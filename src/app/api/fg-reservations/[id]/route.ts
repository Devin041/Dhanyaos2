import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── PATCH: Release or partial dispatch ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, dispatchQty, notes } = body

    const { data: reservation, error: resErr } = await supabase
      .from('FGReservation')
      .select('*')
      .eq('id', id)
      .single()
    if (resErr || !reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    if (reservation.status === 'Released' || reservation.status === 'FullyDispatched') {
      return NextResponse.json({ error: `Reservation is already ${reservation.status}` }, { status: 400 })
    }

    if (action === 'release') {
      const remaining = reservation.reservedQty - reservation.dispatchedQty

      // Move remaining reserved back to available
      const { data: bin, error: binErr } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('id', reservation.fgStockBinId)
        .single()
      if (binErr || !bin) {
        return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
      }

      const mvtNo = generateMovementNo()
      const prevAvail = bin.availableQty
      const prevReserved = bin.reservedQty

      await supabase
        .from('FGStockBin')
        .update({
          availableQty: prevAvail + remaining,
          reservedQty: prevReserved - remaining,
          lastMovementDate: new Date().toISOString(),
        })
        .eq('id', reservation.fgStockBinId)

      await supabase.from('FGStockMovement').insert({
        movementNo: mvtNo,
        movementType: 'Unreservation',
        fgStockBinId: reservation.fgStockBinId,
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        quantity: remaining,
        previousQty: prevAvail,
        newQty: prevAvail + remaining,
        unitCost: bin.unitCost,
        fromStatus: 'Reserved',
        toStatus: 'Available',
        referenceType: 'FGReservation',
        referenceId: reservation.id,
        referenceNo: reservation.reservationNo,
        reason: notes || 'Reservation released',
        movedBy: 'System',
      })

      const { data: updatedRes } = await supabase
        .from('FGReservation')
        .update({
          status: 'Released',
          notes: notes ? (reservation.notes ? reservation.notes + '\n' : '') + notes : reservation.notes,
        })
        .eq('id', id)
        .select()
        .single()

      const { data: updatedBin } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('id', reservation.fgStockBinId)
        .single()

      return NextResponse.json({ reservation: updatedRes, bin: updatedBin ? withComputedFields(updatedBin) : null })
    }

    if (action === 'partial_dispatch') {
      if (!dispatchQty || dispatchQty <= 0) {
        return NextResponse.json({ error: 'dispatchQty must be positive' }, { status: 400 })
      }

      const remaining = reservation.reservedQty - reservation.dispatchedQty
      if (dispatchQty > remaining) {
        return NextResponse.json({ error: `Cannot dispatch ${dispatchQty}. Only ${remaining} remaining.` }, { status: 400 })
      }

      const newDispatched = reservation.dispatchedQty + dispatchQty
      const isFullyDispatched = newDispatched >= reservation.reservedQty
      const newStatus = isFullyDispatched ? 'FullyDispatched' : 'PartiallyDispatched'

      const { data: updated, error: updErr } = await supabase
        .from('FGReservation')
        .update({
          dispatchedQty: newDispatched,
          status: newStatus,
          notes: notes ? (reservation.notes ? reservation.notes + '\n' : '') + notes : reservation.notes,
        })
        .eq('id', id)
        .select()
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ reservation: updated })
    }

    return NextResponse.json({ error: 'Invalid action. Use "release" or "partial_dispatch".' }, { status: 400 })
  } catch (error: any) {
    console.error('[FG-Reservations [id] PATCH]', error)
    return NextResponse.json({ error: error.message || 'Failed to update reservation' }, { status: 500 })
  }
}
