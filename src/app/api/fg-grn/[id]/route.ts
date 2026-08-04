import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateColorCode, generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── GET: GRN detail with items ──
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: grn, error } = await supabase
      .from('FGGrnNote')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !grn) {
      return NextResponse.json({ error: 'GRN not found' }, { status: 404 })
    }

    // Fetch items
    const { data: items } = await supabase
      .from('FGGrnItem')
      .select('*')
      .eq('fgGrnNoteId', id)
      .order('createdAt', { ascending: true })

    return NextResponse.json({ ...grn, items: items || [] })
  } catch (error: any) {
    console.error('[FG-GRN [id] GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch GRN' }, { status: 500 })
  }
}

// ─── PATCH: Approve / Reject ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, items: updatedItems, notes } = body

    // Fetch GRN
    const { data: grn, error: grnErr } = await supabase
      .from('FGGrnNote')
      .select('*')
      .eq('id', id)
      .single()
    if (grnErr || !grn) {
      return NextResponse.json({ error: 'GRN not found' }, { status: 404 })
    }

    if (grn.status === 'Approved' || grn.status === 'Rejected') {
      return NextResponse.json({ error: `GRN is already ${grn.status}` }, { status: 400 })
    }

    if (action === 'reject') {
      const { data: rejected, error: rejErr } = await supabase
        .from('FGGrnNote')
        .update({
          status: 'Rejected',
          notes: notes ? (grn.notes ? grn.notes + '\n' : '') + notes : grn.notes,
        })
        .eq('id', id)
        .select()
        .single()
      if (rejErr) throw rejErr

      // Fetch items for response
      const { data: rejItems } = await supabase
        .from('FGGrnItem')
        .select('*')
        .eq('fgGrnNoteId', id)
      return NextResponse.json({ ...rejected, items: rejItems || [] })
    }

    if (action === 'approve') {
      // Update item quantities if provided
      if (Array.isArray(updatedItems)) {
        for (const ui of updatedItems) {
          if (!ui.id) continue
          const updateData: any = {}
          if (ui.acceptedQty !== undefined) updateData.acceptedQty = ui.acceptedQty
          if (ui.rejectedQty !== undefined) updateData.rejectedQty = ui.rejectedQty
          if (ui.defectNotes !== undefined) updateData.defectNotes = ui.defectNotes
          if (ui.unitCost !== undefined) updateData.unitCost = ui.unitCost
          updateData.totalValue = (ui.acceptedQty || 0) * (ui.unitCost || grn.unitCost)
          await supabase.from('FGGrnItem').update(updateData).eq('id', ui.id)
        }
      }

      // Re-read items with updated values
      const { data: freshItems } = await supabase
        .from('FGGrnItem')
        .select('*')
        .eq('fgGrnNoteId', id)
      const totalAccepted = (freshItems || []).reduce((s: number, i: any) => s + i.acceptedQty, 0)
      const totalRejected = (freshItems || []).reduce((s: number, i: any) => s + i.rejectedQty, 0)

      // Create stock bins + movements for accepted items
      const stockResults: any[] = []
      for (const item of (freshItems || [])) {
        const qty = item.acceptedQty
        if (qty <= 0) continue

        // Find or create bin
        const { data: existingBin } = await supabase
          .from('FGStockBin')
          .select('*')
          .eq('styleNo', grn.styleNo)
          .eq('color', item.color)
          .eq('size', item.size)
          .limit(1)
          .single()

        let bin = existingBin
        if (!bin) {
          const colorCode = item.colorCode || await generateColorCode(grn.styleNo, item.color)
          const { data: newBin, error: createErr } = await supabase
            .from('FGStockBin')
            .insert({
              styleNo: grn.styleNo,
              styleName: grn.styleName,
              colorCode,
              color: item.color,
              size: item.size,
              availableQty: qty,
              unitCost: item.unitCost || grn.unitCost,
              unitSellPrice: grn.unitSellPrice,
              image: grn.image || null,
              firstInDate: new Date().toISOString(),
              lastMovementDate: new Date().toISOString(),
            })
            .select()
            .single()
          if (createErr) throw createErr
          bin = newBin
        } else {
          const prevQty = bin.availableQty
          const { data: updatedBin, error: updErr } = await supabase
            .from('FGStockBin')
            .update({
              availableQty: prevQty + qty,
              lastMovementDate: new Date().toISOString(),
              unitCost: item.unitCost || grn.unitCost || bin.unitCost,
            })
            .eq('id', bin.id)
            .select()
            .single()
          if (updErr) throw updErr
          bin = updatedBin
        }

        const prevQty = bin.availableQty - qty
        await supabase.from('FGStockMovement').insert({
          movementNo: generateMovementNo(),
          movementType: 'Inward',
          fgStockBinId: bin.id,
          styleNo: grn.styleNo,
          styleName: grn.styleName,
          colorCode: bin.colorCode,
          color: bin.color,
          size: bin.size,
          quantity: qty,
          previousQty: prevQty,
          newQty: bin.availableQty,
          unitCost: bin.unitCost,
          referenceType: 'FGGrnNote',
          referenceId: grn.id,
          referenceNo: grn.grnNo,
          movedBy: 'System',
        })

        stockResults.push(withComputedFields(bin))
      }

      const { data: approved, error: appErr } = await supabase
        .from('FGGrnNote')
        .update({
          status: 'Approved',
          totalAcceptedQty: totalAccepted,
          totalRejectedQty: totalRejected,
          notes: notes ? (grn.notes ? grn.notes + '\n' : '') + notes : grn.notes,
        })
        .eq('id', id)
        .select()
        .single()
      if (appErr) throw appErr

      const { data: approvedItems } = await supabase
        .from('FGGrnItem')
        .select('*')
        .eq('fgGrnNoteId', id)

      return NextResponse.json({ grn: { ...approved, items: approvedItems || [] }, stockResults })
    }

    // If no action, just allow updating notes/status manually
    const updateData: any = {}
    if (body.status) updateData.status = body.status
    if (body.notes) updateData.notes = body.notes
    if (Object.keys(updateData).length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from('FGGrnNote')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
      if (updErr) throw updErr
      const { data: updItems } = await supabase
        .from('FGGrnItem')
        .select('*')
        .eq('fgGrnNoteId', id)
      return NextResponse.json({ ...updated, items: updItems || [] })
    }

    return NextResponse.json({ error: 'No valid action or fields to update' }, { status: 400 })
  } catch (error: any) {
    console.error('[FG-GRN [id] PATCH]', error)
    return NextResponse.json({ error: error.message || 'Failed to update GRN' }, { status: 500 })
  }
}
