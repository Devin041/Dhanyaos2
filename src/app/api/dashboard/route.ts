import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

const _isSupabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

function _getDemoData() {
  const today = format(new Date(), 'MMM dd')
  return {
    kpis: { todayRevenue: 245000, pendingOrders: 12, inProductionOrders: 8, totalOrders: 156, deliveredOrders: 89, cashBalance: 1850000, receivables: 720000, payables: 340000, workingCapital: 2230000, inventoryValue: 960000, monthlyExpenses: 580000, totalRevenue: 12400000, totalProfit: 3100000, grossMargin: 25, outstandingPOs: 7, outstandingPOValue: 480000 },
    dailyTrend: Array.from({ length: 14 }, (_, i) => { const d = subDays(new Date(), 13 - i); const base = 100000 + (i * 12000); return { date: format(d, 'MMM dd'), revenue: base, expenses: Math.round(base * 0.7), profit: Math.round(base * 0.3), cashBalance: 1500000 + (i * 25000) } }),
    orderPipeline: [{ status: 'Pending', count: 5, value: 350000 }, { status: 'Confirmed', count: 7, value: 890000 }, { status: 'In Production', count: 8, value: 1200000 }, { status: 'Dispatched', count: 3, value: 450000 }, { status: 'Delivered', count: 89, value: 9600000 }],
    productionJobs: [{ jobNo: 'PRD-001', styleName: 'Anarkali Kurta', targetQty: 200, completedQty: 145, stage: 'Stitching', status: 'In Progress', progress: 73 }, { jobNo: 'PRD-002', styleName: 'Palazzo Set', targetQty: 150, completedQty: 120, stage: 'Finishing', status: 'In Progress', progress: 80 }, { jobNo: 'PRD-003', styleName: 'Saree Blouse', targetQty: 300, completedQty: 300, stage: 'QC', status: 'Completed', progress: 100 }, { jobNo: 'PRD-004', styleName: 'Lehenga Choli', targetQty: 100, completedQty: 25, stage: 'Cutting', status: 'In Progress', progress: 25 }],
    topCustomers: [{ name: 'Pooja Collections', orders: 28, revenue: 2400000, profit: 620000, margin: 25.8 }, { name: 'Riya Fashions', orders: 22, revenue: 1800000, profit: 450000, margin: 25 }, { name: 'Meera Exports', orders: 18, revenue: 1500000, profit: 390000, margin: 26 }, { name: 'Kavita Wholesale', orders: 15, revenue: 1200000, profit: 300000, margin: 25 }],
    alerts: [{ id: '1', type: 'fabric', severity: 'warning', title: 'Low Fabric Stock', message: 'Cotton Lawn running low', isRead: false }, { id: '2', type: 'payment', severity: 'info', title: 'Payment Received', message: '1,20,000 received', isRead: false }],
    recentOrders: [{ orderNo: 'SO-2026-156', customer: 'Pooja Collections', amount: 185000, status: 'Confirmed', paymentStatus: 'Partial', date: today }, { orderNo: 'SO-2026-155', customer: 'Riya Fashions', amount: 95000, status: 'In Production', paymentStatus: 'Unpaid', date: today }],
    pendingPayments: [{ orderNo: 'SO-2026-156', customer: 'Pooja Collections', totalAmount: 185000, paidAmount: 50000, outstanding: 135000, paymentStatus: 'Partial', orderDate: today }],
    upcomingCollections: [{ orderNo: 'SO-2026-148', customer: 'Kavita Wholesale', outstanding: 220000, expectedDate: format(new Date(), 'dd MMM') }],
  }
}

export async function GET() {
  try {
    if (!_isSupabaseConfigured) {
      return NextResponse.json(_getDemoData())
    }

    const today = startOfDay(new Date())
    const todayISO = today.toISOString()
    const todayEndISO = endOfDay(new Date()).toISOString()
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    // Helper: safe query — never throws, returns null on failure
    const safeQuery = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn() } catch (e) { console.warn('[Dashboard] query skipped:', e); return null }
    }

    // === KPIs ===
    let latestSnapshot: any = null
    const snapRes = await safeQuery(() => supabase
      .from('DailySnapshot').select('*').eq('date', todayISO)
      .order('date', { ascending: false }).limit(1).single())
    if (snapRes?.data) latestSnapshot = snapRes.data
    else {
      const latestRes = await safeQuery(() => supabase
        .from('DailySnapshot').select('*')
        .order('date', { ascending: false }).limit(1).single())
      if (latestRes?.data) latestSnapshot = latestRes.data
    }

    let todayRevenue = 0
    const txRes = await safeQuery(() => supabase
      .from('Transaction').select('*').gte('date', todayISO).lt('date', todayEndISO))
    if (txRes?.data) todayRevenue = txRes.data.filter((t: any) => t.type === 'Credit').reduce((s: number, t: any) => s + t.amount, 0)

    // Order counts
    let pendingOrders = 0, inProductionOrders = 0, totalOrders = 0, deliveredOrders = 0
    const poRes = await safeQuery(() => supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Confirmed']))
    if (poRes?.count !== undefined) pendingOrders = poRes.count
    const ipRes = await safeQuery(() => supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'In Production'))
    if (ipRes?.count !== undefined) inProductionOrders = ipRes.count
    const toRes = await safeQuery(() => supabase.from('SalesOrder').select('*', { count: 'exact', head: true }))
    if (toRes?.count !== undefined) totalOrders = toRes.count
    const doRes = await safeQuery(() => supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'Delivered'))
    if (doRes?.count !== undefined) deliveredOrders = doRes.count

    // Aggregates — receivables
    let receivables = 0
    const recRes = await safeQuery(() => supabase.from('SalesOrder').select('totalAmount, paidAmount').in('paymentStatus', ['Unpaid', 'Partial']))
    if (recRes?.data) receivables = recRes.data.reduce((s: number, o: any) => s + (o.totalAmount || 0) - (o.paidAmount || 0), 0)

    // Aggregates — payables
    let payables = 0
    const payRes = await safeQuery(() => supabase.from('PurchaseOrder').select('totalAmount, paidAmount').eq('paymentStatus', 'Unpaid'))
    if (payRes?.data) payables = payRes.data.reduce((s: number, p: any) => s + (p.totalAmount || 0) - (p.paidAmount || 0), 0)

    // Total revenue
    let totalRevenue = 0, totalCost = 0, totalProfit = 0
    const compRes = await safeQuery(() => supabase.from('SalesOrder').select('totalAmount, totalCost, grossProfit').in('status', ['Dispatched', 'Delivered']))
    if (compRes?.data) {
      totalRevenue = compRes.data.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      totalCost = compRes.data.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)
      totalProfit = compRes.data.reduce((s: number, o: any) => s + (o.grossProfit || 0), 0)
    }

    // Inventory values
    let fabricValue = 0, finishedValue = 0
    const fabRes = await safeQuery(() => supabase.from('FabricStock').select('totalValue'))
    if (fabRes?.data) fabricValue = fabRes.data.reduce((s: number, f: any) => s + (f.totalValue || 0), 0)
    const fgRes = await safeQuery(() => supabase.from('FinishedGood').select('totalValue'))
    if (fgRes?.data) finishedValue = fgRes.data.reduce((s: number, f: any) => s + (f.totalValue || 0), 0)

    const workingCapital = (latestSnapshot?.cashBalance || 0) + receivables - payables

    // Monthly expenses
    let monthlyExpenses = 0
    const expRes = await safeQuery(() => supabase.from('Transaction').select('amount').eq('type', 'Debit').gte('date', thirtyDaysAgoISO))
    if (expRes?.data) monthlyExpenses = expRes.data.reduce((s: number, t: any) => s + (t.amount || 0), 0)

    const grossMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 10000) / 100 : 0

    // === DAILY TREND ===
    let snapshots: any[] = []
    const snapTrendRes = await safeQuery(() => supabase.from('DailySnapshot').select('*').gte('date', thirtyDaysAgoISO).order('date', { ascending: true }))
    if (snapTrendRes?.data) snapshots = snapTrendRes.data

    // === ORDER PIPELINE ===
    let orderPipeline: any[] = []
    const allOrdRes = await safeQuery(() => supabase.from('SalesOrder').select('status, totalAmount'))
    if (allOrdRes?.data) {
      const orderPipelineMap = new Map<string, { count: number; value: number }>()
      for (const o of allOrdRes.data) {
        const existing = orderPipelineMap.get(o.status) || { count: 0, value: 0 }
        existing.count++
        existing.value += o.totalAmount || 0
        orderPipelineMap.set(o.status, existing)
      }
      orderPipeline = Array.from(orderPipelineMap.entries()).map(([status, data]) => ({ status, count: data.count, value: data.value }))
    }

    // === PRODUCTION ===
    let productionJobs: any[] = []
    const prodRes = await safeQuery(() => supabase.from('ProductionJob').select('*').order('createdAt', { ascending: false }).limit(8))
    if (prodRes?.data) productionJobs = prodRes.data

    // === TOP CUSTOMERS ===
    let topCustomerDetails: any[] = []
    const custOrdRes = await safeQuery(() => supabase.from('SalesOrder').select('customerId, totalAmount, grossProfit'))
    if (custOrdRes?.data) {
      const customerMap = new Map<string, { revenue: number; profit: number; orders: number }>()
      for (const o of custOrdRes.data) {
        const existing = customerMap.get(o.customerId) || { revenue: 0, profit: 0, orders: 0 }
        existing.revenue += o.totalAmount || 0
        existing.profit += o.grossProfit || 0
        existing.orders++
        customerMap.set(o.customerId, existing)
      }
      const top6 = Array.from(customerMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6)
      topCustomerDetails = await Promise.all(top6.map(async ([customerId, data]) => {
        const custRes = await safeQuery(() => supabase.from('Customer').select('companyName').eq('id', customerId).single())
        return { name: custRes?.data?.companyName || 'Unknown', orders: data.orders, revenue: data.revenue, profit: data.profit, margin: data.revenue ? Math.round((data.profit / data.revenue) * 10000) / 100 : 0 }
      }))
    }

    // === ALERTS ===
    let alerts: any[] = []
    const alertRes = await safeQuery(() => supabase.from('Alert').select('*').order('createdAt', { ascending: false }).limit(10))
    if (alertRes?.data) alerts = alertRes.data

    // === RECENT ORDERS ===
    let recentOrders: any[] = []
    const roRes = await safeQuery(() => supabase.from('SalesOrder').select('*, customer:customerId(companyName)').order('createdAt', { ascending: false }).limit(8))
    if (roRes?.data) recentOrders = roRes.data.map((o: any) => ({ orderNo: o.orderNo, customer: o.customer?.companyName || 'Unknown', amount: o.totalAmount, status: o.status, paymentStatus: o.paymentStatus, date: format(new Date(o.createdAt), 'dd MMM') }))

    // === PENDING PAYMENTS ===
    let pendingPayments: any[] = []
    const ppRes = await safeQuery(() => supabase.from('SalesOrder').select('*, customer:customerId(companyName)').in('paymentStatus', ['Unpaid', 'Partial']).order('orderDate', { ascending: false }).limit(5))
    if (ppRes?.data) pendingPayments = ppRes.data.map((o: any) => ({ orderNo: o.orderNo, customer: o.customer?.companyName || 'Unknown', totalAmount: o.totalAmount, paidAmount: o.paidAmount, outstanding: o.totalAmount - o.paidAmount, paymentStatus: o.paymentStatus, orderDate: format(new Date(o.orderDate), 'dd MMM') }))

    // === UPCOMING COLLECTIONS ===
    let upcomingCollections: any[] = []
    const ucRes = await safeQuery(() => supabase.from('SalesOrder').select('*, customer:customerId(companyName)').in('paymentStatus', ['Unpaid', 'Partial']).not('deliveryDate', 'is', null).gte('deliveryDate', todayISO).order('deliveryDate', { ascending: true }).limit(5))
    if (ucRes?.data) upcomingCollections = ucRes.data.map((o: any) => ({ orderNo: o.orderNo, customer: o.customer?.companyName || 'Unknown', outstanding: o.totalAmount - o.paidAmount, expectedDate: format(new Date(o.deliveryDate), 'dd MMM') }))

    // === OUTSTANDING POs ===
    let outstandingPOValue = 0, outstandingPOCount = 0
    const opoRes = await safeQuery(() => supabase.from('PurchaseOrder').select('totalAmount').in('status', ['Pending', 'Approved', 'Ordered']))
    if (opoRes?.data) {
      outstandingPOValue = opoRes.data.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0)
      outstandingPOCount = opoRes.data.length
    }

    return NextResponse.json({
      kpis: {
        todayRevenue: Math.round(todayRevenue),
        pendingOrders,
        inProductionOrders,
        totalOrders,
        deliveredOrders,
        cashBalance: Math.round(latestSnapshot?.cashBalance || 0),
        receivables: Math.round(receivables),
        payables: Math.round(payables),
        workingCapital: Math.round(workingCapital),
        inventoryValue: Math.round(fabricValue + finishedValue),
        monthlyExpenses: Math.round(monthlyExpenses),
        totalRevenue: Math.round(totalRevenue),
        totalProfit: Math.round(totalProfit),
        grossMargin,
        outstandingPOs: outstandingPOCount,
        outstandingPOValue: Math.round(outstandingPOValue),
      },
      dailyTrend: snapshots.map(s => ({ date: format(new Date(s.date), 'MMM dd'), revenue: s.revenue, expenses: s.expenses, profit: s.grossProfit, cashBalance: s.cashBalance })),
      orderPipeline,
      productionJobs: productionJobs.map(j => ({ jobNo: j.jobNo, styleName: j.styleName, targetQty: j.targetQty, completedQty: j.completedQty, stage: j.stage, status: j.status, progress: j.targetQty > 0 ? Math.round((j.completedQty / j.targetQty) * 100) : 0 })),
      topCustomers: topCustomerDetails,
      alerts,
      recentOrders,
      pendingPayments,
      upcomingCollections,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
