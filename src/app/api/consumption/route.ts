import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'

// ─── GET: List consumption records with filtering, pagination ──────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const fabricId = searchParams.get('fabricId')
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    let query = supabase.from('FabricConsumption').select('*', { count: 'exact' })

    if (jobId) query = query.eq('productionJobId', jobId)
    if (fabricId) query = query.eq('fabricStockId', fabricId)
    if (fromDate) query = query.gte('consumptionDate', new Date(fromDate).toISOString())
    if (toDate) query = query.lte('consumptionDate', new Date(toDate).toISOString())
    if (search) {
      query = query.or(`consumptionNo.ilike.%${search}%,fabricName.ilike.%${search}%`)
    }

    // Count query
    let countQ = supabase.from('FabricConsumption').select('*', { count: 'exact', head: true })
    if (jobId) countQ = countQ.eq('productionJobId', jobId)
    if (fabricId) countQ = countQ.eq('fabricStockId', fabricId)
    if (fromDate) countQ = countQ.gte('consumptionDate', new Date(fromDate).toISOString())
    if (toDate) countQ = countQ.lte('consumptionDate', new Date(toDate).toISOString())
    if (search) countQ = countQ.or(`consumptionNo.ilike.%${search}%,fabricName.ilike.%${search}%`)

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.order('consumptionDate', { ascending: false }).range(from, to)

    const [consumptionsRes, totalRes, allConsumptionsRes, highWasteRes] = await Promise.all([
      query,
      countQ,
      supabase.from('FabricConsumption').select('wastagePercent, consumedQty, wastageQty, issuedQty'),
      supabase.from('FabricConsumption').select('id').gt('wastagePercent', 8),
    ])

    if (consumptionsRes.error) throw consumptionsRes.error
    if (totalRes.error) throw totalRes.error
    if (allConsumptionsRes.error) throw allConsumptionsRes.error

    const consumptions = consumptionsRes.data || []
    const total = totalRes.count ?? 0

    // Summary stats in JS
    const allRows = allConsumptionsRes.data || []
    const totalConsumed = allRows.reduce((s: number, c: any) => s + (c.consumedQty || 0), 0)
    const totalWastage = allRows.reduce((s: number, c: any) => s + (c.wastageQty || 0), 0)
    const avgWastage = allRows.length > 0
      ? allRows.reduce((s: number, c: any) => s + (c.wastagePercent || 0), 0) / allRows.length
      : 0
    const highWasteCount = highWasteRes.data?.length ?? 0

    // Fetch related data
    const jobIds = [...new Set(consumptions.map((c: any) => c.productionJobId).filter(Boolean))]
    const stockIds = [...new Set(consumptions.map((c: any) => c.fabricStockId).filter(Boolean))]

    let jobMap: Record<string, any> = {}
    let stockMap: Record<string, any> = {}
    if (jobIds.length > 0) {
      const { data: jobs } = await supabase
        .from('ProductionJob')
        .select('id, jobNo, styleNo, styleName')
        .in('id', jobIds)
      if (jobs) jobMap = Object.fromEntries(jobs.map((j: any) => [j.id, j]))
    }
    if (stockIds.length > 0) {
      const { data: stocks } = await supabase
        .from('FabricStock')
        .select('id, fabricName')
        .in('id', stockIds)
      if (stocks) stockMap = Object.fromEntries(stocks.map((s: any) => [s.id, s]))
    }

    const consumptionsWithRelations = consumptions.map((c: any) => ({
      ...c,
      productionJob: c.productionJobId ? jobMap[c.productionJobId] || null : null,
      fabricStock: c.fabricStockId ? stockMap[c.fabricStockId] || null : null,
    }))

    return NextResponse.json({
      consumptions: consumptionsWithRelations,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        avgWastagePercent: avgWastage,
        totalConsumedMeters: totalConsumed,
        totalWastageMeters: totalWastage,
        highWasteAlerts: highWasteCount,
      },
    })
  } catch (error) {
    console.error('Error listing consumption records:', error)
    return NextResponse.json({ error: 'Failed to fetch consumption records' }, { status: 500 })
  }
}

// ─── POST: Create consumption record ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productionJobId, fabricStockId, fabricName, issuedQty, consumedQty, outputQty, plannedQty, wastageReason, wastageRemarks, recordedBy } = body

    if (!productionJobId || !fabricStockId || !fabricName || !issuedQty || !consumedQty || !outputQty) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (issuedQty < consumedQty) {
      return NextResponse.json({ error: 'Consumed qty cannot exceed issued qty' }, { status: 400 })
    }

    if (outputQty <= 0) {
      return NextResponse.json({ error: 'Output qty must be greater than 0' }, { status: 400 })
    }

    // Auto-calculate fields
    const wastageQty = issuedQty - consumedQty
    const wastagePercent = issuedQty > 0 ? (wastageQty / issuedQty) * 100 : 0
    const consumptionPerPc = outputQty > 0 ? consumedQty / outputQty : 0
    const varianceVsPlan = plannedQty ? consumedQty - plannedQty : 0

    // Generate consumption number: FC-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { count: todayCount } = await supabase
      .from('FabricConsumption')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', todayStart.toISOString())
      .lte('createdAt', todayEnd.toISOString())

    const consumptionNo = `FC-${today}-${String((todayCount || 0) + 1).padStart(3, '0')}`

    // Fetch fabric stock
    const { data: fabricStock, error: stockErr } = await supabase
      .from('FabricStock')
      .select('*')
      .eq('id', fabricStockId)
      .single()

    if (stockErr || !fabricStock) {
      return NextResponse.json({ error: 'Fabric stock not found' }, { status: 404 })
    }

    if (consumedQty > fabricStock.availableMeters) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${fabricStock.availableMeters}m, Consuming: ${consumedQty}m` },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    // Create consumption record
    const { data: consumption, error } = await supabase
      .from('FabricConsumption')
      .insert({
        consumptionNo,
        productionJobId,
        fabricStockId,
        fabricName,
        issuedQty,
        consumedQty,
        wastageQty,
        wastagePercent,
        plannedQty: plannedQty || 0,
        varianceVsPlan,
        outputQty,
        consumptionPerPc,
        wastageReason: wastageReason || null,
        wastageRemarks: wastageRemarks || null,
        recordedBy: recordedBy || null,
        consumptionDate: now,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    // Deduct from fabric stock (manual decrement)
    const newAvailable = fabricStock.availableMeters - consumedQty
    const newTotalValue = fabricStock.totalValue - (consumedQty * fabricStock.averageCost)
    await supabase
      .from('FabricStock')
      .update({
        availableMeters: Math.max(0, newAvailable),
        totalValue: Math.max(0, newTotalValue),
        updatedAt: now,
      })
      .eq('id', fabricStockId)

    // Update reservation if exists for this job + fabric
    const { data: existingReservations } = await supabase
      .from('StockReservation')
      .select('*')
      .eq('referenceType', 'ProductionJob')
      .eq('referenceId', productionJobId)
      .eq('fabricStockId', fabricStockId)
      .in('status', ['Active', 'Partially Consumed'])
      .limit(1)

    if (existingReservations && existingReservations.length > 0) {
      const reservation = existingReservations[0]
      const newConsumed = reservation.consumedQty + consumedQty
      const newStatus = newConsumed >= reservation.reservedQty ? 'Fully Consumed' : 'Partially Consumed'

      await supabase
        .from('StockReservation')
        .update({
          consumedQty: newConsumed,
          status: newStatus,
          updatedAt: now,
        })
        .eq('id', reservation.id)
    }

    // Create alert if high wastage
    if (wastagePercent > 8) {
      // Fetch job for message
      const { data: job } = await supabase
        .from('ProductionJob')
        .select('jobNo')
        .eq('id', productionJobId)
        .single()

      await supabase.from('Alert').insert({
        type: 'wastage',
        severity: 'warning',
        title: 'High Wastage Alert',
        message: `High wastage ${wastagePercent.toFixed(1)}% in ${consumptionNo} for ${fabricName} (Job: ${job?.jobNo || 'N/A'})`,
        createdAt: now,
      })
    }

    // Fetch relations for response
    const [jobRes, stockRes] = await Promise.all([
      supabase.from('ProductionJob').select('id, jobNo, styleNo, styleName').eq('id', productionJobId).single(),
      supabase.from('FabricStock').select('id, fabricName').eq('id', fabricStockId).single(),
    ])

    return NextResponse.json({
      consumption: {
        ...consumption,
        productionJob: jobRes.data || null,
        fabricStock: stockRes.data || null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating consumption record:', error)
    return NextResponse.json({ error: 'Failed to create consumption record' }, { status: 500 })
  }
}
