import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns'

export async function GET() {
  try {
    const today = startOfDay(new Date())
    const todayISO = today.toISOString()
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    // === P&L Summary ===
    const { data: completedOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount, totalCost, grossProfit')
      .in('status', ['Dispatched', 'Delivered'])
    const revenue = (completedOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)
    const cogs = (completedOrders || []).reduce((s, o) => s + (o.totalCost || 0), 0)
    const grossProfit = (completedOrders || []).reduce((s, o) => s + (o.grossProfit || 0), 0)

    const { data: outflowTxns } = await supabase
      .from('Transaction')
      .select('amount')
      .eq('type', 'Debit')
      .gte('date', thirtyDaysAgoISO)
    const operatingExpenses = (outflowTxns || []).reduce((s, t) => s + (t.amount || 0), 0)
    const netProfit = grossProfit - operatingExpenses

    // === Cash Flow (30 days) ===
    const { data: snapshots } = await supabase
      .from('DailySnapshot')
      .select('*')
      .gte('date', thirtyDaysAgoISO)
      .order('date', { ascending: true })

    const cashFlow = (snapshots || []).map((s) => ({
      date: format(new Date(s.date), 'MMM dd'),
      inflow: s.cashIn,
      outflow: s.cashOut,
      net: s.cashIn - s.cashOut,
    }))

    // === Working Capital Metrics ===
    const { data: unpaidReceivables } = await supabase
      .from('SalesOrder')
      .select('totalAmount, paidAmount')
      .in('paymentStatus', ['Unpaid', 'Partial'])
    const totalReceivables = (unpaidReceivables || []).reduce((s, o) => s + (o.totalAmount || 0) - (o.paidAmount || 0), 0)

    const { data: unpaidPayables } = await supabase
      .from('PurchaseOrder')
      .select('totalAmount, paidAmount')
      .in('paymentStatus', ['Unpaid', 'Partial'])
    const totalPayables = (unpaidPayables || []).reduce((s, p) => s + (p.totalAmount || 0) - (p.paidAmount || 0), 0)

    const dailyRevenue = revenue / 30
    const receivableDays = dailyRevenue > 0 ? Math.round((totalReceivables / dailyRevenue) * 10) / 10 : 0

    const dailyCogs = cogs / 30
    const payableDays = dailyCogs > 0 ? Math.round((totalPayables / dailyCogs) * 10) / 10 : 0

    // Inventory Days
    const { data: fabricStocks } = await supabase.from('FabricStock').select('totalValue')
    const { data: finishedGoods } = await supabase.from('FinishedGood').select('totalValue')
    const inventoryValue = (fabricStocks || []).reduce((s, f) => s + (f.totalValue || 0), 0)
      + (finishedGoods || []).reduce((s, f) => s + (f.totalValue || 0), 0)
    const inventoryDays = dailyCogs > 0 ? Math.round((inventoryValue / dailyCogs) * 10) / 10 : 0

    const cashConversionCycle = Math.round((receivableDays + inventoryDays - payableDays) * 10) / 10

    // === Receivable Aging ===
    const { data: allUnpaidOrders } = await supabase
      .from('SalesOrder')
      .select('orderNo, orderDate, totalAmount, paidAmount')
      .in('paymentStatus', ['Unpaid', 'Partial'])

    const agingBuckets = [
      { label: '0-15 days', min: 0, max: 15 },
      { label: '16-30 days', min: 16, max: 30 },
      { label: '31-45 days', min: 31, max: 45 },
      { label: '46-60 days', min: 46, max: 60 },
      { label: '60+ days', min: 61, max: 9999 },
    ]

    const receivableAging = agingBuckets.map((bucket) => {
      const orders = (allUnpaidOrders || []).filter((o) => {
        const daysOld = differenceInDays(today, startOfDay(new Date(o.orderDate)))
        return daysOld >= bucket.min && daysOld <= bucket.max
      })
      const amount = orders.reduce((s, o) => s + (o.totalAmount - o.paidAmount), 0)
      return {
        bucket: bucket.label,
        amount: Math.round(amount),
        count: orders.length,
        percent: totalReceivables > 0 ? Math.round((amount / totalReceivables) * 10000) / 100 : 0,
      }
    })

    // === Payable Aging ===
    const { data: allUnpaidPOs } = await supabase
      .from('PurchaseOrder')
      .select('poNumber, createdAt, totalAmount, paidAmount')
      .in('paymentStatus', ['Unpaid', 'Partial'])

    const payableAging = agingBuckets.map((bucket) => {
      const pos = (allUnpaidPOs || []).filter((po) => {
        const daysOld = differenceInDays(today, startOfDay(new Date(po.createdAt)))
        return daysOld >= bucket.min && daysOld <= bucket.max
      })
      const amount = pos.reduce((s, po) => s + (po.totalAmount - po.paidAmount), 0)
      return {
        bucket: bucket.label,
        amount: Math.round(amount),
        count: pos.length,
        percent: totalPayables > 0 ? Math.round((amount / totalPayables) * 10000) / 100 : 0,
      }
    })

    // === Expense Analysis ===
    const { data: expenseTxns } = await supabase
      .from('Transaction')
      .select('category, amount')
      .eq('type', 'Debit')
      .gte('date', thirtyDaysAgoISO)

    const expenseGroupMap = new Map<string, { amount: number; count: number }>()
    for (const t of (expenseTxns || [])) {
      const existing = expenseGroupMap.get(t.category) || { amount: 0, count: 0 }
      existing.amount += t.amount || 0
      existing.count++
      expenseGroupMap.set(t.category, existing)
    }
    const totalExpensesAmt = (expenseTxns || []).reduce((s, t) => s + (t.amount || 0), 0)

    const expenseAnalysis = Array.from(expenseGroupMap.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([category, data]) => ({
        category,
        amount: Math.round(data.amount),
        count: data.count,
        percent: totalExpensesAmt > 0 ? Math.round((data.amount / totalExpensesAmt) * 10000) / 100 : 0,
      }))

    // === Customer Profitability ===
    const { data: allCustomerOrders } = await supabase
      .from('SalesOrder')
      .select('customerId, totalAmount, grossProfit')
    const custAggMap = new Map<string, { revenue: number; profit: number; orders: number }>()
    for (const o of (allCustomerOrders || [])) {
      const existing = custAggMap.get(o.customerId) || { revenue: 0, profit: 0, orders: 0 }
      existing.revenue += o.totalAmount || 0
      existing.profit += o.grossProfit || 0
      existing.orders++
      custAggMap.set(o.customerId, existing)
    }
    const top8Customers = Array.from(custAggMap.entries())
      .sort((a, b) => b[1].profit - a[1].profit)
      .slice(0, 8)

    const customerProfitability = await Promise.all(
      top8Customers.map(async ([customerId, data]) => {
        const { data: customer } = await supabase
          .from('Customer')
          .select('companyName')
          .eq('id', customerId)
          .single()
        const rev = data.revenue
        const prof = data.profit
        return {
          name: customer?.companyName || 'Unknown',
          revenue: Math.round(rev),
          profit: Math.round(prof),
          margin: rev > 0 ? Math.round((prof / rev) * 10000) / 100 : 0,
        }
      })
    )

    // === Funding Requirement / Cash Runway ===
    const { data: latestSnapshot } = await supabase
      .from('DailySnapshot')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    const cashBalance = latestSnapshot?.cashBalance || 0
    const avgDailyBurn = operatingExpenses > 0 ? (operatingExpenses - (grossProfit / 1)) / 30 : 0
    const netDailyBurn = avgDailyBurn > 0 ? avgDailyBurn : operatingExpenses / 30
    const runwayDays = netDailyBurn > 0 ? Math.round(cashBalance / netDailyBurn) : 999
    const runwayMonths = Math.round((runwayDays / 30) * 10) / 10

    return NextResponse.json({
      plSummary: {
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
        grossProfit: Math.round(grossProfit),
        operatingExpenses: Math.round(operatingExpenses),
        netProfit: Math.round(netProfit),
      },
      cashFlow,
      workingCapital: {
        receivableDays,
        payableDays,
        inventoryDays,
        cashConversionCycle,
      },
      receivableAging,
      payableAging,
      expenseAnalysis,
      customerProfitability,
      fundingRequirement: {
        cashBalance: Math.round(cashBalance),
        monthlyBurnRate: Math.round(operatingExpenses),
        runwayDays: Math.min(runwayDays, 999),
        runwayMonths: Math.min(runwayMonths, 33.3),
        totalReceivables: Math.round(totalReceivables),
        totalPayables: Math.round(totalPayables),
      },
    })
  } catch (error) {
    console.error('CFO Dashboard API error:', error)
    return NextResponse.json({ error: 'Failed to load CFO dashboard data' }, { status: 500 })
  }
}
