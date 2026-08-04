import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { batchResolveStyleImages } from '@/lib/style-image'

// ─── GET: List returns with filters ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const returnType = searchParams.get('returnType') || ''
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    // ── Count queries in parallel ──
    const [
      totalCountRes,
      requestedRes,
      approvedRes,
      processedRes,
      rejectedRes,
      customerRes,
      supplierRes,
    ] = await Promise.all([
      supabase.from('Return').select('*', { count: 'exact', head: true }),
      supabase.from('Return').select('*', { count: 'exact', head: true }).eq('status', 'Requested'),
      supabase.from('Return').select('*', { count: 'exact', head: true }).eq('status', 'Approved'),
      supabase.from('Return').select('*', { count: 'exact', head: true }).eq('status', 'Processed'),
      supabase.from('Return').select('*', { count: 'exact', head: true }).eq('status', 'Rejected'),
      supabase.from('Return').select('*', { count: 'exact', head: true }).eq('returnType', 'Customer'),
      supabase.from('Return').select('*', { count: 'exact', head: true }).eq('returnType', 'Supplier'),
    ])

    if (totalCountRes.error) throw totalCountRes.error

    const totalCount = totalCountRes.count ?? 0
    const requestedCount = requestedRes.count ?? 0
    const approvedCount = approvedRes.count ?? 0
    const processedCount = processedRes.count ?? 0
    const rejectedCount = rejectedRes.count ?? 0
    const customerCount = customerRes.count ?? 0
    const supplierCount = supplierRes.count ?? 0

    // ── Data query ──
    let query = supabase
      .from('Return')
      .select('*, returnItems:ReturnItem(*)')
      .order('createdAt', { ascending: false })

    if (returnType && returnType !== 'All') {
      query = query.eq('returnType', returnType)
    }
    if (status && status !== 'All') {
      query = query.eq('status', status)
    }

    const { data: returns, error } = await query
    if (error) throw error

    // Filter by search
    let filteredReturns = returns ?? []
    if (search) {
      const term = search.toLowerCase()
      filteredReturns = filteredReturns.filter((r: any) =>
        (r.returnNo ?? '').toLowerCase().includes(term) ||
        (r.referenceNo ?? '').toLowerCase().includes(term) ||
        (r.partyName ?? '').toLowerCase().includes(term) ||
        (r.reason ?? '').toLowerCase().includes(term)
      )
    }

    // Batch-resolve style images for return items
    const allReturnItems = filteredReturns.flatMap((r: any) => r.returnItems || [])
    const styleNos = [...new Set(allReturnItems.map((i: any) => i.styleNo || '').filter(Boolean))]
    if (styleNos.length > 0) {
      const images = await batchResolveStyleImages(styleNos)
      for (const r of filteredReturns) {
        for (const item of (r.returnItems || [])) {
          ;(item as any)._image = images[item.styleNo]?.url || null
        }
      }
    }

    // Add _count for returnItems
    const result = filteredReturns.map((r: any) => ({
      ...r,
      _count: { returnItems: r.returnItems?.length ?? 0 },
    }))

    return NextResponse.json({
      returns: result,
      totalCount,
      statusCounts: {
        Requested: requestedCount,
        Approved: approvedCount,
        Processed: processedCount,
        Rejected: rejectedCount,
        All: totalCount,
      },
      typeCounts: {
        Customer: customerCount,
        Supplier: supplierCount,
      },
    })
  } catch (error) {
    console.error('GET /api/returns error:', error)
    return NextResponse.json({ error: 'Failed to fetch returns' }, { status: 500 })
  }
}

// ─── POST: Create return ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { returnType, referenceId, referenceNo, partyName, reason, notes, items } = body

    if (!returnType || !referenceId || !referenceNo || !partyName || !reason || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'returnType, referenceId, referenceNo, partyName, reason, and items are required' },
        { status: 400 }
      )
    }

    // Generate return number: RET-YYYYMMDD-XXX
    const today = new Date()
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')

    const prefix = `RET-${dateStr}-`
    const { data: lastReturn, error: lrErr } = await supabase
      .from('Return')
      .select('returnNo')
      .ilike('returnNo', `${prefix}%`)
      .order('returnNo', { ascending: false })
      .limit(1)
    if (lrErr) throw lrErr

    let seq = 1
    if (lastReturn && lastReturn.length > 0) {
      const lastSeq = parseInt(lastReturn[0].returnNo.slice(prefix.length), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const returnNo = `${prefix}${String(seq).padStart(3, '0')}`

    // Calculate totals
    let totalQty = 0
    let totalValue = 0
    const returnItems = items.map((item: { itemName: string; styleNo?: string; quantity: number; unitValue: number; reason?: string }) => {
      const itemTotal = (item.quantity || 0) * (item.unitValue || 0)
      totalQty += item.quantity || 0
      totalValue += itemTotal
      return {
        itemName: item.itemName,
        styleNo: item.styleNo || null,
        quantity: item.quantity || 0,
        unitValue: item.unitValue || 0,
        totalValue: itemTotal,
        reason: item.reason || null,
      }
    })

    // Create Return
    const { data: returnRecord, error: retErr } = await supabase
      .from('Return')
      .insert({
        returnNo,
        returnType,
        referenceId,
        referenceNo,
        partyName,
        reason,
        totalQty,
        totalValue,
        refundAmount: 0,
        notes: notes || null,
      })
      .select('*')
      .single()
    if (retErr) throw retErr

    // Create ReturnItems
    const itemsWithReturnId = returnItems.map(item => ({
      ...item,
      returnId: returnRecord.id,
    }))
    const { data: createdItems, error: itemsErr } = await supabase
      .from('ReturnItem')
      .insert(itemsWithReturnId)
      .select('*')
    if (itemsErr) {
      await supabase.from('Return').delete().eq('id', returnRecord.id)
      throw itemsErr
    }

    return NextResponse.json({ ...returnRecord, returnItems: createdItems }, { status: 201 })
  } catch (error) {
    console.error('POST /api/returns error:', error)
    return NextResponse.json({ error: 'Failed to create return' }, { status: 500 })
  }
}
