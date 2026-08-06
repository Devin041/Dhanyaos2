import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

/**
 * GET /api/accounts/monthly-pnl?months=6
 *
 * Monthly Profit & Loss Statement — aggregates all income and expenses
 * to show actual profit/loss per month.
 *
 * Revenue Sources:
 *   - Sales Orders (delivered/dispatched) — totalAmount
 *   - Transaction Credits (customer payments, other income, investor capital)
 *
 * Expense Sources:
 *   - Transaction Debits (salary, rent, maintenance, electricity, etc.)
 *   - Purchase Orders (fabric/material costs)
 *   - Production actual costs (labor, fabric consumed)
 *
 * Returns: 6-month P&L trend + current month breakdown by category
 */

interface MonthPnL {
  month: string
  revenue: number
  expenses: number
  profit: number
  margin: number
  // Expense breakdown
  expenseBreakdown: Array<{ category: string; amount: number; percentage: number }>
  // Revenue breakdown
  revenueBreakdown: Array<{ category: string; amount: number }>
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const monthsCount = Math.min(Math.max(Number(searchParams.get('months')) || 6, 1), 12)
    const now = new Date()

    // Fetch all transactions
    const { data: allTxns, error: txnErr } = await supabase
      .from('Transaction')
      .select('id, type, category, amount, date')

    if (txnErr) {
      if (isMissingTableError(txnErr)) {
        return NextResponse.json({ months: [], currentMonth: null })
      }
      throw txnErr
    }

    const txns = allTxns || []

    // Fetch sales orders for revenue
    const { data: orders } = await supabase
      .from('SalesOrder')
      .select('id, totalAmount, totalCost, grossProfit, status, orderDate, createdAt')
      .in('status', ['Delivered', 'Dispatched', 'Confirmed', 'In Production', 'Pending'])

    const allOrders = orders || []

    // Fetch purchase orders for material costs
    const { data: pos } = await supabase
      .from('PurchaseOrder')
      .select('id, totalAmount, status, createdAt')
    const allPOs = (pos || []).filter((p: any) => p.status !== 'Cancelled')

    // Build monthly P&L
    const months: MonthPnL[] = []
    for (let i = monthsCount - 1; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i))
      const monthEnd = endOfMonth(subMonths(now, i))
      const monthLabel = format(monthStart, 'MMM yy')

      // Transactions for this month
      const monthTxns = txns.filter((t: any) => {
        const d = new Date(t.date)
        return d >= monthStart && d <= monthEnd
      })

      const credits = monthTxns.filter((t: any) => t.type === 'Credit')
      const debits = monthTxns.filter((t: any) => t.type === 'Debit')
      const txnRevenue = credits.reduce((s: number, t: any) => s + (t.amount || 0), 0)
      const txnExpenses = debits.reduce((s: number, t: any) => s + (t.amount || 0), 0)

      // Sales order revenue for this month
      const monthOrders = allOrders.filter((o: any) => {
        const d = new Date(o.orderDate || o.createdAt)
        return d >= monthStart && d <= monthEnd
      })
      const salesRevenue = monthOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      const salesCost = monthOrders.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)

      // PO costs for this month
      const monthPOs = allPOs.filter((p: any) => {
        const d = new Date(p.createdAt)
        return d >= monthStart && d <= monthEnd
      })
      const poCost = monthPOs.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0)

      // Total revenue = sales revenue + other credits
      const totalRevenue = Math.round(salesRevenue + txnRevenue)

      // Total expenses = material cost (PO) + operational expenses (transactions) + sales cost
      const totalExpenses = Math.round(poCost + txnExpenses)

      // Expense breakdown by category
      const expenseMap: Record<string, number> = {}
      for (const t of debits) {
        const cat = t.category || 'Other'
        expenseMap[cat] = (expenseMap[cat] || 0) + (t.amount || 0)
      }
      if (poCost > 0) {
        expenseMap['Material/Fabric (PO)'] = (expenseMap['Material/Fabric (PO)'] || 0) + poCost
      }
      const expenseBreakdown = Object.entries(expenseMap)
        .map(([category, amount]) => ({
          category,
          amount: Math.round(amount),
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.amount - a.amount)

      // Revenue breakdown
      const revMap: Record<string, number> = {}
      if (salesRevenue > 0) revMap['Sales Revenue'] = Math.round(salesRevenue)
      for (const t of credits) {
        const cat = t.category || 'Other Income'
        revMap[cat] = (revMap[cat] || 0) + (t.amount || 0)
      }
      const revenueBreakdown = Object.entries(revMap)
        .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
        .sort((a, b) => b.amount - a.amount)

      const profit = totalRevenue - totalExpenses
      const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 1000) / 10 : 0

      months.push({
        month: monthLabel,
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit,
        margin,
        expenseBreakdown,
        revenueBreakdown,
      })
    }

    // Current month summary (detailed)
    const currentMonth = months[months.length - 1] || null

    // Predefined expense categories for quick entry
    const EXPENSE_CATEGORIES = [
      'Salary', 'Factory Rent', 'Office Rent', 'Electricity', 'Water',
      'Maintenance', 'Transport', 'Marketing', 'Admin', 'Utilities',
      'Raw Material', 'Packaging', 'Stationery', 'Internet/Phone',
      'Insurance', 'Bank Charges', 'Professional Fees', 'Miscellaneous',
    ]

    const INCOME_CATEGORIES = [
      'Sales Revenue', 'Customer Payment', 'Investor Capital', 'Other Income',
    ]

    return NextResponse.json({
      months,
      currentMonth,
      expenseCategories: EXPENSE_CATEGORIES,
      incomeCategories: INCOME_CATEGORIES,
      summary: {
        totalRevenue: months.reduce((s, m) => s + m.revenue, 0),
        totalExpenses: months.reduce((s, m) => s + m.expenses, 0),
        totalProfit: months.reduce((s, m) => s + m.profit, 0),
        avgMargin: months.length > 0 ? Math.round(months.reduce((s, m) => s + m.margin, 0) / months.length * 10) / 10 : 0,
      },
    })
  } catch (error) {
    console.error('Monthly P&L API error:', error)
    return NextResponse.json({ error: 'Failed to load P&L data' }, { status: 500 })
  }
}
