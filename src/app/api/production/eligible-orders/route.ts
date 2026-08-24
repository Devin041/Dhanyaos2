import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

// ─── GET: List sales orders eligible for production ─────────────────────────
// Returns orders whose production is not yet fully complete. A sales order is
// eligible if it has at least one item whose total produced qty < ordered qty.
//
// Statuses considered eligible:
//   - Pending, Confirmed, In Production, In Progress
// Statuses excluded (already past manufacturing):
//   - Delivered, Dispatched, Cancelled
//
// NOTE: The table name in Supabase is `OrderItem` (NOT `SalesOrderItem` — that
// was the bug that caused only 18 of ~189 orders to show up in production).
export async function GET() {
  try {
    // Fetch orders in eligible statuses
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
      .in('status', ['Pending', 'Confirmed', 'In Production', 'In Progress'])
      .order('orderDate', { ascending: false })

    if (error) {
      console.error('Eligible orders query error:', error)
      return NextResponse.json({ orders: [] })
    }

    // Fetch order items separately (table is `OrderItem` in Supabase — NOT
    // `SalesOrderItem`). Each item has its own styleNo/quantity.
    const orderIds = (orders || []).map((o: any) => o.id)
    let itemsMap: Record<string, any[]> = {}
    if (orderIds.length > 0) {
      const { data: orderItems, error: itemsErr } = await supabase
        .from('OrderItem')
        .select('id, salesOrderId, styleNo, styleName, quantity, unitPrice, unitCost')
        .in('salesOrderId', orderIds)
      if (itemsErr) {
        console.error('OrderItem fetch error in eligible-orders:', itemsErr.message)
      }
      for (const item of (orderItems || [])) {
        if (!itemsMap[item.salesOrderId]) itemsMap[item.salesOrderId] = []
        itemsMap[item.salesOrderId].push(item)
      }
    }

    // Fetch existing production jobs (for the eligible orders)
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

    // Build result — attach items to each order, then filter to only those
    // that still have some un-produced quantity (or no jobs yet at all).
    const filtered = (orders || []).map((order: any) => ({
      ...order,
      items: itemsMap[order.id] || [],
    })).filter((order: any) => {
      const orderJobs = jobMap[order.id] || []
      const items = order.items || []
      // If no items recorded, still show the order (user may add manual job)
      if (items.length === 0) return true
      // Check each item: if any item's total produced qty < ordered qty, eligible
      let anyPending = false
      for (const item of items) {
        const matchingJobs = orderJobs.filter((j: any) =>
          j.styleNo === item.styleNo || j.styleNo === item.styleName
        )
        const totalProduced = matchingJobs.reduce(
          (s: number, j: any) => s + (j.targetQty || 0), 0
        )
        if (totalProduced < item.quantity) {
          anyPending = true
          break
        }
      }
      // Also eligible if no jobs have been created for this order at all
      return anyPending || orderJobs.length === 0
    })

    return NextResponse.json({ orders: filtered })
  } catch (error) {
    console.error('Eligible orders GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch eligible orders' }, { status: 500 })
  }
}
