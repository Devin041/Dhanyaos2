import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single reservation detail ──────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: reservation, error } = await supabase
      .from('StockReservation')
      .select()
      .eq('id', id)
      .single()

    if (error || !reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    // Fetch fabric stock details
    let fabricStock = null
    if (reservation.fabricStockId) {
      const { data: stock } = await supabase
        .from('FabricStock')
        .select('id, fabricName, gsm, width, lotNumber, availableMeters, reservedMeters, averageCost')
        .eq('id', reservation.fabricStockId)
        .single()
      fabricStock = stock || null
    }

    return NextResponse.json({ reservation: { ...reservation, fabricStock } })
  } catch (error) {
    console.error('Error fetching reservation:', error)
    return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500 })
  }
}

// ─── PATCH: Release reservation or update consumed qty ───────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, consumedQty } = body

    const { data: reservation, error: findErr } = await supabase
      .from('StockReservation')
      .select()
      .eq('id', id)
      .single()

    if (findErr || !reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    // Fetch fabric stock
    const { data: fabricStock } = await supabase
      .from('FabricStock')
      .select('*')
      .eq('id', reservation.fabricStockId)
      .single()

    if (action === 'release') {
      if (!['Active', 'Partially Consumed'].includes(reservation.status)) {
        return NextResponse.json({ error: `Cannot release reservation with status: ${reservation.status}` }, { status: 400 })
      }

      const remaining = reservation.reservedQty - reservation.consumedQty
      if (remaining <= 0) {
        return NextResponse.json({ error: 'Nothing to release — fully consumed' }, { status: 400 })
      }

      const now = new Date().toISOString()

      const { data: updated, error } = await supabase
        .from('StockReservation')
        .update({
          status: 'Released',
          updatedAt: now,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Increment fabric stock available, decrement reserved
      if (fabricStock) {
        await supabase
          .from('FabricStock')
          .update({
            availableMeters: fabricStock.availableMeters + remaining,
            reservedMeters: Math.max(0, fabricStock.reservedMeters - remaining),
            totalValue: fabricStock.totalValue + (remaining * fabricStock.averageCost),
            updatedAt: now,
          })
          .eq('id', reservation.fabricStockId)
      }

      // Re-fetch fabric stock for response
      const { data: updatedStock } = await supabase
        .from('FabricStock')
        .select('*')
        .eq('id', reservation.fabricStockId)
        .single()

      return NextResponse.json({ reservation: { ...updated, fabricStock: updatedStock || fabricStock || null } })

    } else if (action === 'updateConsumed') {
      if (consumedQty === undefined || consumedQty < 0) {
        return NextResponse.json({ error: 'Invalid consumedQty' }, { status: 400 })
      }

      if (consumedQty > reservation.reservedQty) {
        return NextResponse.json({ error: 'consumedQty cannot exceed reservedQty' }, { status: 400 })
      }

      const newStatus = consumedQty >= reservation.reservedQty ? 'Fully Consumed' : consumedQty > 0 ? 'Partially Consumed' : reservation.status

      const { data: updated, error } = await supabase
        .from('StockReservation')
        .update({
          consumedQty,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      const { data: updatedStock } = await supabase
        .from('FabricStock')
        .select('*')
        .eq('id', reservation.fabricStockId)
        .single()

      return NextResponse.json({ reservation: { ...updated, fabricStock: updatedStock || null } })

    } else {
      return NextResponse.json({ error: 'Invalid action. Use "release" or "updateConsumed"' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error updating reservation:', error)
    return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 })
  }
}

// ─── DELETE: Delete reservation ──────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: reservation, error: findErr } = await supabase
      .from('StockReservation')
      .select('*')
      .eq('id', id)
      .single()

    if (findErr || !reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    // If active/partially consumed, release stock back
    if (['Active', 'Partially Consumed'].includes(reservation.status)) {
      const remaining = reservation.reservedQty - reservation.consumedQty
      if (remaining > 0) {
        const { data: fabricStock } = await supabase
          .from('FabricStock')
          .select('*')
          .eq('id', reservation.fabricStockId)
          .single()

        if (fabricStock) {
          await supabase
            .from('FabricStock')
            .update({
              availableMeters: fabricStock.availableMeters + remaining,
              reservedMeters: Math.max(0, fabricStock.reservedMeters - remaining),
              totalValue: fabricStock.totalValue + (remaining * fabricStock.averageCost),
              updatedAt: new Date().toISOString(),
            })
            .eq('id', reservation.fabricStockId)
        }
      }
    }

    const { error } = await supabase.from('StockReservation').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting reservation:', error)
    return NextResponse.json({ error: 'Failed to delete reservation' }, { status: 500 })
  }
}
