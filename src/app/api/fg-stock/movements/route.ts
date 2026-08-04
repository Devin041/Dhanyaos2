import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Movement log with filters ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNo = searchParams.get('styleNo')?.trim()
    const colorCode = searchParams.get('colorCode')?.trim()
    const movementType = searchParams.get('movementType')?.trim()
    const referenceType = searchParams.get('referenceType')?.trim()
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Build filter function
    const applyFilters = (q: any) => {
      if (styleNo) q = q.eq('styleNo', styleNo)
      if (colorCode) q = q.eq('colorCode', colorCode)
      if (movementType) q = q.eq('movementType', movementType)
      if (referenceType) q = q.eq('referenceType', referenceType)
      if (fromDate) q = q.gte('movedAt', new Date(fromDate).toISOString())
      if (toDate) q = q.lte('movedAt', new Date(toDate).toISOString())
      return q
    }

    // Count query
    const countQuery = applyFilters(
      supabase.from('FGStockMovement').select('*', { count: 'exact', head: true })
    )

    // Data query
    const dataQuery = applyFilters(
      supabase.from('FGStockMovement').select('*')
        .order('movedAt', { ascending: false })
        .range(from, to)
    )

    // Type counts query - get all movements for counting (separate from paginated)
    const allDataQuery = applyFilters(
      supabase.from('FGStockMovement').select('movementType')
    )

    const [{ count: total }, { data: movements, error }, { data: allMovements }] = await Promise.all([
      countQuery,
      dataQuery,
      allDataQuery,
    ])
    if (error) throw error

    // Compute type counts
    const typeCounts: Record<string, number> = {}
    for (const m of (allMovements || [])) {
      typeCounts[m.movementType] = (typeCounts[m.movementType] || 0) + 1
    }

    // Fetch related bin info for each movement
    const binIds = [...new Set((movements || []).map((m: any) => m.fgStockBinId).filter(Boolean))]
    const binMap: Record<string, any> = {}
    if (binIds.length > 0) {
      const { data: bins } = await supabase
        .from('FGStockBin')
        .select('id, colorCode, image')
        .in('id', binIds)
      for (const b of (bins || [])) {
        binMap[b.id] = { colorCode: b.colorCode, image: b.image }
      }
    }

    const movementsWithBin = (movements || []).map((m: any) => ({
      ...m,
      fgStockBin: binMap[m.fgStockBinId] || null,
    }))

    return NextResponse.json({
      movements: movementsWithBin,
      typeCounts,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error('[FG-Stock Movements GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch movements' }, { status: 500 })
  }
}
