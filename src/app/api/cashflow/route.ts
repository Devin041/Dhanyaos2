import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subDays, startOfDay } from 'date-fns'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = Math.min(Math.max(Number(searchParams.get('period')) || 30, 1), 365)

    const today = startOfDay(new Date())
    const startDate = startOfDay(subDays(new Date(), period))

    const startDateStr = startDate.toISOString()
    const todayStr = today.toISOString()

    // === Daily Snapshots for the period ===
    const { data: snapshots, error: snapErr } = await supabase
      .from('DailySnapshot')
      .select('*')
      .gte('date', startDateStr)
      .lte('date', todayStr)
      .order('date', { ascending: true })

    if (snapErr) throw snapErr

    const snaps = snapshots || []

    // === Opening Balance: use snapshot before startDate, or derive from first snapshot ===
    const { data: openingSnaps } = await supabase
      .from('DailySnapshot')
      .select('*')
      .lt('date', startDateStr)
      .order('date', { ascending: false })
      .limit(1)

    const openingSnapshot = openingSnaps && openingSnaps.length > 0 ? openingSnaps[0] : null
    const openingBalance = openingSnapshot
      ? openingSnapshot.cashBalance
      : snaps.length > 0
        ? snaps[0].cashBalance - (snaps[0].cashIn - snaps[0].cashOut)
        : 0

    // === Aggregate Totals ===
    const totalCashIn = snaps.reduce((s: number, x: any) => s + (x.cashIn || 0), 0)
    const totalCashOut = snaps.reduce((s: number, x: any) => s + (x.cashOut || 0), 0)
    const netCashFlow = totalCashIn - totalCashOut
    const closingBalance = openingBalance + netCashFlow
    const numDays = Math.max(snaps.length, 1)
    const avgDailyCashIn = Math.round(totalCashIn / numDays)
    const avgDailyCashOut = Math.round(totalCashOut / numDays)

    // === Daily Flow ===
    let runningBalance = openingBalance
    const dailyFlow = snaps.map((s: any) => {
      runningBalance = runningBalance + (s.cashIn || 0) - (s.cashOut || 0)
      return {
        date: format(new Date(s.date), 'yyyy-MM-dd'),
        cashIn: s.cashIn || 0,
        cashOut: s.cashOut || 0,
        netFlow: (s.cashIn || 0) - (s.cashOut || 0),
        balance: Math.round(runningBalance),
      }
    })

    // === Inflow Breakdown: group Transactions where type='Credit' ===
    const { data: inflowTransactions, error: inflowErr } = await supabase
      .from('Transaction')
      .select('category, amount')
      .eq('type', 'Credit')
      .gte('date', startDateStr)
      .lte('date', todayStr)

    if (inflowErr) throw inflowErr

    const inflowMap: Record<string, number> = {}
    for (const t of inflowTransactions || []) {
      const cat = t.category || 'Uncategorized'
      inflowMap[cat] = (inflowMap[cat] || 0) + (t.amount || 0)
    }
    const inflowBreakdown = Object.entries(inflowMap)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount),
        percent: totalCashIn > 0 ? Math.round((amount / totalCashIn) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    // === Outflow Breakdown: group Transactions where type='Debit' ===
    const { data: outflowTransactions, error: outflowErr } = await supabase
      .from('Transaction')
      .select('category, amount')
      .eq('type', 'Debit')
      .gte('date', startDateStr)
      .lte('date', todayStr)

    if (outflowErr) throw outflowErr

    const outflowMap: Record<string, number> = {}
    for (const t of outflowTransactions || []) {
      const cat = t.category || 'Uncategorized'
      outflowMap[cat] = (outflowMap[cat] || 0) + (t.amount || 0)
    }
    const outflowBreakdown = Object.entries(outflowMap)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount),
        percent: totalCashOut > 0 ? Math.round((amount / totalCashOut) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    // === Upcoming Outflows: PurchaseOrders where paymentStatus != 'Paid' ===
    const { data: upcomingPurchaseOrders } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, totalAmount, paidAmount, expectedDelivery, supplierId')
      .neq('paymentStatus', 'Paid')
      .order('expectedDelivery', { ascending: true })
      .limit(10)

    // Fetch suppliers
    const supplierIds = [...new Set((upcomingPurchaseOrders || []).map((po: any) => po.supplierId).filter(Boolean))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name')
        .in('id', supplierIds)
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
      }
    }

    const upcomingOutflows = (upcomingPurchaseOrders || [])
      .filter((po: any) => po.expectedDelivery)
      .map((po: any) => {
        const unpaidAmount = (po.totalAmount || 0) - (po.paidAmount || 0)
        return {
          description: `Supplier: ${supplierMap[po.supplierId]?.name || 'Unknown'}`,
          amount: Math.round(unpaidAmount),
          dueDate: format(new Date(po.expectedDelivery), 'yyyy-MM-dd'),
          type: 'purchase' as const,
        }
      })

    // === Upcoming Inflows: SalesOrders where paymentStatus != 'Paid' ===
    const { data: upcomingSalesOrders } = await supabase
      .from('SalesOrder')
      .select('id, orderNo, totalAmount, paidAmount, deliveryDate, customerId')
      .neq('paymentStatus', 'Paid')
      .order('deliveryDate', { ascending: true })
      .limit(10)

    // Fetch customers
    const customerIds = [...new Set((upcomingSalesOrders || []).map((so: any) => so.customerId).filter(Boolean))]
    let customerMap: Record<string, any> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('Customer')
        .select('id, companyName')
        .in('id', customerIds)
      if (customers) {
        customerMap = Object.fromEntries(customers.map((c: any) => [c.id, c]))
      }
    }

    const upcomingInflows = (upcomingSalesOrders || [])
      .filter((so: any) => so.deliveryDate)
      .map((so: any) => {
        const unpaidAmount = (so.totalAmount || 0) - (so.paidAmount || 0)
        return {
          description: `Customer: ${customerMap[so.customerId]?.companyName || 'Unknown'}`,
          amount: Math.round(unpaidAmount),
          dueDate: format(new Date(so.deliveryDate), 'yyyy-MM-dd'),
          type: 'order' as const,
        }
      })

    return NextResponse.json({
      summary: {
        openingBalance: Math.round(openingBalance),
        totalCashIn: Math.round(totalCashIn),
        totalCashOut: Math.round(totalCashOut),
        netCashFlow: Math.round(netCashFlow),
        closingBalance: Math.round(closingBalance),
        avgDailyCashIn,
        avgDailyCashOut,
      },
      dailyFlow,
      inflowBreakdown,
      outflowBreakdown,
      upcomingOutflows,
      upcomingInflows,
    })
  } catch (error) {
    console.error('Cash flow API error:', error)
    return NextResponse.json({ error: 'Failed to load cash flow data' }, { status: 500 })
  }
}
