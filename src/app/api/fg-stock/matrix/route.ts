import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { batchResolveStyleImages } from '@/lib/style-image'

// ─── GET: Color×Size matrix view ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNo = searchParams.get('styleNo')?.trim()

    let query = supabase.from('FGStockBin').select('*')
    if (styleNo) query = query.eq('styleNo', styleNo)
    query = query.order('styleNo', { ascending: true }).order('color', { ascending: true }).order('size', { ascending: true })

    const { data: bins, error } = await query
    if (error) throw error

    // Group by styleNo
    const styleMap: Record<string, any[]> = {}
    for (const b of (bins || [])) {
      if (!styleMap[b.styleNo]) styleMap[b.styleNo] = []
      styleMap[b.styleNo].push(b)
    }

    // U5: resolve product photos (bin image || sample/cost-sheet photo),
    // flattened to a plain string URL for <img src>.
    const styleNos = Object.keys(styleMap).filter(Boolean)
    const imgMap = styleNos.length > 0 ? await batchResolveStyleImages(styleNos) : {}

    const styles = Object.entries(styleMap).map(([sNo, sBins]) => {
      const colors = [...new Set(sBins.map((b: any) => b.color))].sort()
      const sizes = [...new Set(sBins.map((b: any) => b.size))].sort()
      const image = sBins[0]?.image || imgMap[sNo]?.url || null

      // Build color×size matrix with full data per cell
      const matrix: Record<string, any> = {}
      for (const color of colors) {
        const colorBins = sBins.filter((b: any) => b.color === color)
        const colorCode = colorBins[0]?.colorCode || ''
        const sizesMap: Record<string, any> = {}

        let rowAvail = 0
        let rowReserved = 0
        let rowTotal = 0

        for (const size of sizes) {
          const bin = colorBins.find((b: any) => b.size === size)
          if (bin) {
            const totalPieces = bin.availableQty + bin.reservedQty + bin.qcPendingQty + bin.underRepairQty + bin.defectiveQty + bin.scrappedQty + bin.exhibitionQty
            sizesMap[size] = {
              binId: bin.id,
              colorCode: bin.colorCode,
              availableQty: bin.availableQty,
              reservedQty: bin.reservedQty,
              totalPieces,
            }
            rowAvail += bin.availableQty
            rowReserved += bin.reservedQty
            rowTotal += totalPieces
          } else {
            sizesMap[size] = { binId: '', colorCode, availableQty: 0, reservedQty: 0, totalPieces: 0 }
          }
        }

        matrix[color] = {
          color,
          colorCode,
          sizes: sizesMap,
          rowTotal: { availableQty: rowAvail, reservedQty: rowReserved, totalPieces: rowTotal },
        }
      }

      // Compute totals
      let totalAvail = 0
      let totalReserved = 0
      let totalPieces = 0
      let stockValue = 0
      let sellValue = 0

      for (const b of sBins) {
        const tp = b.availableQty + b.reservedQty + b.qcPendingQty + b.underRepairQty + b.defectiveQty + b.scrappedQty + b.exhibitionQty
        totalAvail += b.availableQty
        totalReserved += b.reservedQty
        totalPieces += tp
        stockValue += tp * (b.unitCost || 0)
        sellValue += tp * (b.unitSellPrice || 0)
      }

      // Full sets: min(available per size across ALL colors)
      const fullSets = sizes.length > 0
        ? Math.min(...sizes.map(size => {
            return sBins.filter((b: any) => b.size === size).reduce((s: number, b: any) => s + b.availableQty, 0)
          }))
        : 0
      const orphanPieces = totalAvail - (fullSets * sizes.length)

      // Color breakdown for summary
      const colorBreakdown = colors.map(color => {
        const colorBins = sBins.filter((b: any) => b.color === color)
        const colorCode = colorBins[0]?.colorCode || ''
        const colorAvail = colorBins.reduce((s: number, b: any) => s + b.availableQty, 0)
        const colorTotal = colorBins.reduce((s: number, b: any) => {
          return s + b.availableQty + b.reservedQty + b.qcPendingQty + b.underRepairQty + b.defectiveQty + b.scrappedQty + b.exhibitionQty
        }, 0)
        const colorValue = colorBins.reduce((s: number, b: any) => {
          const tp = b.availableQty + b.reservedQty + b.qcPendingQty + b.underRepairQty + b.defectiveQty + b.scrappedQty + b.exhibitionQty
          return s + tp * (b.unitCost || 0)
        }, 0)

        // Full sets for this color
        const colorFullSets = sizes.length > 0
          ? Math.min(...sizes.map(size => {
              const bin = colorBins.find((b: any) => b.size === size)
              return bin ? bin.availableQty : 0
            }))
          : 0
        const colorOrphan = colorAvail - (colorFullSets * sizes.length)

        return { color, colorCode, totalPieces: colorTotal, fullSets: colorFullSets, orphanPieces: colorOrphan, stockValue: colorValue }
      })

      return {
        styleNo: sNo,
        styleName: sBins[0]?.styleName || '',
        image,
        colors,
        sizes,
        matrix,
        totals: { availableQty: totalAvail, reservedQty: totalReserved, totalPieces, stockValue, sellValue },
        fullSets,
        orphanPieces,
        colorBreakdown,
      }
    })

    return NextResponse.json({ styles })
  } catch (error: any) {
    console.error('[FG-Stock Matrix GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch matrix' }, { status: 500 })
  }
}
