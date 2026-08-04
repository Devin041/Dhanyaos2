import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: outwardMovements, error } = await supabase
      .from('FGStockMovement')
      .select('*')
      .eq('movementType', 'Outward')
      .order('movedAt', { ascending: false })
    if (error) throw error

    // Group by styleNo + color
    const groups = new Map<string, {
      styleNo: string
      styleName: string
      color: string
      colorCode: string
      totalQty: number
      totalValue: number
      movements: any[]
    }>()

    for (const m of (outwardMovements || [])) {
      const key = `${m.styleNo}|${m.color}`
      const existing = groups.get(key) || {
        styleNo: m.styleNo,
        styleName: m.styleName,
        color: m.color,
        colorCode: m.colorCode,
        totalQty: 0,
        totalValue: 0,
        movements: [],
      }
      existing.totalQty += m.quantity
      existing.totalValue += m.quantity * (m.unitCost || 0)
      existing.movements.push(m)
      groups.set(key, existing)
    }

    const result = [...groups.values()].sort((a, b) => b.totalQty - a.totalQty)
    const grandTotal = result.reduce((s, r) => s + r.totalQty, 0)
    const grandValue = result.reduce((s, r) => s + r.totalValue, 0)

    return NextResponse.json({ groups: result, grandTotal, grandValue })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
