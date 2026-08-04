import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isValid, differenceInDays } from 'date-fns'

/**
 * GET /api/orders/sales-performance
 *
 * Sales Performance Dashboard — aggregates sales pipeline, conversion rates,
 * order trends, and performance metrics across orders and quotations.
 *
 * Computes:
 *   - Sales pipeline: orders by status (Pending → Confirmed → In Production → Dispatched → Delivered)
 *   - Conversion rate: quotations → orders (Converted / total quotations)
 *   - Win/loss ratio (Accepted vs Rejected quotations)
 *   - Average order value, total revenue, total profit
 *   - 6-month sales trend (revenue, profit, order count)
 *   - Top customers by order value
 *   - Average sales cycle time (quotation → order conversion)
 *   - Payment collection rate
 *   - Sales efficiency score (0-100)
 */

interface PipelineStage {
  stage: string
  count: number
  value: number
  color: string
  percentage: number
}

interface TrendItem {
  month: string
  revenue: number
  profit: number
  orders: number
  avgOrderValue: number
}

interface TopCustomer {
  id: string
  name: string
  orderCount: number
  totalValue: number
  totalProfit: number
  avgMargin: number
}

interface SalesSummary {
  totalOrders: number
  totalQuotations: number
  totalRevenue: number
  totalProfit: number
  avgOrderValue: number
  avgMargin: number
  conversionRate: number
  winRate: number
  avgSalesCycleDays: number
  paymentCollectionRate: number
  salesEfficiencyScore: number
  grade: string
  pendingValue: number
  inProductionValue: number
  deliveredValue: number
}

const STAGE_COLORS: Record<string, string> = {
  Pending: 'oklch(0.8 0.15 75)',
  Confirmed: 'oklch(0.7 0.15 250)',
  'In Production': 'oklch(0.65 0.12 180)',
  Dispatched: 'oklch(0.7 0.15 300)',
  Delivered: 'oklch(0.72 0.18 145)',
  Cancelled: 'oklch(0.65 0.22 25)',
}

function getGrade(score: number): string {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export async function GET() {
  try {
    const now = new Date()

    // ── Fetch all orders ──
    const { data: orders, error: ordErr } = await supabase
      .from('SalesOrder')
      .select('id, orderNo, customerId, customer:customerId(companyName), orderDate, deliveryDate, status, totalAmount, totalCost, grossProfit, grossMargin, paymentStatus, paidAmount, quotationId, createdAt')
      .order('createdAt', { ascending: true })

    if (ordErr) {
      if (isMissingTableError(ordErr)) {
        return NextResponse.json({
          summary: { totalOrders: 0, totalQuotations: 0, totalRevenue: 0, totalProfit: 0, avgOrderValue: 0, avgMargin: 0, conversionRate: 0, winRate: 0, avgSalesCycleDays: 0, paymentCollectionRate: 0, salesEfficiencyScore: 100, grade: 'A', pendingValue: 0, inProductionValue: 0, deliveredValue: 0 },
          pipeline: [],
          trend: [],
          topCustomers: [],
        })
      }
      throw ordErr
    }

    // ── Fetch all quotations ──
    const { data: quotations, error: quotErr } = await supabase
      .from('Quotation')
      .select('id, quotationNo, status, totalAmount, quotationDate, convertedOrderId, createdAt')

    if (quotErr && !isMissingTableError(quotErr)) throw quotErr

    const allOrders = orders || []
    const allQuots = quotations || []

    // ── Summary ──
    const totalOrders = allOrders.length
    const totalQuotations = allQuots.length
    const totalRevenue = allOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
    const totalProfit = allOrders.reduce((s: number, o: any) => s + (o.grossProfit || 0), 0)
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
    const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0

    // Conversion rate: quotations that converted to orders / total quotations
    const convertedQuots = allQuots.filter((q: any) => q.status === 'Converted' || q.convertedOrderId).length
    const conversionRate = totalQuotations > 0 ? Math.round((convertedQuots / totalQuotations) * 1000) / 10 : 0

    // Win rate: Accepted+Converted / (Accepted+Converted+Rejected)
    const accepted = allQuots.filter((q: any) => q.status === 'Accepted' || q.status === 'Converted').length
    const rejected = allQuots.filter((q: any) => q.status === 'Rejected').length
    const winRate = (accepted + rejected) > 0 ? Math.round((accepted / (accepted + rejected)) * 1000) / 10 : 0

    // Avg sales cycle: quotation date → order date (for converted ones)
    let cycleDays = 0
    let cycleCount = 0
    for (const q of allQuots) {
      if (q.status === 'Converted' && q.convertedOrderId) {
        const matchingOrder = allOrders.find((o: any) => o.id === q.convertedOrderId || o.quotationId === q.id)
        if (matchingOrder) {
          const quotDate = q.quotationDate || q.createdAt ? new Date(q.quotationDate || q.createdAt) : null
          const ordDate = matchingOrder.orderDate || matchingOrder.createdAt ? new Date(matchingOrder.orderDate || matchingOrder.createdAt) : null
          if (quotDate && ordDate && isValid(quotDate) && isValid(ordDate)) {
            const days = differenceInDays(ordDate, quotDate)
            if (days >= 0) {
              cycleDays += days
              cycleCount++
            }
          }
        }
      }
    }
    const avgSalesCycleDays = cycleCount > 0 ? Math.round(cycleDays / cycleCount) : 0

    // Payment collection rate
    const totalPaid = allOrders.reduce((s: number, o: any) => s + (o.paidAmount || 0), 0)
    const paymentCollectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 1000) / 10 : 0

    // Pipeline values
    const pendingValue = allOrders.filter((o: any) => o.status === 'Pending').reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
    const inProductionValue = allOrders.filter((o: any) => o.status === 'In Production').reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
    const deliveredValue = allOrders.filter((o: any) => o.status === 'Delivered' || o.status === 'Dispatched').reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)

    // Sales efficiency score
    // - Conversion rate: 30%
    // - Win rate: 25%
    // - Avg margin: 20% (margin/50 * 100)
    // - Payment collection: 15%
    // - Order volume: 10% (min(100, totalOrders/20 * 100))
    const convScore = conversionRate
    const winScore = winRate
    const marginScore = Math.min(100, (avgMargin / 50) * 100)
    const payScore = paymentCollectionRate
    const volScore = Math.min(100, (totalOrders / 20) * 100)
    const salesEfficiencyScore = Math.max(0, Math.min(100, Math.round(convScore * 0.3 + winScore * 0.25 + marginScore * 0.2 + payScore * 0.15 + volScore * 0.1)))
    const grade = getGrade(salesEfficiencyScore)

    const summary: SalesSummary = {
      totalOrders,
      totalQuotations,
      totalRevenue: Math.round(totalRevenue),
      totalProfit: Math.round(totalProfit),
      avgOrderValue,
      avgMargin,
      conversionRate,
      winRate,
      avgSalesCycleDays,
      paymentCollectionRate,
      salesEfficiencyScore,
      grade,
      pendingValue: Math.round(pendingValue),
      inProductionValue: Math.round(inProductionValue),
      deliveredValue: Math.round(deliveredValue),
    }

    // ── Pipeline ──
    const pipelineStages = ['Pending', 'Confirmed', 'In Production', 'Dispatched', 'Delivered']
    const pipeline: PipelineStage[] = pipelineStages.map(stage => {
      const stageOrders = allOrders.filter((o: any) => o.status === stage)
      const value = stageOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      return {
        stage,
        count: stageOrders.length,
        value: Math.round(value),
        color: STAGE_COLORS[stage] || 'oklch(0.6 0.01 260)',
        percentage: totalOrders > 0 ? Math.round((stageOrders.length / totalOrders) * 1000) / 10 : 0,
      }
    })

    // ── 6-month trend ──
    const trend: TrendItem[] = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i))
      const monthEnd = endOfMonth(subMonths(now, i))
      const monthOrders = allOrders.filter((o: any) => {
        const od = o.orderDate || o.createdAt
        if (!od) return false
        const d = new Date(od)
        return d >= monthStart && d <= monthEnd
      })
      const mRev = monthOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      const mProfit = monthOrders.reduce((s: number, o: any) => s + (o.grossProfit || 0), 0)
      trend.push({
        month: format(monthStart, 'MMM yy'),
        revenue: Math.round(mRev),
        profit: Math.round(mProfit),
        orders: monthOrders.length,
        avgOrderValue: monthOrders.length > 0 ? Math.round(mRev / monthOrders.length) : 0,
      })
    }

    // ── Top customers ──
    const custMap: Record<string, { name: string; orderCount: number; totalValue: number; totalProfit: number }> = {}
    for (const o of allOrders) {
      const custId = o.customerId
      if (!custId) continue
      const name = (o.customer as any)?.companyName || 'Unknown'
      if (!custMap[custId]) custMap[custId] = { name, orderCount: 0, totalValue: 0, totalProfit: 0 }
      custMap[custId].orderCount++
      custMap[custId].totalValue += o.totalAmount || 0
      custMap[custId].totalProfit += o.grossProfit || 0
    }
    const topCustomers: TopCustomer[] = Object.entries(custMap)
      .map(([id, c]) => ({
        id,
        name: c.name,
        orderCount: c.orderCount,
        totalValue: Math.round(c.totalValue),
        totalProfit: Math.round(c.totalProfit),
        avgMargin: c.totalValue > 0 ? Math.round((c.totalProfit / c.totalValue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5)

    // ── Quotation funnel ──
    const quotFunnel = {
      draft: allQuots.filter((q: any) => q.status === 'Draft').length,
      sent: allQuots.filter((q: any) => q.status === 'Sent').length,
      accepted: allQuots.filter((q: any) => q.status === 'Accepted').length,
      converted: allQuots.filter((q: any) => q.status === 'Converted').length,
      rejected: allQuots.filter((q: any) => q.status === 'Rejected').length,
    }

    return NextResponse.json({
      summary,
      pipeline,
      trend,
      topCustomers,
      quotFunnel,
    })
  } catch (error) {
    console.error('Sales performance API error:', error)
    return NextResponse.json({ error: 'Failed to load sales performance data' }, { status: 500 })
  }
}
