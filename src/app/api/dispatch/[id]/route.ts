import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single dispatch with items ───────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: dispatch, error } = await supabase
      .from('Dispatch')
      .select('*, salesOrder:salesOrderId(orderNo,id), customer:customerId(companyName,shippingAddress,id), dispatchItems:DispatchItem(*)')
      .eq('id', id)
      .single()

    if (error || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    return NextResponse.json(dispatch)
  } catch (error) {
    console.error('GET /api/dispatch/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch dispatch' }, { status: 500 })
  }
}

// ─── PATCH: Update dispatch ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, trackingNo, transporter, vehicleNo, shippingAddress, notes, dispatchItems } = body

    const { data: existing, error: existErr } = await supabase
      .from('Dispatch')
      .select('*, dispatchItems:DispatchItem(*)')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    const data: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (status !== undefined) data.status = status
    if (trackingNo !== undefined) data.trackingNo = trackingNo || null
    if (transporter !== undefined) data.transporter = transporter || null
    if (vehicleNo !== undefined) data.vehicleNo = vehicleNo || null
    if (shippingAddress !== undefined) data.shippingAddress = shippingAddress || null
    if (notes !== undefined) data.notes = notes || null

    // If dispatch items are provided, update them (only for Packed/InTransit status)
    if (dispatchItems && Array.isArray(dispatchItems) && (existing.status === 'Packed' || existing.status === 'InTransit')) {
      const totalDispatched = dispatchItems.reduce((s: number, i: { dispatchedQty: number }) => s + (Number(i.dispatchedQty) || 0), 0)
      data.totalDispatchedQty = totalDispatched

      // Delete existing items
      const { error: delErr } = await supabase
        .from('DispatchItem')
        .delete()
        .eq('dispatchId', id)
      if (delErr) throw delErr

      // Update dispatch with new data
      const { data: updated, error: updErr } = await supabase
        .from('Dispatch')
        .update(data)
        .eq('id', id)
        .select('*, salesOrder:salesOrderId(orderNo), customer:customerId(companyName), dispatchItems:DispatchItem(*)')
        .single()
      if (updErr) throw updErr

      // Create new dispatch items
      const newItems = dispatchItems.map((item: { styleNo: string; styleName: string; orderedQty: number; dispatchedQty: number }) => ({
        dispatchId: id,
        styleNo: item.styleNo,
        styleName: item.styleName,
        orderedQty: Number(item.orderedQty) || 0,
        dispatchedQty: Number(item.dispatchedQty) || 0,
      }))
      const { data: createdItems, error: ciErr } = await supabase
        .from('DispatchItem')
        .insert(newItems)
        .select('*')
      if (ciErr) throw ciErr

      return NextResponse.json({ ...updated, dispatchItems: createdItems })
    }

    const { data: dispatch, error } = await supabase
      .from('Dispatch')
      .update(data)
      .eq('id', id)
      .select('*, salesOrder:salesOrderId(orderNo), customer:customerId(companyName), dispatchItems:DispatchItem(*)')
      .single()

    if (error) throw error

    return NextResponse.json(dispatch)
  } catch (error) {
    console.error('PATCH /api/dispatch/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update dispatch' }, { status: 500 })
  }
}

// ─── DELETE: Delete dispatch (only if Packed) ──────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: existing, error: existErr } = await supabase
      .from('Dispatch')
      .select('id,status')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }
    if (existing.status !== 'Packed') {
      return NextResponse.json({ error: 'Only packed dispatches can be deleted' }, { status: 400 })
    }

    // Delete dispatch items first (cascade delete)
    await supabase.from('DispatchItem').delete().eq('dispatchId', id)

    const { error } = await supabase.from('Dispatch').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/dispatch/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete dispatch' }, { status: 500 })
  }
}
