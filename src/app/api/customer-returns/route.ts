import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format, startOfMonth, endOfMonth } from 'date-fns'

// ─── GET: List customer returns with filtering, pagination ──────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')
    const reason = searchParams.get('reason')
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    // ── counts query ──
    let countQuery = supabase.from('CustomerReturn').select('*', { count: 'exact', head: true })
    if (status && status !== 'All') countQuery = countQuery.eq('status', status)
    if (customerId) countQuery = countQuery.eq('customerId', customerId)
    if (reason && reason !== 'All') countQuery = countQuery.eq('returnReason', reason)
    if (fromDate) countQuery = countQuery.gte('returnDate', new Date(fromDate).toISOString())
    if (toDate) countQuery = countQuery.lte('returnDate', new Date(toDate).toISOString())

    const { count: total, error: countErr } = await countQuery
    if (countErr) throw countErr

    // ── data query ──
    let dataQuery = supabase
      .from('CustomerReturn')
      .select('*, salesOrder:salesOrderId(id,orderNo), items:CustomerReturnItem(*)')
      .order('returnDate', { ascending: false })
      .range((page - 1) * limit, (page - 1) * limit + limit - 1)

    if (status && status !== 'All') dataQuery = dataQuery.eq('status', status)
    if (customerId) dataQuery = dataQuery.eq('customerId', customerId)
    if (reason && reason !== 'All') dataQuery = dataQuery.eq('returnReason', reason)
    if (fromDate) dataQuery = dataQuery.gte('returnDate', new Date(fromDate).toISOString())
    if (toDate) dataQuery = dataQuery.lte('returnDate', new Date(toDate).toISOString())

    const { data: returns, error: dataErr } = await dataQuery
    if (dataErr) throw dataErr

    // Filter by search term (returnNo, customerName, salesOrder.orderNo)
    let filteredReturns = returns ?? []
    if (search) {
      const term = search.toLowerCase()
      filteredReturns = filteredReturns.filter((r: any) =>
        (r.returnNo ?? '').toLowerCase().includes(term) ||
        (r.customerName ?? '').toLowerCase().includes(term) ||
        (r.salesOrder?.orderNo ?? '').toLowerCase().includes(term)
      )
    }

    // Add _count for items
    const result = filteredReturns.map((r: any) => ({
      ...r,
      _count: { items: r.items?.length ?? 0 },
    }))

    // ── status counts (groupBy equivalent) ──
    const { data: statusRows, error: statusErr } = await supabase
      .from('CustomerReturn')
      .select('status')
    if (statusErr) throw statusErr

    const counts: Record<string, number> = { All: total ?? 0, Requested: 0, Approved: 0, 'In Process': 0, Completed: 0, Rejected: 0 }
    for (const row of statusRows ?? []) {
      if (counts[row.status] !== undefined) counts[row.status]++
    }

    // ── Summary ──
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)

    const [allRes, pendingRes, refundRes, monthRes, pendingSumRes] = await Promise.all([
      supabase.from('CustomerReturn').select('refundAmount,creditNoteAmount'),
      supabase.from('CustomerReturn').select('*', { count: 'exact', head: true }).in('status', ['Requested', 'Approved', 'In Process']),
      supabase.from('CustomerReturn').select('refundAmount').eq('resolutionType', 'Refund'),
      supabase.from('CustomerReturn').select('*', { count: 'exact', head: true }).gte('returnDate', monthStart.toISOString()).lte('returnDate', monthEnd.toISOString()),
    ])

    let totalRefundAmount = 0
    let totalCreditNoteAmount = 0
    for (const r of allRes.data ?? []) {
      totalRefundAmount += r.refundAmount || 0
      totalCreditNoteAmount += r.creditNoteAmount || 0
    }

    let refundValue = 0
    for (const r of refundRes.data ?? []) {
      refundValue += r.refundAmount || 0
    }

    return NextResponse.json({
      returns: result,
      pagination: { page, limit, total: total ?? 0, pages: Math.ceil((total ?? 0) / limit) },
      counts,
      summary: {
        totalReturns: total ?? 0,
        pendingResolution: pendingRes.count ?? 0,
        refundValue,
        thisMonth: monthRes.count ?? 0,
        totalReturnItems: totalRefundAmount,
      },
    })
  } catch (error) {
    console.error('Error listing customer returns:', error)
    return NextResponse.json({ error: 'Failed to fetch customer returns' }, { status: 500 })
  }
}

// ─── POST: Create customer return ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { salesOrderId, deliveryChallanId, returnReason, notes, items } = body

    if (!salesOrderId || !returnReason || !items || !items.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch SO
    const { data: so, error: soErr } = await supabase
      .from('SalesOrder')
      .select('id,customerId,customerName')
      .eq('id', salesOrderId)
      .single()
    if (soErr || !so) {
      return NextResponse.json({ error: 'Sales order not found' }, { status: 404 })
    }

    // Generate return number: CR-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { count: todayCount, error: countErr } = await supabase
      .from('CustomerReturn')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', todayStart.toISOString())
      .lte('createdAt', todayEnd.toISOString())
    if (countErr) throw countErr

    const returnNo = `CR-${today}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const totalValue = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0)

    // Create CustomerReturn
    const { data: customerReturn, error: crErr } = await supabase
      .from('CustomerReturn')
      .insert({
        returnNo,
        salesOrderId,
        deliveryChallanId: deliveryChallanId || null,
        customerId: so.customerId,
        customerName: so.customerName,
        returnReason,
        notes: notes || null,
        returnDate: new Date().toISOString(),
      })
      .select('*, salesOrder:salesOrderId(orderNo)')
      .single()
    if (crErr) throw crErr

    // Create items
    const itemsWithReturnId = items.map((item: { styleName: string; quantity: number; unitPrice: number; totalValue: number; returnReason?: string; condition?: string }) => ({
      customerReturnId: customerReturn.id,
      styleName: item.styleName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalValue: item.quantity * item.unitPrice,
      returnReason: item.returnReason || null,
      condition: item.condition || 'Used',
    }))
    const { data: createdItems, error: itemsErr } = await supabase
      .from('CustomerReturnItem')
      .insert(itemsWithReturnId)
      .select('*')
    if (itemsErr) {
      await supabase.from('CustomerReturn').delete().eq('id', customerReturn.id)
      throw itemsErr
    }

    return NextResponse.json({ customerReturn: { ...customerReturn, items: createdItems } }, { status: 201 })
  } catch (error) {
    console.error('Error creating customer return:', error)
    return NextResponse.json({ error: 'Failed to create customer return' }, { status: 500 })
  }
}
