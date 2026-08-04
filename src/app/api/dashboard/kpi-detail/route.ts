import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format, subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const kpi = searchParams.get('kpi')
    if (!kpi) return NextResponse.json({ error: 'kpi parameter required' }, { status: 400 })

    const today = startOfDay(new Date())
    const todayISO = today.toISOString()
    const todayEndISO = endOfDay(new Date()).toISOString()
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    switch (kpi) {

      // ─── 1. TODAY'S REVENUE ──────────────────────────────────────────────────
      case 'today-revenue': {
        const { data: txns } = await supabase
          .from('Transaction')
          .select('*')
          .eq('type', 'Credit')
          .neq('category', 'Capital Investment')
          .gte('date', todayISO)
          .lt('date', todayEndISO)
          .order('amount', { ascending: false })
        const total = (txns || []).reduce((s, t) => s + t.amount, 0)
        const grouped = (txns || []).reduce<Record<string, number>>((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount
          return acc
        }, {})
        const byCategory = Object.entries(grouped).map(([category, amount]) => ({
          category,
          amount: Math.round(amount),
          percent: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
          count: (txns || []).filter(t => t.category === category).length,
        })).sort((a, b) => b.amount - a.amount)
        return NextResponse.json({
          title: "Today's Revenue Breakdown",
          total: Math.round(total),
          items: (txns || []).map(t => ({
            id: t.id,
            description: t.description,
            category: t.category,
            amount: Math.round(t.amount),
            time: format(new Date(t.date), 'hh:mm a'),
          })),
          byCategory,
        })
      }

      // ─── 2. PENDING ORDERS ───────────────────────────────────────────────────
      case 'pending-orders': {
        const { data: orders } = await supabase
          .from('SalesOrder')
          .select('*, customer:customerId(companyName)')
          .in('status', ['Pending', 'Confirmed'])
          .order('orderDate', { ascending: false })
        const totalValue = (orders || []).reduce((s, o) => s + o.totalAmount, 0)
        return NextResponse.json({
          title: 'Pending Orders',
          total: (orders || []).length,
          totalValue: Math.round(totalValue),
          items: (orders || []).map(o => ({
            id: o.id,
            orderNo: o.orderNo,
            customer: o.customer?.companyName || 'Unknown',
            amount: Math.round(o.totalAmount),
            status: o.status,
            orderDate: format(new Date(o.orderDate), 'dd MMM yyyy'),
            daysOld: differenceInDays(today, startOfDay(new Date(o.orderDate))),
          })),
        })
      }

      // ─── 3. ORDERS IN PRODUCTION ─────────────────────────────────────────────
      case 'in-production': {
        const { data: orders } = await supabase
          .from('SalesOrder')
          .select('*, customer:customerId(companyName), productionJobs:ProductionJob(jobNo, styleName, stage, status, targetQty, completedQty)')
          .eq('status', 'In Production')
          .order('orderDate', { ascending: true })
        const totalValue = (orders || []).reduce((s, o) => s + o.totalAmount, 0)
        return NextResponse.json({
          title: 'Orders in Production',
          total: (orders || []).length,
          totalValue: Math.round(totalValue),
          items: (orders || []).map(o => {
            const totalJobs = (o.productionJobs || []).length
            const completedJobs = (o.productionJobs || []).filter((j: { status: string }) => j.status === 'Completed').length
            const totalQty = (o.productionJobs || []).reduce((s: number, j: { targetQty: number }) => s + j.targetQty, 0)
            const doneQty = (o.productionJobs || []).reduce((s: number, j: { completedQty: number }) => s + j.completedQty, 0)
            return {
              id: o.id,
              orderNo: o.orderNo,
              customer: o.customer?.companyName || 'Unknown',
              amount: Math.round(o.totalAmount),
              jobs: `${completedJobs}/${totalJobs}`,
              quantity: `${doneQty}/${totalQty}`,
              progress: totalQty > 0 ? Math.round((doneQty / totalQty) * 100) : 0,
              orderDate: format(new Date(o.orderDate), 'dd MMM yyyy'),
            }
          }),
        })
      }

      // ─── 4. CASH POSITION ───────────────────────────────────────────────────
      case 'cash-position': {
        const { data: creditTxns } = await supabase
          .from('Transaction')
          .select('category, amount')
          .eq('type', 'Credit')
        const { data: debitTxns } = await supabase
          .from('Transaction')
          .select('category, amount')
          .eq('type', 'Debit')
          .neq('category', 'Payment Correction')

        const creditGroupMap = new Map<string, { amount: number; count: number }>()
        for (const t of (creditTxns || [])) {
          const existing = creditGroupMap.get(t.category) || { amount: 0, count: 0 }
          existing.amount += t.amount || 0
          existing.count++
          creditGroupMap.set(t.category, existing)
        }
        const totalIn = (creditTxns || []).reduce((s, g) => s + (g.amount || 0), 0)

        const debitGroupMap = new Map<string, { amount: number; count: number }>()
        for (const t of (debitTxns || [])) {
          const existing = debitGroupMap.get(t.category) || { amount: 0, count: 0 }
          existing.amount += t.amount || 0
          existing.count++
          debitGroupMap.set(t.category, existing)
        }
        const totalOut = (debitTxns || []).reduce((s, g) => s + (g.amount || 0), 0)

        return NextResponse.json({
          title: 'Cash Position Breakdown',
          cashBalance: Math.round(totalIn - totalOut),
          totalIn: Math.round(totalIn),
          totalOut: Math.round(totalOut),
          inflows: Array.from(creditGroupMap.entries())
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([category, data]) => ({
              category,
              amount: Math.round(data.amount),
              count: data.count,
              percent: totalIn > 0 ? Math.round((data.amount / totalIn) * 10000) / 100 : 0,
            })),
          outflows: Array.from(debitGroupMap.entries())
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([category, data]) => ({
              category,
              amount: Math.round(data.amount),
              count: data.count,
              percent: totalOut > 0 ? Math.round((data.amount / totalOut) * 10000) / 100 : 0,
            })),
        })
      }

      // ─── 5. RECEIVABLES ──────────────────────────────────────────────────────
      case 'receivables': {
        const { data: orders } = await supabase
          .from('SalesOrder')
          .select('*, customer:customerId(companyName)')
          .in('paymentStatus', ['Unpaid', 'Partial'])
          .order('orderDate', { ascending: true })
        const totalOutstanding = (orders || []).reduce((s, o) => s + (o.totalAmount - o.paidAmount), 0)
        return NextResponse.json({
          title: 'Receivables Breakdown',
          total: (orders || []).length,
          totalOutstanding: Math.round(totalOutstanding),
          totalBilled: Math.round((orders || []).reduce((s, o) => s + o.totalAmount, 0)),
          totalCollected: Math.round((orders || []).reduce((s, o) => s + o.paidAmount, 0)),
          items: (orders || []).map(o => {
            const outstanding = o.totalAmount - o.paidAmount
            const daysOld = differenceInDays(today, startOfDay(new Date(o.orderDate)))
            return {
              id: o.id,
              orderNo: o.orderNo,
              customer: o.customer?.companyName || 'Unknown',
              total: Math.round(o.totalAmount),
              paid: Math.round(o.paidAmount),
              outstanding: Math.round(outstanding),
              status: o.paymentStatus,
              daysOld,
              orderDate: format(new Date(o.orderDate), 'dd MMM yyyy'),
            }
          }).sort((a, b) => b.outstanding - a.outstanding),
        })
      }

      // ─── 6. PAYABLES ────────────────────────────────────────────────────────
      case 'payables': {
        const { data: pos } = await supabase
          .from('PurchaseOrder')
          .select('*, supplier:supplierId(name)')
          .in('paymentStatus', ['Unpaid', 'Partial'])

        const { data: vbs } = await supabase
          .from('VendorBill')
          .select('*, vendor:vendorId(vendorName)')
          .in('status', ['Pending', 'Partially Paid', 'Overdue'])

        const poTotal = (pos || []).reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0)
        const vbTotal = (vbs || []).reduce((s, v) => s + (v.totalAmount - v.paidAmount), 0)
        return NextResponse.json({
          title: 'Payables Breakdown',
          total: Math.round(poTotal + vbTotal),
          poTotal: Math.round(poTotal),
          poCount: (pos || []).length,
          vbTotal: Math.round(vbTotal),
          vbCount: (vbs || []).length,
          purchaseOrders: (pos || []).map(p => ({
            id: p.id,
            ref: p.poNumber,
            party: p.supplier?.name || 'Unknown',
            total: Math.round(p.totalAmount),
            paid: Math.round(p.paidAmount),
            outstanding: Math.round(p.totalAmount - p.paidAmount),
            status: p.paymentStatus,
            expected: p.expectedDelivery ? format(new Date(p.expectedDelivery), 'dd MMM yyyy') : '—',
          })).sort((a, b) => b.outstanding - a.outstanding),
          vendorBills: (vbs || []).map(v => ({
            id: v.id,
            ref: v.billNo,
            party: v.vendor?.vendorName || 'Unknown',
            total: Math.round(v.totalAmount),
            paid: Math.round(v.paidAmount),
            outstanding: Math.round(v.totalAmount - v.paidAmount),
            status: v.status,
            dueDate: v.dueDate ? format(new Date(v.dueDate), 'dd MMM yyyy') : '—',
            isOverdue: v.status === 'Overdue',
          })).sort((a, b) => b.outstanding - a.outstanding),
        })
      }

      // ─── 7. WORKING CAPITAL ──────────────────────────────────────────────────
      case 'working-capital': {
        const { data: creditTxns } = await supabase.from('Transaction').select('amount').eq('type', 'Credit')
        const { data: debitTxns } = await supabase.from('Transaction').select('amount').eq('type', 'Debit')
        const cash = (creditTxns || []).reduce((s, t) => s + (t.amount || 0), 0)
          - (debitTxns || []).reduce((s, t) => s + (t.amount || 0), 0)

        const { data: rcvOrders } = await supabase.from('SalesOrder').select('totalAmount, paidAmount').in('paymentStatus', ['Unpaid', 'Partial'])
        const receivables = (rcvOrders || []).reduce((s, o) => s + (o.totalAmount || 0) - (o.paidAmount || 0), 0)

        const { data: poPayData } = await supabase.from('PurchaseOrder').select('totalAmount, paidAmount').in('paymentStatus', ['Unpaid', 'Partial'])
        const { data: vbPayData } = await supabase.from('VendorBill').select('totalAmount, paidAmount').in('status', ['Pending', 'Partially Paid', 'Overdue'])
        const payables = (poPayData || []).reduce((s, o) => s + (o.totalAmount || 0) - (o.paidAmount || 0), 0)
          + (vbPayData || []).reduce((s, o) => s + (o.totalAmount || 0) - (o.paidAmount || 0), 0)

        const workingCapital = cash + receivables - payables

        return NextResponse.json({
          title: 'Working Capital Breakdown',
          workingCapital: Math.round(workingCapital),
          formula: [
            { label: 'Cash Position', value: Math.round(cash), type: 'positive' as const },
            { label: '(+) Receivables', value: Math.round(receivables), type: 'positive' as const },
            { label: '(−) Payables', value: -Math.round(payables), type: 'negative' as const },
            { label: '= Working Capital', value: Math.round(workingCapital), type: 'result' as const },
          ],
        })
      }

      // ─── 8. INVENTORY VALUE ─────────────────────────────────────────────────
      case 'inventory': {
        const { data: fabrics } = await supabase
          .from('FabricStock')
          .select('*')
          .order('totalValue', { ascending: false })
        const { data: finished } = await supabase
          .from('FinishedGood')
          .select('*')
          .order('totalValue', { ascending: false })
        const fabricTotal = (fabrics || []).reduce((s, f) => s + f.totalValue, 0)
        const finishedTotal = (finished || []).reduce((s, f) => s + f.totalValue, 0)
        return NextResponse.json({
          title: 'Inventory Value Breakdown',
          total: Math.round(fabricTotal + finishedTotal),
          fabricTotal: Math.round(fabricTotal),
          finishedTotal: Math.round(finishedTotal),
          fabrics: (fabrics || []).map(f => ({
            id: f.id,
            name: f.fabricName,
            meters: Math.round(f.availableMeters),
            avgCost: Math.round(f.averageCost),
            value: Math.round(f.totalValue),
          })),
          finishedGoods: (finished || []).map(f => ({
            id: f.id,
            style: f.styleName,
            quantity: f.quantity,
            unitCost: Math.round(f.unitCost),
            value: Math.round(f.totalValue),
          })),
        })
      }

      // ─── 9. OUTSTANDING POs ─────────────────────────────────────────────────
      case 'outstanding-pos': {
        const { data: pos } = await supabase
          .from('PurchaseOrder')
          .select('*, supplier:supplierId(name)')
          .in('status', ['Pending', 'Approved', 'Ordered'])
          .order('expectedDelivery', { ascending: true })
        const totalValue = (pos || []).reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0)
        return NextResponse.json({
          title: 'Outstanding Purchase Orders',
          total: (pos || []).length,
          totalValue: Math.round(totalValue),
          items: (pos || []).map(p => ({
            id: p.id,
            poNumber: p.poNumber,
            supplier: p.supplier?.name || 'Unknown',
            fabric: p.fabricName,
            qty: `${p.receivedQty}/${p.quantity} ${p.unit}`,
            total: Math.round(p.totalAmount),
            paid: Math.round(p.paidAmount),
            outstanding: Math.round(p.totalAmount - p.paidAmount),
            status: p.status,
            expected: p.expectedDelivery ? format(new Date(p.expectedDelivery), 'dd MMM yyyy') : '—',
          })),
        })
      }

      // ─── 10. MONTHLY EXPENSES ────────────────────────────────────────────────
      case 'monthly-expenses': {
        const { data: txns } = await supabase
          .from('Transaction')
          .select('*')
          .eq('type', 'Debit')
          .neq('category', 'Payment Correction')
          .gte('date', thirtyDaysAgoISO)
          .order('amount', { ascending: false })
        const total = (txns || []).reduce((s, t) => s + t.amount, 0)
        const grouped = (txns || []).reduce<Record<string, { amount: number; count: number }>>((acc, t) => {
          if (!acc[t.category]) acc[t.category] = { amount: 0, count: 0 }
          acc[t.category].amount += t.amount
          acc[t.category].count++
          return acc
        }, {})
        const byCategory = Object.entries(grouped)
          .map(([category, data]) => ({
            category,
            amount: Math.round(data.amount),
            count: data.count,
            percent: total > 0 ? Math.round((data.amount / total) * 10000) / 100 : 0,
          }))
          .sort((a, b) => b.amount - a.amount)
        return NextResponse.json({
          title: 'Monthly Expenses Breakdown (Last 30 Days)',
          total: Math.round(total),
          byCategory,
          items: (txns || []).map(t => ({
            id: t.id,
            description: t.description,
            category: t.category,
            amount: Math.round(t.amount),
            date: format(new Date(t.date), 'dd MMM'),
          })),
        })
      }

      default:
        return NextResponse.json({ error: `Unknown KPI: ${kpi}` }, { status: 400 })
    }
  } catch (error) {
    console.error('KPI detail API error:', error)
    return NextResponse.json({ error: 'Failed to load KPI detail' }, { status: 500 })
  }
}
