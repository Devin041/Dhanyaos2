import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: promoMovements, error } = await supabase
      .from('FGStockMovement')
      .select('*')
      .eq('movementType', 'PromotionalIssue')
      .order('movedAt', { ascending: false })
    if (error) throw error

    // Summary by style
    const styleSummary = new Map<string, {
      styleNo: string
      styleName: string
      totalQty: number
      totalValue: number
      count: number
    }>()

    for (const m of (promoMovements || [])) {
      const existing = styleSummary.get(m.styleNo) || {
        styleNo: m.styleNo,
        styleName: m.styleName,
        totalQty: 0,
        totalValue: 0,
        count: 0,
      }
      existing.totalQty += m.quantity
      existing.totalValue += m.quantity * (m.unitCost || 0)
      existing.count += 1
      styleSummary.set(m.styleNo, existing)
    }

    const summary = [...styleSummary.values()].sort((a, b) => b.totalQty - a.totalQty)
    const grandTotal = (promoMovements || []).reduce((s: number, m: any) => s + m.quantity, 0)
    const grandValue = (promoMovements || []).reduce((s: number, m: any) => s + m.quantity * (m.unitCost || 0), 0)

    return NextResponse.json({ movements: promoMovements || [], summary, grandTotal, grandValue })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
