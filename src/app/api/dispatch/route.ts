import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { batchResolveStyleImages } from '@/lib/style-image'

// ─── GET: List dispatches with filters ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    // ── status counts ──
    const [packedRes, inTransitRes, deliveredRes, allRes] = await Promise.all([
      supabase.from('Dispatch').select('*', { count: 'exact', head: true }).eq('status', 'Packed'),
      supabase.from('Dispatch').select('*', { count: 'exact', head: true }).eq('status', 'InTransit'),
      supabase.from('Dispatch').select('*', { count: 'exact', head: true }).eq('status', 'Delivered'),
      supabase.from('Dispatch').select('*', { count: 'exact', head: true }),
    ])
    if (packedRes.error) throw packedRes.error
    if (inTransitRes.error) throw inTransitRes.error
    if (deliveredRes.error) throw deliveredRes.error
    if (allRes.error) throw allRes.error

    const packedCount = packedRes.count ?? 0
    const inTransitCount = inTransitRes.count ?? 0
    const deliveredCount = deliveredRes.count ?? 0
    const totalCount = allRes.count ?? 0

    // ── data query ──
    let query = supabase
      .from('Dispatch')
      .select('*, salesOrder:salesOrderId(orderNo), customer:customerId(companyName), dispatchItems:DispatchItem(*)')
      .order('createdAt', { ascending: false })

    if (status && status !== 'All') {
      query = query.eq('status', status)
    }

    const { data: dispatches, error } = await query
    if (error) throw error

    // If search, filter by dispatchNo, salesOrder.orderNo, customer.companyName, transporter, trackingNo
    let filteredDispatches = dispatches ?? []
    if (search) {
      const term = search.toLowerCase()
      filteredDispatches = filteredDispatches.filter((d: any) =>
        (d.dispatchNo ?? '').toLowerCase().includes(term) ||
        (d.salesOrder?.orderNo ?? '').toLowerCase().includes(term) ||
        (d.customer?.companyName ?? '').toLowerCase().includes(term) ||
        (d.transporter ?? '').toLowerCase().includes(term) ||
        (d.trackingNo ?? '').toLowerCase().includes(term)
      )
    }

    // Batch-resolve style images for dispatch items
    const allItems = filteredDispatches.flatMap((d: any) => d.dispatchItems || [])
    const styleNos = [...new Set(allItems.map((i: any) => i.styleNo || '').filter(Boolean))]
    if (styleNos.length > 0) {
      const images = await batchResolveStyleImages(styleNos)
      for (const d of filteredDispatches) {
        for (const item of (d.dispatchItems || [])) {
          ;(item as any)._image = images[item.styleNo]?.url || null
        }
      }
    }

    // Add _count for dispatch items
    const result = filteredDispatches.map((d: any) => ({
      ...d,
      _count: { dispatchItems: d.dispatchItems?.length ?? 0 },
    }))

    return NextResponse.json({
      dispatches: result,
      totalCount,
      statusCounts: { Packed: packedCount, InTransit: inTransitCount, Delivered: deliveredCount, All: totalCount },
    })
  } catch (error) {
    console.error('GET /api/dispatch error:', error)
    return NextResponse.json({ error: 'Failed to fetch dispatches' }, { status: 500 })
  }
}

// ─── POST: Create dispatch ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { salesOrderId, customerId, shippingAddress, trackingNo, transporter, vehicleNo, notes, items, status } = body

    if (!salesOrderId || !customerId || !items || items.length === 0) {
      return NextResponse.json({ error: 'salesOrderId, customerId, and items are required' }, { status: 400 })
    }

    // Generate dispatch number: DSP-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')

    const prefix = `DSP-${dateStr}-`
    const { data: lastDispatch, error: seqErr } = await supabase
      .from('Dispatch')
      .select('dispatchNo')
      .ilike('dispatchNo', `${prefix}%`)
      .order('dispatchNo', { ascending: false })
      .limit(1)
    if (seqErr) throw seqErr

    let seq = 1
    if (lastDispatch && lastDispatch.length > 0) {
      const lastSeq = parseInt(lastDispatch[0].dispatchNo.slice(prefix.length), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const dispatchNo = `${prefix}${String(seq).padStart(3, '0')}`

    const totalDispatchedQty = items.reduce((sum: number, item: { dispatchedQty: number }) => sum + (item.dispatchedQty || 0), 0)

    // Create dispatch
    const { data: dispatch, error: dErr } = await supabase
      .from('Dispatch')
      .insert({
        dispatchNo,
        salesOrderId,
        customerId,
        dispatchDate: new Date().toISOString(),
        status: status || 'Packed',
        shippingAddress: shippingAddress || null,
        trackingNo: trackingNo || null,
        transporter: transporter || null,
        vehicleNo: vehicleNo || null,
        totalDispatchedQty,
        notes: notes || null,
      })
      .select('*, salesOrder:salesOrderId(orderNo), customer:customerId(companyName)')
      .single()
    if (dErr) throw dErr

    // Create dispatch items
    const dispatchItems = items.map((item: { styleNo: string; styleName: string; orderedQty: number; dispatchedQty: number }) => ({
      dispatchId: dispatch.id,
      styleNo: item.styleNo,
      styleName: item.styleName,
      orderedQty: item.orderedQty || 0,
      dispatchedQty: item.dispatchedQty || 0,
    }))
    const { data: createdItems, error: diErr } = await supabase
      .from('DispatchItem')
      .insert(dispatchItems)
      .select('*')
    if (diErr) {
      await supabase.from('Dispatch').delete().eq('id', dispatch.id)
      throw diErr
    }

    return NextResponse.json({ ...dispatch, dispatchItems: createdItems }, { status: 201 })
  } catch (error) {
    console.error('POST /api/dispatch error:', error)
    return NextResponse.json({ error: 'Failed to create dispatch' }, { status: 500 })
  }
}
