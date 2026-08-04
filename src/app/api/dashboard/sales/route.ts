import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subDays, startOfDay, endOfDay, startOfMonth, subMonths } from 'date-fns'

export async function GET() {
  try {
    const today = startOfDay(new Date())
    const todayISO = today.toISOString()
    const todayEndISO = endOfDay(new Date()).toISOString()
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    // === Recent Orders (last 10) ===
    const { data: recentOrders } = await supabase
      .from('SalesOrder')
      .select('*, customer:customerId(companyName, buyerName)')
      .order('createdAt', { ascending: false })
      .limit(10)

    // === Sales Pipeline (grouped by status) ===
    const { data: allOrders } = await supabase
      .from('SalesOrder')
      .select('status, totalAmount')
    const orderPipelineMap = new Map<string, { count: number; value: number }>()
    for (const o of (allOrders || [])) {
      const existing = orderPipelineMap.get(o.status) || { count: 0, value: 0 }
      existing.count++
      existing.value += o.totalAmount || 0
      orderPipelineMap.set(o.status, existing)
    }
    const orderPipeline = Array.from(orderPipelineMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      value: data.value,
    }))

    // === Repeat Customers ===
    const { data: customerOrderCounts } = await supabase
      .from('SalesOrder')
      .select('customerId')
    const customerOrderMap = new Map<string, number>()
    for (const o of (customerOrderCounts || [])) {
      customerOrderMap.set(o.customerId, (customerOrderMap.get(o.customerId) || 0) + 1)
    }
    const totalCustomers = customerOrderMap.size
    const repeatCustomers = Array.from(customerOrderMap.values()).filter(c => c >= 2).length
    const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 10000) / 100 : 0

    // === Dispatch Schedule ===
    const { data: upcomingDispatches } = await supabase
      .from('SalesOrder')
      .select('*, customer:customerId(companyName)')
      .in('status', ['Confirmed', 'In Production', 'Dispatched'])
      .gte('deliveryDate', todayISO)
      .order('deliveryDate', { ascending: true })
      .limit(8)

    // === Collections Summary ===
    const { data: paidOrders } = await supabase.from('SalesOrder').select('paidAmount, totalAmount').eq('paymentStatus', 'Paid')
    const { data: partialOrders } = await supabase.from('SalesOrder').select('paidAmount, totalAmount').eq('paymentStatus', 'Partial')
    const { data: unpaidOrders } = await supabase.from('SalesOrder').select('totalAmount').eq('paymentStatus', 'Unpaid')

    // === Monthly Sales Trend (last 6 months) ===
    const monthlyTrend = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i))
      const monthEnd = i === 0 ? endOfDay(new Date()) : startOfMonth(subMonths(new Date(), i - 1))
      const { data: monthOrders } = await supabase
        .from('SalesOrder')
        .select('totalAmount, grossProfit')
        .gte('createdAt', monthStart.toISOString())
        .lt('createdAt', monthEnd.toISOString())
      const monthRev = (monthOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)
      const monthProfit = (monthOrders || []).reduce((s, o) => s + (o.grossProfit || 0), 0)
      monthlyTrend.push({
        month: format(monthStart, 'MMM yyyy'),
        revenue: Math.round(monthRev),
        profit: Math.round(monthProfit),
        orders: (monthOrders || []).length,
      })
    }

    // === Today's summary ===
    const { data: todayTxns } = await supabase
      .from('Transaction')
      .select('*')
      .gte('date', todayISO)
      .lt('date', todayEndISO)
    const todayRevenue = (todayTxns || []).filter(t => t.type === 'Credit').reduce((s, t) => s + t.amount, 0)

    const { count: totalOrderCount } = await supabase
      .from('SalesOrder')
      .select('*', { count: 'exact', head: true })

    const { count: pendingCount } = await supabase
      .from('SalesOrder')
      .select('*', { count: 'exact', head: true })
      .in('status', ['Pending', 'Confirmed'])

    const paidTotal = (paidOrders || []).reduce((s, o) => s + (o.paidAmount || 0), 0)
    const partialPaid = (partialOrders || []).reduce((s, o) => s + (o.paidAmount || 0), 0)
    const partialOutstanding = (partialOrders || []).reduce((s, o) => s + ((o.totalAmount || 0) - (o.paidAmount || 0)), 0)
    const unpaidTotal = (unpaidOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)

    return NextResponse.json({
      recentOrders: (recentOrders || []).map(o => ({
        orderNo: o.orderNo,
        customer: o.customer?.companyName || 'Unknown',
        buyer: o.customer?.buyerName,
        amount: o.totalAmount,
        status: o.status,
        paymentStatus: o.paymentStatus,
        date: format(new Date(o.createdAt), 'dd MMM'),
        paidAmount: o.paidAmount,
      })),
      orderPipeline,
      repeatCustomers,
      repeatRate,
      totalCustomers,
      dispatchSchedule: (upcomingDispatches || []).map(d => ({
        orderNo: d.orderNo,
        customer: d.customer?.companyName || 'Unknown',
        amount: d.totalAmount,
        status: d.status,
        deliveryDate: d.deliveryDate ? format(new Date(d.deliveryDate), 'dd MMM yyyy') : 'TBD',
        daysUntilDelivery: d.deliveryDate
          ? Math.max(0, Math.ceil((new Date(d.deliveryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
          : null,
      })),
      collections: {
        paid: Math.round(paidTotal),
        partialPaid: Math.round(partialPaid),
        partialOutstanding: Math.round(partialOutstanding),
        unpaid: Math.round(unpaidTotal),
        totalCollected: Math.round(paidTotal + partialPaid),
        totalOutstanding: Math.round(partialOutstanding + unpaidTotal),
      },
      monthlyTrend,
      kpis: {
        todayRevenue: Math.round(todayRevenue),
        totalOrders: totalOrderCount || 0,
        pendingOrders: pendingCount || 0,
        totalCustomers,
        repeatCustomers,
        repeatRate,
      },
    })
  } catch (error) {
    console.error('Sales Dashboard API error:', error)
    return NextResponse.json({ error: 'Failed to load sales dashboard data' }, { status: 500 })
  }
}
