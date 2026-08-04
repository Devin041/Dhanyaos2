import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, generateReservationNo, withComputedFields } from '@/lib/fg-color-code'

// ─── POST: Reserve stock for an order ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { binId, quantity, orderNo, customerName, notes } = body

    if (!binId || !quantity || !orderNo) {
      return NextResponse.json({ error: 'binId, quantity, and orderNo are required' }, { status: 400 })
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
    }

    // Fetch bin
    const { data: bin, error: binErr } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', binId)
      .single()
    if (binErr || !bin) {
      return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
    }
    if (bin.availableQty < quantity) {
      return NextResponse.json({
        error: `Insufficient available stock. Available: ${bin.availableQty}, Requested: ${quantity}`,
      }, { status: 400 })
    }

    const resNo = generateReservationNo()
    const mvtNo = generateMovementNo()
    const prevQty = bin.availableQty

    // Create reservation record
    const { data: reservation, error: resErr } = await supabase
      .from('FGReservation')
      .insert({
        reservationNo: resNo,
        salesOrderId: orderNo,
        salesOrderNo: orderNo,
        customerName: customerName || null,
        fgStockBinId: binId,
        styleNo: bin.styleNo,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        reservedQty: quantity,
        status: 'Active',
        notes: notes || null,
      })
      .select()
      .single()
    if (resErr) throw resErr

    // Update bin quantities
    await supabase
      .from('FGStockBin')
      .update({
        availableQty: prevQty - quantity,
        reservedQty: bin.reservedQty + quantity,
        lastMovementDate: new Date().toISOString(),
      })
      .eq('id', binId)

    // Create movement record
    await supabase.from('FGStockMovement').insert({
      movementNo: mvtNo,
      movementType: 'Reservation',
      fgStockBinId: binId,
      styleNo: bin.styleNo,
      styleName: bin.styleName,
      colorCode: bin.colorCode,
      color: bin.color,
      size: bin.size,
      quantity,
      previousQty: prevQty,
      newQty: prevQty - quantity,
      unitCost: bin.unitCost,
      fromStatus: 'Available',
      toStatus: 'Reserved',
      referenceType: 'FGReservation',
      referenceId: reservation.id,
      referenceNo: resNo,
      partyName: customerName || null,
      reason: notes || null,
      movedBy: 'System',
    })

    const { data: updatedBin } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', binId)
      .single()

    return NextResponse.json({
      reservation,
      bin: updatedBin ? withComputedFields(updatedBin) : null,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[FG-Stock Reserve POST]', error)
    return NextResponse.json({ error: error.message || 'Reservation failed' }, { status: 500 })
  }
}
