import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    // Get all return and QC status change movements with fromStatus = QC Pending
    const { data: returnMovements, error: retErr } = await supabase
      .from('FGStockMovement')
      .select('*')
      .or('movementType.eq.Return,and(movementType.eq.QCStatusChange,fromStatus.eq.QC Pending)')
      .order('movedAt', { ascending: false })
    if (retErr) throw retErr

    // Get total outward per styleNo+color for return rate
    const { data: outwardMovements, error: outErr } = await supabase
      .from('FGStockMovement')
      .select('*')
      .eq('movementType', 'Outward')
    if (outErr) throw outErr

    const outwardByStyle = new Map<string, number>()
    for (const m of (outwardMovements || [])) {
      const key = `${m.styleNo}|${m.color}`
      outwardByStyle.set(key, (outwardByStyle.get(key) || 0) + m.quantity)
    }

    // Group returns by styleNo+color
    const returnMap = new Map<string, {
      styleNo: string
      styleName: string
      color: string
      colorCode: string
      totalReturned: number
      returnCount: number
      totalValue: number
    }>()

    for (const m of (returnMovements || [])) {
      const key = `${m.styleNo}|${m.color}`
      const existing = returnMap.get(key) || {
        styleNo: m.styleNo,
        styleName: m.styleName,
        color: m.color,
        colorCode: m.colorCode,
        totalReturned: 0,
        returnCount: 0,
        totalValue: 0,
      }
      existing.totalReturned += m.quantity
      existing.returnCount += 1
      existing.totalValue += m.quantity * (m.unitCost || 0)
      returnMap.set(key, existing)
    }

    const result = [...returnMap.values()].map((r) => {
      const outward = outwardByStyle.get(`${r.styleNo}|${r.color}`) || 0
      const returnRate = outward > 0 ? ((r.totalReturned / outward) * 100) : 0
      return { ...r, outward, returnRate: Math.round(returnRate * 100) / 100 }
    }).sort((a, b) => b.totalReturned - a.totalReturned)
    return NextResponse.json({ groups: result, movements: returnMovements || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
