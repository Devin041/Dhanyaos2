import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateColorCode, generateMovementNo, withComputedFields, computeBinHealth, type StockBinWithComputed } from '@/lib/fg-color-code'

// ─── GET: List all FG stock bins with KPI stats + health indicators ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const health = searchParams.get('health')
    const styleNo = searchParams.get('styleNo')?.trim()
    const colorCode = searchParams.get('colorCode')?.trim()
    const color = searchParams.get('color')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const sortBy = searchParams.get('sortBy') || 'updatedAt'
    const sortDir = searchParams.get('sortDir') || 'desc'

    // ── Count with filters ──
    let countQuery = supabase.from('FGStockBin').select('*', { count: 'exact', head: true })
    if (styleNo) countQuery = countQuery.eq('styleNo', styleNo)
    if (colorCode) countQuery = countQuery.eq('colorCode', colorCode)
    if (color) countQuery = countQuery.eq('color', color)
    const { count: total, error: countErr } = await countQuery
    if (countErr) throw countErr

    const validSortFields = [
      'styleNo', 'styleName', 'colorCode', 'color', 'size',
      'availableQty', 'unitCost', 'unitSellPrice', 'updatedAt', 'createdAt', 'location',
    ] as const
    const sortField = validSortFields.includes(sortBy as any) ? sortBy : 'updatedAt'
    const isAsc = sortDir === 'asc'

    // ── Data query (fetch extra for health post-filter) ──
    const fetchLimit = limit + 200
    let dataQuery = supabase
      .from('FGStockBin')
      .select('*')
      .order(sortField, { ascending: isAsc })
      .range((page - 1) * (fetchLimit + limit), (page - 1) * (fetchLimit + limit) + fetchLimit - 1)

    if (styleNo) dataQuery = dataQuery.eq('styleNo', styleNo)
    if (colorCode) dataQuery = dataQuery.eq('colorCode', colorCode)
    if (color) dataQuery = dataQuery.eq('color', color)
    if (search) {
      dataQuery = dataQuery.or(`styleNo.ilike.%${search}%,styleName.ilike.%${search}%,colorCode.ilike.%${search}%,color.ilike.%${search}%`)
    }

    const { data: rawBins, error } = await dataQuery
    if (error) throw error

    let bins = (rawBins || []).map(b => ({ ...b, _health: computeBinHealth(b) }))

    // Filter by health if requested
    if (health) {
      bins = bins.filter(b => b._health === health)
    }
    bins = bins.slice(0, limit)

    const binsWithComputed = bins.map(b => {
      const { _health, ...rest } = b
      return withComputedFields(rest)
    })

    // ── lastDispatch per bin (Phase 6): latest Outward Dispatch movement →
    // partyName / dispatchNo / date. ONE batched query for the whole page;
    // ordered movedAt DESC so the first row seen per bin is its latest.
    // Bins with no dispatch movement keep lastDispatch: null.
    const lastDispatchByBin: Record<string, {
      partyName: string | null
      dispatchNo: string | null
      date: string | null
      qty: number
    }> = {}
    const binIds = binsWithComputed.map(b => b.id)
    if (binIds.length > 0) {
      const { data: dispatchMovements } = await supabase
        .from('FGStockMovement')
        .select('fgStockBinId, partyName, referenceNo, movedAt, quantity')
        .in('fgStockBinId', binIds)
        .eq('movementType', 'Outward')
        .eq('referenceType', 'Dispatch')
        .order('movedAt', { ascending: false })
        .limit(1000)
      for (const m of (dispatchMovements || []) as any[]) {
        const binId = m.fgStockBinId as string
        if (binId && !lastDispatchByBin[binId]) {
          lastDispatchByBin[binId] = {
            partyName: m.partyName || null,
            dispatchNo: m.referenceNo || null,
            date: m.movedAt || null,
            qty: Number(m.quantity) || 0,
          }
        }
      }
    }
    const binsWithLastDispatch: Array<StockBinWithComputed & {
      lastDispatch: { partyName: string | null; dispatchNo: string | null; date: string | null; qty: number } | null
    }> = binsWithComputed.map(b => ({
      ...b,
      lastDispatch: lastDispatchByBin[b.id] || null,
    }))

    // ── Global stats (across ALL bins) ──
    const { data: allBins } = await supabase.from('FGStockBin').select('*')
    const totalStyles = new Set((allBins || []).map((b: any) => b.styleNo)).size

    let totalPieces = 0
    let availablePieces = 0
    let reservedPieces = 0
    let qcPendingPieces = 0
    let deadStockPieces = 0
    let totalStockValue = 0
    let totalSellValue = 0
    let healthCounts: Record<string, number> = { Healthy: 0, LowStock: 0, Critical: 0, Empty: 0, DeadStock: 0 }

    for (const b of (allBins || [])) {
      const tp = b.availableQty + b.reservedQty + b.qcPendingQty + b.underRepairQty + b.defectiveQty + b.scrappedQty + b.exhibitionQty
      totalPieces += tp
      availablePieces += b.availableQty
      reservedPieces += b.reservedQty
      qcPendingPieces += b.qcPendingQty
      deadStockPieces += b.defectiveQty + b.scrappedQty
      totalStockValue += tp * (b.unitCost || 0)
      totalSellValue += tp * (b.unitSellPrice || 0)
      const h = computeBinHealth(b)
      healthCounts[h] = (healthCounts[h] || 0) + 1
    }

    // Full sets / orphan calculation
    const colorSizeMap: Record<string, Record<string, number>> = {}
    for (const b of (allBins || [])) {
      const key = `${b.styleNo}-${b.color}`
      if (!colorSizeMap[key]) colorSizeMap[key] = {}
      const active = b.availableQty + b.reservedQty + b.qcPendingQty + b.underRepairQty + b.exhibitionQty
      if (active > 0) {
        colorSizeMap[key][b.size] = (colorSizeMap[key][b.size] || 0) + active
      }
    }
    const colorSizes = Object.values(colorSizeMap).map(sm => Object.keys(sm).length)
    const avgSizesPerColor = colorSizes.length > 0 ? Math.round(colorSizes.reduce((a, b) => a + b, 0) / colorSizes.length) : 0
    const orphanPieces = totalPieces > 0 ? Math.max(0, totalPieces % avgSizesPerColor) : 0
    const fullSets = avgSizesPerColor > 0 ? Math.floor(totalPieces / avgSizesPerColor) : 0

    const stats = {
      totalStyles,
      totalPieces,
      fullSets,
      orphanPieces,
      availablePieces,
      reservedPieces,
      qcPendingPieces,
      deadStockPieces,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
      totalSellValue: Math.round(totalSellValue * 100) / 100,
      potentialProfit: Math.round((totalSellValue - totalStockValue) * 100) / 100,
    }

    return NextResponse.json({
      bins: binsWithLastDispatch,
      stats,
      healthDist: healthCounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('[FG-Stock GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch FG stock' }, { status: 500 })
  }
}

// ─── POST: Create stock bin with auto-generated colorCode ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { styleNo, styleName, color, size, unitCost, unitSellPrice, image, location, notes, initialQty, reason, movedBy } = body

    if (!styleNo || !styleName || !color || !size) {
      return NextResponse.json({ error: 'styleNo, styleName, color, size are required' }, { status: 400 })
    }

    // Check unique constraint
    const { data: existing } = await supabase
      .from('FGStockBin')
      .select('id, colorCode')
      .eq('styleNo', styleNo)
      .eq('color', color)
      .eq('size', size)
      .limit(1)
      .single()
    if (existing) {
      return NextResponse.json({ error: `Stock bin already exists for ${styleNo} / ${color} / ${size}`, colorCode: existing.colorCode }, { status: 409 })
    }

    // Auto-generate colorCode
    const colorCode = await generateColorCode(styleNo, color)
    const now = new Date()
    const qty = Math.max(0, initialQty || 0)

    const { data: bin, error: createErr } = await supabase
      .from('FGStockBin')
      .insert({
        styleNo,
        styleName,
        colorCode,
        color,
        size,
        availableQty: qty,
        unitCost: unitCost || 0,
        unitSellPrice: unitSellPrice || 0,
        image: image || null,
        location: location || 'Warehouse',
        notes: notes || null,
        firstInDate: qty > 0 ? now.toISOString() : null,
        lastMovementDate: qty > 0 ? now.toISOString() : null,
      })
      .select()
      .single()
    if (createErr) {
      if (createErr.code === '23505') {
        return NextResponse.json({ error: 'Duplicate entry: styleNo + color + size must be unique' }, { status: 409 })
      }
      throw createErr
    }

    // Create movement if initialQty > 0
    if (qty > 0) {
      await supabase.from('FGStockMovement').insert({
        movementNo: generateMovementNo(),
        movementType: 'Adjustment',
        fgStockBinId: bin.id,
        styleNo,
        styleName,
        colorCode,
        color,
        size,
        quantity: qty,
        previousQty: 0,
        newQty: qty,
        unitCost: unitCost || 0,
        referenceType: 'Adjustment',
        reason: reason || 'Initial stock entry',
        movedBy: movedBy || 'System',
      })
    }

    // Auto-resolve image from Sample (Supabase) if not provided
    if (!image || image === '') {
      const { data: samples } = await supabase
        .from('Sample')
        .select('id')
        .eq('styleNo', styleNo)
        .limit(1)

      if (samples && samples.length > 0) {
        const { data: photos } = await supabase
          .from('SamplePhoto')
          .select('imageUrl')
          .eq('sampleId', samples[0].id)
          .order('sortOrder', { ascending: true })
          .limit(1)
        if (photos && photos.length > 0 && photos[0].imageUrl) {
          await supabase.from('FGStockBin').update({ image: photos[0].imageUrl }).eq('id', bin.id)
          bin.image = photos[0].imageUrl
        }
      }
    }

    return NextResponse.json(withComputedFields(bin), { status: 201 })
  } catch (error: any) {
    console.error('[FG-Stock POST]', error)
    return NextResponse.json({ error: error.message || 'Failed to create stock bin' }, { status: 500 })
  }
}
