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
    const brackets = [
      { label: '0-30 days', min: 0, max: 30, pieces: 0, value: 0, bins: [] as any[] },
      { label: '31-60 days', min: 31, max: 60, pieces: 0, value: 0, bins: [] as any[] },
      { label: '61-90 days', min: 61, max: 90, pieces: 0, value: 0, bins: [] as any[] },
      { label: '90+ days', min: 91, max: Infinity, pieces: 0, value: 0, bins: [] as any[] },
    ]

    for (const bin of (bins || [])) {
      const enriched = withComputedFields(bin)
      if (!bin.firstInDate || enriched.totalPieces === 0) continue

      const ageInDays = Math.floor((now.getTime() - new Date(bin.firstInDate).getTime()) / (1000 * 60 * 60 * 24))

      for (const bracket of brackets) {
        if (ageInDays >= bracket.min && ageInDays <= bracket.max) {
          bracket.pieces += enriched.totalPieces
          bracket.value += enriched.stockValue
          bracket.bins.push({
            styleNo: enriched.styleNo,
            styleName: enriched.styleName,
            colorCode: enriched.colorCode,
            color: enriched.color,
            size: enriched.size,
            availableQty: enriched.availableQty,
            totalPieces: enriched.totalPieces,
            stockValue: enriched.stockValue,
            firstInDate: enriched.firstInDate,
            ageInDays,
          })
          break
        }
      }
    }

    return NextResponse.json({ brackets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
