import { supabase } from '@/lib/supabase-db'
import type { ToolDef, ToolResult } from './tools'
import { parseDateInput, istToday, istNow, istMonthStart } from './date-utils'
import { TOOLS_PREDICTIVE } from './tools-predictive-defs'

// ─── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const rnd = (n: number) => Math.round(n * 100) / 100
const rnd1 = (n: number) => Math.round(n * 10) / 10

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS — 3 PREDICTIVE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

export { TOOLS_PREDICTIVE }

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS — 3 PREDICTIVE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOL_EXECUTORS_PREDICTIVE: Record<string, (p: Record<string, unknown>) => Promise<ToolResult>> = {

  // ═══════════════════════════════════════════════════════════════════════
  // P1: Get Demand Forecast
  // ═══════════════════════════════════════════════════════════════════════
  get_demand_forecast: async (p) => {
    const period = (p.period as string) || 'next_month'
    const customerName = (p.customerName as string || '').trim()
    const category = (p.category as string || '').trim()

    // ── Fetch last 3 months of orders for baseline ──
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    // Build the Supabase query
    let query = supabase.from('SalesOrder')
      .select('*, items:OrderItem(*, style:styleId(category)), customer:customerId(companyName)')
      .gte('orderDate', threeMonthsAgo.toISOString())
      .neq('status', 'Cancelled')
      .order('orderDate', { ascending: true })

    // For customerName filter, we need to use a nested search or post-filter
    // For category filter on items.style.category, we need post-filter
    // Supabase doesn't support deep nested where filtering easily, so we fetch all and filter

    const { data: allOrders, error } = await query
    if (error || !allOrders) {
      return { success: false, data: null, summary: 'Failed to fetch orders for forecast.' }
    }

    // Apply customer name filter (case-insensitive contains)
    let orders = allOrders as any[]
    if (customerName) {
      orders = orders.filter(o =>
        o.customer?.companyName?.toLowerCase().includes(customerName.toLowerCase())
      )
    }

    // Apply category filter on items.style.category
    if (category) {
      orders = orders.filter(o =>
        o.items?.some((i: any) => i.style?.category?.toLowerCase().includes(category.toLowerCase()))
      )
    }

    if (orders.length === 0) {
      return {
        success: false,
        data: null,
        summary: customerName || category
          ? `No orders found for the specified filters in the last 3 months.`
          : 'No orders found in the last 3 months. Cannot generate forecast.',
      }
    }

    // ── Group orders by week ──
    const weeklyBuckets: { weekStart: Date; weekEnd: Date; orders: typeof orders; totalQty: number; totalRevenue: number }[] = []

    // Find the Monday of the first order's week
    const firstOrderDate = new Date(orders[0].orderDate)
    const firstMonday = new Date(firstOrderDate)
    const dayOfWeek = firstMonday.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    firstMonday.setDate(firstMonday.getDate() - diff)
    firstMonday.setHours(0, 0, 0, 0)

    let currentWeekStart = new Date(firstMonday)
    let currentBucket: typeof weeklyBuckets[0] | null = null

    for (const order of orders) {
      const orderDate = new Date(order.orderDate)
      const weekEnd = new Date(currentWeekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      if (orderDate >= currentWeekStart && orderDate < weekEnd) {
        if (!currentBucket) {
          currentBucket = { weekStart: new Date(currentWeekStart), weekEnd: new Date(weekEnd), orders: [], totalQty: 0, totalRevenue: 0 }
          weeklyBuckets.push(currentBucket)
        }
        currentBucket.orders.push(order)
        currentBucket.totalQty += order.items.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0)
        currentBucket.totalRevenue += order.totalAmount ?? 0
      } else {
        // Advance to the correct week
        while (orderDate >= weekEnd) {
          currentWeekStart = new Date(weekEnd)
          weekEnd.setDate(weekEnd.getDate() + 7)
        }
        currentBucket = { weekStart: new Date(currentWeekStart), weekEnd: new Date(weekEnd), orders: [], totalQty: 0, totalRevenue: 0 }
        weeklyBuckets.push(currentBucket)
        currentBucket.orders.push(order)
        currentBucket.totalQty += order.items.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0)
        currentBucket.totalRevenue += order.totalAmount ?? 0
      }
    }

    // ── Calculate averages (simple moving average) ──
    const weekCount = weeklyBuckets.length || 1
    const avgOrdersPerWeek = orders.length / weekCount
    const avgQtyPerWeek = weeklyBuckets.reduce((s, w) => s + w.totalQty, 0) / weekCount
    const avgRevenuePerWeek = weeklyBuckets.reduce((s, w) => s + w.totalRevenue, 0) / weekCount

    // ── Calculate variance for confidence ──
    const orderCounts = weeklyBuckets.map(w => w.orders.length)
    const varianceOrders = orderCounts.reduce((s, c) => s + Math.pow(c - avgOrdersPerWeek, 2), 0) / weekCount
    const stdDevOrders = Math.sqrt(varianceOrders)
    const coefficientOfVariation = avgOrdersPerWeek > 0 ? stdDevOrders / avgOrdersPerWeek : 1

    // ── Growth rate: this month vs last month ──
    const now = istNow()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const thisMonthOrders = orders.filter(o => new Date(o.orderDate) >= thisMonthStart).length
    const lastMonthOrders = orders.filter(o => {
      const d = new Date(o.orderDate)
      return d >= lastMonthStart && d < thisMonthStart
    }).length

    const growthRate = lastMonthOrders > 0 ? rnd1((thisMonthOrders - lastMonthOrders) / lastMonthOrders * 100) : 0

    // ── Apply growth adjustment to forecast ──
    const growthFactor = 1 + growthRate / 100
    let periodWeeks: number
    let periodLabel: string

    switch (period) {
      case 'next_week':
        periodWeeks = 1
        periodLabel = 'Next Week'
        break
      case 'next_quarter':
        periodWeeks = 13
        periodLabel = 'Next Quarter'
        break
      default:
        periodWeeks = 4
        periodLabel = 'Next Month'
    }

    const predictedOrders = Math.round(avgOrdersPerWeek * periodWeeks * growthFactor)
    const predictedQty = Math.round(avgQtyPerWeek * periodWeeks * growthFactor)
    const predictedRevenue = rnd(avgRevenuePerWeek * periodWeeks * growthFactor)

    // ── Trend direction ──
    let trend: 'up' | 'down' | 'stable'
    if (growthRate > 5) trend = 'up'
    else if (growthRate < -5) trend = 'down'
    else trend = 'stable'

    // ── Confidence based on data variance ──
    let confidence: 'high' | 'medium' | 'low'
    if (coefficientOfVariation < 0.3) confidence = 'high'
    else if (coefficientOfVariation < 0.6) confidence = 'medium'
    else confidence = 'low'

    const filterNote = customerName || category
      ? ` for ${[customerName, category ? `category "${category}"` : ''].filter(Boolean).join(', ')}`
      : ''

    return {
      success: true,
      count: predictedOrders,
      summary: `${periodLabel}${filterNote}: ~${predictedOrders} orders, ${predictedQty.toLocaleString('en-IN')} pcs, ${fmt(predictedRevenue)} revenue. Trend: ${trend} (${growthRate > 0 ? '+' : ''}${growthRate}%).`,
      data: {
        period: periodLabel,
        filter: customerName || category || 'All customers',
        predicted: {
          orderCount: predictedOrders,
          quantity: predictedQty,
          revenue: predictedRevenue,
        },
        baseline: {
          avgOrdersPerWeek: rnd1(avgOrdersPerWeek),
          avgQtyPerWeek: Math.round(avgQtyPerWeek),
          avgRevenuePerWeek: rnd(avgRevenuePerWeek),
          weeksAnalyzed: weeklyBuckets.length,
          totalOrdersAnalyzed: orders.length,
        },
        growth: {
          rate: growthRate,
          thisMonthOrders,
          lastMonthOrders,
          trend,
        },
        confidence,
        recentWeeks: weeklyBuckets.slice(-4).map(w => ({
          weekOf: w.weekStart.toISOString().split('T')[0],
          orders: w.orders.length,
          qty: w.totalQty,
          revenue: rnd(w.totalRevenue),
        })),
      },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // P2: Get Stock Prediction
  // ═══════════════════════════════════════════════════════════════════════
  get_stock_prediction: async (p) => {
    const days = (typeof p.days === 'number' ? p.days : 30) || 30

    // ── Get all fabrics with stock > 0 ──
    const { data: fabrics, error } = await supabase.from('FabricStock')
      .select('*, fabricConsumptions:FabricConsumption(consumedQty, consumptionDate)')
      .gt('availableMeters', 0)

    if (error || !fabrics || fabrics.length === 0) {
      return { success: false, data: null, summary: 'No fabrics in stock to predict.' }
    }

    const now = istNow()
    const lookbackDays = 90 // Look at last 90 days for consumption rate
    const lookbackDate = new Date(now.getTime() - lookbackDays * 86400000)

    const predictions = fabrics.map(fabric => {
      // Calculate daily consumption rate from FabricConsumption records
      const fabricAny = fabric as any
      const consumptions = fabricAny.fabricConsumptions ?? []
      const relevantConsumptions = consumptions.filter(
        (fc: any) => new Date(fc.consumptionDate) >= lookbackDate && fc.consumedQty > 0
      )

      let dailyRate: number
      let rateSource: string

      if (relevantConsumptions.length > 0) {
        const totalConsumed = relevantConsumptions.reduce((s: number, fc: any) => s + fc.consumedQty, 0)
        // Use the actual date range of consumptions for accuracy
        const oldest = new Date(Math.min(...relevantConsumptions.map((fc: any) => new Date(fc.consumptionDate).getTime())))
        const newest = new Date(Math.max(...relevantConsumptions.map((fc: any) => new Date(fc.consumptionDate).getTime())))
        const daysInRange = Math.max(1, Math.ceil((newest.getTime() - oldest.getTime()) / 86400000) + 1)
        dailyRate = totalConsumed / daysInRange
        rateSource = `Based on ${relevantConsumptions.length} consumption records over ${daysInRange} days`
      } else {
        // Fallback: use actualFabricConsumed from linked ProductionJobs if available
        // Estimate based on order of magnitude of stock
        if (fabric.availableMeters > 1000) {
          dailyRate = fabric.availableMeters / 180 // Assume ~180 day supply as baseline
          rateSource = 'Estimated (no consumption data, large stock assumption)'
        } else if (fabric.availableMeters > 100) {
          dailyRate = fabric.availableMeters / 60
          rateSource = 'Estimated (no consumption data, medium stock assumption)'
        } else {
          dailyRate = fabric.availableMeters / 30
          rateSource = 'Estimated (no consumption data, small stock assumption)'
        }
      }

      // If consumption is effectively zero, set very high days remaining
      if (dailyRate < 0.001) {
        return {
          fabricName: fabric.fabricName,
          lotNumber: fabric.lotNumber,
          currentStock: fabric.availableMeters,
          dailyRate: 0,
          daysRemaining: Infinity,
          predictedStockOut: 'Never (no consumption)',
          urgency: 'safe' as const,
          rateSource,
        }
      }

      const daysRemaining = Math.round(fabric.availableMeters / dailyRate)
      const stockOutDate = new Date(now.getTime() + daysRemaining * 86400000)
      const stockOutStr = stockOutDate.toISOString().split('T')[0]

      let urgency: 'critical' | 'warning' | 'watch' | 'safe'
      if (daysRemaining <= 7) urgency = 'critical'
      else if (daysRemaining <= 21) urgency = 'warning'
      else if (daysRemaining <= days) urgency = 'watch'
      else urgency = 'safe'

      return {
        fabricName: fabric.fabricName,
        lotNumber: fabric.lotNumber,
        currentStock: fabric.availableMeters,
        dailyRate: rnd1(dailyRate),
        daysRemaining,
        predictedStockOut: stockOutStr,
        urgency,
        rateSource,
      }
    })

    // Sort by urgency (soonest stock-out first), safe fabrics last
    const urgencyOrder = { critical: 0, warning: 1, watch: 2, safe: 3 }
    predictions.sort((a, b) => {
      const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      if (uDiff !== 0) return uDiff
      return a.daysRemaining - b.daysRemaining
    })

    const criticalCount = predictions.filter(pr => pr.urgency === 'critical').length
    const warningCount = predictions.filter(pr => pr.urgency === 'warning').length
    const withinHorizon = predictions.filter(pr => pr.urgency !== 'safe')

    return {
      success: true,
      count: fabrics.length,
      summary: `${fabrics.length} fabrics analyzed. ${criticalCount} critical (≤7 days), ${warningCount} warning (≤21 days). ${withinHorizon.length} may run out within ${days}-day horizon.`,
      data: {
        horizon: days,
        totalFabrics: fabrics.length,
        criticalCount,
        warningCount,
        watchCount: predictions.filter(pr => pr.urgency === 'watch').length,
        safeCount: predictions.filter(pr => pr.urgency === 'safe').length,
        predictions,
      },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // P3: Get Trend Analysis
  // ═══════════════════════════════════════════════════════════════════════
  get_trend_analysis: async (p) => {
    const metric = (p.metric as string) || 'orders'
    const periods = (typeof p.periods === 'number' ? p.periods : 6) || 6

    const now = istNow()
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // Build monthly buckets
    const periodData: { month: string; label: string; value: number; from: Date; to: Date }[] = []

    for (let i = periods - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`
      const monthStr = d.toISOString().slice(0, 7) // YYYY-MM
      periodData.push({ month: monthStr, label, value: 0, from: d, to: monthEnd })
    }

    switch (metric) {
      case 'orders': {
        // Count orders per month (exclude cancelled)
        const { data: orders } = await supabase.from('SalesOrder')
          .select('orderDate')
          .gte('orderDate', periodData[0].from.toISOString())
          .lte('orderDate', periodData[periodData.length - 1].to.toISOString())
          .neq('status', 'Cancelled')

        for (const order of (orders ?? [])) {
          const m = new Date(order.orderDate).toISOString().slice(0, 7)
          const bucket = periodData.find(pd => pd.month === m)
          if (bucket) bucket.value++
        }
        break
      }

      case 'revenue': {
        // Sum totalAmount per month
        const { data: orders } = await supabase.from('SalesOrder')
          .select('orderDate, totalAmount')
          .gte('orderDate', periodData[0].from.toISOString())
          .lte('orderDate', periodData[periodData.length - 1].to.toISOString())
          .neq('status', 'Cancelled')

        for (const order of (orders ?? [])) {
          const m = new Date(order.orderDate).toISOString().slice(0, 7)
          const bucket = periodData.find(pd => pd.month === m)
          if (bucket) bucket.value += order.totalAmount ?? 0
        }
        // Round values
        periodData.forEach(pd => { pd.value = rnd(pd.value) })
        break
      }

      case 'production': {
        // Count completed production jobs per month
        const { data: jobs } = await supabase.from('ProductionJob')
          .select('updatedAt')
          .gte('createdAt', periodData[0].from.toISOString())
          .lte('createdAt', periodData[periodData.length - 1].to.toISOString())
          .eq('status', 'Completed')

        for (const job of (jobs ?? [])) {
          // Use updatedAt for completed jobs (when they were marked complete)
          const m = new Date(job.updatedAt).toISOString().slice(0, 7)
          const bucket = periodData.find(pd => pd.month === m)
          if (bucket) bucket.value++
        }
        break
      }

      case 'customers': {
        // Count unique customers ordering per month
        const { data: orders } = await supabase.from('SalesOrder')
          .select('orderDate, customerId')
          .gte('orderDate', periodData[0].from.toISOString())
          .lte('orderDate', periodData[periodData.length - 1].to.toISOString())
          .neq('status', 'Cancelled')

        const monthCustomers = new Map<string, Set<string>>()
        for (const order of (orders ?? [])) {
          const m = new Date(order.orderDate).toISOString().slice(0, 7)
          if (!monthCustomers.has(m)) monthCustomers.set(m, new Set())
          monthCustomers.get(m)!.add(order.customerId)
        }

        for (const [m, customers] of Array.from(monthCustomers)) {
          const bucket = periodData.find(pd => pd.month === m)
          if (bucket) bucket.value = customers.size
        }
        break
      }
    }

    // ── Calculate month-over-month growth rates ──
    const growthRates: { period: string; rate: number }[] = []
    for (let i = 1; i < periodData.length; i++) {
      const prev = periodData[i - 1].value
      const curr = periodData[i].value
      const rate = prev > 0 ? rnd1((curr - prev) / prev * 100) : (curr > 0 ? 100 : 0)
      growthRates.push({ period: periodData[i].label, rate })
    }

    // ── Find best and worst months ──
    const values = periodData.map(pd => pd.value)
    const maxValue = Math.max(...values)
    const minValue = Math.min(...values)
    const bestMonth = periodData.find(pd => pd.value === maxValue)
    const worstMonth = periodData.find(pd => pd.value === minValue)

    // ── Overall trend (simple linear regression slope) ──
    const n = periodData.length
    const xMean = (n - 1) / 2 // 0-indexed x values
    const yMean = values.reduce((s, v) => s + v, 0) / n
    let numerator = 0
    let denominator = 0
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean)
      denominator += (i - xMean) * (i - xMean)
    }
    const slope = denominator > 0 ? numerator / denominator : 0

    // Determine trend direction from slope
    const yMeanAbs = Math.abs(yMean) || 1
    const normalizedSlope = slope / yMeanAbs
    let trendDirection: 'strong_up' | 'up' | 'stable' | 'down' | 'strong_down'
    if (normalizedSlope > 0.1) trendDirection = 'strong_up'
    else if (normalizedSlope > 0.02) trendDirection = 'up'
    else if (normalizedSlope > -0.02) trendDirection = 'stable'
    else if (normalizedSlope > -0.1) trendDirection = 'down'
    else trendDirection = 'strong_down'

    const trendLabels: Record<string, string> = {
      strong_up: '📈 Strongly Up',
      up: '↗️ Up',
      stable: '➡️ Stable',
      down: '↘️ Down',
      strong_down: '📉 Strongly Down',
    }

    // ── Average growth rate ──
    const avgGrowthRate = growthRates.length > 0
      ? rnd1(growthRates.reduce((s, g) => s + g.rate, 0) / growthRates.length)
      : 0

    // ── Format per-period data for display ──
    const perPeriod = periodData.map((pd, i) => ({
      label: pd.label,
      value: metric === 'revenue' ? fmt(pd.value) : pd.value,
      rawValue: pd.value,
      growth: i > 0 ? `${growthRates[i - 1].rate > 0 ? '+' : ''}${growthRates[i - 1].rate}%` : '—',
    }))

    const metricLabels: Record<string, string> = {
      orders: 'Orders',
      revenue: 'Revenue',
      production: 'Completed Jobs',
      customers: 'Active Customers',
    }

    return {
      success: true,
      count: periods,
      summary: `${metricLabels[metric]} trend: ${trendLabels[trendDirection]}. Best: ${bestMonth?.label} (${metric === 'revenue' ? fmt(maxValue) : maxValue}), Worst: ${worstMonth?.label} (${metric === 'revenue' ? fmt(minValue) : minValue}). Avg MoM growth: ${avgGrowthRate > 0 ? '+' : ''}${avgGrowthRate}%.`,
      data: {
        metric,
        metricLabel: metricLabels[metric],
        periods,
        overallTrend: {
          direction: trendDirection,
          label: trendLabels[trendDirection],
          slope: rnd1(slope),
          avgGrowthRate,
        },
        best: { month: bestMonth?.label, value: metric === 'revenue' ? fmt(maxValue) : maxValue },
        worst: { month: worstMonth?.label, value: metric === 'revenue' ? fmt(minValue) : minValue },
        growthRates,
        perPeriod,
      },
    }
  },
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────────

export async function executePredictiveTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS_PREDICTIVE[toolName]
  if (!executor) {
    return { success: false, data: null, summary: `Unknown predictive tool: ${toolName}` }
  }
  return executor(params)
}
