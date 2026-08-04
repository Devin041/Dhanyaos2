import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { withComputedFields, computeBinHealth } from '@/lib/fg-color-code'

export async function GET() {
  try {
    const { data: bins, error } = await supabase
      .from('FGStockBin')
      .select('*')
      .order('styleNo', { ascending: true })
    if (error) throw error

    const suggestions: any[] = []

    for (const bin of (bins || [])) {
      const enriched = withComputedFields(bin)
      const health = computeBinHealth(bin)

      if (health === 'LowStock' || health === 'Critical') {
        suggestions.push({
          styleNo: enriched.styleNo,
          styleName: enriched.styleName,
          colorCode: enriched.colorCode,
          color: enriched.color,
          size: enriched.size,
          availableQty: enriched.availableQty,
          health,
          unitCost: enriched.unitCost,
          suggestedQty: Math.max(0, 20 - enriched.availableQty),
          estimatedCost: Math.max(0, 20 - enriched.availableQty) * (enriched.unitCost || 0),
        })
      }
    }

    const totalEstimate = suggestions.reduce((s, r) => s + r.estimatedCost, 0)
    const criticalCount = suggestions.filter((s) => s.health === 'Critical').length
    const lowStockCount = suggestions.filter((s) => s.health === 'LowStock').length

    return NextResponse.json({
      suggestions,
      criticalCount,
      lowStockCount,
      totalEstimate,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
