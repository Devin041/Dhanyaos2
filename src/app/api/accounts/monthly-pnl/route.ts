import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

/**
 * GET /api/accounts/monthly-pnl?months=6
 *
 * Monthly Profit & Loss — THREE clearly labeled views (F3 fix):
 *
 *   TARGET  — booking + cost-sheet plan (the old numbers, now labeled):
 *             revenue = SalesOrder.totalAmount booked, COGS = cost-sheet target
 *   ACTUAL  — what really happened:
 *             revenue = invoices raised (invoice value, GST-inclusive),
 *             direct costs = material POs + job-work vendor bills + broker
 *             commissions + direct expense entries
 *   NET     — actual gross profit − net GST payable − indirect expenses
 *             (salary, rent, admin…). This is the money left in the business.
 *
 * Correctness rules (vs the pre-F3 route):
 *   • Customer payments / investor capital credits are NOT revenue
 *     (they are cash/equity events — counting them double-counted ₹7L+).
 *   • Cost-sheet target is never shown as an actual.
 *   • Net GST uses the statutory cross-utilization order (Sec 49(5)/Rule 88A),
 *     same as /api/gst-returns, so IGST liability is offset by CGST+SGST ITC.
 */

// Transaction debit categories that are DIRECT production costs (counted in
// ACTUAL direct costs, not indirect) — avoids double counting with POs.
const DIRECT_TXN_CATEGORIES = new Set([
  'Fabric Purchase', 'Embroidery Cost', 'Stitching Cost', 'Accessories',
  'Raw Material', 'Packaging', 'Material', 'Job Work', 'Cutting Cost',
  'Dyeing Cost', 'Printing Cost', 'Washing Cost',
])

// Credit categories that are NOT income (cash or equity movements)
const NON_INCOME_CREDIT_CATEGORIES = new Set([
  'Customer Payment', 'Investor Capital', 'Sales Revenue', 'Capital',
  'Owner Capital', 'Owner Contribution', 'Loan',
])

interface MonthPnL {
  month: string
  target: {
    revenue: number
    cogs: number
    grossProfit: number
    margin: number
    orderCount: number
  }
  actual: {
    revenue: number
    invoiceCount: number
    directCosts: {
      material: number
      jobWork: number
      broker: number
      expenseEntries: number
    }
    totalCosts: number
    grossProfit: number
    margin: number
  }
  gst: {
    output: number
    input: number
    netPayable: number
  }
  indirect: {
    expenses: number
    breakdown: Array<{ category: string; amount: number }>
  }
  net: {
    profit: number
    margin: number
  }
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const monthsCount = Math.min(Math.max(Number(searchParams.get('months')) || 6, 1), 12)
    const now = new Date()

    // ── Fetch all sources in parallel-ish ──
    const { data: allTxns, error: txnErr } = await supabase
      .from('Transaction')
      .select('id, type, category, amount, date')
    if (txnErr && !isMissingTableError(txnErr)) throw txnErr
    const txns = allTxns || []

    const { data: orders } = await supabase
      .from('SalesOrder')
      .select('id, totalAmount, totalCost, status, orderDate, createdAt')
    const allOrders = (orders || []).filter((o: any) => o.status !== 'Cancelled')

    const { data: invoices } = await supabase
      .from('Invoice')
      .select('id, totalAmount, cgstAmount, sgstAmount, igstAmount, totalGst, status, invoiceDate')
    const allInvoices = (invoices || []).filter((i: any) => i.status !== 'Cancelled')

    const { data: pos } = await supabase
      .from('PurchaseOrder')
      .select('id, totalAmount, totalGst, cgstAmount, sgstAmount, igstAmount, status, createdAt')
    const allPOs = (pos || []).filter((p: any) => p.status !== 'Cancelled')

    const { data: bills } = await supabase
      .from('VendorBill')
      .select('id, totalAmount, totalGst, cgstAmount, sgstAmount, igstAmount, status, billDate')
    const allBills = (bills || []).filter((b: any) => b.status !== 'Cancelled')

    const { data: costSheets } = await supabase
      .from('CostSheet')
      .select('id, brokerCommissionAmount, status, createdAt')
    const activeSheets = (costSheets || []).filter((c: any) => c.status !== 'Cancelled')

    // ── Build monthly P&L ──
    const months: MonthPnL[] = []
    for (let i = monthsCount - 1; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i))
      const monthEnd = endOfMonth(subMonths(now, i))
      const monthLabel = format(monthStart, 'MMM yy')
      const inMonth = (d: any) => {
        if (!d) return false
        const t = new Date(d)
        return t >= monthStart && t <= monthEnd
      }

      // TARGET — bookings + cost-sheet plan (old behavior, now labeled)
      const monthOrders = allOrders.filter((o: any) => inMonth(o.orderDate || o.createdAt))
      const targetRevenue = monthOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0)
      const targetCogs = monthOrders.reduce((s: number, o: any) => s + (o.totalCost || 0), 0)

      // ACTUAL — invoiced revenue
      const monthInvoices = allInvoices.filter((inv: any) => inMonth(inv.invoiceDate))
      const invoiceRevenue = monthInvoices.reduce((s: number, inv: any) => s + (inv.totalAmount || 0), 0)

      // ACTUAL — direct costs (what it actually took to deliver)
      const monthPOs = allPOs.filter((p: any) => inMonth(p.createdAt))
      const materialCost = monthPOs.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0)

      const monthBills = allBills.filter((b: any) => inMonth(b.billDate))
      const jobWorkCost = monthBills.reduce((s: number, b: any) => s + (b.totalAmount || 0), 0)

      const monthSheets = activeSheets.filter((c: any) => inMonth(c.createdAt))
      const brokerCost = monthSheets.reduce((s: number, c: any) => s + (c.brokerCommissionAmount || 0), 0)

      const monthTxns = txns.filter((t: any) => inMonth(t.date))
      const debits = monthTxns.filter((t: any) => t.type === 'Debit')
      const directDebits = debits.filter((t: any) => DIRECT_TXN_CATEGORIES.has(t.category || ''))
      const indirectDebits = debits.filter((t: any) => !DIRECT_TXN_CATEGORIES.has(t.category || ''))
      const directEntryCost = directDebits.reduce((s: number, t: any) => s + (t.amount || 0), 0)

      // Other (non-cash/equity) credit income — e.g. genuine 'Other Income'
      const otherIncome = monthTxns
        .filter((t: any) => t.type === 'Credit' && !NON_INCOME_CREDIT_CATEGORIES.has(t.category || 'Other Income'))
        .reduce((s: number, t: any) => s + (t.amount || 0), 0)

      const actualRevenue = invoiceRevenue + otherIncome
      const totalCosts = materialCost + jobWorkCost + brokerCost + directEntryCost
      const actualGross = actualRevenue - totalCosts

      // GST — statutory cross-utilization (same order as /api/gst-returns):
      // IGST liab ← IGST→CGST→SGST credit; CGST liab ← CGST→IGST; SGST liab ← SGST→IGST
      let outC = 0, outS = 0, outI = 0
      for (const inv of monthInvoices) { outC += inv.cgstAmount || 0; outS += inv.sgstAmount || 0; outI += inv.igstAmount || 0 }
      let inC = 0, inS = 0, inI = 0
      for (const p of monthPOs) { inC += p.cgstAmount || 0; inS += p.sgstAmount || 0; inI += p.igstAmount || 0 }
      for (const b of monthBills) { inC += b.cgstAmount || 0; inS += b.sgstAmount || 0; inI += b.igstAmount || 0 }
      let crI = inI, crC = inC, crS = inS
      let liabI = Math.max(0, outI)
      let use = Math.min(liabI, crI); liabI -= use; crI -= use
      use = Math.min(liabI, crC); liabI -= use; crC -= use
      use = Math.min(liabI, crS); liabI -= use; crS -= use
      let liabC = Math.max(0, outC)
      use = Math.min(liabC, crC); liabC -= use; crC -= use
      use = Math.min(liabC, crI); liabC -= use; crI -= use
      let liabS = Math.max(0, outS)
      use = Math.min(liabS, crS); liabS -= use; crS -= use
      use = Math.min(liabS, crI); liabS -= use; crI -= use
      const netGst = r2(liabI + liabC + liabS)

      // INDIRECT — operating expenses breakdown
      const indMap: Record<string, number> = {}
      for (const t of indirectDebits) {
        const cat = t.category || 'Other'
        indMap[cat] = (indMap[cat] || 0) + (t.amount || 0)
      }
      const indirectExpenses = indirectDebits.reduce((s: number, t: any) => s + (t.amount || 0), 0)

      // NET — what's left after GST remittance and overheads
      const netProfit = actualGross - netGst - indirectExpenses

      months.push({
        month: monthLabel,
        target: {
          revenue: r2(targetRevenue),
          cogs: r2(targetCogs),
          grossProfit: r2(targetRevenue - targetCogs),
          margin: targetRevenue > 0 ? Math.round(((targetRevenue - targetCogs) / targetRevenue) * 1000) / 10 : 0,
          orderCount: monthOrders.length,
        },
        actual: {
          revenue: r2(actualRevenue),
          invoiceCount: monthInvoices.length,
          directCosts: {
            material: r2(materialCost),
            jobWork: r2(jobWorkCost),
            broker: r2(brokerCost),
            expenseEntries: r2(directEntryCost),
          },
          totalCosts: r2(totalCosts),
          grossProfit: r2(actualGross),
          margin: actualRevenue > 0 ? Math.round((actualGross / actualRevenue) * 1000) / 10 : 0,
        },
        gst: {
          output: r2(outC + outS + outI),
          input: r2(inC + inS + inI),
          netPayable: netGst,
        },
        indirect: {
          expenses: r2(indirectExpenses),
          breakdown: Object.entries(indMap)
            .map(([category, amount]) => ({ category, amount: r2(amount) }))
            .sort((a, b) => b.amount - a.amount),
        },
        net: {
          profit: r2(netProfit),
          margin: actualRevenue > 0 ? Math.round((netProfit / actualRevenue) * 1000) / 10 : 0,
        },
      })
    }

    const sum = (fn: (m: MonthPnL) => number) => r2(months.reduce((s, m) => s + fn(m), 0))
    const summary = {
      target: { revenue: sum(m => m.target.revenue), cogs: sum(m => m.target.cogs), grossProfit: sum(m => m.target.grossProfit) },
      actual: { revenue: sum(m => m.actual.revenue), directCosts: sum(m => m.actual.totalCosts), grossProfit: sum(m => m.actual.grossProfit) },
      gst: { netPayable: sum(m => m.gst.netPayable) },
      indirect: { expenses: sum(m => m.indirect.expenses) },
      net: {
        profit: sum(m => m.net.profit),
        avgMargin: months.length > 0 ? Math.round(months.reduce((s, m) => s + m.net.margin, 0) / months.length * 10) / 10 : 0,
      },
    }

    const EXPENSE_CATEGORIES = [
      'Salary', 'Factory Rent', 'Office Rent', 'Electricity', 'Water',
      'Maintenance', 'Transport', 'Marketing', 'Admin', 'Utilities',
      'Raw Material', 'Packaging', 'Stationery', 'Internet/Phone',
      'Insurance', 'Bank Charges', 'Professional Fees', 'Miscellaneous',
    ]
    const INCOME_CATEGORIES = ['Sales Revenue', 'Customer Payment', 'Investor Capital', 'Other Income']

    return NextResponse.json({
      months,
      currentMonth: months[months.length - 1] || null,
      summary,
      expenseCategories: EXPENSE_CATEGORIES,
      incomeCategories: INCOME_CATEGORIES,
    })
  } catch (error) {
    console.error('Monthly P&L API error:', error)
    return NextResponse.json({ error: 'Failed to load P&L data' }, { status: 500 })
  }
}
