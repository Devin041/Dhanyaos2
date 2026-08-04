import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { computeBinHealth } from '@/lib/fg-color-code'

// ─── GET: Complete style breakdown ──
// /api/fg-stock/style-detail?styleNo=DH-01
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNo = searchParams.get('styleNo')?.trim()

    if (!styleNo) {
      return NextResponse.json({ error: 'styleNo is required' }, { status: 400 })
    }

    // ── Fetch all bins for this style from Supabase ──
    const { data: bins, error } = await supabase
      .from('FGStockBin')
      .select('*')
      .eq('styleNo', styleNo)
      .order('color', { ascending: true })
      .order('size', { ascending: true })
    if (error) throw error

    if (!bins || bins.length === 0) {
      return NextResponse.json({ error: `No stock found for style ${styleNo}` }, { status: 404 })
    }

    // ── Style info (from first bin) ──
    const firstBin = bins[0]
    const style = {
      styleNo: firstBin.styleNo,
      styleName: firstBin.styleName,
      image: firstBin.image,
      firstInDate: firstBin.firstInDate,
    }

    // ── Group bins by color ──
    const colorMap = new Map<string, typeof bins>()
    for (const bin of bins) {
      const existing = colorMap.get(bin.color) || []
      existing.push(bin)
      colorMap.set(bin.color, existing)
    }

    // ── Build color sections ──
    const colors = []
    let styleTotalPieces = 0
    let styleAvailablePieces = 0
    let styleReservedPieces = 0
    let styleFullSets = 0
    let styleOrphanPieces = 0
    let styleTotalStockValue = 0
    let styleTotalSellValue = 0

    for (const [colorName, colorBins] of colorMap) {
      const colorCode = colorBins[0].colorCode

      // Size breakdown
      const sizes = colorBins.map(bin => {
        const totalPieces =
          bin.availableQty + bin.reservedQty + bin.qcPendingQty +
          bin.underRepairQty + bin.defectiveQty + bin.scrappedQty + bin.exhibitionQty
        return {
          size: bin.size,
          binId: bin.id,
          availableQty: bin.availableQty,
          reservedQty: bin.reservedQty,
          qcPendingQty: bin.qcPendingQty,
          underRepairQty: bin.underRepairQty,
          defectiveQty: bin.defectiveQty,
          scrappedQty: bin.scrappedQty,
          exhibitionQty: bin.exhibitionQty,
          totalPieces,
          unitCost: bin.unitCost,
          unitSellPrice: bin.unitSellPrice,
          health: computeBinHealth(bin),
        }
      })

      // Set analysis: fullSets = min(availableQty across sizes), orphanPieces = sum(available) - (fullSets * numSizes)
      const numberOfSizes = sizes.length
      const availableQtys = sizes.map(s => s.availableQty)
      const fullSets = numberOfSizes > 0 ? Math.min(...availableQtys) : 0
      const totalAvailable = availableQtys.reduce((a, b) => a + b, 0)
      const orphanPieces = Math.max(0, totalAvailable - fullSets * numberOfSizes)

      // Color totals
      const colorTotal = {
        available: sizes.reduce((s, sz) => s + sz.availableQty, 0),
        reserved: sizes.reduce((s, sz) => s + sz.reservedQty, 0),
        qcPending: sizes.reduce((s, sz) => s + sz.qcPendingQty, 0),
        underRepair: sizes.reduce((s, sz) => s + sz.underRepairQty, 0),
        defective: sizes.reduce((s, sz) => s + sz.defectiveQty, 0),
        scrapped: sizes.reduce((s, sz) => s + sz.scrappedQty, 0),
        exhibition: sizes.reduce((s, sz) => s + sz.exhibitionQty, 0),
        stockValue: Math.round(sizes.reduce((s, sz) => s + sz.totalPieces * (sz.unitCost || 0), 0) * 100) / 100,
        sellValue: Math.round(sizes.reduce((s, sz) => s + sz.totalPieces * (sz.unitSellPrice || 0), 0) * 100) / 100,
      }

      colors.push({
        color: colorName,
        colorCode,
        sizes,
        fullSets,
        orphanPieces,
        colorTotal,
      })

      // Accumulate style totals
      styleTotalPieces += sizes.reduce((s, sz) => s + sz.totalPieces, 0)
      styleAvailablePieces += colorTotal.available
      styleReservedPieces += colorTotal.reserved
      styleFullSets += fullSets
      styleOrphanPieces += orphanPieces
      styleTotalStockValue += colorTotal.stockValue
      styleTotalSellValue += colorTotal.sellValue
    }

    const styleTotal = {
      totalPieces: styleTotalPieces,
      availablePieces: styleAvailablePieces,
      reservedPieces: styleReservedPieces,
      fullSets: styleFullSets,
      orphanPieces: styleOrphanPieces,
      totalStockValue: Math.round(styleTotalStockValue * 100) / 100,
      totalSellValue: Math.round(styleTotalSellValue * 100) / 100,
    }

    // ── Recent movements (last 10) for this style ──
    const { data: recentMovements } = await supabase
      .from('FGStockMovement')
      .select('*')
      .eq('styleNo', styleNo)
      .order('movedAt', { ascending: false })
      .limit(10)

    // Fetch related bin info for movements
    const mvtBinIds = [...new Set((recentMovements || []).map((m: any) => m.fgStockBinId).filter(Boolean))]
    const mvtBinMap: Record<string, any> = {}
    if (mvtBinIds.length > 0) {
      const { data: mvtBins } = await supabase
        .from('FGStockBin')
        .select('id, colorCode, color, size')
        .in('id', mvtBinIds)
      for (const b of (mvtBins || [])) {
        mvtBinMap[b.id] = { colorCode: b.colorCode, color: b.color, size: b.size }
      }
    }

    const recentMovementsWithBin = (recentMovements || []).map((m: any) => ({
      ...m,
      fgStockBin: mvtBinMap[m.fgStockBinId] || null,
    }))

    // ── Active reservations for this style ──
    const { data: activeReservations } = await supabase
      .from('FGReservation')
      .select('*')
      .eq('styleNo', styleNo)
      .in('status', ['Active', 'PartiallyDispatched'])
      .order('reservedDate', { ascending: false })

    return NextResponse.json({
      style,
      colors,
      styleTotal,
      recentMovements: recentMovementsWithBin,
      activeReservations: activeReservations || [],
    })
  } catch (error: any) {
    console.error('[FG-Stock Style Detail GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch style detail' }, { status: 500 })
  }
}
