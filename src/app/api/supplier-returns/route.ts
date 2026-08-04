import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'

// ─── GET: List supplier returns with filtering, pagination ──────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const supplierId = searchParams.get('supplierId')
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    // ── count query ──
    let countQuery = supabase.from('SupplierReturn').select('*', { count: 'exact', head: true })
    if (status && status !== 'All') countQuery = countQuery.eq('status', status)
    if (supplierId) countQuery = countQuery.eq('supplierId', supplierId)
    if (fromDate) countQuery = countQuery.gte('returnDate', new Date(fromDate).toISOString())
    if (toDate) countQuery = countQuery.lte('returnDate', new Date(toDate).toISOString())

    const { count: total, error: countErr } = await countQuery
    if (countErr) throw countErr

    // ── data query ──
    let dataQuery = supabase
      .from('SupplierReturn')
      .select('*, purchaseOrder:purchaseOrderId(id,poNumber), items:SupplierReturnItem(*)')
      .order('returnDate', { ascending: false })
      .range((page - 1) * limit, (page - 1) * limit + limit - 1)

    if (status && status !== 'All') dataQuery = dataQuery.eq('status', status)
    if (supplierId) dataQuery = dataQuery.eq('supplierId', supplierId)
    if (fromDate) dataQuery = dataQuery.gte('returnDate', new Date(fromDate).toISOString())
    if (toDate) dataQuery = dataQuery.lte('returnDate', new Date(toDate).toISOString())

    const { data: returns, error: dataErr } = await dataQuery
    if (dataErr) throw dataErr

    // Filter by search
    let filteredReturns = returns ?? []
    if (search) {
      const term = search.toLowerCase()
      filteredReturns = filteredReturns.filter((r: any) =>
        (r.returnNo ?? '').toLowerCase().includes(term) ||
        (r.supplierName ?? '').toLowerCase().includes(term) ||
        (r.purchaseOrder?.poNumber ?? '').toLowerCase().includes(term)
      )
    }

    const result = filteredReturns.map((r: any) => ({
      ...r,
      _count: { items: r.items?.length ?? 0 },
    }))

    // ── status counts (groupBy) ──
    const { data: statusRows, error: statusErr } = await supabase
      .from('SupplierReturn')
      .select('status')
    if (statusErr) throw statusErr

    const counts: Record<string, number> = { All: total ?? 0, Requested: 0, Sent: 0, Received: 0, 'Credit Received': 0, 'Replacement Received': 0, Rejected: 0 }
    for (const row of statusRows ?? []) {
      if (counts[row.status] !== undefined) counts[row.status]++
    }

    // ── Summary ──
    const [pendingRes, creditRes, sentRes] = await Promise.all([
      supabase.from('SupplierReturn').select('*', { count: 'exact', head: true }).in('status', ['Requested', 'Sent']),
      supabase.from('SupplierReturn').select('creditAmount').eq('resolutionType', 'Credit'),
      supabase.from('SupplierReturn').select('*', { count: 'exact', head: true }).eq('status', 'Sent'),
    ])

    let creditValue = 0
    for (const r of creditRes.data ?? []) {
      creditValue += r.creditAmount || 0
    }

    return NextResponse.json({
      returns: result,
      pagination: { page, limit, total: total ?? 0, pages: Math.ceil((total ?? 0) / limit) },
      counts,
      summary: {
        totalReturns: total ?? 0,
        pending: pendingRes.count ?? 0,
        creditValue,
        sent: sentRes.count ?? 0,
      },
    })
  } catch (error) {
    console.error('Error listing supplier returns:', error)
    return NextResponse.json({ error: 'Failed to fetch supplier returns' }, { status: 500 })
  }
}

// ─── POST: Create supplier return ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { purchaseOrderId, grnId, returnReason, notes, items } = body

    if (!purchaseOrderId || !returnReason || !items || !items.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch PO with supplier
    const { data: po, error: poErr } = await supabase
      .from('PurchaseOrder')
      .select('id,supplierId,supplier:supplierId(name)')
      .eq('id', purchaseOrderId)
      .single()
    if (poErr || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // Generate return number: SUP-RET-YYYYMMDD-XXX (avoid clash with StockReservation SR-)
    const today = format(new Date(), 'yyyyMMdd')
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { count: todayCount, error: countErr } = await supabase
      .from('SupplierReturn')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', todayStart.toISOString())
      .lte('createdAt', todayEnd.toISOString())
    if (countErr) throw countErr

    const returnNo = `SUP-RET-${today}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    // Create SupplierReturn
    const { data: supplierReturn, error: srErr } = await supabase
      .from('SupplierReturn')
      .insert({
        returnNo,
        purchaseOrderId,
        grnId: grnId || null,
        supplierId: po.supplierId,
        supplierName: po.supplier?.name,
        returnReason,
        notes: notes || null,
        returnDate: new Date().toISOString(),
      })
      .select('*, purchaseOrder:purchaseOrderId(poNumber)')
      .single()
    if (srErr) throw srErr

    // Create items
    const itemsWithReturnId = items.map((item: { purchaseOrderItemId: string; itemName: string; colorName?: string; quantity: number; unit: string; ratePerUnit: number; returnReason?: string }) => ({
      supplierReturnId: supplierReturn.id,
      purchaseOrderItemId: item.purchaseOrderItemId,
      itemName: item.itemName,
      colorName: item.colorName || null,
      quantity: item.quantity,
      unit: item.unit,
      ratePerUnit: item.ratePerUnit,
      totalValue: item.quantity * item.ratePerUnit,
      returnReason: item.returnReason || null,
    }))
    const { data: createdItems, error: itemsErr } = await supabase
      .from('SupplierReturnItem')
      .insert(itemsWithReturnId)
      .select('*')
    if (itemsErr) {
      await supabase.from('SupplierReturn').delete().eq('id', supplierReturn.id)
      throw itemsErr
    }

    return NextResponse.json({ supplierReturn: { ...supplierReturn, items: createdItems } }, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier return:', error)
    return NextResponse.json({ error: 'Failed to create supplier return' }, { status: 500 })
  }
}
