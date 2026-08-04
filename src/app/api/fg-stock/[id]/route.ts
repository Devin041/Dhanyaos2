import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { withComputedFields, generateMovementNo } from '@/lib/fg-color-code'

// ─── GET: Single bin detail + last 30 days movements + active reservations ──
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: bin, error } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !bin) {
      return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [movementsRes, reservationsRes] = await Promise.all([
      supabase
        .from('FGStockMovement')
        .select('*')
        .eq('fgStockBinId', id)
        .gte('movedAt', thirtyDaysAgo.toISOString())
        .order('movedAt', { ascending: false })
        .limit(100),
      supabase
        .from('FGReservation')
        .select('*')
        .eq('fgStockBinId', id)
        .in('status', ['Active', 'PartiallyDispatched']),
    ])

    return NextResponse.json({
      bin: withComputedFields(bin),
      recentMovements: movementsRes.data || [],
      activeReservations: reservationsRes.data || [],
    })
  } catch (error: any) {
    console.error('[FG-Stock [id] GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch stock bin' }, { status: 500 })
  }
}

// ─── PATCH: Update metadata only ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Only allow metadata fields
    const allowedFields = ['notes', 'location', 'unitCost', 'unitSellPrice', 'image', 'styleName'] as const
    const updateData: any = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Ensure no quantity fields slipped through
    const qtyFields = ['availableQty', 'reservedQty', 'qcPendingQty', 'underRepairQty', 'defectiveQty', 'scrappedQty', 'exhibitionQty']
    for (const f of qtyFields) {
      if (body[f] !== undefined) {
        return NextResponse.json({ error: `Cannot update ${f} via PATCH. Use /api/fg-stock/movement instead.` }, { status: 400 })
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updatedBin, error } = await supabase
      .from('FGStockBin')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    return NextResponse.json(withComputedFields(updatedBin))
  } catch (error: any) {
    console.error('[FG-Stock [id] PATCH]', error)
    return NextResponse.json({ error: error.message || 'Failed to update stock bin' }, { status: 500 })
  }
}

// ─── DELETE: Soft-delete (scrap all stock) ──
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: bin, error: binErr } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', id)
      .single()
    if (binErr || !bin) {
      return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
    }

    const mvtNo = generateMovementNo()
    const totalToScrap =
      bin.availableQty + bin.reservedQty + bin.qcPendingQty +
      bin.underRepairQty + bin.defectiveQty + bin.exhibitionQty

    if (totalToScrap === 0) {
      // Just delete the empty bin
      await supabase.from('FGStockBin').delete().eq('id', id)
      return NextResponse.json({ deleted: true, scrapped: 0 })
    }

    // Move everything to scrapped
    const updateData: any = {
      availableQty: 0,
      reservedQty: 0,
      qcPendingQty: 0,
      underRepairQty: 0,
      defectiveQty: 0,
      exhibitionQty: 0,
      scrappedQty: bin.scrappedQty + totalToScrap,
      lastMovementDate: new Date().toISOString(),
      notes: (bin.notes ? bin.notes + '\n' : '') + '[DELETED] All stock scrapped via soft-delete',
    }

    const { error: updErr } = await supabase
      .from('FGStockBin')
      .update(updateData)
      .eq('id', id)
    if (updErr) throw updErr

    await supabase.from('FGStockMovement').insert({
      movementNo: mvtNo,
      movementType: 'Scrapping',
      fgStockBinId: id,
      styleNo: bin.styleNo,
      styleName: bin.styleName,
      colorCode: bin.colorCode,
      color: bin.color,
      size: bin.size,
      quantity: totalToScrap,
      previousQty: bin.availableQty,
      newQty: 0,
      unitCost: bin.unitCost,
      fromStatus: 'All',
      toStatus: 'Scrapped',
      referenceType: 'Adjustment',
      reason: 'Soft-delete: all stock scrapped',
      movedBy: 'System',
    })

    return NextResponse.json({ deleted: true, scrapped: totalToScrap })
  } catch (error: any) {
    console.error('[FG-Stock [id] DELETE]', error)
    return NextResponse.json({ error: error.message || 'Failed to delete stock bin' }, { status: 500 })
  }
}
