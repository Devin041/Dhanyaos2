import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single return with items ───────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: returnRecord, error } = await supabase
      .from('Return')
      .select('*, returnItems:ReturnItem(*)')
      .eq('id', id)
      .single()

    if (error || !returnRecord) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    return NextResponse.json(returnRecord)
  } catch (error) {
    console.error('GET /api/returns/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch return' }, { status: 500 })
  }
}

// ─── PATCH: Update return (status changes, refund amount, etc.) ─────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, refundAmount, notes } = body

    const { data: existing, error: existErr } = await supabase
      .from('Return')
      .select('*')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }

    // Validate status transitions
    if (status) {
      const validTransitions: Record<string, string[]> = {
        Requested: ['Approved', 'Rejected'],
        Approved: ['Processed'],
        Processed: [],
        Rejected: [],
      }
      const allowed = validTransitions[existing.status] || []
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${status}` },
          { status: 400 }
        )
      }
    }

    const data: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (status !== undefined) data.status = status
    if (refundAmount !== undefined) data.refundAmount = refundAmount
    if (notes !== undefined) data.notes = notes || null

    // If transitioning to 'Processed', restore stock
    if (status === 'Processed') {
      const { data: returnItems } = await supabase
        .from('ReturnItem')
        .select('*')
        .eq('returnId', id)

      // Update return first
      const { data: updated, error: updErr } = await supabase
        .from('Return')
        .update(data)
        .eq('id', id)
        .select('*, returnItems:ReturnItem(*)')
        .single()
      if (updErr) throw updErr

      // Restore stock based on return type (sequential)
      if (existing.returnType === 'Customer') {
        // Customer return: add quantities back to FinishedGood
        for (const item of (returnItems ?? [])) {
          if (item.quantity <= 0) continue

          const { data: fg } = await supabase
            .from('FinishedGood')
            .select('*')
            .eq('styleNo', item.styleNo || item.itemName)
            .limit(1)
            .single()

          if (fg) {
            const newQty = fg.quantity + item.quantity
            await supabase
              .from('FinishedGood')
              .update({
                quantity: newQty,
                totalValue: newQty * fg.unitCost,
                updatedAt: new Date().toISOString(),
              })
              .eq('id', fg.id)
          } else {
            // Create a new FinishedGood entry if none exists
            await supabase.from('FinishedGood').insert({
              styleNo: item.styleNo || item.itemName,
              styleName: item.itemName,
              quantity: item.quantity,
              unitCost: item.unitValue,
              totalValue: item.quantity * item.unitValue,
              status: 'In Stock',
            })
          }
        }
      } else {
        // Supplier return: add quantities back to FabricStock
        for (const item of (returnItems ?? [])) {
          if (item.quantity <= 0) continue

          const { data: fabric } = await supabase
            .from('FabricStock')
            .select('*')
            .eq('fabricName', item.itemName)
            .limit(1)
            .single()

          if (fabric) {
            const newMeters = fabric.availableMeters + item.quantity
            const newTotalValue = fabric.totalValue + (item.quantity * item.unitValue)
            await supabase
              .from('FabricStock')
              .update({
                availableMeters: newMeters,
                totalValue: newTotalValue,
                averageCost: newMeters > 0 ? newTotalValue / newMeters : fabric.averageCost,
                updatedAt: new Date().toISOString(),
              })
              .eq('id', fabric.id)
          } else {
            await supabase.from('FabricStock').insert({
              fabricName: item.itemName,
              availableMeters: item.quantity,
              averageCost: item.unitValue,
              totalValue: item.quantity * item.unitValue,
            })
          }
        }
      }

      return NextResponse.json(updated)
    }

    const { data: returnRecord, error } = await supabase
      .from('Return')
      .update(data)
      .eq('id', id)
      .select('*, returnItems:ReturnItem(*)')
      .single()

    if (error) throw error

    return NextResponse.json(returnRecord)
  } catch (error) {
    console.error('PATCH /api/returns/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update return' }, { status: 500 })
  }
}

// ─── DELETE: Delete return (only if Requested) ───────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: existing, error: existErr } = await supabase
      .from('Return')
      .select('id,status')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Return not found' }, { status: 404 })
    }
    if (existing.status !== 'Requested') {
      return NextResponse.json({ error: 'Only requested returns can be deleted' }, { status: 400 })
    }

    // Delete return items first
    await supabase.from('ReturnItem').delete().eq('returnId', id)

    const { error } = await supabase.from('Return').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/returns/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete return' }, { status: 500 })
  }
}
