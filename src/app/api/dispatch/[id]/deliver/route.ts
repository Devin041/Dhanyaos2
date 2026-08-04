import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── POST: Mark dispatch as delivered & deduct finished goods ──────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: dispatch, error: dErr } = await supabase
      .from('Dispatch')
      .select('*, dispatchItems:DispatchItem(*)')
      .eq('id', id)
      .single()

    if (dErr || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    if (dispatch.status === 'Delivered') {
      return NextResponse.json({ error: 'Already marked as delivered' }, { status: 400 })
    }

    // Validate stock availability before deducting
    const warnings: string[] = []
    for (const item of (dispatch.dispatchItems ?? [])) {
      if (item.dispatchedQty <= 0) continue

      const { data: fg } = await supabase
        .from('FinishedGood')
        .select('*')
        .eq('styleNo', item.styleNo)
        .limit(1)
        .single()

      if (!fg) {
        warnings.push(`No FinishedGood record found for style ${item.styleNo} — qty ${item.dispatchedQty} not deducted.`)
      } else if (fg.quantity < item.dispatchedQty) {
        return NextResponse.json(
          { error: `Insufficient stock for ${item.styleNo}: have ${fg.quantity}, need ${item.dispatchedQty}` },
          { status: 400 }
        )
      }
    }

    // Update dispatch status to Delivered
    const { data: updated, error: updErr } = await supabase
      .from('Dispatch')
      .update({ status: 'Delivered', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select('*, salesOrder:salesOrderId(orderNo), customer:customerId(companyName), dispatchItems:DispatchItem(*)')
      .single()
    if (updErr) throw updErr

    // Deduct from FinishedGood for each dispatch item (sequential)
    for (const item of (updated.dispatchItems ?? [])) {
      if (item.dispatchedQty <= 0) continue

      const { data: fg } = await supabase
        .from('FinishedGood')
        .select('*')
        .eq('styleNo', item.styleNo)
        .limit(1)
        .single()

      if (fg) {
        const newQty = Math.max(0, fg.quantity - item.dispatchedQty)
        await supabase
          .from('FinishedGood')
          .update({
            quantity: newQty,
            totalValue: newQty * fg.unitCost,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', fg.id)
      }
    }

    return NextResponse.json({ dispatch: updated, warnings: warnings.length > 0 ? warnings : undefined })
  } catch (error) {
    console.error('POST /api/dispatch/[id]/deliver error:', error)
    return NextResponse.json({ error: 'Failed to mark as delivered' }, { status: 500 })
  }
}
