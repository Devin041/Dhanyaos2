import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'

// ─── GET: List stock reservations with filtering, search, pagination ─────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fabricStockId = searchParams.get('fabricStockId')
    const referenceType = searchParams.get('referenceType')
    const status = searchParams.get('status')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    let query = supabase.from('StockReservation').select('*', { count: 'exact' })
    let countQ = supabase.from('StockReservation').select('*', { count: 'exact', head: true })

    if (fabricStockId) { query = query.eq('fabricStockId', fabricStockId); countQ = countQ.eq('fabricStockId', fabricStockId) }
    if (referenceType && referenceType !== 'All') { query = query.eq('referenceType', referenceType); countQ = countQ.eq('referenceType', referenceType) }
    if (status && status !== 'All') { query = query.eq('status', status); countQ = countQ.eq('status', status) }
    if (search) {
      query = query.or(`reservationNo.ilike.%${search}%,referenceNo.ilike.%${search}%`)
      countQ = countQ.or(`reservationNo.ilike.%${search}%,referenceNo.ilike.%${search}%`)
    }

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.order('createdAt', { ascending: false }).range(from, to)

    const [reservationsRes, totalRes, statusCountsRes, activeReservationsRes, allReservationsRes, fabricStockRes] = await Promise.all([
      query,
      countQ,
      supabase.from('StockReservation').select('status'),
      supabase.from('StockReservation').select('reservedQty').in('status', ['Active', 'Partially Consumed']),
      supabase.from('StockReservation').select('consumedQty'),
      supabase.from('FabricStock').select('availableMeters'),
    ])

    if (reservationsRes.error) throw reservationsRes.error
    if (totalRes.error) throw totalRes.error

    const reservations = reservationsRes.data || []
    const total = totalRes.count ?? 0

    // Status counts in JS
    const allStatusRows = statusCountsRes.data || []
    const counts: Record<string, number> = {
      All: total,
      Active: 0,
      'Partially Consumed': 0,
      'Fully Consumed': 0,
      Released: 0,
      Expired: 0,
    }
    for (const sc of allStatusRows) {
      if (sc.status && counts[sc.status] !== undefined) counts[sc.status]++
    }

    // Summary stats
    const activeRows = activeReservationsRes.data || []
    const allRows = allReservationsRes.data || []
    const fabricRows = fabricStockRes.data || []

    const reservedMeters = activeRows.reduce((s: number, r: any) => s + (r.reservedQty || 0), 0)
    const consumedMeters = allRows.reduce((s: number, r: any) => s + (r.consumedQty || 0), 0)
    const availableUnreserved = fabricRows.reduce((s: number, f: any) => s + (f.availableMeters || 0), 0)

    // Fetch fabric stock details for reservations
    const stockIds = [...new Set(reservations.map((r: any) => r.fabricStockId).filter(Boolean))]
    let stockMap: Record<string, any> = {}
    if (stockIds.length > 0) {
      const { data: stocks } = await supabase
        .from('FabricStock')
        .select('id, fabricName, availableMeters, reservedMeters')
        .in('id', stockIds)
      if (stocks) {
        stockMap = Object.fromEntries(stocks.map((s: any) => [s.id, s]))
      }
    }

    const reservationsWithStock = reservations.map((r: any) => ({
      ...r,
      fabricStock: r.fabricStockId ? stockMap[r.fabricStockId] || null : null,
    }))

    return NextResponse.json({
      reservations: reservationsWithStock,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      counts,
      summary: {
        activeReservations: counts['Active'] + counts['Partially Consumed'],
        reservedMeters,
        consumedMeters,
        availableUnreserved,
      },
    })
  } catch (error) {
    console.error('Error listing stock reservations:', error)
    return NextResponse.json({ error: 'Failed to fetch reservations' }, { status: 500 })
  }
}

// ─── POST: Create stock reservation ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fabricStockId, referenceType, referenceId, referenceNo, reservedQty, expiryDate, notes } = body

    if (!fabricStockId || !referenceType || !referenceId || !referenceNo || !reservedQty || reservedQty <= 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['SalesOrder', 'ProductionJob'].includes(referenceType)) {
      return NextResponse.json({ error: 'referenceType must be SalesOrder or ProductionJob' }, { status: 400 })
    }

    // Fetch fabric stock and validate
    const { data: fabricStock, error: stockErr } = await supabase
      .from('FabricStock')
      .select('*')
      .eq('id', fabricStockId)
      .single()
    if (stockErr || !fabricStock) {
      return NextResponse.json({ error: 'Fabric stock not found' }, { status: 404 })
    }

    if (reservedQty > fabricStock.availableMeters) {
      return NextResponse.json(
        { error: `Insufficient available stock. Available: ${fabricStock.availableMeters}m, Requested: ${reservedQty}m` },
        { status: 400 }
      )
    }

    // Generate reservation number: SR-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { count: todayCount } = await supabase
      .from('StockReservation')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', todayStart.toISOString())
      .lte('createdAt', todayEnd.toISOString())

    const reservationNo = `SR-${today}-${String((todayCount || 0) + 1).padStart(3, '0')}`

    const now = new Date().toISOString()

    // Create reservation
    const { data: reservation, error } = await supabase
      .from('StockReservation')
      .insert({
        reservationNo,
        fabricStockId,
        referenceType,
        referenceId,
        referenceNo,
        reservedQty,
        consumedQty: 0,
        status: 'Active',
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    // Update fabric stock: decrement available, increment reserved
    const newAvailable = fabricStock.availableMeters - reservedQty
    const newReserved = fabricStock.reservedMeters + reservedQty
    const newValue = Math.max(0, fabricStock.totalValue - (reservedQty * fabricStock.averageCost))

    await supabase
      .from('FabricStock')
      .update({
        availableMeters: Math.max(0, newAvailable),
        reservedMeters: newReserved,
        totalValue: newValue,
        updatedAt: now,
      })
      .eq('id', fabricStockId)

    // Fetch fabric stock for response
    const { data: stockForResponse } = await supabase
      .from('FabricStock')
      .select('id, fabricName, availableMeters, reservedMeters')
      .eq('id', fabricStockId)
      .single()

    return NextResponse.json({
      reservation: {
        ...reservation,
        fabricStock: stockForResponse || null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating stock reservation:', error)
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 })
  }
}
