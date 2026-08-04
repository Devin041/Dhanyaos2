import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { subDays, format, startOfDay, endOfDay } from 'date-fns'

export async function GET() {
  try {
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()
    const today = startOfDay(new Date())

    // Revenue and profit trends (last 30 days)
    const { data: snapshots } = await supabase
      .from('DailySnapshot')
      .select('*')
      .gte('date', thirtyDaysAgoISO)
      .order('date', { ascending: true })

    // Total revenue (dispatched + delivered)
    const { data: revenueOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount, totalCost, grossProfit')
      .in('status', ['Dispatched', 'Delivered'])

    // Monthly revenue growth (this month vs last month)
    const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const startOfLastMonth = subDays(startOfThisMonth, 30)

    const { data: thisMonthOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount')
      .gte('orderDate', startOfThisMonth.toISOString())
      .in('status', ['Dispatched', 'Delivered'])

    const { data: lastMonthOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount')
      .gte('orderDate', startOfLastMonth.toISOString())
      .lt('orderDate', startOfThisMonth.toISOString())
      .in('status', ['Dispatched', 'Delivered'])

    const thisMonthRev = (thisMonthOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)
    const lastMonthRev = (lastMonthOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)
    const monthlyGrowth = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 10000) / 100 : 0

    // Cash flow
    const { data: latestSnapshot } = await supabase
      .from('DailySnapshot')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    // Working capital
    const { data: receivableOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount, paidAmount')
      .in('paymentStatus', ['Unpaid', 'Partial'])
    const receivables = (receivableOrders || []).reduce((s, o) => s + (o.totalAmount || 0) - (o.paidAmount || 0), 0)

    const { data: payableOrders } = await supabase
      .from('PurchaseOrder')
      .select('totalAmount, paidAmount')
      .eq('paymentStatus', 'Unpaid')
    const payables = (payableOrders || []).reduce((s, p) => s + (p.totalAmount || 0) - (p.paidAmount || 0), 0)

    // Monthly expenses
    const { data: expenseTxns } = await supabase
      .from('Transaction')
      .select('amount')
      .eq('type', 'Debit')
      .gte('date', thirtyDaysAgoISO)
    const monthlyExpenses = (expenseTxns || []).reduce((s, t) => s + (t.amount || 0), 0)

    // Order book value
    const { data: orderBookOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount')
      .in('status', ['Pending', 'Confirmed', 'In Production'])
    const orderBookValue = (orderBookOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)

    // Customer acquisition
    const { count: totalCustomers } = await supabase
      .from('Customer')
      .select('*', { count: 'exact', head: true })

    const { data: activeCustomerOrders } = await supabase
      .from('SalesOrder')
      .select('customerId')
      .gte('orderDate', thirtyDaysAgoISO)
    const activeCustomerIds = new Set((activeCustomerOrders || []).map(o => o.customerId))

    const totalRev = (revenueOrders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)
    const totalGrossProfit = (revenueOrders || []).reduce((s, o) => s + (o.grossProfit || 0), 0)

    return NextResponse.json({
      executiveSummary: {
        company: 'Dhanya Lifestyle LLP',
        brand: 'Elysé by Dhanya',
        stage: 'Growth & Capital Raise',
        founded: 'July 2024',
        industry: "Women's Ethnic Wear Manufacturing",
        headquarters: 'Ahmedabad, Gujarat, India',
        totalRevenue: Math.round(totalRev),
        grossProfit: Math.round(totalGrossProfit),
        grossMargin: totalRev ? Math.round((totalGrossProfit / totalRev) * 10000) / 100 : 0,
        totalOrders: (revenueOrders || []).length,
        monthlyGrowth,
        activeCustomers: activeCustomerIds.size,
        totalCustomers: totalCustomers || 0,
      },
      revenueTrend: (snapshots || []).map(s => ({
        date: format(new Date(s.date), 'MMM dd'),
        revenue: s.revenue,
        profit: s.grossProfit,
        cashBalance: s.cashBalance,
      })),
      cashFlow: {
        cashBalance: Math.round(latestSnapshot?.cashBalance || 0),
        monthlyBurnRate: Math.round(monthlyExpenses),
        receivables: Math.round(receivables),
        payables: Math.round(payables),
        workingCapital: Math.round((latestSnapshot?.cashBalance || 0) + receivables - payables),
        runwayDays: monthlyExpenses ? Math.round((latestSnapshot?.cashBalance || 0) / (monthlyExpenses / 30)) : 0,
      },
      orderBook: {
        pendingValue: Math.round(orderBookValue),
        pendingOrders: (orderBookOrders || []).length,
      },
      growthStrategy: [
        { label: 'Own Brand Wholesale', status: 'Active', priority: 1 },
        { label: 'B2B Fabric-Included Orders', status: 'Active', priority: 2 },
        { label: 'Selective Manufacturing Services', status: 'Evaluated', priority: 3 },
        { label: 'Online Marketplace', status: 'Planned', priority: 4 },
        { label: 'Export Markets', status: 'Future', priority: 5 },
      ],
      milestones: [
        { date: 'Jul 2024', title: 'Company Incorporated', status: 'completed' },
        { date: 'Q3 2024', title: 'Manufacturing Setup Complete', status: 'completed' },
        { date: 'Q4 2024', title: 'First 100 Orders Delivered', status: 'completed' },
        { date: 'Q1 2025', title: 'Elysé Brand Launch', status: 'completed' },
        { date: 'Q2 2025', title: '10+ Active B2B Clients', status: 'active' },
        { date: 'Q3 2025', title: 'Funding Round - Series A', status: 'upcoming' },
        { date: '2026', title: 'Pan-India Distribution', status: 'future' },
        { date: '2030', title: 'National Brand Leader', status: 'future' },
      ],
      riskAnalysis: [
        { risk: 'Cash Flow Volatility', level: 'Medium', mitigation: 'Maintaining 45-day cash reserve' },
        { risk: 'Customer Concentration', level: 'Medium', mitigation: 'Diversifying client base across regions' },
        { risk: 'Fabric Price Inflation', level: 'Low', mitigation: 'Multi-supplier strategy with fixed-rate contracts' },
        { risk: 'Production Delays', level: 'Low', mitigation: 'Buffer capacity and parallel production lines' },
        { risk: 'Market Seasonality', level: 'Medium', mitigation: 'Balanced seasonal and all-season collections' },
      ],
    })
  } catch (error) {
    console.error('Investor API error:', error)
    return NextResponse.json({ error: 'Failed to load investor data' }, { status: 500 })
  }
}
