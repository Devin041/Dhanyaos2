import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { differenceInDays, format } from 'date-fns'

/**
 * GET /api/inventory/aging
 *
 * Inventory Aging Analysis — shows how long inventory items have been in stock,
 * grouped by age buckets (0-30d, 31-60d, 61-90d, 90+d).
 *
 * Combines:
 *   1. FabricStock — fabric rolls with createdAt date
 *   2. FinishedGood — finished goods bins with createdAt/receivedDate
 *
 * Returns:
 *   - Age buckets with item count, total value, percentage
 *   - Top oldest items (dead stock candidates)
 *   - Summary stats (total items, total value, avg age, dead stock value)
 */

interface AgingItem {
  id: string
  name: string
  type: 'fabric' | 'finished-good'
  quantity: number
  unit: string
  value: number
  ageDays: number
  createdAt: string
  supplier?: string
  styleNo?: string
}

interface AgeBucket {
  label: string
  minDays: number
  maxDays: number | null
  itemCount: number
  totalValue: number
  percentage: number
  items: AgingItem[]
}

const AGE_BUCKETS = [
  { label: '0-30 days', minDays: 0, maxDays: 30, color: 'oklch(0.72 0.18 145)' },     // green
  { label: '31-60 days', minDays: 31, maxDays: 60, color: 'oklch(0.8 0.15 75)' },     // gold
  { label: '61-90 days', minDays: 61, maxDays: 90, color: 'oklch(0.75 0.15 65)' },    // orange
  { label: '90+ days', minDays: 91, maxDays: null, color: 'oklch(0.65 0.22 25)' },    // red
]

function formatINR(v: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export async function GET() {
  try {
    const now = new Date()
    const allItems: AgingItem[] = []

    // ── 1. Fetch Fabric Stock ──
    const { data: fabrics, error: fabErr } = await supabase
      .from('FabricStock')
      .select('id, fabricName, availableMeters, averageCost, totalValue, createdAt, supplier:supplierId(name)')
      .order('createdAt', { ascending: true })

    if (fabErr) {
      if (!isMissingTableError(fabErr)) throw fabErr
    } else if (fabrics) {
      for (const f of fabrics) {
        const created = f.createdAt ? new Date(f.createdAt) : now
        const ageDays = Math.max(0, differenceInDays(now, created))
        const value = f.totalValue || ((f.availableMeters || 0) * (f.averageCost || 0))
        allItems.push({
          id: f.id,
          name: f.fabricName || 'Unknown Fabric',
          type: 'fabric',
          quantity: Math.round((f.availableMeters || 0) * 100) / 100,
          unit: 'meters',
          value: Math.round(value),
          ageDays,
          createdAt: f.createdAt || now.toISOString(),
          supplier: (f.supplier as any)?.name,
        })
      }
    }

    // ── 2. Fetch Finished Goods ──
    const { data: fgs, error: fgErr } = await supabase
      .from('FinishedGood')
      .select('id, styleNo, styleName, availablePieces, totalValue, createdAt, receivedDate')
      .order('createdAt', { ascending: true })

    if (fgErr) {
      if (!isMissingTableError(fgErr)) throw fgErr
    } else if (fgs) {
      for (const g of fgs) {
        const dateField = g.receivedDate || g.createdAt
        const created = dateField ? new Date(dateField) : now
        const ageDays = Math.max(0, differenceInDays(now, created))
        allItems.push({
          id: g.id,
          name: g.styleName || g.styleNo || 'Unknown Style',
          type: 'finished-good',
          quantity: g.availablePieces || 0,
          unit: 'pieces',
          value: Math.round(g.totalValue || 0),
          ageDays,
          createdAt: dateField || now.toISOString(),
          styleNo: g.styleNo,
        })
      }
    }

    // ── 3. Build age buckets ──
    const buckets: AgeBucket[] = AGE_BUCKETS.map(b => ({
      ...b,
      itemCount: 0,
      totalValue: 0,
      percentage: 0,
      items: [],
    }))

    for (const item of allItems) {
      for (const bucket of buckets) {
        const inBucket = bucket.maxDays === null
          ? item.ageDays >= bucket.minDays
          : item.ageDays >= bucket.minDays && item.ageDays <= bucket.maxDays
        if (inBucket) {
          bucket.itemCount++
          bucket.totalValue += item.value
          bucket.items.push(item)
          break
        }
      }
    }

    const totalItems = allItems.length
    const totalValue = allItems.reduce((s, i) => s + i.value, 0)

    // Calculate percentages
    for (const bucket of buckets) {
      bucket.percentage = totalValue > 0 ? Math.round((bucket.totalValue / totalValue) * 1000) / 10 : 0
      // Sort items within bucket by age descending (oldest first)
      bucket.items.sort((a, b) => b.ageDays - a.ageDays)
    }

    // ── 4. Summary stats ──
    const avgAgeDays = totalItems > 0
      ? Math.round(allItems.reduce((s, i) => s + i.ageDays, 0) / totalItems)
      : 0

    const deadStockItems = allItems.filter(i => i.ageDays >= 90)
    const deadStockValue = deadStockItems.reduce((s, i) => s + i.value, 0)
    const deadStockPercentage = totalValue > 0 ? Math.round((deadStockValue / totalValue) * 1000) / 10 : 0

    const freshItems = allItems.filter(i => i.ageDays <= 30)
    const freshValue = freshItems.reduce((s, i) => s + i.value, 0)

    // Top 10 oldest items (dead stock candidates)
    const topOldest = [...allItems]
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 10)
      .map(i => ({
        ...i,
        createdAtFormatted: format(new Date(i.createdAt), 'dd MMM yyyy'),
        valueFormatted: formatINR(i.value),
      }))

    // Breakdown by type
    const fabricItems = allItems.filter(i => i.type === 'fabric')
    const fgItems = allItems.filter(i => i.type === 'finished-good')
    const fabricValue = fabricItems.reduce((s, i) => s + i.value, 0)
    const fgValue = fgItems.reduce((s, i) => s + i.value, 0)

    return NextResponse.json({
      summary: {
        totalItems,
        totalValue: Math.round(totalValue),
        avgAgeDays,
        deadStockItems: deadStockItems.length,
        deadStockValue: Math.round(deadStockValue),
        deadStockPercentage,
        freshItems: freshItems.length,
        freshValue: Math.round(freshValue),
        fabricItems: fabricItems.length,
        fabricValue: Math.round(fabricValue),
        fgItems: fgItems.length,
        fgValue: Math.round(fgValue),
      },
      buckets: buckets.map(b => ({
        label: b.label,
        color: b.color,
        minDays: b.minDays,
        maxDays: b.maxDays,
        itemCount: b.itemCount,
        totalValue: Math.round(b.totalValue),
        percentage: b.percentage,
        topItems: b.items.slice(0, 5).map(i => ({
          ...i,
          createdAtFormatted: format(new Date(i.createdAt), 'dd MMM yyyy'),
        })),
      })),
      topOldest,
    })
  } catch (error) {
    console.error('Inventory aging API error:', error)
    return NextResponse.json({ error: 'Failed to load inventory aging data' }, { status: 500 })
  }
}
