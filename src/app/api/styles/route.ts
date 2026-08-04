import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List styles with search, filters, pagination, and order metrics ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const category = searchParams.get('category')
    const season = searchParams.get('season')
    const collection = searchParams.get('collection')
    const status = searchParams.get('status') || 'All'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Build the styles query with order items
    let query = supabase
      .from('Style')
      .select('*, OrderItem(id, salesOrderId, quantity, totalAmount, profit)')

    if (search) {
      query = query.or(
        `styleNo.ilike.%${search}%,collectionName.ilike.%${search}%,category.ilike.%${search}%,fabricType.ilike.%${search}%`
      )
    }

    if (category && category !== 'All') {
      query = query.eq('category', category)
    }

    if (season && season !== 'All') {
      query = query.eq('season', season)
    }

    if (collection && collection !== 'All') {
      query = query.eq('collectionName', collection)
    }

    if (status === 'Active' || status === 'Inactive') {
      query = query.eq('status', status)
    }

    // Build the count query (same filters, no include)
    let countQuery = supabase.from('Style').select('*', { count: 'exact', head: true })

    if (search) {
      countQuery = countQuery.or(
        `styleNo.ilike.%${search}%,collectionName.ilike.%${search}%,category.ilike.%${search}%,fabricType.ilike.%${search}%`
      )
    }

    if (category && category !== 'All') {
      countQuery = countQuery.eq('category', category)
    }

    if (season && season !== 'All') {
      countQuery = countQuery.eq('season', season)
    }

    if (collection && collection !== 'All') {
      countQuery = countQuery.eq('collectionName', collection)
    }

    if (status === 'Active' || status === 'Inactive') {
      countQuery = countQuery.eq('status', status)
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to).order('createdAt', { ascending: false })

    const [stylesResult, totalResult] = await Promise.all([query, countQuery])

    if (stylesResult.error) {
      console.error('Supabase error:', stylesResult.error)
      return NextResponse.json(
        { error: 'Failed to load styles' },
        { status: 500 }
      )
    }

    const styles = stylesResult.data || []
    const total = totalResult.count || 0

    // Compute per-style metrics
    const stylesWithMetrics = styles.map((s: any) => {
      const orderItems = s.OrderItem || []
      const uniqueOrderIds = new Set(orderItems.map((oi: any) => oi.salesOrderId))
      const orderCount = uniqueOrderIds.size
      const totalQtyOrdered = orderItems.reduce((sum: number, oi: any) => sum + oi.quantity, 0)
      const totalRevenue = orderItems.reduce((sum: number, oi: any) => sum + oi.totalAmount, 0)
      const totalProfit = orderItems.reduce((sum: number, oi: any) => sum + oi.profit, 0)

      return {
        id: s.id,
        styleNo: s.styleNo,
        collectionName: s.collectionName,
        season: s.season,
        category: s.category,
        fit: s.fit,
        fabricType: s.fabricType,
        embroideryType: s.embroideryType,
        neckDesign: s.neckDesign,
        sleeveType: s.sleeveType,
        brand: s.brand,
        status: s.status,
        costPrice: s.costPrice,
        sellPrice: s.sellPrice,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        orderCount,
        totalQtyOrdered,
        totalRevenue,
        totalProfit,
      }
    })

    // Aggregate counts for filters (unfiltered)
    const { data: allStyles } = await supabase
      .from('Style')
      .select('category, season, collectionName, status, costPrice, sellPrice')

    const categoryCounts: Record<string, number> = {}
    const seasonCounts: Record<string, number> = {}
    const collectionCounts: Record<string, number> = {}
    const statusCounts: Record<string, number> = { Active: 0, Inactive: 0 }

    let totalMarginSum = 0
    let marginStyleCount = 0
    let totalRevenueAll = 0

    for (const s of allStyles || []) {
      if (s.category) categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1
      if (s.season) seasonCounts[s.season] = (seasonCounts[s.season] || 0) + 1
      if (s.collectionName) collectionCounts[s.collectionName] = (collectionCounts[s.collectionName] || 0) + 1
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1
      if (s.sellPrice > 0) {
        totalMarginSum += ((s.sellPrice - s.costPrice) / s.sellPrice) * 100
        marginStyleCount++
      }
    }

    // Compute total revenue from all order items (replace Prisma aggregate)
    const { data: revenueRows } = await supabase
      .from('OrderItem')
      .select('totalAmount')
    totalRevenueAll = Math.round(
      (revenueRows || []).reduce((sum: number, r: any) => sum + (r.totalAmount || 0), 0)
    )

    const avgMargin = marginStyleCount > 0 ? Math.round((totalMarginSum / marginStyleCount) * 10) / 10 : 0

    // Find top category
    let topCategory = '—'
    let topCategoryCount = 0
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > topCategoryCount) {
        topCategory = cat
        topCategoryCount = count
      }
    }

    const collectionsCount = Object.keys(collectionCounts).length

    return NextResponse.json({
      styles: stylesWithMetrics,
      total,
      page,
      limit,
      categoryCounts,
      seasonCounts,
      collectionCounts,
      statusCounts,
      summary: {
        totalStyles: (allStyles || []).length,
        activeStyles: statusCounts.Active || 0,
        avgMargin,
        topCategory,
        totalRevenue: totalRevenueAll,
        collectionsCount,
      },
    })
  } catch (error) {
    console.error('Styles GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load styles' },
      { status: 500 }
    )
  }
}

// ─── POST: Create new style ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      styleNo,
      collectionName,
      season,
      category,
      fit,
      fabricType,
      embroideryType,
      neckDesign,
      sleeveType,
      costPrice,
      sellPrice,
    } = body

    if (!styleNo) {
      return NextResponse.json({ error: 'styleNo is required' }, { status: 400 })
    }
    if (costPrice === undefined || sellPrice === undefined) {
      return NextResponse.json({ error: 'costPrice and sellPrice are required' }, { status: 400 })
    }

    // Check uniqueness
    const { data: existing, error: findError } = await supabase
      .from('Style')
      .select('id')
      .eq('styleNo', styleNo)
      .single()

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 = no row returned (not found), which is OK
      console.error('Supabase error:', findError)
      return NextResponse.json(
        { error: 'Failed to check style uniqueness' },
        { status: 500 }
      )
    }

    if (existing) {
      return NextResponse.json(
        { error: `Style "${styleNo}" already exists` },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()

    const { data: style, error } = await supabase
      .from('Style')
      .insert({
        styleNo,
        collectionName: collectionName || null,
        season: season || null,
        category: category || null,
        fit: fit || null,
        fabricType: fabricType || null,
        embroideryType: embroideryType || null,
        neckDesign: neckDesign || null,
        sleeveType: sleeveType || null,
        brand: 'Elysé by Dhanya',
        status: 'Active',
        costPrice: parseFloat(costPrice),
        sellPrice: parseFloat(sellPrice),
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create style' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        id: style.id,
        styleNo: style.styleNo,
        collectionName: style.collectionName,
        season: style.season,
        category: style.category,
        fit: style.fit,
        fabricType: style.fabricType,
        embroideryType: style.embroideryType,
        neckDesign: style.neckDesign,
        sleeveType: style.sleeveType,
        brand: style.brand,
        status: style.status,
        costPrice: style.costPrice,
        sellPrice: style.sellPrice,
        createdAt: style.createdAt,
        updatedAt: style.updatedAt,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Styles POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create style' },
      { status: 500 }
    )
  }
}
