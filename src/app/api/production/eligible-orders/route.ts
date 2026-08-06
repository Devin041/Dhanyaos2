import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

// ─── GET: List sales orders eligible for production ─────────────────────────
// Returns orders with status 'Confirmed' (or 'Pending') that don't have
// production jobs created yet (or have partial production).
export async function GET() {
  try {
    // Fetch orders that are Confirmed or Pending
    const { data: orders, error } = await supabase
      .from('SalesOrder')
      .select(`
        id,
        orderNo,
        customerId,
        orderDate,
        deliveryDate,
        totalAmount,
        totalCost,
        grossProfit,
        status,
        customer:customerId(id, companyName)
      `)
      .in('status', ['Confirmed', 'Pending'])
      .order('orderDate', { ascending: true })

    if (error) {
      console.error('Eligible orders query error:', error)
      return NextResponse.json({ orders: [] })
    }

    // Fetch order items separately (relation name may vary)
    const orderIds = (orders || []).map((o: any) => o.id)
    let itemsMap: Record<string, any[]> = {}
    if (orderIds.length > 0) {
      const { data: orderItems } = await supabase
        .from('SalesOrderItem')
        .select('id, salesOrderId, styleNo, styleName, quantity, unitPrice, unitCost')
        .in('salesOrderId', orderIds)
      for (const item of (orderItems || [])) {
        if (!itemsMap[item.salesOrderId]) itemsMap[item.salesOrderId] = []
        itemsMap[item.salesOrderId].push(item)
      }
    }

    // Fetch existing production jobs
    const { data: existingJobs } = await supabase
      .from('ProductionJob')
      .select('salesOrderId, styleNo, targetQty, completedQty')

    const jobMap: Record<string, any[]> = {}
    for (const job of (existingJobs || [])) {
      if (job.salesOrderId) {
        if (!jobMap[job.salesOrderId]) jobMap[job.salesOrderId] = []
        jobMap[job.salesOrderId].push(job)
      }
    }

    // Build result with items attached
    const filtered = (orders || []).map((order: any) => ({
      ...order,
      items: itemsMap[order.id] || [],
    })).filter((order: any) => {
      const orderJobs = jobMap[order.id] || []
      const items = order.items || []
      if (items.length === 0) return true
      for (const item of items) {
        const matchingJobs = orderJobs.filter((j: any) => j.styleNo === item.styleNo)
        const totalProduced = matchingJobs.reduce((s: number, j: any) => s + (j.targetQty || 0), 0)
        if (totalProduced < item.quantity) return true
      }
      return orderJobs.length === 0
    })

    return NextResponse.json({ orders: filtered })
  } catch (error) {
    console.error('Eligible orders GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch eligible orders' }, { status: 500 })
  }
}
