import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: movements, error } = await supabase
      .from('FGStockMovement')
      .select('*')
      .order('movedAt', { ascending: false })
    if (error) throw error

    // Group by referenceType
    const channelMap = new Map<string, {
      channel: string
      totalMovements: number
      totalQty: number
      totalValue: number
      inwardQty: number
      outwardQty: number
      returnQty: number
    }>()

    for (const m of (movements || [])) {
      const channel = m.referenceType || 'Unspecified'
      const existing = channelMap.get(channel) || {
        channel,
        totalMovements: 0,
        totalQty: 0,
        totalValue: 0,
        inwardQty: 0,
        outwardQty: 0,
        returnQty: 0,
      }
      existing.totalMovements += 1
      existing.totalQty += m.quantity
      existing.totalValue += m.quantity * (m.unitCost || 0)

      if (m.movementType === 'Inward') existing.inwardQty += m.quantity
      else if (m.movementType === 'Outward') existing.outwardQty += m.quantity
      else if (m.movementType === 'Return') existing.returnQty += m.quantity

      channelMap.set(channel, existing)
    }

    const channels = [...channelMap.values()].sort((a, b) => b.totalQty - a.totalQty)

    return NextResponse.json({ channels })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
