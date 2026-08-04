import { NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { differenceInDays, format, subDays, startOfDay, addDays, parseISO, isValid } from 'date-fns'

/**
 * GET /api/analytics/hub
 *
 * Executive Analytics Hub — consolidates key metrics from all 5 analytics
 * modules into a single command-center response for the Founder Dashboard.
 *
 * Aggregates:
 *   1. Business Health Score (profitability, liquidity, collections, operations, risk)
 *   2. Cash Flow Snapshot (current balance, 30d forecast, runway)
 *   3. Inventory Health (total value, dead stock, aging)
 *   4. Supply Chain (supplier avg score, top supplier, outstanding POs)
 *   5. Customer Pulse (total revenue, at-risk count, top customer, payment rate)
 *   6. Production Status (completion %, efficiency, bottleneck, at-risk jobs)
 *
 * Returns a compact summary suitable for a single dashboard widget.
 */

interface HubMetric {
  label: string
  value: string
  subtext?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color: string
  icon: string
}

interface HealthDimension {
  label: string
  score: number
  hint: string
}

interface HubResponse {
  healthScore: {
    overall: number
    label: string
    color: string
    dimensions: HealthDimension[]
  }
  cashFlow: {
    currentBalance: number
    projected30Day: number
    runwayDays: number | null
    avgDailyNet: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  inventory: {
    totalValue: number
    totalItems: number
    deadStockValue: number
    deadStockPct: number
    freshPct: number
    avgAgeDays: number
  }
  supplyChain: {
    totalSuppliers: number
    avgScore: number
    topSupplier: string
    topSupplierScore: number
    outstandingPOs: number
    outstandingValue: number
  }
  customers: {
    totalCustomers: number
    totalRevenue: number
    atRiskCount: number
    topCustomer: string
    topCustomerRevenue: number
    avgPaymentRate: number
    repeatRate: number
  }
  production: {
    totalJobs: number
    completionPct: number
    efficiency: number
    bottleneck: string
    atRiskJobs: number
    throughput: number
  }
  alerts: Array<{
    id: string
    severity: 'critical' | 'warning' | 'info'
    category: string
    title: string
    message: string
  }>
  metrics: HubMetric[]
}

function getHealthLabel(score: number): string {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Healthy'
  if (score >= 50) return 'Moderate'
  if (score >= 30) return 'At Risk'
  return 'Critical'
}

function getHealthColor(score: number): string {
  if (score >= 75) return 'oklch(0.72 0.18 145)'
  if (score >= 50) return 'oklch(0.8 0.15 75)'
  return 'oklch(0.65 0.22 25)'
}

function formatINR(v: number): string {
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L`
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  return `₹${v}`
}

function formatFullINR(v: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export async function GET() {
  try {
    const now = new Date()
    const alerts: HubResponse['alerts'] = []

    // ════════════════════════════════════════════════════════════════════════
    // 1. BUSINESS HEALTH SCORE (from dashboard KPIs)
    // ════════════════════════════════════════════════════════════════════════
    let kpis: any = {}
    let unreadAlerts = 0

    try {
      const { data: latestSnap } = await supabase
        .from('DailySnapshot')
        .select('cashBalance, revenue, expenses, grossProfit')
        .order('date', { ascending: false })
        .limit(1)
        .single()

      // Aggregate from SalesOrder
      const { data: orders } = await supabase
        .from('SalesOrder')
        .select('totalAmount, totalCost, grossProfit, status, paymentStatus, paidAmount, deliveryDate')

      const allOrders = orders || []
      const totalRevenue = allOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      const totalCost = allOrders.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)
      const totalProfit = allOrders.reduce((s: number, o: any) => s + (o.grossProfit || 0), 0)
      const receivables = allOrders
        .filter((o: any) => ['Unpaid', 'Partial'].includes(o.paymentStatus))
        .reduce((s: number, o: any) => s + ((o.totalAmount || 0) - (o.paidAmount || 0)), 0)
      const delivered = allOrders.filter((o: any) => o.status === 'Delivered').length
      const totalOrders = allOrders.length
      const cashBalance = latestSnap?.cashBalance || 0
      const monthlyExpenses = latestSnap?.expenses ? latestSnap.expenses * 30 : 0
      const grossMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10 : 0

      kpis = { totalRevenue, totalProfit, grossMargin, cashBalance, receivables, monthlyExpenses, delivered, totalOrders }

      // Count unread alerts
      const { count: alertCount } = await supabase
        .from('Alert')
        .select('*', { count: 'exact', head: true })
        .eq('isRead', false)
      unreadAlerts = alertCount || 0
    } catch (e) {
      // Continue with defaults
    }

    const profitability = Math.min(100, Math.max(0, Math.round((kpis.grossMargin || 0 / 30) * 100)))
    const liquidity = kpis.monthlyExpenses > 0
      ? Math.min(100, Math.max(0, Math.round((kpis.cashBalance / (kpis.monthlyExpenses * 3)) * 100)))
      : 100
    const collectionEff = kpis.totalRevenue > 0
      ? Math.min(100, Math.max(0, Math.round(100 - (kpis.receivables / kpis.totalRevenue) * 100)))
      : 50
    const operations = kpis.totalOrders > 0
      ? Math.min(100, Math.round((kpis.delivered / kpis.totalOrders) * 100))
      : 0
    const risk = Math.max(0, Math.min(100, 100 - (unreadAlerts * 10)))

    const dimensions: HealthDimension[] = [
      { label: 'Profitability', score: profitability, hint: `${(kpis.grossMargin || 0).toFixed(1)}% margin` },
      { label: 'Liquidity', score: liquidity, hint: formatINR(kpis.cashBalance || 0) },
      { label: 'Collections', score: collectionEff, hint: formatINR(kpis.receivables || 0) },
      { label: 'Operations', score: operations, hint: `${kpis.delivered || 0}/${kpis.totalOrders || 0}` },
      { label: 'Risk', score: risk, hint: `${unreadAlerts} alerts` },
    ]
    const healthOverall = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)

    // ════════════════════════════════════════════════════════════════════════
    // 2. CASH FLOW SNAPSHOT
    // ════════════════════════════════════════════════════════════════════════
    let cashFlow: HubResponse['cashFlow'] = {
      currentBalance: kpis.cashBalance || 0,
      projected30Day: kpis.cashBalance || 0,
      runwayDays: null,
      avgDailyNet: 0,
      riskLevel: 'low',
    }

    try {
      const thirtyDaysAgo = subDays(now, 30).toISOString()
      const { data: histSnaps } = await supabase
        .from('DailySnapshot')
        .select('cashIn, cashOut')
        .gte('date', thirtyDaysAgo)

      const snaps = histSnaps || []
      const totalIn = snaps.reduce((s: number, x: any) => s + (x.cashIn || 0), 0)
      const totalOut = snaps.reduce((s: number, x: any) => s + (x.cashOut || 0), 0)
      const avgDailyNet = snaps.length > 0 ? Math.round((totalIn - totalOut) / snaps.length) : 0
      const projected30Day = (kpis.cashBalance || 0) + (avgDailyNet * 30)
      const runwayDays = avgDailyNet < 0 ? Math.floor((kpis.cashBalance || 0) / Math.abs(avgDailyNet)) : null

      let riskLevel: 'low' | 'medium' | 'high' = 'low'
      if (runwayDays !== null && runwayDays < 30) riskLevel = 'high'
      else if (runwayDays !== null && runwayDays < 90) riskLevel = 'medium'
      else if (projected30Day < 0) riskLevel = 'high'

      cashFlow = { currentBalance: kpis.cashBalance || 0, projected30Day, runwayDays, avgDailyNet, riskLevel }

      if (riskLevel === 'high') {
        alerts.push({
          id: 'cash-risk',
          severity: 'critical',
          category: 'Cash Flow',
          title: 'Cash Flow Risk',
          message: `Projected balance in 30 days: ${formatFullINR(projected30Day)}. Runway: ${runwayDays !== null ? runwayDays + ' days' : 'infinite'}.`,
        })
      }
    } catch {
      // Keep defaults
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. INVENTORY HEALTH
    // ════════════════════════════════════════════════════════════════════════
    let inventory: HubResponse['inventory'] = {
      totalValue: 0,
      totalItems: 0,
      deadStockValue: 0,
      deadStockPct: 0,
      freshPct: 0,
      avgAgeDays: 0,
    }

    try {
      const { data: fabrics } = await supabase
        .from('FabricStock')
        .select('id, fabricName, availableMeters, averageCost, totalValue, createdAt')

      const items = (fabrics || []).map((f: any) => {
        const created = f.createdAt ? new Date(f.createdAt) : now
        const ageDays = Math.max(0, differenceInDays(now, created))
        const value = f.totalValue || ((f.availableMeters || 0) * (f.averageCost || 0))
        return { ageDays, value }
      })

      const totalValue = items.reduce((s, i) => s + i.value, 0)
      const totalItems = items.length
      const deadStockValue = items.filter(i => i.ageDays >= 90).reduce((s, i) => s + i.value, 0)
      const freshValue = items.filter(i => i.ageDays <= 30).reduce((s, i) => s + i.value, 0)
      const avgAgeDays = totalItems > 0 ? Math.round(items.reduce((s, i) => s + i.ageDays, 0) / totalItems) : 0

      inventory = {
        totalValue: Math.round(totalValue),
        totalItems,
        deadStockValue: Math.round(deadStockValue),
        deadStockPct: totalValue > 0 ? Math.round((deadStockValue / totalValue) * 1000) / 10 : 0,
        freshPct: totalValue > 0 ? Math.round((freshValue / totalValue) * 1000) / 10 : 0,
        avgAgeDays,
      }

      if (inventory.deadStockPct > 20) {
        alerts.push({
          id: 'dead-stock',
          severity: 'warning',
          category: 'Inventory',
          title: 'Dead Stock Alert',
          message: `${inventory.deadStockPct}% of inventory value (${formatFullINR(deadStockValue)}) is 90+ days old. Consider liquidation.`,
        })
      }
    } catch {
      // Keep defaults
    }

    // ════════════════════════════════════════════════════════════════════════
    // 4. SUPPLY CHAIN
    // ════════════════════════════════════════════════════════════════════════
    let supplyChain: HubResponse['supplyChain'] = {
      totalSuppliers: 0,
      avgScore: 0,
      topSupplier: '—',
      topSupplierScore: 0,
      outstandingPOs: 0,
      outstandingValue: 0,
    }

    try {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name, rating, paymentTerms, status')
        .eq('status', 'Active')

      const { data: pos } = await supabase
        .from('PurchaseOrder')
        .select('id, supplierId, totalAmount, paidAmount, status, paymentStatus')

      const supplierList = suppliers || []
      const poList = pos || []

      // Compute per-supplier score (simplified)
      const poBySupplier: Record<string, any[]> = {}
      for (const po of poList) {
        if (!po.supplierId) continue
        if (!poBySupplier[po.supplierId]) poBySupplier[po.supplierId] = []
        poBySupplier[po.supplierId].push(po)
      }

      let topSupplier = '—'
      let topScore = 0
      let totalScore = 0
      const scoredSuppliers: Array<{ name: string; score: number }> = []

      for (const sup of supplierList) {
        const supPOs = poBySupplier[sup.id] || []
        const totalPOValue = supPOs.reduce((s, p) => s + (p.totalAmount || 0), 0)
        const paidAmount = supPOs.reduce((s, p) => s + (p.paidAmount || 0), 0)
        const paymentScore = totalPOValue > 0 ? (paidAmount / totalPOValue) * 100 : 100
        const qualityScore = ((sup.rating || 3) / 5) * 100
        const score = Math.round(paymentScore * 0.3 + qualityScore * 0.4 + Math.min(100, supPOs.length * 10) * 0.3)
        totalScore += score
        scoredSuppliers.push({ name: sup.name, score })
        if (score > topScore) {
          topScore = score
          topSupplier = sup.name
        }
      }

      const outstandingPOs = poList.filter((p: any) => p.paymentStatus !== 'Paid').length
      const outstandingValue = poList
        .filter((p: any) => p.paymentStatus !== 'Paid')
        .reduce((s: number, p: any) => s + ((p.totalAmount || 0) - (p.paidAmount || 0)), 0)

      supplyChain = {
        totalSuppliers: supplierList.length,
        avgScore: supplierList.length > 0 ? Math.round(totalScore / supplierList.length) : 0,
        topSupplier,
        topSupplierScore: topScore,
        outstandingPOs,
        outstandingValue: Math.round(outstandingValue),
      }
    } catch {
      // Keep defaults
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5. CUSTOMER PULSE
    // ════════════════════════════════════════════════════════════════════════
    let customers: HubResponse['customers'] = {
      totalCustomers: 0,
      totalRevenue: 0,
      atRiskCount: 0,
      topCustomer: '—',
      topCustomerRevenue: 0,
      avgPaymentRate: 0,
      repeatRate: 0,
    }

    try {
      const { data: custList } = await supabase
        .from('Customer')
        .select('id, companyName, status')

      const { data: allOrders } = await supabase
        .from('SalesOrder')
        .select('id, customerId, totalAmount, paidAmount, paymentStatus')

      const orders = allOrders || []
      const orderByCust: Record<string, any[]> = {}
      for (const o of orders) {
        if (!o.customerId) continue
        if (!orderByCust[o.customerId]) orderByCust[o.customerId] = []
        orderByCust[o.customerId].push(o)
      }

      const custData = (custList || []).map((c: any) => {
        const cOrders = orderByCust[c.id] || []
        const revenue = cOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
        const paid = cOrders.reduce((s: number, o: any) => s + (o.paidAmount || 0), 0)
        const paymentRate = revenue > 0 ? (paid / revenue) * 100 : 0
        return { name: c.companyName, revenue, paid, paymentRate, orderCount: cOrders.length }
      })

      const totalRevenue = custData.reduce((s, c) => s + c.revenue, 0)
      const totalPaid = custData.reduce((s, c) => s + c.paid, 0)
      const atRiskCount = custData.filter(c => c.revenue > 50000 && c.paymentRate < 30).length
      const repeatCustomers = custData.filter(c => c.orderCount >= 2).length
      const topCust = custData.sort((a, b) => b.revenue - a.revenue)[0]

      customers = {
        totalCustomers: custData.length,
        totalRevenue: Math.round(totalRevenue),
        atRiskCount,
        topCustomer: topCust?.name || '—',
        topCustomerRevenue: Math.round(topCust?.revenue || 0),
        avgPaymentRate: totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 1000) / 10 : 0,
        repeatRate: custData.length > 0 ? Math.round((repeatCustomers / custData.length) * 1000) / 10 : 0,
      }

      if (atRiskCount > 0) {
        alerts.push({
          id: 'at-risk-customers',
          severity: 'warning',
          category: 'Customers',
          title: 'At-Risk Customers',
          message: `${atRiskCount} customer${atRiskCount !== 1 ? 's' : ''} with high revenue but low payment rate. Prioritize collections.`,
        })
      }
    } catch {
      // Keep defaults
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6. PRODUCTION STATUS
    // ════════════════════════════════════════════════════════════════════════
    let production: HubResponse['production'] = {
      totalJobs: 0,
      completionPct: 0,
      efficiency: 0,
      bottleneck: '—',
      atRiskJobs: 0,
      throughput: 0,
    }

    try {
      const { data: jobs } = await supabase
        .from('ProductionJob')
        .select('id, jobNo, targetQty, completedQty, stage, status, startDate, endDate, createdAt')

      const jobList = jobs || []
      const totalTarget = jobList.reduce((s: number, j: any) => s + (j.targetQty || 0), 0)
      const totalCompleted = jobList.reduce((s: number, j: any) => s + (j.completedQty || 0), 0)
      const completionPct = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 1000) / 10 : 0

      // Efficiency calc
      let totalEff = 0
      let effCount = 0
      let atRiskJobs = 0
      let totalThroughput = 0
      const stageMap: Record<string, { count: number; progressSum: number }> = {}

      for (const job of jobList) {
        const target = job.targetQty || 0
        const completed = job.completedQty || 0
        const progress = target > 0 ? (completed / target) * 100 : 0
        const start = job.startDate ? new Date(job.startDate) : (job.createdAt ? new Date(job.createdAt) : now)
        const daysElapsed = Math.max(1, differenceInDays(now, start))
        let daysPlanned = 7
        if (job.endDate) {
          const end = new Date(job.endDate)
          if (isValid(end)) daysPlanned = Math.max(1, differenceInDays(end, start))
        }
        const expectedProgress = Math.min(100, (daysElapsed / daysPlanned) * 100)
        const eff = expectedProgress > 0 ? (progress / expectedProgress) * 100 : 100

        if (job.status !== 'Completed') {
          totalEff += eff
          effCount++
          if (progress < expectedProgress - 10 && progress < 80) atRiskJobs++
        }
        totalThroughput += completed / daysElapsed

        const stage = job.stage || 'Unknown'
        if (!stageMap[stage]) stageMap[stage] = { count: 0, progressSum: 0 }
        stageMap[stage].count++
        stageMap[stage].progressSum += progress
      }

      // Bottleneck
      let bottleneck = '—'
      let bottleneckScore = -1
      for (const [stage, s] of Object.entries(stageMap)) {
        const avgProgress = s.count > 0 ? s.progressSum / s.count : 0
        const score = s.count * 2 + (100 - avgProgress)
        if (score > bottleneckScore) {
          bottleneckScore = score
          bottleneck = stage
        }
      }

      production = {
        totalJobs: jobList.length,
        completionPct,
        efficiency: effCount > 0 ? Math.round((totalEff / effCount) * 10) / 10 : 100,
        bottleneck,
        atRiskJobs,
        throughput: Math.round(totalThroughput * 10) / 10,
      }

      if (atRiskJobs > 0) {
        alerts.push({
          id: 'prod-at-risk',
          severity: 'warning',
          category: 'Production',
          title: 'Production Behind Schedule',
          message: `${atRiskJobs} job${atRiskJobs !== 1 ? 's' : ''} behind schedule. Bottleneck at ${bottleneck} stage.`,
        })
      }
    } catch {
      // Keep defaults
    }

    // ════════════════════════════════════════════════════════════════════════
    // 7. BUILD COMPACT METRICS ARRAY
    // ════════════════════════════════════════════════════════════════════════
    const metrics: HubMetric[] = [
      {
        label: 'Health Score',
        value: `${healthOverall}/100`,
        subtext: getHealthLabel(healthOverall),
        color: getHealthColor(healthOverall),
        icon: 'Activity',
      },
      {
        label: 'Cash Position',
        value: formatINR(cashFlow.currentBalance),
        subtext: `30d: ${formatINR(cashFlow.projected30Day)}`,
        trend: cashFlow.avgDailyNet >= 0 ? 'up' : 'down',
        trendValue: `${cashFlow.avgDailyNet >= 0 ? '+' : ''}${formatINR(cashFlow.avgDailyNet)}/day`,
        color: cashFlow.riskLevel === 'high' ? 'oklch(0.65 0.22 25)' : cashFlow.riskLevel === 'medium' ? 'oklch(0.8 0.15 75)' : 'oklch(0.72 0.18 145)',
        icon: 'Wallet',
      },
      {
        label: 'Inventory',
        value: formatINR(inventory.totalValue),
        subtext: `${inventory.totalItems} items · ${inventory.avgAgeDays}d avg`,
        trend: inventory.deadStockPct > 10 ? 'down' : 'neutral',
        trendValue: `${inventory.deadStockPct}% dead stock`,
        color: inventory.deadStockPct > 20 ? 'oklch(0.65 0.22 25)' : 'oklch(0.78 0.14 85)',
        icon: 'Package',
      },
      {
        label: 'Suppliers',
        value: `${supplyChain.avgScore}/100`,
        subtext: `${supplyChain.totalSuppliers} active · Top: ${supplyChain.topSupplier.substring(0, 15)}`,
        color: supplyChain.avgScore >= 70 ? 'oklch(0.72 0.18 145)' : 'oklch(0.8 0.15 75)',
        icon: 'Truck',
      },
      {
        label: 'Customers',
        value: formatINR(customers.totalRevenue),
        subtext: `${customers.totalCustomers} · ${customers.atRiskCount} at-risk`,
        trend: customers.avgPaymentRate >= 50 ? 'up' : 'down',
        trendValue: `${customers.avgPaymentRate}% paid`,
        color: customers.atRiskCount > 3 ? 'oklch(0.65 0.22 25)' : 'oklch(0.72 0.18 145)',
        icon: 'Users',
      },
      {
        label: 'Production',
        value: `${production.completionPct}%`,
        subtext: `${production.efficiency}% eff · ${production.atRiskJobs} at-risk`,
        trend: production.efficiency >= 75 ? 'up' : 'down',
        trendValue: `${production.throughput}/day`,
        color: production.efficiency >= 75 ? 'oklch(0.72 0.18 145)' : production.efficiency >= 50 ? 'oklch(0.8 0.15 75)' : 'oklch(0.65 0.22 25)',
        icon: 'Factory',
      },
    ]

    // ════════════════════════════════════════════════════════════════════════
    // 8. FINAL RESPONSE
    // ════════════════════════════════════════════════════════════════════════
    const response: HubResponse = {
      healthScore: {
        overall: healthOverall,
        label: getHealthLabel(healthOverall),
        color: getHealthColor(healthOverall),
        dimensions,
      },
      cashFlow,
      inventory,
      supplyChain,
      customers,
      production,
      alerts: alerts.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 }
        return order[a.severity] - order[b.severity]
      }),
      metrics,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Analytics hub API error:', error)
    return NextResponse.json({ error: 'Failed to load analytics hub' }, { status: 500 })
  }
}
