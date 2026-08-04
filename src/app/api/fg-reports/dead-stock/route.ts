import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { withComputedFields } from '@/lib/fg-color-code'

export async function GET() {
  try {
    const { data: bins, error } = await supabase
      .from('FGStockBin')
      .select('*')
      .order('styleNo', { ascending: true })
    if (error) throw error

    const now = new Date()
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
    const deadStockBins: any[] = []

    for (const bin of (bins || [])) {
      const enriched = withComputedFields(bin)
      const hasDefectiveOrScrapped = bin.defectiveQty > 0 || bin.scrappedQty > 0
      const noMovement90Days = bin.lastMovementDate
        ? (now.getTime() - new Date(bin.lastMovementDate).getTime()) > ninetyDaysMs
        : false
      const neverMoved = !bin.lastMovementDate && bin.firstInDate
        ? (now.getTime() - new Date(bin.firstInDate).getTime()) > ninetyDaysMs
        : false

      if (hasDefectiveOrScrapped || noMovement90Days || neverMoved) {
        const ageInDays = bin.firstInDate
          ? Math.floor((now.getTime() - new Date(bin.firstInDate).getTime()) / (1000 * 60 * 60 * 24))
          : null
        const daysSinceMovement = bin.lastMovementDate
          ? Math.floor((now.getTime() - new Date(bin.lastMovementDate).getTime()) / (1000 * 60 * 60 * 24))
          : null

        deadStockBins.push({
          ...enriched,
          ageInDays,
          daysSinceMovement,
          reason: hasDefectiveOrScrapped
            ? 'Defective/Scrapped'
            : 'No movement 90+ days',
        })
      }
    }

    const totalPieces = deadStockBins.reduce((s, b) => s + b.totalPieces, 0)
    const totalValue = deadStockBins.reduce((s, b) => s + b.stockValue, 0)

    return NextResponse.json({ bins: deadStockBins, totalPieces, totalValue })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
