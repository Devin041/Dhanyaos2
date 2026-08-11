import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { startOfMonth, endOfMonth, format } from 'date-fns'

/**
 * GET /api/financial-statements?type=trading&month=2026-08
 * GET /api/financial-statements?type=pl&month=2026-08
 * GET /api/financial-statements?type=balancesheet&month=2026-08
 *
 * Trading Account: COGS calculation (Opening Stock + Purchases - Closing Stock)
 * P&L Statement: Gross Profit - Indirect Expenses = Net Profit
 * Balance Sheet: Assets = Liabilities + Equity
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'pl'
    const monthParam = searchParams.get('month')

    let monthStart: Date, monthEnd: Date, monthLabel: string
    if (monthParam) {
      const [year, mon] = monthParam.split('-').map(Number)
      monthStart = startOfMonth(new Date(year, mon - 1))
      monthEnd = endOfMonth(new Date(year, mon - 1))
      monthLabel = format(monthStart, 'MMM yyyy')
    } else {
      monthStart = startOfMonth(new Date())
      monthEnd = endOfMonth(new Date())
      monthLabel = format(monthStart, 'MMM yyyy')
    }

    const ms = monthStart.toISOString()
    const me = monthEnd.toISOString()

    // Fetch all data in parallel
    const [salesRes, poRes, txnRes, fabricStockRes, invoiceRes, paymentRes, capInvRes] = await Promise.all([
      // Sales (orders)
      supabase.from('SalesOrder').select('totalAmount, totalCost, grossProfit, orderDate, createdAt').gte('orderDate', ms).lte('orderDate', me),
      // Purchases (POs)
      supabase.from('PurchaseOrder').select('totalAmount, createdAt').gte('createdAt', ms).lte('createdAt', me),
      // Transactions (expenses + income)
      supabase.from('Transaction').select('type, category, amount, date').gte('date', ms).lte('date', me),
      // Fabric stock (for closing stock value)
      supabase.from('FabricStock').select('availableMeters, averageCost, totalValue'),
      // Invoices
      supabase.from('Invoice').select('totalAmount, paidAmount, paymentStatus, invoiceDate').gte('invoiceDate', ms).lte('invoiceDate', me),
      // Payments received
      supabase.from('Payment').select('amount, paymentDate').gte('paymentDate', ms).lte('paymentDate', me),
      // Capital investments
      supabase.from('CapitalInvestment').select('amount'),
    ])

    const sales = salesRes.data || []
    const purchases = poRes.data || []
    const transactions = txnRes.data || []
    const fabricStock = fabricStockRes.data || []
    const invoices = invoiceRes.data || []
    const payments = paymentRes.data || []
    const capital = capInvRes.data || []

    // Calculate values
    const totalSales = sales.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
    const totalCOGS = sales.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)
    const grossProfit = sales.reduce((s: number, o: any) => s + (o.grossProfit || 0), 0)
    const totalPurchases = purchases.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0)

    const closingStockFabric = fabricStock.reduce((s: number, f: any) => s + (f.totalValue || 0), 0)

    const creditTxns = transactions.filter((t: any) => t.type === 'Credit')
    const debitTxns = transactions.filter((t: any) => t.type === 'Debit')
    const totalIncome = creditTxns.reduce((s: number, t: any) => s + (t.amount || 0), 0)
    const totalExpenses = debitTxns.reduce((s: number, t: any) => s + (t.amount || 0), 0)

    // Expense breakdown by category
    const expenseBreakdown: Record<string, number> = {}
    for (const t of debitTxns) {
      const cat = t.category || 'Other'
      expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + (t.amount || 0)
    }

    const totalInvoiced = invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0)
    const totalCollected = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const totalReceivable = invoices.reduce((s: number, i: any) => s + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0)
    const totalCapital = capital.reduce((s: number, c: any) => s + (c.amount || 0), 0)

    // ─── Trading Account ───
    if (type === 'trading') {
      return NextResponse.json({
        type: 'Trading Account',
        month: monthLabel,
        openingStock: 0, // Would need previous month closing
        purchases: Math.round(totalPurchases),
        directExpenses: Math.round(totalExpenses), // simplified
        closingStock: Math.round(closingStockFabric),
        costOfGoodsSold: Math.round(totalCOGS),
        sales: Math.round(totalSales),
        grossProfit: Math.round(grossProfit),
        grossProfitPercent: totalSales > 0 ? Math.round((grossProfit / totalSales) * 1000) / 10 : 0,
      })
    }

    // ─── P&L Statement ───
    if (type === 'pl') {
      const indirectExpenses = totalExpenses
      const netProfit = grossProfit - indirectExpenses
      return NextResponse.json({
        type: 'Profit & Loss Statement',
        month: monthLabel,
        revenue: {
          sales: Math.round(totalSales),
          otherIncome: Math.round(totalIncome),
          totalRevenue: Math.round(totalSales + totalIncome),
        },
        costOfGoodsSold: Math.round(totalCOGS),
        grossProfit: Math.round(grossProfit),
        grossProfitPercent: totalSales > 0 ? Math.round((grossProfit / totalSales) * 1000) / 10 : 0,
        indirectExpenses: Math.round(indirectExpenses),
        expenseBreakdown: Object.entries(expenseBreakdown)
          .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
          .sort((a, b) => b.amount - a.amount),
        netProfit: Math.round(netProfit),
        netProfitPercent: totalSales > 0 ? Math.round((netProfit / totalSales) * 1000) / 10 : 0,
      })
    }

    // ─── Balance Sheet ───
    if (type === 'balancesheet') {
      const cashBalance = fabricStock.reduce((s: number, f: any) => s + 0, 0) // Would get from BankAccount
      const totalAssets = closingStockFabric + totalReceivable + 0 // + cash (not tracked yet)
      const totalLiabilities = 0 // AP outstanding to suppliers
      const totalEquity = totalCapital
      return NextResponse.json({
        type: 'Balance Sheet',
        month: monthLabel,
        assets: {
          currentAssets: {
            cashAndBank: 0, // From BankAccount
            accountsReceivable: Math.round(totalReceivable),
            inventory: Math.round(closingStockFabric),
            totalCurrentAssets: Math.round(totalReceivable + closingStockFabric),
          },
          fixedAssets: {
            machinery: 0,
            furniture: 0,
            totalFixedAssets: 0,
          },
          totalAssets: Math.round(totalAssets),
        },
        liabilities: {
          currentLiabilities: {
            accountsPayable: 0, // From AP Aging
            gstPayable: 0,
            expensesPayable: 0,
            totalCurrentLiabilities: 0,
          },
          totalLiabilities: Math.round(totalLiabilities),
        },
        equity: {
          capital: Math.round(totalCapital),
          retainedEarnings: Math.round(grossProfit - totalExpenses),
          totalEquity: Math.round(totalCapital + grossProfit - totalExpenses),
        },
        balanceCheck: Math.round(totalAssets) === Math.round(totalLiabilities + totalCapital + grossProfit - totalExpenses),
      })
    }

    return NextResponse.json({ error: 'Invalid statement type. Use: trading, pl, or balancesheet' }, { status: 400 })
  } catch (error) {
    console.error('Financial Statements API error:', error)
    return NextResponse.json({ error: 'Failed to generate financial statement' }, { status: 500 })
  }
}
