import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, differenceInDays, parseISO, isValid, subDays } from 'date-fns'

/**
 * GET /api/customers/insights
 *
 * Customer Insights Dashboard — aggregates customer behavior metrics across
 * orders, payments, and profitability.
 *
 * Computes per customer:
 *   - Order count, total revenue, total profit, avg margin
 *   - Total paid, outstanding receivables, payment rate
 *   - Avg order value, first/last order date, days as customer
 *   - Order frequency (orders per 30 days)
 *   - Lifetime value (LTV = total paid + projected repeat)
 *   - Customer segment: VIP / Loyal / Regular / New / At-Risk
 *   - Payment behavior score (0-100)
 *
 * Returns:
 *   - Summary: totalCustomers, totalRevenue, totalOutstanding, avgMargin, segment counts
 *   - Top customers by revenue
 *   - Revenue trend (last 6 months)
 *   - Payment status distribution
 */

interface CustomerInsight {
  id: string
  companyName: string
  buyerName: string | null
  email: string | null
  phone: string | null
  paymentTerms: number
  creditLimit: number
  status: string
  orderCount: number
  totalRevenue: number
  totalProfit: number
  avgMargin: number
  totalPaid: number
  outstanding: number
  paymentRate: number
  avgOrderValue: number
  firstOrderDate: string | null
  lastOrderDate: string | null
  daysAsCustomer: number
  orderFrequency: number // orders per 30 days
  ltv: number
  segment: 'VIP' | 'Loyal' | 'Regular' | 'New' | 'At-Risk'
  paymentScore: number
  creditUtilization: number
}

interface SummaryStats {
  totalCustomers: number
  activeCustomers: number
  totalRevenue: number
  totalProfit: number
  totalOutstanding: number
  avgMargin: number
  avgPaymentRate: number
  segmentCounts: { VIP: number; Loyal: number; Regular: number; New: number; 'At-Risk': number }
  topCustomerName: string
  topCustomerRevenue: number
  avgOrderValue: number
  repeatCustomerRate: number
}

function computeSegment(
  orderCount: number,
  totalRevenue: number,
  paymentRate: number,
  daysAsCustomer: number
): 'VIP' | 'Loyal' | 'Regular' | 'New' | 'At-Risk' {
  // At-Risk: has orders but low payment rate
  if (orderCount > 0 && paymentRate < 30 && totalRevenue > 50000) return 'At-Risk'
  // New: less than 30 days as customer
  if (daysAsCustomer < 30 && orderCount <= 3) return 'New'
  // VIP: high revenue + high payment rate
  if (totalRevenue >= 1000000 && paymentRate >= 60) return 'VIP'
  // Loyal: multiple orders over time
  if (orderCount >= 5 && daysAsCustomer >= 30) return 'Loyal'
  // Regular: default
  return 'Regular'
}

function computePaymentScore(totalRevenue: number, totalPaid: number, paymentTerms: number): number {
  if (totalRevenue === 0) return 100
  // Base score = payment rate
  let score = (totalPaid / totalRevenue) * 100
  // Bonus for shorter payment terms (more reliable)
  if (paymentTerms <= 7) score += 5
  else if (paymentTerms >= 45) score -= 5
  return Math.max(0, Math.min(100, Math.round(score)))
}

function formatINR(v: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export async function GET() {
  try {
    // ── 1. Fetch all customers ──
    const { data: customers, error: custErr } = await supabase
      .from('Customer')
      .select('id, companyName, buyerName, email, phone, paymentTerms, creditLimit, status, createdAt')
      .order('createdAt', { ascending: true })

    if (custErr) {
      if (isMissingTableError(custErr)) {
        return NextResponse.json({
          summary: { totalCustomers: 0, activeCustomers: 0, totalRevenue: 0, totalProfit: 0, totalOutstanding: 0, avgMargin: 0, avgPaymentRate: 0, segmentCounts: { VIP: 0, Loyal: 0, Regular: 0, New: 0, 'At-Risk': 0 }, topCustomerName: '—', topCustomerRevenue: 0, avgOrderValue: 0, repeatCustomerRate: 0 },
          customers: [],
          revenueTrend: [],
          paymentDist: [],
        })
      }
      throw custErr
    }

    // ── 2. Fetch all orders ──
    const { data: orders, error: ordErr } = await supabase
      .from('SalesOrder')
      .select('id, customerId, orderNo, orderDate, deliveryDate, status, totalAmount, totalCost, grossProfit, grossMargin, paymentStatus, paidAmount, createdAt')

    if (ordErr) {
      if (isMissingTableError(ordErr)) {
        return NextResponse.json({
          summary: { totalCustomers: 0, activeCustomers: 0, totalRevenue: 0, totalProfit: 0, totalOutstanding: 0, avgMargin: 0, avgPaymentRate: 0, segmentCounts: { VIP: 0, Loyal: 0, Regular: 0, New: 0, 'At-Risk': 0 }, topCustomerName: '—', topCustomerRevenue: 0, avgOrderValue: 0, repeatCustomerRate: 0 },
          customers: [],
          revenueTrend: [],
          paymentDist: [],
        })
      }
      throw ordErr
    }

    // ── 3. Group orders by customer ──
    const ordersByCustomer: Record<string, any[]> = {}
    for (const o of orders || []) {
      if (!o.customerId) continue
      if (!ordersByCustomer[o.customerId]) ordersByCustomer[o.customerId] = []
      ordersByCustomer[o.customerId].push(o)
    }

    // ── 4. Compute insights per customer ──
    const now = new Date()
    const insights: CustomerInsight[] = []

    for (const cust of customers || []) {
      const custOrders = ordersByCustomer[cust.id] || []
      let totalRevenue = 0
      let totalProfit = 0
      let totalPaid = 0
      let firstDate: Date | null = null
      let lastDate: Date | null = null

      for (const o of custOrders) {
        totalRevenue += o.totalAmount || 0
        totalProfit += o.grossProfit || 0
        totalPaid += o.paidAmount || 0
        const od = o.orderDate || o.createdAt
        if (od) {
          const d = new Date(od)
          if (isValid(d)) {
            if (!firstDate || d < firstDate) firstDate = d
            if (!lastDate || d > lastDate) lastDate = d
          }
        }
      }

      const orderCount = custOrders.length
      const outstanding = Math.max(0, totalRevenue - totalPaid)
      const paymentRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 1000) / 10 : 0
      const avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0
      const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0
      const daysAsCustomer = firstDate ? Math.max(1, differenceInDays(now, firstDate)) : 0
      const orderFrequency = daysAsCustomer > 0 ? Math.round((orderCount / daysAsCustomer) * 30 * 100) / 100 : 0
      // LTV = total paid + (avg order value * projected annual frequency * 0.5 retention factor)
      const projectedAnnual = orderFrequency * 12 * avgOrderValue
      const ltv = Math.round(totalPaid + projectedAnnual * 0.5)
      const paymentScore = computePaymentScore(totalRevenue, totalPaid, cust.paymentTerms || 30)
      const creditUtilization = cust.creditLimit > 0 ? Math.round((outstanding / cust.creditLimit) * 1000) / 10 : 0
      const segment = computeSegment(orderCount, totalRevenue, paymentRate, daysAsCustomer)

      insights.push({
        id: cust.id,
        companyName: cust.companyName,
        buyerName: cust.buyerName,
        email: cust.email,
        phone: cust.phone,
        paymentTerms: cust.paymentTerms || 30,
        creditLimit: cust.creditLimit || 0,
        status: cust.status,
        orderCount,
        totalRevenue: Math.round(totalRevenue),
        totalProfit: Math.round(totalProfit),
        avgMargin,
        totalPaid: Math.round(totalPaid),
        outstanding: Math.round(outstanding),
        paymentRate,
        avgOrderValue,
        firstOrderDate: firstDate ? firstDate.toISOString() : null,
        lastOrderDate: lastDate ? lastDate.toISOString() : null,
        daysAsCustomer,
        orderFrequency,
        ltv,
        segment,
        paymentScore,
        creditUtilization,
      })
    }

    // Sort by total revenue descending
    insights.sort((a, b) => b.totalRevenue - a.totalRevenue)

    // ── 5. Summary stats ──
    const totalCustomers = insights.length
    const activeCustomers = insights.filter(c => c.status === 'Active').length
    const totalRevenue = insights.reduce((s, c) => s + c.totalRevenue, 0)
    const totalProfit = insights.reduce((s, c) => s + c.totalProfit, 0)
    const totalOutstanding = insights.reduce((s, c) => s + c.outstanding, 0)
    const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0
    const avgPaymentRate = totalRevenue > 0 ? Math.round((insights.reduce((s, c) => s + c.totalPaid, 0) / totalRevenue) * 1000) / 10 : 0
    const avgOrderValue = insights.length > 0 ? Math.round(insights.reduce((s, c) => s + c.avgOrderValue, 0) / insights.length) : 0
    const repeatCustomers = insights.filter(c => c.orderCount >= 2).length
    const repeatCustomerRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 1000) / 10 : 0

    const segmentCounts = { VIP: 0, Loyal: 0, Regular: 0, New: 0, 'At-Risk': 0 }
    for (const c of insights) segmentCounts[c.segment]++

    const topCustomer = insights[0]

    // ── 6. Revenue trend (last 6 months) ──
    const revenueTrend: Array<{ month: string; revenue: number; profit: number; orders: number }> = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const monthOrders = (orders || []).filter(o => {
        const od = o.orderDate || o.createdAt
        if (!od) return false
        const d = new Date(od)
        return d >= monthStart && d <= monthEnd
      })
      revenueTrend.push({
        month: format(monthStart, 'MMM yy'),
        revenue: Math.round(monthOrders.reduce((s, o) => s + (o.totalAmount || 0), 0)),
        profit: Math.round(monthOrders.reduce((s, o) => s + (o.grossProfit || 0), 0)),
        orders: monthOrders.length,
      })
    }

    // ── 7. Payment status distribution ──
    const paymentDistMap: Record<string, number> = {}
    for (const o of orders || []) {
      const ps = o.paymentStatus || 'Unknown'
      paymentDistMap[ps] = (paymentDistMap[ps] || 0) + 1
    }
    const paymentDist = Object.entries(paymentDistMap).map(([status, count]) => ({ status, count }))

    return NextResponse.json({
      summary: {
        totalCustomers,
        activeCustomers,
        totalRevenue: Math.round(totalRevenue),
        totalProfit: Math.round(totalProfit),
        totalOutstanding: Math.round(totalOutstanding),
        avgMargin,
        avgPaymentRate,
        avgOrderValue,
        repeatCustomerRate,
        segmentCounts,
        topCustomerName: topCustomer?.companyName || '—',
        topCustomerRevenue: topCustomer?.totalRevenue || 0,
      } as SummaryStats,
      customers: insights,
      revenueTrend,
      paymentDist,
    })
  } catch (error) {
    console.error('Customer insights API error:', error)
    return NextResponse.json({ error: 'Failed to load customer insights' }, { status: 500 })
  }
}
