import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: outwardMovements, error } = await supabase
      .from('FGStockMovement')
      .select('*')
      .eq('movementType', 'Outward')
    if (error) throw error

    // Aggregate by color
    const colorMap = new Map<string, { color: string; totalQty: number; movementCount: number }>()
    // Aggregate by size
    const sizeMap = new Map<string, { size: string; totalQty: number; movementCount: number }>()
    // Aggregate by style+color+size combo
    const comboMap = new Map<string, {
      styleNo: string
      styleName: string
      color: string
      colorCode: string
      size: string
      totalQty: number
    }>()

    for (const m of (outwardMovements || [])) {
      // Color
      const cKey = m.color || 'Unknown'
      const colorEntry = colorMap.get(cKey) || { color: cKey, totalQty: 0, movementCount: 0 }
      colorEntry.totalQty += m.quantity
      colorEntry.movementCount += 1
      colorMap.set(cKey, colorEntry)

      // Size
      const sKey = m.size || 'Unknown'
      const sizeEntry = sizeMap.get(sKey) || { size: sKey, totalQty: 0, movementCount: 0 }
      sizeEntry.totalQty += m.quantity
      sizeEntry.movementCount += 1
      sizeMap.set(sKey, sizeEntry)

      // Combo
      const comboKey = `${m.styleNo}|${m.color}|${m.size}`
      const combo = comboMap.get(comboKey) || {
        styleNo: m.styleNo,
        styleName: m.styleName,
        color: m.color,
        colorCode: m.colorCode,
        size: m.size,
        totalQty: 0,
      }
      combo.totalQty += m.quantity
      comboMap.set(comboKey, combo)
    }

    const topColors = [...colorMap.values()].sort((a, b) => b.totalQty - a.totalQty)
    const topSizes = [...sizeMap.values()].sort((a, b) => b.totalQty - a.totalQty)
    const topCombos = [...comboMap.values()].sort((a, b) => b.totalQty - a.totalQty).slice(0, 20)

    return NextResponse.json({ topColors, topSizes, topCombos })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
