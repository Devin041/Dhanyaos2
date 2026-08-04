import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { withComputedFields } from '@/lib/fg-color-code'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const styleNo = searchParams.get('styleNo') || undefined

    let query = supabase.from('FGStockBin').select('*').order('styleNo', { ascending: true })
    if (styleNo) query = query.eq('styleNo', styleNo)

    const { data: bins, error } = await query
    if (error) throw error

    const enriched = (bins || []).map((b: any) => withComputedFields(b))

    const totalStyles = new Set(enriched.map((b) => b.styleNo)).size
    const totalColors = new Set(enriched.map((b) => b.colorCode)).size
    const totalPieces = enriched.reduce((s, b) => s + b.totalPieces, 0)
    const totalStockValue = enriched.reduce((s, b) => s + b.stockValue, 0)
    const totalSellValue = enriched.reduce((s, b) => s + b.sellValue, 0)

    const availablePieces = enriched.reduce((s, b) => s + b.availableQty, 0)
    const reservedPieces = enriched.reduce((s, b) => s + b.reservedQty, 0)
    const qcPendingPieces = enriched.reduce((s, b) => s + b.qcPendingQty, 0)
    const underRepairPieces = enriched.reduce((s, b) => s + b.underRepairQty, 0)
    const defectivePieces = enriched.reduce((s, b) => s + b.defectiveQty, 0)
    const scrappedPieces = enriched.reduce((s, b) => s + b.scrappedQty, 0)
    const exhibitionPieces = enriched.reduce((s, b) => s + b.exhibitionQty, 0)

    // Health distribution
    const healthDist: Record<string, number> = { Healthy: 0, LowStock: 0, Critical: 0, Empty: 0, DeadStock: 0 }
    for (const b of enriched) {
      healthDist[b.health] = (healthDist[b.health] || 0) + 1
    }

    // Top styles by value
    const styleMap = new Map<string, { styleNo: string; styleName: string; pieces: number; stockValue: number; sellValue: number }>()
    for (const b of enriched) {
      const key = b.styleNo
      const existing = styleMap.get(key) || { styleNo: b.styleNo, styleName: b.styleName, pieces: 0, stockValue: 0, sellValue: 0 }
      existing.pieces += b.totalPieces
      existing.stockValue += b.stockValue
      existing.sellValue += b.sellValue
      styleMap.set(key, existing)
    }
    const topStyles = [...styleMap.values()].sort((a, b) => b.sellValue - a.sellValue).slice(0, 10)

    return NextResponse.json({
      totalStyles,
      totalColors,
      totalPieces,
      totalStockValue,
      totalSellValue,
      statusBreakdown: {
        available: availablePieces,
        reserved: reservedPieces,
        qcPending: qcPendingPieces,
        underRepair: underRepairPieces,
        defective: defectivePieces,
        scrapped: scrappedPieces,
        exhibition: exhibitionPieces,
      },
      healthDistribution: healthDist,
      topStyles,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
