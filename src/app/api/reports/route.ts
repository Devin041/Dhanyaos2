import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const PRODUCTION_STAGES = [
  'Fabric Issue',
  'Cutting',
  'Embroidery',
  'Stitching',
  'Fitting',
  'Quality Check',
  'Finishing',
  'Packing',
  'Dispatch Ready',
  'Dispatched',
]

type ReportType =
  | 'profit_loss'
  | 'balance_sheet'
  | 'order_analysis'
  | 'production_report'
  | 'customer_report'
  | 'inventory_report'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const report = searchParams.get('report') as ReportType

    if (!report) {
      return NextResponse.json(
        { error: 'Missing ?report= parameter' },
        { status: 400 }
      )
    }

    switch (report) {
      case 'profit_loss':
        return NextResponse.json(await getProfitLoss())
      case 'order_analysis':
        return NextResponse.json(await getOrderAnalysis())
      case 'production_report':
        return NextResponse.json(await getProductionReport())
      case 'customer_report':
        return NextResponse.json(await getCustomerReport())
      case 'inventory_report':
        return NextResponse.json(await getInventoryReport())
      case 'balance_sheet':
        return NextResponse.json(
          { reportType: 'balance_sheet', message: 'Coming soon' },
          { status: 501 }
        )
      default:
        return NextResponse.json(
          { error: `Unknown report type: ${report}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Reports API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}

// ─── 1. PROFIT & LOSS ───────────────────────────────────────────────────────

async function getProfitLoss() {
  const now = new Date()
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const completedStatuses = ['Dispatched', 'Delivered', 'Completed']
  const inProgressStatuses = ['In Production', 'Confirmed', 'In Progress']
  const allStatuses = [...completedStatuses, ...inProgressStatuses]

  // Fetch orders in period
  const { data: orders } = await supabase
    .from('SalesOrder')
    .select('id, status, totalAmount, totalCost')
    .gte('createdAt', periodStart.toISOString())
    .in('status', allStatuses)

  const ordersArr = orders || []
  const completedOrders = ordersArr.filter((o: any) => completedStatuses.includes(o.status))
  const inProgressOrders = ordersArr.filter((o: any) => inProgressStatuses.includes(o.status))

  const completedRevenue = completedOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
  const inProgressRevenue = inProgressOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
  const totalRevenue = completedRevenue + inProgressRevenue

  // COGS
  const completedCOGS = completedOrders.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)
  const inProgressCOGS = inProgressOrders.reduce((s: number, o: any) => s + (o.totalCost || 0) * 0.8, 0)
  const totalCOGS = completedCOGS + inProgressCOGS

  // Split COGS into Fabric/Labor/Overheads
  const fabricCost = totalCOGS * 0.5
  const laborCost = totalCOGS * 0.3
  const overheadCost = totalCOGS * 0.2

  const grossProfit = totalRevenue - totalCOGS
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // OPEX from Debit transactions in period
  const { data: opexTransactions } = await supabase
    .from('Transaction')
    .select('category, amount')
    .eq('type', 'Debit')
    .gte('date', periodStart.toISOString())

  const opexRows = opexTransactions || []
  const opexByCategory = new Map<string, number>()
  for (const t of opexRows) {
    opexByCategory.set(t.category || 'Uncategorized', (opexByCategory.get(t.category || 'Uncategorized') || 0) + (t.amount || 0))
  }

  const totalOpex = opexRows.reduce((s: number, t: any) => s + (t.amount || 0), 0)
  const opexItems: { label: string; amount: number }[] = []

  if (opexByCategory.size > 0) {
    for (const [cat, amt] of opexByCategory) {
      opexItems.push({ label: cat, amount: Math.round(amt) })
    }
  } else {
    // Fallback defaults
    const salaries = totalOpex * 0.5 || 200000
    const rent = totalOpex * 0.125 || 50000
    const utilities = totalOpex * 0.075 || 30000
    const transport = totalOpex * 0.1 || 40000
    const other = totalOpex * 0.2 || 80000
    opexItems.push(
      { label: 'Salaries', amount: Math.round(salaries) },
      { label: 'Rent', amount: Math.round(rent) },
      { label: 'Utilities', amount: Math.round(utilities) },
      { label: 'Transport', amount: Math.round(transport) },
      { label: 'Other', amount: Math.round(other) }
    )
  }

  const netProfit = grossProfit - totalOpex
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  // Monthly comparison (last 3 months)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthlyComparison = []

  for (let i = 2; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const { data: monthOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount, totalCost')
      .gte('createdAt', mStart.toISOString())
      .lte('createdAt', mEnd.toISOString())
      .in('status', allStatuses)
    const mOrders = monthOrders || []
    const mRevenue = mOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
    const mCost = mOrders.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)
    monthlyComparison.push({
      month: monthNames[mStart.getMonth()],
      revenue: Math.round(mRevenue),
      profit: Math.round(mRevenue - mCost),
    })
  }

  return {
    reportType: 'profit_loss',
    period: 'Last 30 Days',
    generatedAt: now.toISOString(),
    revenue: {
      totalRevenue: Math.round(totalRevenue),
      orders: [
        { label: 'Completed Orders', amount: Math.round(completedRevenue) },
        { label: 'In Progress (Accrued)', amount: Math.round(inProgressRevenue) },
      ],
    },
    costOfGoods: {
      totalCOGS: Math.round(totalCOGS),
      items: [
        { label: 'Fabric Cost', amount: Math.round(fabricCost) },
        { label: 'Labor Cost', amount: Math.round(laborCost) },
        { label: 'Overheads (Allocated)', amount: Math.round(overheadCost) },
      ],
    },
    grossProfit: Math.round(grossProfit),
    grossMargin: Math.round(grossMargin * 10) / 10,
    operatingExpenses: {
      totalOpex: Math.round(totalOpex),
      items: opexItems,
    },
    netProfit: Math.round(netProfit),
    netMargin: Math.round(netMargin * 10) / 10,
    monthlyComparison,
  }
}

// ─── 2. ORDER ANALYSIS ──────────────────────────────────────────────────────

async function getOrderAnalysis() {
  const { data: orders, error } = await supabase
    .from('SalesOrder')
    .select('id, orderNo, status, totalAmount, grossMargin, paymentStatus, customerId, salesOrderId')

  if (error) throw error
  const ordersArr: any[] = orders || []

  // Fetch order items for top styles
  const { data: orderItems } = await supabase
    .from('OrderItem')
    .select('id, salesOrderId, styleId, styleName, quantity, totalAmount')

  const itemsArr: any[] = orderItems || []

  // Fetch styles
  const styleIds = [...new Set(itemsArr.map((i: any) => i.styleId).filter(Boolean))]
  let styleMap: Record<string, any> = {}
  if (styleIds.length > 0) {
    const { data: styles } = await supabase
      .from('Style')
      .select('id, styleNo, collectionName')
      .in('id', styleIds)
    if (styles) {
      styleMap = Object.fromEntries(styles.map((s: any) => [s.id, s]))
    }
  }

  const totalOrders = ordersArr.length
  const totalValue = ordersArr.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)

  // Status breakdown
  const statusMap = new Map<string, { count: number; value: number }>()
  for (const o of ordersArr) {
    const entry = statusMap.get(o.status) || { count: 0, value: 0 }
    entry.count++
    entry.value += o.totalAmount || 0
    statusMap.set(o.status, entry)
  }
  const statusBreakdown = Array.from(statusMap.entries()).map(([status, data]) => ({
    status,
    count: data.count,
    value: Math.round(data.value),
  }))

  // Payment breakdown
  const paymentMap = new Map<string, { count: number; value: number }>()
  for (const o of ordersArr) {
    const entry = paymentMap.get(o.paymentStatus) || { count: 0, value: 0 }
    entry.count++
    entry.value += o.totalAmount || 0
    paymentMap.set(o.paymentStatus, entry)
  }
  const paymentBreakdown = Array.from(paymentMap.entries()).map(([status, data]) => ({
    status,
    count: data.count,
    value: Math.round(data.value),
  }))

  // Top styles
  const styleAggMap = new Map<string, { styleNo: string; styleName: string; totalQty: number; totalValue: number; orderCount: number }>()
  for (const item of itemsArr) {
    const style = item.styleId ? styleMap[item.styleId] : null
    const key = style?.styleNo || item.styleName
    const existing = styleAggMap.get(key)
    if (existing) {
      existing.totalQty += item.quantity || 0
      existing.totalValue += item.totalAmount || 0
      existing.orderCount++
    } else {
      styleAggMap.set(key, {
        styleNo: style?.styleNo || '',
        styleName: item.styleName,
        totalQty: item.quantity || 0,
        totalValue: item.totalAmount || 0,
        orderCount: 1,
      })
    }
  }
  const topStyles = Array.from(styleAggMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10)
    .map((s) => ({
      ...s,
      totalValue: Math.round(s.totalValue),
    }))

  const avgOrderValue = totalOrders > 0 ? Math.round(totalValue / totalOrders) : 0
  const avgMargin =
    ordersArr.length > 0
      ? Math.round((ordersArr.reduce((s: number, o: any) => s + (o.grossMargin || 0), 0) / ordersArr.length) * 10) / 10
      : 0

  return {
    reportType: 'order_analysis',
    totalOrders,
    statusBreakdown,
    paymentBreakdown,
    topStyles,
    avgOrderValue,
    avgMargin,
  }
}

// ─── 3. PRODUCTION REPORT ───────────────────────────────────────────────────

async function getProductionReport() {
  const { data: jobs, error } = await supabase
    .from('ProductionJob')
    .select('*')

  if (error) throw error
  const jobsArr: any[] = jobs || []
  const now = new Date()

  const totalJobs = jobsArr.length
  const statusMap = new Map<string, number>()
  const stageMap = new Map<string, number>()
  let totalTarget = 0
  let totalCompleted = 0

  const overdueJobs: Array<{
    jobNo: string
    styleName: string
    endDate: string
    daysOverdue: number
    completedPct: number
  }> = []

  for (const job of jobsArr) {
    statusMap.set(job.status, (statusMap.get(job.status) || 0) + 1)
    stageMap.set(job.stage, (stageMap.get(job.stage) || 0) + 1)
    totalTarget += job.targetQty || 0
    totalCompleted += job.completedQty || 0

    if (job.endDate && job.status !== 'Completed') {
      const daysOverdue = Math.ceil((now.getTime() - new Date(job.endDate).getTime()) / (1000 * 60 * 60 * 24))
      if (daysOverdue > 0) {
        overdueJobs.push({
          jobNo: job.jobNo,
          styleName: job.styleName,
          endDate: new Date(job.endDate).toISOString().split('T')[0],
          daysOverdue,
          completedPct: job.targetQty > 0 ? Math.round((job.completedQty / job.targetQty) * 100) : 0,
        })
      }
    }
  }

  // Ensure all stages appear
  for (const stage of PRODUCTION_STAGES) {
    if (!stageMap.has(stage)) stageMap.set(stage, 0)
  }

  const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({
    status,
    count,
  }))

  const stageDistribution = Array.from(stageMap.entries()).map(([stage, count]) => ({
    stage,
    count,
  }))

  const overallProgress = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 1000) / 10 : 0

  // Efficiency: completed jobs / total jobs (weighted by completion)
  const completedJobs = jobsArr.filter((j: any) => j.status === 'Completed')
  const efficiency =
    jobsArr.length > 0
      ? Math.round(
          (completedJobs.reduce((s: number, j: any) => s + (j.completedQty / (j.targetQty || 1)), 0) / jobsArr.length) * 1000
        ) / 10
      : 0

  return {
    reportType: 'production_report',
    totalJobs,
    statusBreakdown,
    stageDistribution,
    totalTarget,
    totalCompleted,
    overallProgress,
    overdueJobs: overdueJobs.sort((a, b) => b.daysOverdue - a.daysOverdue),
    efficiency: Math.min(efficiency, 100),
  }
}

// ─── 4. CUSTOMER REPORT ─────────────────────────────────────────────────────

async function getCustomerReport() {
  const { data: customers, error: custErr } = await supabase
    .from('Customer')
    .select('*')

  if (custErr) throw custErr
  const customersArr: any[] = customers || []

  // Fetch all sales orders
  const { data: allOrders } = await supabase
    .from('SalesOrder')
    .select('id, customerId, totalAmount, paidAmount, grossMargin, orderDate, status')
    .order('orderDate', { ascending: false })

  const ordersArr: any[] = allOrders || []

  // Group orders by customer
  const ordersByCustomer: Record<string, any[]> = {}
  for (const o of ordersArr) {
    if (!ordersByCustomer[o.customerId]) ordersByCustomer[o.customerId] = []
    ordersByCustomer[o.customerId].push(o)
  }

  const totalCustomers = customersArr.length
  const activeCustomers = customersArr.filter((c: any) => c.status === 'Active').length

  const topCustomers = customersArr
    .map((c: any) => {
      const customerOrders = ordersByCustomer[c.id] || []
      const totalOrders = customerOrders.length
      const totalValue = customerOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      const totalPaid = customerOrders.reduce((s: number, o: any) => s + (o.paidAmount || 0), 0)
      const outstanding = totalValue - totalPaid
      const avgMargin =
        totalOrders > 0
          ? Math.round((customerOrders.reduce((s: number, o: any) => s + (o.grossMargin || 0), 0) / totalOrders) * 10) / 10
          : 0
      const lastOrderDate = customerOrders[0]?.orderDate || null

      return {
        companyName: c.companyName,
        totalOrders,
        totalValue: Math.round(totalValue),
        totalPaid: Math.round(totalPaid),
        outstanding: Math.round(outstanding),
        avgMargin,
        lastOrderDate,
      }
    })
    .sort((a, b) => b.totalValue - a.totalValue)

  // Payment terms distribution
  const termsMap = new Map<number, number>()
  for (const c of customersArr) {
    termsMap.set(c.paymentTerms || 0, (termsMap.get(c.paymentTerms || 0) || 0) + 1)
  }
  const paymentTermsDistribution = Array.from(termsMap.entries())
    .map(([terms, count]) => ({ terms, count }))
    .sort((a, b) => a.terms - b.terms)

  const totalReceivables = Math.round(
    customersArr.reduce((s: number, c: any) => {
      const customerOrders = ordersByCustomer[c.id] || []
      const totalValue = customerOrders.reduce((sv: number, o: any) => sv + (o.totalAmount || 0), 0)
      const totalPaid = customerOrders.reduce((sv: number, o: any) => sv + (o.paidAmount || 0), 0)
      return s + (totalValue - totalPaid)
    }, 0)
  )

  const totalOrderValue = ordersArr.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
  const totalPaidValue = ordersArr.reduce((s: number, o: any) => s + (o.paidAmount || 0), 0)
  const collectionRate =
    totalOrderValue > 0 ? Math.round((totalPaidValue / totalOrderValue) * 1000) / 10 : 0

  return {
    reportType: 'customer_report',
    totalCustomers,
    activeCustomers,
    topCustomers,
    paymentTermsDistribution,
    totalReceivables,
    collectionRate,
  }
}

// ─── 5. INVENTORY REPORT ────────────────────────────────────────────────────

async function getInventoryReport() {
  const [fabricStockRes, finishedGoodsRes, activeJobsRes] = await Promise.all([
    supabase.from('FabricStock').select('*'),
    supabase.from('FinishedGood').select('*'),
    supabase.from('ProductionJob').select('*').eq('status', 'In Progress'),
  ])

  if (fabricStockRes.error) throw fabricStockRes.error
  if (finishedGoodsRes.error) throw finishedGoodsRes.error
  if (activeJobsRes.error) throw activeJobsRes.error

  const fabricStock: any[] = fabricStockRes.data || []
  const finishedGoods: any[] = finishedGoodsRes.data || []
  const activeJobs: any[] = activeJobsRes.data || []

  const totalRawMaterialValue = Math.round(fabricStock.reduce((s: number, f: any) => s + (f.totalValue || 0), 0))
  const totalFinishedGoodsValue = Math.round(finishedGoods.reduce((s: number, f: any) => s + (f.totalValue || 0), 0))

  const wipValue = activeJobs.reduce((s: number, j: any) => {
    const remaining = (j.targetQty || 0) - (j.completedQty || 0)
    return s + remaining * 300 // avg cost per unit estimate
  }, 0)
  const totalWIPValue = Math.round(wipValue)

  const totalInventoryValue = totalRawMaterialValue + totalFinishedGoodsValue + totalWIPValue

  // Low stock items
  const lowStockItems = fabricStock
    .filter((f: any) => (f.availableMeters || 0) < 50)
    .map((f: any) => ({
      fabricName: f.fabricName,
      availableMeters: f.availableMeters,
      totalValue: Math.round(f.totalValue || 0),
    }))
    .sort((a, b) => a.availableMeters - b.availableMeters)

  // Fabric utilization
  let fabricUtilization = 0
  if (fabricStock.length > 0) {
    const total = fabricStock.reduce((s: number, f: any) => s + (f.availableMeters || 0) + (f.reservedMeters || 0), 0)
    const available = fabricStock.reduce((s: number, f: any) => s + (f.availableMeters || 0), 0)
    fabricUtilization = total > 0 ? Math.round((available / total) * 1000) / 10 : 0
  }

  // Stock turnover
  const { data: completedOrders } = await supabase
    .from('SalesOrder')
    .select('totalCost')
    .in('status', ['Dispatched', 'Delivered', 'Completed'])
  const completedArr: any[] = completedOrders || []
  const totalCOGS = Math.round(completedArr.reduce((s: number, o: any) => s + (o.totalCost || 0), 0))
  const stockTurnover =
    totalInventoryValue > 0 ? Math.round((totalCOGS / totalInventoryValue) * 10) / 10 : 0

  return {
    reportType: 'inventory_report',
    totalRawMaterialValue,
    totalFinishedGoodsValue,
    totalWIPValue,
    totalInventoryValue,
    lowStockItems,
    fabricUtilization,
    stockTurnover,
  }
}
