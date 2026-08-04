import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateReservationNo, generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── GET: List reservations ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.trim()
    const styleNo = searchParams.get('styleNo')?.trim()
    const colorCode = searchParams.get('colorCode')?.trim()
    const salesOrderId = searchParams.get('salesOrderId')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Count query
    let countQuery = supabase.from('FGReservation').select('*', { count: 'exact', head: true })
    if (status) countQuery = countQuery.eq('status', status)
    if (styleNo) countQuery = countQuery.eq('styleNo', styleNo)
    if (colorCode) countQuery = countQuery.eq('colorCode', colorCode)
    if (salesOrderId) countQuery = countQuery.eq('salesOrderId', salesOrderId)

    // Data query
    let dataQuery = supabase.from('FGReservation').select('*')
      .order('createdAt', { ascending: false })
      .range(from, to)
    if (status) dataQuery = dataQuery.eq('status', status)
    if (styleNo) dataQuery = dataQuery.eq('styleNo', styleNo)
    if (colorCode) dataQuery = dataQuery.eq('colorCode', colorCode)
    if (salesOrderId) dataQuery = dataQuery.eq('salesOrderId', salesOrderId)

    const [{ count: total }, { data: reservations, error }] = await Promise.all([
      countQuery,
      dataQuery,
    ])
    if (error) throw error

    // Fetch related bin info for each reservation
    const binIds = (reservations || []).map((r: any) => r.fgStockBinId).filter(Boolean)
    const binMap: Record<string, any> = {}
    if (binIds.length > 0) {
      const { data: bins } = await supabase
        .from('FGStockBin')
        .select('id, colorCode, image, size')
        .in('id', binIds)
      for (const b of (bins || [])) {
        binMap[b.id] = b
      }
    }

    const reservationsWithBin = (reservations || []).map((r: any) => ({
      ...r,
      fgStockBin: binMap[r.fgStockBinId] ? {
        colorCode: binMap[r.fgStockBinId].colorCode,
        image: binMap[r.fgStockBinId].image,
        size: binMap[r.fgStockBinId].size,
      } : null,
    }))

    return NextResponse.json({
      reservations: reservationsWithBin,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error('[FG-Reservations GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch reservations' }, { status: 500 })
  }
}

// ─── POST: Create reservation ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      salesOrderId, salesOrderNo, customerId, customerName,
      fgStockBinId, styleNo, colorCode, color, size,
      reservedQty, expiryDate, notes,
    } = body

    if (!salesOrderId || !salesOrderNo || !fgStockBinId || !styleNo || !color || !size || !reservedQty) {
      return NextResponse.json({ error: 'salesOrderId, salesOrderNo, fgStockBinId, styleNo, color, size, reservedQty are required' }, { status: 400 })
    }

    if (reservedQty <= 0) {
      return NextResponse.json({ error: 'reservedQty must be positive' }, { status: 400 })
    }

    // Check bin has enough available stock
    const { data: bin, error: binErr } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', fgStockBinId)
      .single()
    if (binErr || !bin) {
      return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
    }
    if (bin.availableQty < reservedQty) {
      return NextResponse.json({ error: `Insufficient available stock. Available: ${bin.availableQty}, Requested: ${reservedQty}` }, { status: 400 })
    }

    const resNo = generateReservationNo()

    // Create reservation
    const { data: reservation, error: resErr } = await supabase
      .from('FGReservation')
      .insert({
        reservationNo: resNo,
        salesOrderId,
        salesOrderNo,
        customerId: customerId || null,
        customerName: customerName || null,
        fgStockBinId,
        styleNo,
        colorCode: colorCode || bin.colorCode,
        color,
        size,
        reservedQty,
        status: 'Active',
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        notes: notes || null,
      })
      .select()
      .single()
    if (resErr) throw resErr

    // Create stock movement
    const mvtNo = generateMovementNo()
    const prevQty = bin.availableQty
    await supabase
      .from('FGStockBin')
      .update({
        availableQty: prevQty - reservedQty,
        reservedQty: bin.reservedQty + reservedQty,
        lastMovementDate: new Date().toISOString(),
      })
      .eq('id', fgStockBinId)

    await supabase.from('FGStockMovement').insert({
      movementNo: mvtNo,
      movementType: 'Reservation',
      fgStockBinId,
      styleNo: bin.styleNo,
      styleName: bin.styleName,
      colorCode: bin.colorCode,
      color: bin.color,
      size: bin.size,
      quantity: reservedQty,
      previousQty: prevQty,
      newQty: prevQty - reservedQty,
      unitCost: bin.unitCost,
      fromStatus: 'Available',
      toStatus: 'Reserved',
      referenceType: 'FGReservation',
      referenceId: reservation.id,
      referenceNo: resNo,
      movedBy: 'System',
    })

    const { data: updatedBin } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('id', fgStockBinId)
      .single()

    return NextResponse.json({
      reservation,
      bin: updatedBin ? withComputedFields(updatedBin) : null,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[FG-Reservations POST]', error)
    return NextResponse.json({ error: error.message || 'Failed to create reservation' }, { status: 500 })
  }
}
