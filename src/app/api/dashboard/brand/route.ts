import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Collection/Style Performance from order items
    const { data: orderItems } = await supabase
      .from('OrderItem')
      .select('styleName, quantity, totalAmount, totalCost, profit')

    const stylePerformanceMap = new Map<string, { orders: number; quantity: number; revenue: number; cost: number; profit: number }>()
    for (const item of (orderItems || [])) {
      const existing = stylePerformanceMap.get(item.styleName) || { orders: 0, quantity: 0, revenue: 0, cost: 0, profit: 0 }
      existing.orders++
      existing.quantity += item.quantity || 0
      existing.revenue += item.totalAmount || 0
      existing.cost += item.totalCost || 0
      existing.profit += item.profit || 0
      stylePerformanceMap.set(item.styleName, existing)
    }
    const stylePerformance = Array.from(stylePerformanceMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([styleName, s]) => ({
        styleName,
        orders: s.orders,
        quantity: s.quantity,
        revenue: s.revenue,
        cost: s.cost,
        profit: s.profit,
        margin: s.revenue ? Math.round((s.profit / s.revenue) * 10000) / 100 : 0,
      }))

    // All styles for catalog
    const { data: styles } = await supabase
      .from('Style')
      .select('*')
      .order('collectionName', { ascending: true })

    // Collection grouping from styles
    const collectionMap = new Map<string, number>()
    for (const s of (styles || [])) {
      collectionMap.set(s.collectionName || 'Uncategorized', (collectionMap.get(s.collectionName || 'Uncategorized') || 0) + 1)
    }
    const collections = Array.from(collectionMap.entries()).map(([name, count]) => ({ name, count }))

    // Season distribution
    const seasonMap = new Map<string, number>()
    for (const s of (styles || [])) {
      seasonMap.set(s.season || 'All Season', (seasonMap.get(s.season || 'All Season') || 0) + 1)
    }
    const seasons = Array.from(seasonMap.entries()).map(([name, count]) => ({ name, count }))

    // Category distribution
    const categoryMap = new Map<string, number>()
    for (const s of (styles || [])) {
      categoryMap.set(s.category || 'Other', (categoryMap.get(s.category || 'Other') || 0) + 1)
    }
    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count }))

    return NextResponse.json({
      stylePerformance,
      catalog: (styles || []).map(s => ({
        id: s.id,
        styleNo: s.styleNo,
        collection: s.collectionName,
        season: s.season,
        category: s.category,
        fit: s.fit,
        fabric: s.fabricType,
        embroidery: s.embroideryType,
        neck: s.neckDesign,
        sleeve: s.sleeveType,
        costPrice: s.costPrice,
        sellPrice: s.sellPrice,
        margin: s.sellPrice > 0 ? Math.round(((s.sellPrice - s.costPrice) / s.sellPrice) * 10000) / 100 : 0,
        status: s.status,
      })),
      collections,
      seasons,
      categories,
    })
  } catch (error) {
    console.error('Brand API error:', error)
    return NextResponse.json({ error: 'Failed to load brand data' }, { status: 500 })
  }
}
