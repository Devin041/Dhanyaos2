import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    // ── 1. Fetch all needed data in parallel ──────────────────────────────
    const [
      salesOrdersRes,
      dailySnapshotsRes,
      productionJobsRes,
      customersRes,
      qualityChecksRes,
      transactionsRes,
      stylesRes,
    ] = await Promise.all([
      supabase.from('SalesOrder').select('*, items:OrderItem(*, style:Style(*)), customer:Customer(*)').order('orderDate', { ascending: true }).limit(500),
      supabase.from('DailySnapshot').select('*').order('date', { ascending: true }).limit(365),
      supabase.from('ProductionJob').select('*, qualityChecks:QualityCheck(*)').order('startDate', { ascending: true }).limit(500),
      supabase.from('Customer').select('*, orders:SalesOrder(*)'),
      supabase.from('QualityCheck').select('*').limit(1000),
      supabase.from('Transaction').select('*').order('date', { ascending: true }).limit(2000),
      supabase.from('Style').select('*, orderItems:OrderItem(*)'),
    ])

    const salesOrders = salesOrdersRes.data || []
    const dailySnapshots = dailySnapshotsRes.data || []
    const productionJobs = productionJobsRes.data || []
    const customers = customersRes.data || []
    const qualityChecks = qualityChecksRes.data || []
    const transactions = transactionsRes.data || []
    const styles = stylesRes.data || []

    // ── 2. KPI Summary ───────────────────────────────────────────────────
    const totalRevenue = salesOrders.reduce((s, o) => s + o.totalAmount, 0)
    const totalProfit = salesOrders.reduce((s, o) => s + o.grossProfit, 0)
    const totalOrders = salesOrders.length
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    const completedOrders = salesOrders.filter(
      (o) => o.status === 'Delivered' || o.status === 'Completed'
    ).length
    const orderCompletionRate =
      totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0

    const avgGrossMargin =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

    const customersWithMultiple = customers.filter(
      (c) => (c.orders || []).length > 1
    ).length
    const customerRetentionRate =
      customers.length > 0
        ? (customersWithMultiple / customers.length) * 100
        : 0

    const prodJobsWithTarget = productionJobs.filter((j) => j.targetQty > 0)
    const productionEfficiency =
      prodJobsWithTarget.length > 0
        ? (prodJobsWithTarget.reduce(
            (s, j) => s + Math.min(j.completedQty / j.targetQty, 1),
            0
          ) /
            prodJobsWithTarget.length) *
          100
        : 0

    const kpiSummary = {
      totalRevenue: Math.round(totalRevenue),
      totalProfit: Math.round(totalProfit),
      avgGrossMargin: parseFloat(avgGrossMargin.toFixed(1)),
      totalOrders,
      avgOrderValue: Math.round(avgOrderValue),
      orderCompletionRate: parseFloat(orderCompletionRate.toFixed(1)),
      customerRetentionRate: parseFloat(customerRetentionRate.toFixed(1)),
      productionEfficiency: parseFloat(productionEfficiency.toFixed(1)),
    }

    // ── 3. Revenue Trend (weekly from DailySnapshot) ─────────────────────
    const snaps = [...dailySnapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    const weekMap = new Map<string, { revenue: number; orders: number }>()
    let weekNum = 0
    let weekStart: Date | null = null
    for (const snap of snaps) {
      const snapDate = new Date(snap.date)
      if (!weekStart || snapDate.getTime() - weekStart.getTime() >= 7 * 86400000) {
        weekNum++
        weekStart = snapDate
      }
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ]
      const label = `W${weekNum} ${monthNames[snapDate.getMonth()]}`
      const existing = weekMap.get(label) || { revenue: 0, orders: 0 }
      existing.revenue += snap.revenue
      existing.orders += snap.ordersCount
      weekMap.set(label, existing)
    }
    const revenueTrend = Array.from(weekMap.entries())
      .slice(-6)
      .map(([week, data]) => ({
        week,
        revenue: Math.round(data.revenue),
        orders: data.orders,
      }))

    // ── 4. Category Performance ──────────────────────────────────────────
    const categoryMap = new Map<
      string,
      { revenue: number; orders: Set<string>; profit: number }
    >()
    for (const order of salesOrders) {
      for (const item of (order.items || [])) {
        const cat = item.style?.category || item.styleName || 'Uncategorized'
        const existing = categoryMap.get(cat) || {
          revenue: 0,
          orders: new Set<string>(),
          profit: 0,
        }
        existing.revenue += item.totalAmount
        existing.profit += item.profit
        existing.orders.add(order.id)
        categoryMap.set(cat, existing)
      }
    }
    const categoryPerformance = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        revenue: Math.round(data.revenue),
        orders: data.orders.size,
        margin: parseFloat(
          data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : '0'
        ),
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // ── 5. Customer Tier Analysis ────────────────────────────────────────
    const customerRevenue = customers.map((c) => ({
      name: c.companyName,
      revenue: (c.orders || []).reduce((s, o) => s + o.totalAmount, 0),
    }))

    const tiers = [
      { tier: 'Platinum (5L+)', min: 500000, max: Infinity },
      { tier: 'Gold (2-5L)', min: 200000, max: 500000 },
      { tier: 'Silver (1-2L)', min: 100000, max: 200000 },
      { tier: 'Bronze (<1L)', min: 0, max: 100000 },
    ]

    const totalCustomerRevenue = customerRevenue.reduce(
      (s, c) => s + c.revenue,
      0
    )

    const customerTierAnalysis = tiers.map((t) => {
      const matching = customerRevenue.filter(
        (c) => c.revenue >= t.min && c.revenue < t.max
      )
      const rev = matching.reduce((s, c) => s + c.revenue, 0)
      return {
        tier: t.tier,
        count: matching.length,
        revenue: Math.round(rev),
        percent:
          totalCustomerRevenue > 0
            ? parseFloat(((rev / totalCustomerRevenue) * 100).toFixed(1))
            : 0,
      }
    })

    // ── 6. Production Analytics ──────────────────────────────────────────
    const stages = [
      'Cutting', 'Stitching', 'Embroidery', 'Finishing', 'Quality Check',
      'Packing', 'Fabric Sourcing', 'Pattern Making', 'Hand Work', 'Washing & Ironing',
    ]

    const stageJobCount = new Map<string, number>()
    for (const job of productionJobs) {
      stageJobCount.set(job.stage, (stageJobCount.get(job.stage) || 0) + 1)
    }

    const stageEff = new Map<string, number[]>()
    for (const job of productionJobs) {
      const eff = job.targetQty > 0 ? Math.min((job.completedQty / job.targetQty) * 100, 100) : 0
      const arr = stageEff.get(job.stage) || []
      arr.push(eff)
      stageEff.set(job.stage, arr)
    }

    const stageEfficiency = stages
      .map((stage) => {
        const effs = stageEff.get(stage) || []
        const avgEff = effs.length > 0 ? effs.reduce((s, e) => s + e, 0) / effs.length : 0
        return { stage, efficiency: parseFloat(avgEff.toFixed(1)) }
      })
      .filter((s) => stageJobCount.has(s.stage))

    const bottleneck =
      stageEfficiency.length > 0
        ? stageEfficiency.reduce((min, s) => (s.efficiency < min.efficiency ? s : min))
        : { stage: 'N/A', efficiency: 0 }

    const completedJobsList = productionJobs.filter((j) => j.status === 'Completed')
    const avgCycleTime =
      completedJobsList.length > 0
        ? parseFloat(
            (
              completedJobsList.reduce((s, j) => {
                const end = j.endDate ? new Date(j.endDate) : new Date()
                const days = (end.getTime() - new Date(j.startDate).getTime()) / 86400000
                return s + days
              }, 0) / completedJobsList.length
            ).toFixed(1)
          )
        : 0

    const deliveredOnTime = productionJobs.filter((j) => {
      if (j.status !== 'Completed' || !j.endDate) return false
      return new Date() <= new Date(j.endDate) || j.completedQty >= j.targetQty
    }).length
    const onTimeDelivery =
      productionJobs.length > 0
        ? parseFloat(((deliveredOnTime / productionJobs.length) * 100).toFixed(1))
        : 0

    const totalChecked = qualityChecks.reduce((s, q) => s + q.checkedQty, 0)
    const totalPassed = qualityChecks.reduce((s, q) => s + q.passedQty, 0)
    const qualityPassRate =
      totalChecked > 0 ? parseFloat(((totalPassed / totalChecked) * 100).toFixed(1)) : 0

    const productionAnalytics = {
      stageBottleneck: bottleneck.stage,
      avgCycleTime,
      onTimeDelivery,
      qualityPassRate,
      stageEfficiency,
    }

    // ── 7. Financial Health ──────────────────────────────────────────────
    const latestSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null
    const avgReceivables = snaps.length > 0 ? snaps.reduce((s, d) => s + d.receivables, 0) / snaps.length : 0
    const avgPayables = snaps.length > 0 ? snaps.reduce((s, d) => s + d.payables, 0) / snaps.length : 0
    const avgInventory = snaps.length > 0 ? snaps.reduce((s, d) => s + d.inventoryValue, 0) / snaps.length : 0

    const totalRevenue30 = snaps.length > 0 ? snaps.slice(-30).reduce((s, d) => s + d.revenue, 0) : 0
    const totalExpenses30 = snaps.length > 0 ? snaps.slice(-30).reduce((s, d) => s + d.expenses, 0) : 0

    const avgDailyExpense = snaps.length > 0 ? snaps.slice(-30).reduce((s, d) => s + d.cashOut, 0) / 30 : 0
    const cashRunwayDays = avgDailyExpense > 0 && latestSnap ? Math.round(latestSnap.cashBalance / avgDailyExpense) : 0

    const receivablesTurnover = avgReceivables > 0 ? parseFloat((totalRevenue30 / avgReceivables).toFixed(1)) : 0
    const inventoryTurnover = avgInventory > 0 ? parseFloat((totalExpenses30 / avgInventory).toFixed(1)) : 0

    const debtToEquity = latestSnap && latestSnap.cashBalance > 0 ? parseFloat((avgPayables / latestSnap.cashBalance).toFixed(1)) : 0

    const currentAssets = (latestSnap?.cashBalance || 0) + avgReceivables
    const currentRatio = avgPayables > 0 ? parseFloat((currentAssets / avgPayables).toFixed(1)) : 0

    const quickAssets = currentAssets - avgInventory
    const quickRatio = avgPayables > 0 ? parseFloat((quickAssets / avgPayables).toFixed(1)) : 0

    const financialHealth = { cashRunwayDays, receivablesTurnover, inventoryTurnover, debtToEquity, currentRatio, quickRatio }

    // ── 8. Top Performers ────────────────────────────────────────────────
    const topCustomers = customers
      .map((c) => {
        const custOrders = salesOrders.filter((o) => o.customerId === c.id)
        const rev = custOrders.reduce((s, o) => s + o.totalAmount, 0)
        const prof = custOrders.reduce((s, o) => s + o.grossProfit, 0)
        return { name: c.companyName, revenue: Math.round(rev), margin: rev > 0 ? parseFloat(((prof / rev) * 100).toFixed(1)) : 0, orders: custOrders.length }
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const styleMap = new Map<string, { styleNo: string; styleName: string; revenue: number; qty: number; profit: number }>()
    for (const order of salesOrders) {
      for (const item of (order.items || [])) {
        const key = item.style?.styleNo || item.styleName
        const existing = styleMap.get(key) || { styleNo: item.style?.styleNo || 'N/A', styleName: item.styleName, revenue: 0, qty: 0, profit: 0 }
        existing.revenue += item.totalAmount
        existing.qty += item.quantity
        existing.profit += item.profit
        styleMap.set(key, existing)
      }
    }
    const topStyles = Array.from(styleMap.values())
      .map((s) => ({ ...s, revenue: Math.round(s.revenue), margin: s.revenue > 0 ? parseFloat(((s.profit / s.revenue) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const collectionMap = new Map<string, { revenue: number; orders: Set<string>; profit: number }>()
    for (const order of salesOrders) {
      for (const item of (order.items || [])) {
        const col = item.style?.collectionName || 'General'
        const existing = collectionMap.get(col) || { revenue: 0, orders: new Set<string>(), profit: 0 }
        existing.revenue += item.totalAmount
        existing.profit += item.profit
        existing.orders.add(order.id)
        collectionMap.set(col, existing)
      }
    }
    const topCollections = Array.from(collectionMap.entries())
      .map(([collection, data]) => ({
        collection, revenue: Math.round(data.revenue), orders: data.orders.size,
        margin: data.revenue > 0 ? parseFloat(((data.profit / data.revenue) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3)

    const topPerformers = { topCustomers, topStyles, topCollections }

    // ── 9. Monthly Comparison ────────────────────────────────────────────
    const monthMap = new Map<string, { revenue: number; profit: number; orders: number }>()
    for (const snap of snaps) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const label = monthNames[new Date(snap.date).getMonth()]
      const existing = monthMap.get(label) || { revenue: 0, profit: 0, orders: 0 }
      existing.revenue += snap.revenue
      existing.profit += snap.netProfit
      existing.orders += snap.ordersCount
      monthMap.set(label, existing)
    }
    const monthlyComparison = Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month, revenue: Math.round(data.revenue), profit: Math.round(data.profit), orders: data.orders,
        margin: data.revenue > 0 ? parseFloat(((data.profit / data.revenue) * 100).toFixed(1)) : 0,
      }))
      .slice(-3)

    return NextResponse.json({
      kpiSummary, revenueTrend, categoryPerformance, customerTierAnalysis,
      productionAnalytics, financialHealth, topPerformers, monthlyComparison,
    })
  } catch (error) {
    console.error('[Analytics API]', error)
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
  }
}
