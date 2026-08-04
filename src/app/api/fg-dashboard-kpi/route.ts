import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { computeBinHealth } from '@/lib/fg-color-code'

const _hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// ─── GET: Dashboard KPI data for Founder + COO ──
export async function GET() {
  try {
    if (!_hasSupabase) {
      return NextResponse.json({
        totalStockValue: 0, totalSellValue: 0, potentialProfit: 0,
        totalPieces: 0, availablePieces: 0, reservedPieces: 0,
        deadStockPieces: 0, lowStockStyles: 0, lowStockStylesList: [],
        criticalStyles: 0, totalStyles: 0, recentMovementsCount: 0,
        piecesAtExhibition: 0, qcPendingPieces: 0, topStylesByValue: [],
        agingBrackets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
      })
    }
    // Fetch all bins from Supabase for aggregation
    const { data: allBins, error } = await supabase
      .from('FGStockBin')
      .select('id, styleNo, styleName, colorCode, color, size, availableQty, reservedQty, qcPendingQty, underRepairQty, defectiveQty, scrappedQty, exhibitionQty, unitCost, unitSellPrice, image, firstInDate')
    if (error) throw error

    // ── Core KPIs ──
    let totalStockValue = 0
    let totalSellValue = 0
    let totalPieces = 0
    let availablePieces = 0
    let reservedPieces = 0
    let deadStockPieces = 0
    let lowStockStyles = 0
    let criticalStyles = 0
    let piecesAtExhibition = 0
    let qcPendingPieces = 0
    const styleSet = new Set<string>()
    const styleValueMap: Record<string, { styleNo: string; styleName: string; stockValue: number; sellValue: number; image: string | null }> = {}
    const lowStockStylesList: Array<{ styleNo: string; styleName: string; image: string | null; availableQty: number }> = []
    const lowStockStyleSet = new Set<string>()

    // Aging brackets (based on firstInDate)
    const agingBrackets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    const now = Date.now()
    const DAY_MS = 86_400_000

    for (const bin of (allBins || [])) {
      const total =
        bin.availableQty + bin.reservedQty + bin.qcPendingQty +
        bin.underRepairQty + bin.defectiveQty + bin.scrappedQty + bin.exhibitionQty

      totalPieces += total
      availablePieces += bin.availableQty
      reservedPieces += bin.reservedQty
      piecesAtExhibition += bin.exhibitionQty
      qcPendingPieces += bin.qcPendingQty

      const stockVal = total * (bin.unitCost || 0)
      const sellVal = total * (bin.unitSellPrice || 0)
      totalStockValue += stockVal
      totalSellValue += sellVal

      styleSet.add(bin.styleNo)

      // Per-style aggregation
      if (!styleValueMap[bin.styleNo]) {
        styleValueMap[bin.styleNo] = {
          styleNo: bin.styleNo,
          styleName: bin.styleName,
          stockValue: 0,
          sellValue: 0,
          image: bin.image,
        }
      }
      styleValueMap[bin.styleNo].stockValue += stockVal
      styleValueMap[bin.styleNo].sellValue += sellVal

      // Health classification
      const health = computeBinHealth(bin)
      if (health === 'DeadStock') {
        deadStockPieces += total
      } else if (health === 'LowStock') {
        lowStockStyles++
        if (!lowStockStyleSet.has(bin.styleNo)) {
          lowStockStyleSet.add(bin.styleNo)
          lowStockStylesList.push({
            styleNo: bin.styleNo,
            styleName: bin.styleName,
            image: bin.image,
            availableQty: bin.availableQty,
          })
        }
      } else if (health === 'Critical') {
        criticalStyles++
      }

      // Aging
      if (bin.firstInDate) {
        const ageDays = Math.floor((now - new Date(bin.firstInDate).getTime()) / DAY_MS)
        if (ageDays <= 30) agingBrackets['0-30'] += total
        else if (ageDays <= 60) agingBrackets['31-60'] += total
        else if (ageDays <= 90) agingBrackets['61-90'] += total
        else agingBrackets['90+'] += total
      } else {
        agingBrackets['0-30'] += total // no date → treat as recent
      }
    }

    // Top styles by sell value (top 5)
    const topStylesByValue = Object.values(styleValueMap)
      .sort((a, b) => b.sellValue - a.sellValue)
      .slice(0, 5)

    // Recent movements count (last 7 days)
    const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString()
    const { count: recentMovementsCount } = await supabase
      .from('FGStockMovement')
      .select('*', { count: 'exact', head: true })
      .gte('movedAt', sevenDaysAgo)

    return NextResponse.json({
      totalStockValue,
      totalSellValue,
      potentialProfit: totalSellValue - totalStockValue,
      totalPieces,
      availablePieces,
      reservedPieces,
      deadStockPieces,
      lowStockStyles,
      lowStockStylesList,
      criticalStyles,
      totalStyles: styleSet.size,
      recentMovementsCount: recentMovementsCount || 0,
      piecesAtExhibition,
      qcPendingPieces,
      topStylesByValue,
      agingBrackets,
    })
  } catch (error: any) {
    console.error('[FG-Dashboard KPI GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch KPI data' }, { status: 500 })
  }
}
