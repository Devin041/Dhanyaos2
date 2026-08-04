import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: orders, error } = await supabase
      .from('SalesOrder')
      .select('*, customer:customerId(id, companyName), SalesOrderItem(*, style:styleId(styleNo, category)), ProductionJob(id, styleNo, targetQty)')
      .in('status', ['Pending', 'Confirmed'])
      .order('orderDate', { ascending: true })
    if (error) throw error
    const filtered = (orders || []).filter((order: any) => {
      const producedStyleQty: Record<string, number> = {}
      for (const job of (order.ProductionJob || [])) { producedStyleQty[job.styleNo] = (producedStyleQty[job.styleNo] || 0) + job.targetQty }
      const items = order.SalesOrderItem || []
      if (items.length === 0) return true
      for (const item of items) { if (!producedStyleQty[item.style?.styleNo || item.styleName]) return true }
      return false
    })
    return NextResponse.json({ orders: filtered })
  } catch (error) {
    console.error('Eligible orders GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch eligible orders' }, { status: 500 })
  }
}
