import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: reservations, error } = await supabase
      .from('FGReservation')
      .select('*')
      .eq('status', 'Active')
      .order('reservedDate', { ascending: false })
    if (error) throw error

    // Group by styleNo for summary
    const styleSummary = new Map<string, {
      styleNo: string
      styleName: string
      totalReserved: number
      orders: Set<string>
    }>()

    for (const r of (reservations || [])) {
      const existing = styleSummary.get(r.styleNo) || {
        styleNo: r.styleNo,
        styleName: r.styleName,
        totalReserved: 0,
        orders: new Set<string>(),
      }
      existing.totalReserved += r.reservedQty
      if (r.orderNo) existing.orders.add(r.orderNo)
      styleSummary.set(r.styleNo, existing)
    }

    const summary = [...styleSummary.values()].map((s) => ({
      ...s,
      orders: [...s.orders],
    })).sort((a, b) => b.totalReserved - a.totalReserved)

    return NextResponse.json({ reservations: reservations || [], summary })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
