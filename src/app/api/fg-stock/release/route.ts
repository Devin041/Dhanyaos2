import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── POST: Release reserved stock back to available ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reservationId, reason } = body

    if (!reservationId) {
      return NextResponse.json({ error: 'reservationId is required' }, { status: 400 })
    }

    // Fetch reservation
    const { data: reservation, error: resErr } = await supabase
      .from('FGReservation')
      .select('*')
      .eq('id', reservationId)
      .single()
    if (resErr || !reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }
    if (reservation.status !== 'Active') {
      return NextResponse.json({
        error: `Cannot release reservation with status: ${reservation.status}`,
      }, { status: 400 })
    }

    // Fetch associated bin
    const { data: bin, error: binErr } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', reservation.fgStockBinId)
      .single()
    if (binErr || !bin) {
      return NextResponse.json({ error: 'Associated stock bin not found' }, { status: 404 })
    }

    const qtyToRelease = reservation.reservedQty - reservation.dispatchedQty
    if (qtyToRelease <= 0) {
      return NextResponse.json({ error: 'No un-dispatched quantity to release' }, { status: 400 })
    }

    const mvtNo = generateMovementNo()
    const prevAvail = bin.availableQty

    // Update reservation status
    const { error: updResErr } = await supabase
      .from('FGReservation')
      .update({
        status: 'Released',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', reservationId)
    if (updResErr) throw updResErr

    // Return qty to available
    await supabase
      .from('FGStockBin')
      .update({
        reservedQty: bin.reservedQty - qtyToRelease,
        availableQty: prevAvail + qtyToRelease,
        lastMovementDate: new Date().toISOString(),
      })
      .eq('id', bin.id)

    // Create movement record
    await supabase.from('FGStockMovement').insert({
      movementNo: mvtNo,
      movementType: 'Unreservation',
      fgStockBinId: bin.id,
      styleNo: bin.styleNo,
      styleName: bin.styleName,
      colorCode: bin.colorCode,
      color: bin.color,
      size: bin.size,
      quantity: qtyToRelease,
      previousQty: bin.reservedQty,
      newQty: bin.reservedQty - qtyToRelease,
      unitCost: bin.unitCost,
      fromStatus: 'Reserved',
      toStatus: 'Available',
      referenceType: 'FGReservation',
      referenceId: reservation.id,
      referenceNo: reservation.reservationNo,
      reason: reason || `Released from reservation ${reservation.reservationNo}`,
      movedBy: 'System',
    })

    const { data: updatedBin } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', bin.id)
      .single()

    return NextResponse.json({
      reservation: { ...reservation, status: 'Released' },
      releasedQty: qtyToRelease,
      bin: updatedBin ? withComputedFields(updatedBin) : null,
    })
  } catch (error: any) {
    console.error('[FG-Stock Release POST]', error)
    return NextResponse.json({ error: error.message || 'Release failed' }, { status: 500 })
  }
}
