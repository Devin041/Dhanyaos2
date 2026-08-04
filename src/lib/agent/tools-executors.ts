import { supabase } from '@/lib/supabase-db'
import type { ToolResult, ToolExecutor } from './tools-types'

// ─── Helper ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

// Robust number parser — handles "₹50", "50rs", "50 rs/mtr", "50 per pcs" etc.
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v
  if (v == null) return fallback
  const s = String(v).replace(/[₹,]/g, '').replace(/rs\.?/gi, '').replace(/per.*/i, '').replace(/[a-zA-Z]/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? fallback : n
}

const todayRange = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 86400000)
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return { start, end, dateStr }
}

const calcGst = (taxableAmount: number, gstType: string, gstPercent: number) => {
  const gstAmount = Math.round(taxableAmount * gstPercent / 100 * 100) / 100
  return {
    gstAmount,
    cgstAmount: gstType === 'IntraState' ? Math.round(gstAmount / 2 * 100) / 100 : 0,
    sgstAmount: gstType === 'IntraState' ? Math.round(gstAmount / 2 * 100) / 100 : 0,
    igstAmount: gstType === 'InterState' ? gstAmount : 0,
  }
}

// ─── Tool Executor Registry ──────────────────────────────────────────────────

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  get_orders: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('SalesOrder').select('*, customer:customerId(companyName, phone)').order('orderDate', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    if (p.paymentStatus) query = query.eq('paymentStatus', p.paymentStatus as string)
    const { data: orders, error } = await query
    if (error) throw error

    // JS filter for OR search across relations
    let filtered = orders ?? []
    if (p.search) {
      const s = String(p.search).toLowerCase()
      filtered = filtered.filter(o =>
        (o.orderNo && o.orderNo.toLowerCase().includes(s)) ||
        (o.customer?.companyName && o.customer.companyName.toLowerCase().includes(s))
      )
    }
    return {
      success: true,
      count: filtered.length,
      summary: `${filtered.length} orders found`,
      data: filtered.map(o => ({
        orderNo: o.orderNo, customer: o.customer?.companyName,
        amount: o.totalAmount, cost: o.totalCost, profit: o.grossProfit, margin: o.grossMargin,
        status: o.status, paymentStatus: o.paymentStatus, paidAmount: o.paidAmount,
        orderDate: o.orderDate, deliveryDate: o.deliveryDate,
      })),
    }
  },

  get_order_detail: async (p) => {
    const { data: order, error } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName, phone, gstNumber), items:OrderItem(*), productionJobs:ProductionJob(*), dispatches:Dispatch(*)')
      .eq('orderNo', p.orderNo as string).limit(1).single()
    if (error || !order) return { success: false, data: null, summary: `Order "${p.orderNo}" not found in database.` }

    // Sort dispatches by date desc in JS
    const sortedDispatches = (order.dispatches ?? []).sort((a: any, b: any) => new Date(b.dispatchDate).getTime() - new Date(a.dispatchDate).getTime())

    return {
      success: true, count: 1,
      summary: `Order ${order.orderNo} — ${order.customer?.companyName}, ${fmt(order.totalAmount)}`,
      data: {
        orderNo: order.orderNo, customer: order.customer, status: order.status,
        amount: order.totalAmount, cost: order.totalCost, profit: order.grossProfit, margin: order.grossMargin,
        paymentStatus: order.paymentStatus, paidAmount: order.paidAmount, brokerName: order.brokerName,
        commissionPercent: order.commissionPercent, commissionAmount: order.commissionAmount,
        netAmount: order.netAmount, netProfit: order.netProfit, netMargin: order.netMargin,
        orderDate: order.orderDate, deliveryDate: order.deliveryDate,
        items: (order.items ?? []).map((i: any) => ({ styleName: i.styleName, qty: i.quantity, price: i.unitPrice, cost: i.unitCost })),
        productionJobs: (order.productionJobs ?? []).map((j: any) => ({ jobNo: j.jobNo, target: j.targetQty, completed: j.completedQty, status: j.status })),
        dispatches: sortedDispatches.map((d: any) => ({ dispatchNo: d.dispatchNo, date: d.dispatchDate, qty: d.totalDispatchedQty, status: d.status })),
      },
    }
  },

  get_inventory: async (p) => {
    const limit = Math.min(Number(p.limit) || 20, 50)
    let query = supabase.from('FabricStock').select('*').order('availableMeters', { ascending: true }).limit(limit)
    if (p.lowStockOnly) query = query.lte('availableMeters', 100)
    if (p.search) query = query.ilike('fabricName', `%${p.search}%`)
    const { data: fabrics, error } = await query
    if (error) throw error

    // Aggregate totals from all records
    const { data: allFabrics } = await supabase.from('FabricStock').select('totalValue, availableMeters, reservedMeters')
    const totals = (allFabrics ?? []).reduce((acc, f) => ({
      totalValue: acc.totalValue + (f.totalValue || 0),
      availableMeters: acc.availableMeters + (f.availableMeters || 0),
      reservedMeters: acc.reservedMeters + (f.reservedMeters || 0),
    }), { totalValue: 0, availableMeters: 0, reservedMeters: 0 })

    return {
      success: true, count: fabrics?.length ?? 0,
      summary: `${fabrics?.length ?? 0} fabrics, total value ${fmt(totals.totalValue)}, ${Math.round(totals.availableMeters)}m available`,
      data: (fabrics ?? []).map(f => ({
        fabricName: f.fabricName, available: f.availableMeters, reserved: f.reservedMeters,
        free: f.availableMeters - f.reservedMeters, avgCost: f.averageCost, value: f.totalValue,
        gsm: f.gsm, width: f.width,
      })),
    }
  },

  get_cost_sheets: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('CostSheet').select('*, customer:customerId(companyName), costItems:CostItem(count), colorBreakdown:CostSheetColor(count)').order('createdAt', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: sheets, error } = await query
    if (error) throw error

    // JS filter for OR search
    let filtered = sheets ?? []
    if (p.search) {
      const s = String(p.search).toLowerCase()
      filtered = filtered.filter(sh =>
        (sh.styleNo && sh.styleNo.toLowerCase().includes(s)) ||
        (sh.styleName && sh.styleName.toLowerCase().includes(s)) ||
        (sh.sheetNo && sh.sheetNo.toLowerCase().includes(s))
      )
    }
    return {
      success: true, count: filtered.length,
      summary: `${filtered.length} cost sheets found`,
      data: filtered.map(s => ({
        sheetNo: s.sheetNo, styleNo: s.styleNo, styleName: s.styleName,
        customer: s.customer?.companyName, status: s.status,
        totalCost: s.totalCost, sellingPrice: s.sellingPrice, margin: s.profitPercent,
        broker: s.brokerCommissionPercent, targetQty: s.targetQty,
        itemsCount: (s.costItems as any[])?.length ?? 0, colorsCount: (s.colorBreakdown as any[])?.length ?? 0,
        breakdown: { fabric: s.fabricCost, trim: s.trimCost, labor: s.laborCost, wash: s.washCost, packaging: s.packagingCost, overhead: s.overheadCost, other: s.otherCost },
      })),
    }
  },

  get_cost_sheet_detail: async (p) => {
    const { data: sheet, error } = await supabase.from('CostSheet')
      .select('*, customer:customerId(companyName), costItems:CostItem(*), colorBreakdown:CostSheetColor(*)')
      .eq('sheetNo', p.sheetNo as string).limit(1).single()
    if (error || !sheet) return { success: false, data: null, summary: `Cost sheet "${p.sheetNo}" not found in database.` }

    // Sort costItems by category asc, createdAt asc in JS
    const sortedItems = (sheet.costItems ?? []).sort((a: any, b: any) => {
      const cat = (a.category || '').localeCompare(b.category || '')
      if (cat !== 0) return cat
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    // Sort colorBreakdown by createdAt asc in JS
    const sortedColors = (sheet.colorBreakdown ?? []).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    return {
      success: true, count: 1,
      summary: `${sheet.sheetNo} — ${sheet.styleName}, ${fmt(sheet.totalCost)}/piece, ${sortedItems.length} items, ${sortedColors.length} colors`,
      data: {
        sheetNo: sheet.sheetNo, styleNo: sheet.styleNo, styleName: sheet.styleName,
        customer: sheet.customer?.companyName, status: sheet.status, sizeRange: sheet.sizeRange,
        targetQty: sheet.targetQty, totalCost: sheet.totalCost, sellingPrice: sheet.sellingPrice,
        margin: sheet.profitPercent, broker: sheet.brokerCommissionPercent,
        items: sortedItems.map((i: any) => ({ category: i.category, name: i.itemName, consumption: i.consumption, unit: i.unit, rate: i.unitRate, waste: i.wastagePercent, cost: i.itemCost })),
        colors: sortedColors.map((c: any) => ({ color: c.color, quantity: c.quantity })),
      },
    }
  },

  get_production_jobs: async (p) => {
    const limit = Math.min(Number(p.limit) || 15, 50)
    let query = supabase.from('ProductionJob').select('*').order('createdAt', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: jobs, error } = await query
    if (error) throw error

    // Group by status manually (equivalent to groupBy)
    const { data: allJobs } = await supabase.from('ProductionJob').select('status, targetQty, completedQty')
    const groupMap = new Map<string, { count: number; target: number; completed: number }>()
    for (const j of (allJobs ?? [])) {
      const existing = groupMap.get(j.status) || { count: 0, target: 0, completed: 0 }
      existing.count++
      existing.target += j.targetQty || 0
      existing.completed += j.completedQty || 0
      groupMap.set(j.status, existing)
    }
    const byStatus = Array.from(groupMap.entries()).map(([status, g]) => ({ status, _count: g.count, _sum: { targetQty: g.target, completedQty: g.completed } }))

    return {
      success: true, count: jobs?.length ?? 0,
      summary: `${jobs?.length ?? 0} jobs found. Status: ${byStatus.map(s => `${s.status}=${s._count}`).join(', ')}`,
      data: {
        summary: byStatus.map(s => ({ status: s.status, count: s._count, target: s._sum.targetQty, completed: s._sum.completedQty })),
        jobs: (jobs ?? []).map(j => ({
          jobNo: j.jobNo, styleNo: j.styleNo, styleName: j.styleName,
          target: j.targetQty, completed: j.completedQty,
          progress: j.targetQty > 0 ? Math.round((j.completedQty / j.targetQty) * 100) : 0,
          stage: j.stage, status: j.status,
          startDate: j.startDate, endDate: j.endDate,
        })),
      },
    }
  },

  get_customers: async (p) => {
    const limit = Math.min(Number(p.limit) || 20, 50)
    let query = supabase.from('Customer').select('*').order('companyName', { ascending: true }).limit(limit)
    if (p.search) query = query.ilike('companyName', `%${p.search}%`)
    const { data: customers, error } = await query
    if (error) throw error
    return {
      success: true, count: customers?.length ?? 0,
      summary: `${customers?.length ?? 0} customers found`,
      data: (customers ?? []).map(c => ({ id: c.id, name: c.companyName, phone: c.phone, gstNumber: c.gstNumber, billingAddress: c.billingAddress })),
    }
  },

  get_suppliers: async (p) => {
    const limit = Math.min(Number(p.limit) || 20, 50)
    let query = supabase.from('Supplier').select('*').order('name', { ascending: true }).limit(limit)
    if (p.search) query = query.ilike('name', `%${p.search}%`)
    const { data: suppliers, error } = await query
    if (error) throw error
    return {
      success: true, count: suppliers?.length ?? 0,
      summary: `${suppliers?.length ?? 0} suppliers found`,
      data: (suppliers ?? []).map(s => ({ id: s.id, name: s.name, phone: s.phone, paymentTerms: s.paymentTerms, rating: s.rating, status: s.status })),
    }
  },

  get_dispatches: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Dispatch').select('*').order('dispatchDate', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: dispatches, error } = await query
    if (error) throw error
    return {
      success: true, count: dispatches?.length ?? 0,
      summary: `${dispatches?.length ?? 0} dispatches found`,
      data: (dispatches ?? []).map(d => ({ dispatchNo: d.dispatchNo, date: d.dispatchDate, status: d.status, totalQty: d.totalDispatchedQty, vehicleNo: d.vehicleNo, transporter: d.transporter })),
    }
  },

  get_purchase_orders: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('PurchaseOrder').select('*, supplier:supplierId(name)').order('createdAt', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: pos, error } = await query
    if (error) throw error
    return {
      success: true, count: pos?.length ?? 0,
      summary: `${pos?.length ?? 0} purchase orders found`,
      data: (pos ?? []).map(po => ({ poNumber: po.poNumber, fabricName: po.fabricName, supplier: po.supplier?.name, qty: po.quantity, unitRate: po.ratePerUnit, amount: po.totalAmount, status: po.status, expectedDelivery: po.expectedDelivery })),
    }
  },

  get_transactions: async (p) => {
    const limit = Math.min(Number(p.limit) || 15, 50)
    let query = supabase.from('Transaction').select('*').order('date', { ascending: false }).limit(limit)
    if (p.type) query = query.eq('type', p.type as string)
    if (p.category) query = query.eq('category', p.category as string)
    const { data: txns, error } = await query
    if (error) throw error

    // Aggregate total amount (equivalent to aggregate _sum)
    let sumQuery = supabase.from('Transaction').select('amount')
    if (p.type) sumQuery = sumQuery.eq('type', p.type as string)
    if (p.category) sumQuery = sumQuery.eq('category', p.category as string)
    const { data: allTxns } = await sumQuery
    const totalAmount = (allTxns ?? []).reduce((s, t) => s + (t.amount || 0), 0)

    return {
      success: true, count: txns?.length ?? 0,
      summary: `${txns?.length ?? 0} transactions, total ${fmt(totalAmount)}`,
      data: (txns ?? []).map(t => ({ date: t.date, type: t.type, category: t.category, amount: t.amount, description: t.description, reference: t.referenceNo })),
    }
  },

  get_daily_summary: async () => {
    // Use LIVE data from actual DB records, NOT stale snapshots
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(startOfDay.getTime() + 86400000)
    const todayStr = startOfDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

    const startISO = startOfDay.toISOString()
    const endISO = endOfDay.toISOString()

    // Parallel queries for today's real data
    const [
      todayTxnsRes, pendingOrdersRes, inProductionOrdersRes, activeJobsRes,
      completedJobsTodayRes, latestSnapshotRes, totalOrdersRes, totalEmployeesRes,
    ] = await Promise.all([
      supabase.from('Transaction').select('*').gte('date', startISO).lt('date', endISO),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Confirmed']),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'In Production'),
      supabase.from('ProductionJob').select('*', { count: 'exact', head: true }).eq('status', 'In Progress'),
      supabase.from('ProductionJob').select('*', { count: 'exact', head: true }).eq('status', 'Completed').gte('updatedAt', startISO).lt('updatedAt', endISO),
      supabase.from('DailySnapshot').select('*').order('date', { ascending: false }).limit(1).single(),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }),
      supabase.from('Employee').select('*', { count: 'exact', head: true }),
    ])

    const todayTxns = todayTxnsRes.data ?? []
    const pendingOrders = pendingOrdersRes.count ?? 0
    const inProductionOrders = inProductionOrdersRes.count ?? 0
    const activeJobs = activeJobsRes.count ?? 0
    const completedJobsToday = completedJobsTodayRes.count ?? 0
    const latestSnapshot = latestSnapshotRes.data ?? null
    const totalOrders = totalOrdersRes.count ?? 0
    const totalEmployees = totalEmployeesRes.count ?? 0

    // Calculate TODAY's revenue & expenses from real transactions
    const todayRevenue = todayTxns.filter(t => t.type === 'Credit').reduce((s, t) => s + t.amount, 0)
    const todayExpenses = todayTxns.filter(t => t.type === 'Debit').reduce((s, t) => s + t.amount, 0)
    const todayProfit = todayRevenue - todayExpenses

    // Snapshot data for balances (these are running totals, not daily)
    const snapshotDate = latestSnapshot?.date ? new Date(latestSnapshot.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'

    return {
      success: true, count: todayTxns.length,
      summary: `Today's (${todayStr}) live data: Revenue ${fmt(todayRevenue)}, Expenses ${fmt(todayExpenses)}, ${todayTxns.length} transactions`,
      data: {
        _meta: {
          type: 'LIVE_DATA',
          date: todayStr,
          note: `Ye aaj ka REAL data hai database se calculate kiya gaya, koi snapshot nahi. Balance data ${snapshotDate} ka latest snapshot se liya gaya hai.`,
        },
        today: {
          revenue: todayRevenue,
          expenses: todayExpenses,
          profit: todayProfit,
          transactionCount: todayTxns.length,
        },
        balances: {
          cashBalance: latestSnapshot?.cashBalance || 0,
          receivables: latestSnapshot?.receivables || 0,
          payables: latestSnapshot?.payables || 0,
          inventoryValue: latestSnapshot?.inventoryValue || 0,
          _snapshotDate: snapshotDate,
        },
        orders: {
          pending: pendingOrders,
          inProduction: inProductionOrders,
          total: totalOrders,
        },
        production: {
          activeJobs: activeJobs,
          completedToday: completedJobsToday,
          totalEmployees: totalEmployees,
        },
      },
    }
  },

  get_overdue_orders: async (p) => {
    const today = new Date()
    const limit = Math.min(Number(p.limit) || 10, 50)
    const { data: overdue, error } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName, phone)')
      .in('status', ['Pending', 'Confirmed', 'In Production'])
      .lt('deliveryDate', today.toISOString())
      .order('deliveryDate', { ascending: true })
      .limit(limit)
    if (error) throw error
    return {
      success: true, count: overdue?.length ?? 0,
      summary: overdue && overdue.length > 0 ? `${overdue.length} overdue orders found` : 'Koi overdue order nahi hai! Sab timely hain.',
      data: (overdue ?? []).map(o => {
        const daysLate = Math.max(0, Math.floor((today.getTime() - (o.deliveryDate ? new Date(o.deliveryDate).getTime() : today.getTime())) / 86400000))
        return { orderNo: o.orderNo, customer: o.customer?.companyName, amount: o.totalAmount, deliveryDate: o.deliveryDate, daysLate, status: o.status }
      }),
    }
  },

  get_quotations: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Quotation').select('*, customer:customerId(companyName)').order('createdAt', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: quotes, error } = await query
    if (error) throw error
    return {
      success: true, count: quotes?.length ?? 0,
      summary: `${quotes?.length ?? 0} quotations found`,
      data: (quotes ?? []).map(q => ({ quoteNo: q.quotationNo, customer: q.customer?.companyName, amount: q.totalAmount, status: q.status, validUntil: q.validUntil, createdAt: q.createdAt })),
    }
  },

  get_employees: async (p) => {
    let query = supabase.from('Employee').select('*').order('name', { ascending: true }).limit(30)
    if (p.department) query = query.eq('department', p.department as string)
    const { data: emps, error } = await query
    if (error) throw error

    // JS filter for OR search
    let filtered = emps ?? []
    if (p.search) {
      const s = String(p.search).toLowerCase()
      filtered = filtered.filter(e =>
        (e.name && e.name.toLowerCase().includes(s)) ||
        (e.employeeCode && e.employeeCode.toLowerCase().includes(s))
      )
    }
    return {
      success: true, count: filtered.length,
      summary: `${filtered.length} employees found`,
      data: filtered.map(e => ({ id: e.id, name: e.name, designation: e.designation, department: e.department, phone: e.phone, dailyWage: e.dailyWage, salary: e.salary })),
    }
  },

  get_grn_notes: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    const { data: grns, error } = await supabase.from('GrnNote').select('*').order('createdAt', { ascending: false }).limit(limit)
    if (error) throw error
    return {
      success: true, count: grns?.length ?? 0,
      summary: `${grns?.length ?? 0} GRN notes found`,
      data: (grns ?? []).map(g => ({ grnNo: g.grnNo, supplier: g.supplierName, fabric: g.fabricName, totalQty: g.totalReceivedQty, status: g.status, date: g.receivedDate })),
    }
  },

  get_samples: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Sample').select('*, customer:customerId(companyName)').order('createdAt', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: samples, error } = await query
    if (error) throw error
    return {
      success: true, count: samples?.length ?? 0,
      summary: `${samples?.length ?? 0} samples found`,
      data: (samples ?? []).map(s => ({ sampleNo: s.sampleNo, styleName: s.styleName, customer: s.customer?.companyName, status: s.status, stage: s.stage })),
    }
  },

  get_quality_checks: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    const { data: qcs, error } = await supabase.from('QualityCheck')
      .select('*, productionJob:productionJobId(jobNo, styleName)')
      .order('createdAt', { ascending: false }).limit(limit)
    if (error) throw error
    return {
      success: true, count: qcs?.length ?? 0,
      summary: `${qcs?.length ?? 0} quality check records found`,
      data: (qcs ?? []).map(q => ({ id: q.id, jobNo: q.productionJob?.jobNo, point: q.inspectionPoint, checkedQty: q.checkedQty, passedQty: q.passedQty, failedQty: q.failedQty, defectType: q.defectType, status: q.status, inspector: q.inspectorName, date: q.checkedAt })),
    }
  },

  get_returns: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Return').select('*').order('createdAt', { ascending: false }).limit(limit)
    if (p.status) query = query.eq('status', p.status as string)
    const { data: returns, error } = await query
    if (error) throw error
    return {
      success: true, count: returns?.length ?? 0,
      summary: `${returns?.length ?? 0} returns found`,
      data: (returns ?? []).map(r => ({ returnNo: r.returnNo, referenceNo: r.referenceNo, party: r.partyName, reason: r.reason, quantity: r.totalQty, status: r.status })),
    }
  },

  search_all: async (p) => {
    const q = (p.query as string || '').trim()
    if (!q) return { success: false, data: null, summary: 'Search query is required.' }
    const [ordersRes, fabricsRes, costSheetsRes, customersRes] = await Promise.all([
      supabase.from('SalesOrder').select('*, customer:customerId(companyName)').limit(5),
      supabase.from('FabricStock').select('*').ilike('fabricName', `%${q}%`).limit(5),
      supabase.from('CostSheet').select('*').limit(5),
      supabase.from('Customer').select('*').ilike('companyName', `%${q}%`).limit(5),
    ])

    // JS filter for OR search across relations for orders
    const orders = (ordersRes.data ?? []).filter(o =>
      (o.orderNo && o.orderNo.toLowerCase().includes(q.toLowerCase())) ||
      (o.customer?.companyName && o.customer.companyName.toLowerCase().includes(q.toLowerCase()))
    )
    const fabrics = fabricsRes.data ?? []
    const costSheets = (costSheetsRes.data ?? []).filter(c =>
      (c.styleNo && c.styleNo.toLowerCase().includes(q.toLowerCase())) ||
      (c.styleName && c.styleName.toLowerCase().includes(q.toLowerCase()))
    )
    const customers = customersRes.data ?? []

    return {
      success: true,
      summary: `Found: ${orders.length} orders, ${fabrics.length} fabrics, ${costSheets.length} cost sheets, ${customers.length} customers`,
      data: {
        orders: orders.map(o => ({ orderNo: o.orderNo, customer: o.customer?.companyName, amount: o.totalAmount, status: o.status })),
        fabrics: fabrics.map(f => ({ name: f.fabricName, available: f.availableMeters, avgCost: f.averageCost })),
        costSheets: costSheets.map(c => ({ sheetNo: c.sheetNo, style: c.styleName, cost: c.totalCost, status: c.status })),
        customers: customers.map(c => ({ name: c.companyName, city: c.city })),
      },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WRITE TOOLS — These CREATE records directly in the database
  // ═══════════════════════════════════════════════════════════════════════

  // ── WRITE: Create Cost Sheet ───────────────────────────────────────
  create_cost_sheet: async (p) => {
    const styleNo = String(p.styleNo || '').trim()
    const styleName = String(p.styleName || '').trim()
    const targetQty = toNum(p.targetQty, 100)
    const profitPercent = toNum(p.profitPercent, 30)
    const brokerCommissionPercent = toNum(p.brokerCommissionPercent, 0)
    const rawItems = Array.isArray(p.items) ? p.items : []
    const rawColors = Array.isArray(p.colors) ? p.colors : []

    if (!styleNo || !styleName) return { success: false, data: null, summary: 'styleNo and styleName are required.' }
    if (rawItems.length === 0) return { success: false, data: null, summary: 'At least one cost item is required.' }

    // Generate sheet number
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const prefix = `CS-${y}${m}${d}-`
    const { data: lastRes } = await supabase.from('CostSheet').select('sheetNo').like('sheetNo', `${prefix}%`).order('sheetNo', { ascending: false }).limit(1)
    const last = lastRes?.[0]
    const nextNum = last ? parseInt(last.sheetNo.slice(prefix.length), 10) + 1 : 1
    const sheetNo = `${prefix}${String(nextNum).padStart(3, '0')}`

    // Calculate costs from items — use toNum for robust parsing
    // Accept both standard field names and common aliases (rate/unitRate, name/itemName)
    const costItemsData = rawItems.map((item: Record<string, unknown>) => {
      const consumption = toNum(item.consumption, 1)
      const unitRate = toNum(item.unitRate || item.rate, 0)  // "rate" alias
      const wastage = toNum(item.wastagePercent || item.wastage, 0)
      const itemCost = consumption * unitRate * (1 + wastage / 100)
      const itemName = String(item.itemName || item.name || '')  // "name" alias
      // Auto-detect category from item name if not provided
      let category = String(item.category || '')
      if (!category && itemName) {
        const n = itemName.toLowerCase()
        if (n.includes('fabric') || n.includes('cloth') || n.includes('main')) category = 'Fabric'
        else if (n.includes('embroid') || n.includes('stitch') || n.includes('cut to pack') || n.includes('cutting') || n.includes('factory') || n.includes('labor') || n.includes('cmt')) category = 'Labor'
        else if (n.includes('trim') || n.includes('button') || n.includes('zip') || n.includes('label') || n.includes('thread') || n.includes('tag')) category = 'Trims'
        else if (n.includes('wash') || n.includes('dye')) category = 'Wash'
        else if (n.includes('overhead') || n.includes('transport') || n.includes('packing')) category = 'Overhead'
        else category = 'Other'
      }
      return {
        category,
        itemName,
        description: item.description ? String(item.description) : null,
        consumption,
        unit: String(item.unit || 'pcs'),
        unitRate,
        wastagePercent: wastage,
        itemCost: Math.round(itemCost * 100) / 100,
      }
    })

    const totalCost = costItemsData.reduce((sum: number, i: { itemCost: number }) => sum + i.itemCost, 0)
    const sellingPrice = Math.round(totalCost * (1 + profitPercent / 100) * 100) / 100
    const brokerCommissionAmount = Math.round(sellingPrice * (brokerCommissionPercent / 100) * 100) / 100

    // Map category costs to legacy fields for reporting
    const catMap: Record<string, number> = { fabricCost: 0, trimCost: 0, laborCost: 0, washCost: 0, packagingCost: 0, overheadCost: 0, otherCost: 0 }
    for (const ci of costItemsData) {
      const cat = (ci.category || '').toLowerCase()
      let key = 'otherCost'
      if (cat.includes('fabric') || cat.includes('lining')) key = 'fabricCost'
      else if (cat.includes('trim') || cat.includes('accessor') || cat.includes('label') || cat.includes('tag') || cat.includes('button') || cat.includes('zip')) key = 'trimCost'
      else if (cat.includes('embroid') || cat.includes('stitch') || cat.includes('cutting') || cat.includes('labor') || cat.includes('finishing') || cat.includes('iron') || cat.includes('print') || cat.includes('factory') || cat.includes('cut to pack')) key = 'laborCost'
      else if (cat.includes('dye') || cat.includes('wash')) key = 'washCost'
      else if (cat.includes('overhead') || cat.includes('transport') || cat.includes('logistic')) key = 'overheadCost'
      catMap[key] += ci.itemCost
    }

    const colorsData = rawColors.map((c: Record<string, unknown> | string) => {
      // Handle both formats: {color: "Red", quantity: 100} and just "Red"
      if (typeof c === 'string') {
        return { color: c, quantity: Math.floor(targetQty / Math.max(rawColors.length, 1)) }
      }
      return {
        color: String(c.color || c.name || ''),
        quantity: toNum(c.quantity, Math.floor(targetQty / Math.max(rawColors.length, 1))),
      }
    })

    // Create cost sheet, then costItems, then colors sequentially
    const sheetData: Record<string, any> = {
      sheetNo, styleNo, styleName,
      targetQty,
      fabricCost: catMap.fabricCost, trimCost: catMap.trimCost,
      laborCost: catMap.laborCost, washCost: catMap.washCost,
      packagingCost: catMap.packagingCost, overheadCost: catMap.overheadCost,
      otherCost: catMap.otherCost,
      totalCost: Math.round(totalCost * 100) / 100,
      profitPercent, sellingPrice,
      brokerCommissionPercent, brokerCommissionAmount,
      status: 'Draft',
    }
    const { data: sheet, error: sheetErr } = await supabase.from('CostSheet').insert(sheetData).select().single()
    if (sheetErr) throw sheetErr

    // Create cost items
    const costItemsWithSheetId = costItemsData.map(ci => ({ ...ci, costSheetId: sheet.id }))
    const { error: itemsErr } = await supabase.from('CostItem').insert(costItemsWithSheetId)
    if (itemsErr) throw itemsErr

    // Create colors
    if (colorsData.length > 0) {
      const colorsWithSheetId = colorsData.map(c => ({ ...c, costSheetId: sheet.id }))
      const { error: colorsErr } = await supabase.from('CostSheetColor').insert(colorsWithSheetId)
      if (colorsErr) throw colorsErr
    }

    const netProfitPerPc = sellingPrice - brokerCommissionAmount - totalCost
    const brokerPerPc = brokerCommissionAmount

    return {
      success: true, count: 1,
      summary: `Cost Sheet ${sheet.sheetNo} created successfully! ${sheet.styleName} — ${costItemsData.length} items, ${colorsData.length} colors, ${fmt(sheet.totalCost)}/pc cost, ${fmt(sheet.sellingPrice)}/pc selling, ${fmt(brokerPerPc)}/pc broker, ${fmt(netProfitPerPc)}/pc net profit`,
      data: {
        sheetNo: sheet.sheetNo, styleNo: sheet.styleNo, styleName: sheet.styleName,
        targetQty: sheet.targetQty, totalCost: sheet.totalCost, sellingPrice: sheet.sellingPrice,
        profitPercent: sheet.profitPercent, brokerCommissionPercent: sheet.brokerCommissionPercent,
        brokerCommissionAmount: sheet.brokerCommissionAmount,
        netProfitPerPc: Math.round(netProfitPerPc * 100) / 100,
        totalOrderValue: Math.round(sellingPrice * targetQty * 100) / 100,
        totalProfit: Math.round(netProfitPerPc * targetQty * 100) / 100,
        totalBroker: Math.round(brokerPerPc * targetQty * 100) / 100,
        items: costItemsData.map(i => ({ category: i.category, name: i.itemName, consumption: i.consumption, unit: i.unit, rate: i.unitRate, waste: i.wastagePercent, cost: i.itemCost })),
        colors: colorsData.map(c => ({ color: c.color, qty: c.quantity })),
      },
    }
  },

  // ── WRITE: Create Quotation ─────────────────────────────────────────
  create_quotation: async (p) => {
    const customerName = (p.customerName as string || '').trim()
    const validDays = Number(p.validDays) || 30
    const gstType = (p.gstType as string) || 'IntraState'
    const gstPercent = Number(p.gstPercent) || 18
    const rawItems = Array.isArray(p.items) ? p.items : []
    const notes = (p.notes as string) || null

    if (!customerName) return { success: false, data: null, summary: 'customerName is required.' }
    if (rawItems.length === 0) return { success: false, data: null, summary: 'At least one quotation item is required.' }

    // Find customer by name
    const { data: customer, error: custErr } = await supabase.from('Customer').select('*').ilike('companyName', `%${customerName}%`).limit(1).single()
    if (custErr || !customer) {
      return { success: false, data: null, summary: `Customer "${customerName}" not found in database. Please use get_customers tool to find the exact name.` }
    }

    // Generate quotation number
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86400000)
    const { count: todayCount } = await supabase.from('Quotation').select('*', { count: 'exact', head: true }).gte('quotationDate', todayStart.toISOString()).lt('quotationDate', todayEnd.toISOString())
    const quotationNo = `QT-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    // Calculate items
    const quotationItems = rawItems.map((item: Record<string, unknown>) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      const cost = Number(item.unitCost) || 0
      return {
        styleName: String(item.styleName || ''),
        quantity: qty,
        unitPrice: price,
        unitCost: cost,
        totalAmount: Math.round(qty * price * 100) / 100,
        totalCost: Math.round(qty * cost * 100) / 100,
        profit: Math.round(qty * (price - cost) * 100) / 100,
      }
    })

    const taxableAmount = quotationItems.reduce((sum: number, i: { totalAmount: number }) => sum + i.totalAmount, 0)
    const totalCost = quotationItems.reduce((sum: number, i: { totalCost: number }) => sum + i.totalCost, 0)
    const gstAmount = Math.round(taxableAmount * gstPercent / 100 * 100) / 100
    const cgstAmount = gstType === 'IntraState' ? Math.round(gstAmount / 2 * 100) / 100 : 0
    const sgstAmount = gstType === 'IntraState' ? Math.round(gstAmount / 2 * 100) / 100 : 0
    const igstAmount = gstType === 'InterState' ? gstAmount : 0
    const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + validDays)

    // Create quotation, then items
    const quotationData: Record<string, any> = {
      quotationNo, customerId: customer.id,
      quotationDate: new Date(),
      validUntil, status: 'Draft',
      gstType, gstPercent,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      cgstAmount, sgstAmount, igstAmount,
      totalGst: gstAmount,
      totalAmount, totalCost,
      notes,
    }
    const { data: quotation, error: quotErr } = await supabase.from('Quotation').insert(quotationData).select('*, customer:customerId(companyName)').single()
    if (quotErr) throw quotErr

    // Create quotation items
    const itemsWithQuotationId = quotationItems.map(i => ({ ...i, quotationId: quotation.id }))
    const { error: itemsErr } = await supabase.from('QuotationItem').insert(itemsWithQuotationId)
    if (itemsErr) throw itemsErr

    return {
      success: true, count: 1,
      summary: `Quotation ${quotation.quotationNo} created for ${customer.companyName}! Total: ${fmt(quotation.totalAmount)} (incl. ${fmt(gstAmount)} GST), Valid until: ${validUntil.toLocaleDateString('en-IN')}`,
      data: {
        quotationNo: quotation.quotationNo, customer: customer.companyName,
        totalAmount: quotation.totalAmount, totalCost: quotation.totalCost,
        taxableAmount: quotation.taxableAmount, gstAmount: quotation.totalGst,
        cgst: quotation.cgstAmount, sgst: quotation.sgstAmount, igst: quotation.igstAmount,
        items: quotationItems.map(i => ({ style: i.styleName, qty: i.quantity, price: i.unitPrice, cost: i.unitCost, total: i.totalAmount })),
        validUntil: quotation.validUntil,
      },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NEW WRITE EXECUTORS
  // ═══════════════════════════════════════════════════════════════════════

  // ── WRITE: Create Sales Order ──────────────────────────────────────
  create_order: async (p) => {
    const customerName = (p.customerName as string || '').trim()
    if (!customerName) return { success: false, data: null, summary: 'customerName is required.' }

    const { data: customer, error: custErr } = await supabase.from('Customer').select('*').ilike('companyName', `%${customerName}%`).limit(1).single()
    if (custErr || !customer) return { success: false, data: null, summary: `Customer "${customerName}" not found in database. Use get_customers to find the exact name.` }

    const rawItems = Array.isArray(p.items) ? p.items : []
    if (rawItems.length === 0) return { success: false, data: null, summary: 'At least one order item is required.' }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).gte('orderDate', start.toISOString()).lt('orderDate', end.toISOString())
    const orderNo = `SO-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const gstType = (p.gstType as string) || 'IntraState'
    const gstPercent = Number(p.gstPercent) || 18
    const discountPercent = Number(p.discountPercent) || 0
    const brokerName = (p.brokerName as string) || null
    const commissionPercent = Number(p.commissionPercent) || 0
    const notes = (p.notes as string) || null

    const orderItemsData = rawItems.map((item: Record<string, unknown>) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      const cost = Number(item.unitCost) || 0
      const colors = Array.isArray(item.colorBreakdown)
        ? (item.colorBreakdown as Record<string, unknown>[]).map((c: Record<string, unknown>) => ({
            color: String(c.color || ''),
            quantity: Number(c.quantity) || 0,
          }))
        : []
      return {
        styleName: String(item.styleName || ''),
        quantity: qty,
        unitPrice: price,
        unitCost: cost,
        totalAmount: Math.round(qty * price * 100) / 100,
        totalCost: Math.round(qty * cost * 100) / 100,
        profit: Math.round(qty * (price - cost) * 100) / 100,
        colorBreakdown: colors,
      }
    })

    const taxableAmount = orderItemsData.reduce((s: number, i: { totalAmount: number }) => s + i.totalAmount, 0)
    const totalCost = orderItemsData.reduce((s: number, i: { totalCost: number }) => s + i.totalCost, 0)
    const discount = Math.round(taxableAmount * discountPercent / 100 * 100) / 100
    const gstBase = taxableAmount - discount
    const { gstAmount, cgstAmount, sgstAmount, igstAmount } = calcGst(gstBase, gstType, gstPercent)
    const totalAmount = Math.round((gstBase + gstAmount) * 100) / 100
    const grossProfit = Math.round((totalAmount - totalCost) * 100) / 100
    const grossMargin = totalAmount > 0 ? Math.round(grossProfit / totalAmount * 10000) / 100 : 0
    const commissionAmount = Math.round(totalAmount * commissionPercent / 100 * 100) / 100
    const netAmount = Math.round((totalAmount - commissionAmount) * 100) / 100
    const netProfit = Math.round((grossProfit - commissionAmount) * 100) / 100
    const netMargin = netAmount > 0 ? Math.round(netProfit / netAmount * 10000) / 100 : 0

    // Create order
    const orderData: Record<string, any> = {
      orderNo, customerId: customer.id, orderDate: new Date(),
      gstType, gstPercent, discountPercent,
      taxableAmount: Math.round(gstBase * 100) / 100,
      cgstAmount, sgstAmount, igstAmount, totalGst: gstAmount,
      totalAmount, totalCost, grossProfit, grossMargin,
      brokerName, commissionPercent, commissionAmount,
      netAmount, netProfit, netMargin,
      notes,
    }
    const { data: order, error: orderErr } = await supabase.from('SalesOrder').insert(orderData).select('*, customer:customerId(companyName)').single()
    if (orderErr) throw orderErr

    // Create order items and their color breakdowns
    for (const item of orderItemsData) {
      const { data: orderItem, error: itemErr } = await supabase.from('OrderItem').insert({ ...item, salesOrderId: order.id }).select().single()
      if (itemErr) throw itemErr

      if (item.colorBreakdown && item.colorBreakdown.length > 0) {
        const colorsWithItemId = item.colorBreakdown.map((c: any) => ({ ...c, orderItemId: orderItem.id }))
        const { error: colorsErr } = await supabase.from('OrderItemColor').insert(colorsWithItemId)
        if (colorsErr) throw colorsErr
      }
    }

    console.log(`[create_order] ${orderNo} created for ${customer.companyName}, ${rawItems.length} items, ${fmt(totalAmount)}`)

    return {
      success: true, count: 1,
      summary: `Order ${order.orderNo} created for ${customer.companyName}, ${rawItems.length} items, total ${fmt(totalAmount)}`,
      data: {
        orderNo: order.orderNo, customer: customer.companyName,
        taxableAmount: gstBase, totalGst: gstAmount, discount, totalAmount,
        totalCost, grossProfit, grossMargin,
        commissionAmount, netAmount, netProfit, netMargin,
        items: orderItemsData.map(i => ({
          styleName: i.styleName, qty: i.quantity, price: i.unitPrice,
          total: i.totalAmount, colors: i.colorBreakdown.map(c => ({ color: c.color, qty: c.quantity })),
        })),
      },
    }
  },

  // ── WRITE: Create Sample ───────────────────────────────────────────
  create_sample: async (p) => {
    const styleNo = (p.styleNo as string || '').trim()
    const styleName = (p.styleName as string || '').trim()
    if (!styleNo || !styleName) return { success: false, data: null, summary: 'styleNo and styleName are required.' }

    let customerId: string | undefined
    if (p.customerName) {
      const { data: customer } = await supabase.from('Customer').select('id').ilike('companyName', `%${String(p.customerName)}%`).limit(1).single()
      if (customer) customerId = customer.id
    }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('Sample').select('*', { count: 'exact', head: true }).gte('createdAt', start.toISOString()).lt('createdAt', end.toISOString())
    const sampleNo = `SMP-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const { data: sample, error } = await supabase.from('Sample').insert({
      sampleNo, customerId,
      styleNo, styleName,
      stage: (p.stage as string) || 'Design',
      status: (p.status as string) || 'In Progress',
      assignedTo: (p.assignedTo as string) || null,
      cost: Number(p.cost) || 0,
      notes: (p.notes as string) || null,
    }).select('*, customer:customerId(companyName)').single()
    if (error) throw error

    console.log(`[create_sample] ${sampleNo} created for ${styleName}`)

    return {
      success: true, count: 1,
      summary: `Sample ${sample.sampleNo} created — ${styleName}, stage: ${sample.stage}, status: ${sample.status}`,
      data: { sampleNo: sample.sampleNo, styleNo, styleName, stage: sample.stage, status: sample.status, customer: sample.customer?.companyName, cost: sample.cost },
    }
  },

  // ── WRITE: Create Production Job ───────────────────────────────────
  create_production_job: async (p) => {
    const styleNo = (p.styleNo as string || '').trim()
    const styleName = (p.styleName as string || '').trim()
    const targetQty = Number(p.targetQty) || 0
    if (!styleNo || !styleName || !targetQty) return { success: false, data: null, summary: 'styleNo, styleName, and targetQty are required.' }

    let salesOrderId: string | undefined
    if (p.salesOrderNo) {
      const { data: order, error: orderErr } = await supabase.from('SalesOrder').select('id').eq('orderNo', String(p.salesOrderNo)).limit(1).single()
      if (orderErr || !order) return { success: false, data: null, summary: `Sales order "${p.salesOrderNo}" not found.` }
      salesOrderId = order.id
    }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('ProductionJob').select('*', { count: 'exact', head: true }).gte('startDate', start.toISOString()).lt('startDate', end.toISOString())
    const jobNo = `PJ-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const { data: job, error } = await supabase.from('ProductionJob').insert({
      jobNo, salesOrderId,
      styleNo, styleName, targetQty,
      stage: (p.stage as string) || 'Fabric Issue',
      fabricStockId: (p.fabricStockId as string) || null,
      startDate: new Date(),
    }).select().single()
    if (error) throw error

    console.log(`[create_production_job] ${jobNo} created for ${styleName}, target: ${targetQty}`)

    return {
      success: true, count: 1,
      summary: `Production Job ${job.jobNo} created — ${styleName}, target: ${targetQty} pcs, stage: ${job.stage}`,
      data: { jobNo: job.jobNo, styleNo, styleName, targetQty, stage: job.stage, status: job.status, salesOrderNo: p.salesOrderNo || null },
    }
  },

  // ── WRITE: Create Dispatch ─────────────────────────────────────────
  create_dispatch: async (p) => {
    const salesOrderNo = (p.salesOrderNo as string || '').trim()
    if (!salesOrderNo) return { success: false, data: null, summary: 'salesOrderNo is required.' }

    const { data: order, error: orderErr } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(*), items:OrderItem(*), dispatches:Dispatch(*)')
      .eq('orderNo', salesOrderNo).limit(1).single()
    if (orderErr || !order) return { success: false, data: null, summary: `Order "${salesOrderNo}" not found.` }

    const rawItems = Array.isArray(p.items) ? p.items : []
    if (rawItems.length === 0) return { success: false, data: null, summary: 'At least one dispatch item is required.' }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('Dispatch').select('*', { count: 'exact', head: true }).gte('dispatchDate', start.toISOString()).lt('dispatchDate', end.toISOString())
    const dispatchNo = `DP-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const dispatchItems = rawItems.map((item: Record<string, unknown>) => ({
      styleNo: String(item.styleNo || ''),
      styleName: String(item.styleName || ''),
      orderedQty: Number(item.orderedQty) || 0,
      dispatchedQty: Number(item.dispatchedQty) || 0,
    }))

    const totalDispatchedQty = dispatchItems.reduce((s: number, i: { dispatchedQty: number }) => s + i.dispatchedQty, 0)

    // Create dispatch
    const { data: dispatch, error: dispatchErr } = await supabase.from('Dispatch').insert({
      dispatchNo,
      salesOrderId: order.id,
      customerId: order.customerId,
      status: 'Packed',
      totalDispatchedQty,
      trackingNo: (p.trackingNo as string) || null,
      transporter: (p.transporter as string) || null,
      vehicleNo: (p.vehicleNo as string) || null,
      shippingAddress: (p.shippingAddress as string) || (order.customer as any)?.shippingAddress || null,
      notes: (p.notes as string) || null,
      dispatchDate: new Date(),
    }).select().single()
    if (dispatchErr) throw dispatchErr

    // Create dispatch items
    const dispatchItemsWithId = dispatchItems.map(i => ({ ...i, dispatchId: dispatch.id }))
    const { error: diErr } = await supabase.from('DispatchItem').insert(dispatchItemsWithId)
    if (diErr) throw diErr

    // Check if fully dispatched — sum all dispatches for this order
    const { data: allDispatches } = await supabase.from('Dispatch').select('*, dispatchItems:DispatchItem(dispatchedQty)').eq('salesOrderId', order.id)
    const totalOrdered = (order.items ?? []).reduce((s: number, i: any) => s + i.quantity, 0)
    const totalDispatched = (allDispatches ?? []).reduce((s: number, d: any) =>
      s + (d.dispatchItems ?? []).reduce((ds: number, di: any) => ds + di.dispatchedQty, 0), 0)

    if (totalDispatched >= totalOrdered && order.status !== 'Dispatched' && order.status !== 'Delivered') {
      await supabase.from('SalesOrder').update({ status: 'Dispatched' }).eq('id', order.id)
      console.log(`[create_dispatch] Order ${salesOrderNo} fully dispatched, status updated to Dispatched`)
    }

    console.log(`[create_dispatch] ${dispatchNo} created for ${salesOrderNo}, ${totalDispatchedQty} pcs`)

    return {
      success: true, count: 1,
      summary: `Dispatch ${dispatchNo} created for ${(order.customer as any)?.companyName}, ${totalDispatchedQty} pcs dispatched${totalDispatched >= totalOrdered ? ' — Order fully dispatched!' : ''}`,
      data: { dispatchNo, salesOrderNo, customer: (order.customer as any)?.companyName, totalDispatchedQty, status: dispatch.status, items: dispatchItems },
    }
  },

  // ── WRITE: Create Purchase Order ───────────────────────────────────
  create_purchase_order: async (p) => {
    const supplierName = (p.supplierName as string || '').trim()
    const fabricName = (p.fabricName as string || '').trim()
    const quantity = Number(p.quantity) || 0
    const ratePerUnit = Number(p.ratePerUnit) || 0
    if (!supplierName || !fabricName || !quantity || !ratePerUnit) return { success: false, data: null, summary: 'supplierName, fabricName, quantity, and ratePerUnit are required.' }

    const { data: supplier, error: supErr } = await supabase.from('Supplier').select('*').ilike('name', `%${supplierName}%`).limit(1).single()
    if (supErr || !supplier) return { success: false, data: null, summary: `Supplier "${supplierName}" not found. Use get_suppliers to find the exact name.` }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('PurchaseOrder').select('*', { count: 'exact', head: true }).gte('createdAt', start.toISOString()).lt('createdAt', end.toISOString())
    const poNumber = `PO-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const gstType = (p.gstType as string) || 'IntraState'
    const gstPercent = Number(p.gstPercent) || 18
    const unit = (p.unit as string) || 'meters'
    const taxableAmount = Math.round(quantity * ratePerUnit * 100) / 100
    const { gstAmount, cgstAmount, sgstAmount, igstAmount } = calcGst(taxableAmount, gstType, gstPercent)
    const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100

    const { data: po, error } = await supabase.from('PurchaseOrder').insert({
      poNumber, supplierId: supplier.id,
      fabricName, quantity, unit, ratePerUnit,
      gstType, gstPercent,
      taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst: gstAmount, totalAmount,
      expectedDelivery: p.expectedDelivery ? new Date(String(p.expectedDelivery)) : null,
    }).select('*, supplier:supplierId(name)').single()
    if (error) throw error

    console.log(`[create_purchase_order] ${poNumber} created for ${fabricName}, ${fmt(totalAmount)}`)

    return {
      success: true, count: 1,
      summary: `Purchase Order ${po.poNumber} created for ${fabricName} from ${supplier.name}, ${quantity} ${unit} × ${fmt(ratePerUnit)} = ${fmt(totalAmount)}`,
      data: { poNumber: po.poNumber, supplier: supplier.name, fabricName, quantity, unit, ratePerUnit, taxableAmount, totalGst: gstAmount, totalAmount, gstType, gstPercent },
    }
  },

  // ── WRITE: Create Transaction ──────────────────────────────────────
  create_transaction: async (p) => {
    const type = (p.type as string || '').trim()
    const category = (p.category as string || '').trim()
    const amount = Number(p.amount) || 0
    const description = (p.description as string || '').trim()
    if (!type || !category || !amount || !description) return { success: false, data: null, summary: 'type, category, amount, and description are required.' }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('Transaction').select('*', { count: 'exact', head: true }).gte('date', start.toISOString()).lt('date', end.toISOString())
    const displayId = `TXN-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const { data: txn, error } = await supabase.from('Transaction').insert({
      type, category, amount, description,
      referenceNo: `${displayId}${p.referenceNo ? ' / ' + String(p.referenceNo) : ''}`,
      date: p.date ? new Date(String(p.date)) : new Date(),
    }).select().single()
    if (error) throw error

    console.log(`[create_transaction] ${displayId} created — ${type} ${category} ${fmt(amount)}`)

    return {
      success: true, count: 1,
      summary: `Transaction ${displayId} recorded — ${type}: ${category}, ${fmt(amount)}`,
      data: { displayId, type, category, amount, description, referenceNo: txn.referenceNo, date: txn.date },
    }
  },

  // ── WRITE: Create Quality Check ────────────────────────────────────
  create_quality_check: async (p) => {
    const jobNo = (p.jobNo as string || '').trim()
    const inspectionPoint = (p.inspectionPoint as string || '').trim()
    if (!jobNo || !inspectionPoint) return { success: false, data: null, summary: 'jobNo and inspectionPoint are required.' }

    const { data: job, error: jobErr } = await supabase.from('ProductionJob').select('id, styleName').eq('jobNo', jobNo).limit(1).single()
    if (jobErr || !job) return { success: false, data: null, summary: `Production job "${jobNo}" not found.` }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('QualityCheck').select('*', { count: 'exact', head: true }).gte('checkedAt', start.toISOString()).lt('checkedAt', end.toISOString())
    const checkNo = `QC-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const checkedQty = Number(p.checkedQty) || 0
    const passedQty = Number(p.passedQty) || 0
    const failedQty = Number(p.failedQty) || 0

    const { data: qc, error } = await supabase.from('QualityCheck').insert({
      checkNo, productionJobId: job.id,
      inspectionPoint, checkedQty, passedQty, failedQty,
      defectType: (p.defectType as string) || null,
      defectCount: Number(p.defectCount) || 0,
      severity: (p.severity as string) || 'Minor',
      status: (p.status as string) || 'Pass',
      inspectorName: (p.inspectorName as string) || null,
      notes: (p.notes as string) || null,
      checkedAt: new Date(),
    }).select().single()
    if (error) throw error

    console.log(`[create_quality_check] ${checkNo} created — ${inspectionPoint}, ${checkedQty} checked, ${passedQty} passed`)

    return {
      success: true, count: 1,
      summary: `Quality Check ${checkNo} created — ${inspectionPoint} for ${job.styleName}, ${checkedQty} checked, ${passedQty} passed, ${failedQty} failed`,
      data: { checkNo, jobNo, inspectionPoint, checkedQty, passedQty, failedQty, defectType: qc.defectType, defectCount: qc.defectCount, severity: qc.severity, status: qc.status },
    }
  },

  // ── WRITE: Create Return ───────────────────────────────────────────
  create_return: async (p) => {
    const returnType = (p.returnType as string || '').trim()
    const referenceNo = (p.referenceNo as string || '').trim()
    const partyName = (p.partyName as string || '').trim()
    const reason = (p.reason as string || '').trim()
    if (!returnType || !referenceNo || !partyName || !reason) return { success: false, data: null, summary: 'returnType, referenceNo, partyName, and reason are required.' }

    const rawItems = Array.isArray(p.items) ? p.items : []
    if (rawItems.length === 0) return { success: false, data: null, summary: 'At least one return item is required.' }

    // Resolve referenceId from referenceNo
    let referenceId = ''
    if (returnType === 'Customer') {
      const { data: order, error } = await supabase.from('SalesOrder').select('id').eq('orderNo', referenceNo).limit(1).single()
      if (error || !order) return { success: false, data: null, summary: `Sales order "${referenceNo}" not found for customer return.` }
      referenceId = order.id
    } else {
      const { data: po } = await supabase.from('PurchaseOrder').select('id').eq('poNumber', referenceNo).limit(1).single()
      if (!po) {
        const { data: bill } = await supabase.from('VendorBill').select('id').eq('billNo', referenceNo).limit(1).single()
        if (bill) referenceId = bill.id
      } else {
        referenceId = po.id
      }
      if (!referenceId) return { success: false, data: null, summary: `Could not find PO or Vendor Bill "${referenceNo}" for supplier return.` }
    }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('Return').select('*', { count: 'exact', head: true }).gte('createdAt', start.toISOString()).lt('createdAt', end.toISOString())
    const returnNo = `RTN-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const returnItems = rawItems.map((item: Record<string, unknown>) => ({
      itemName: String(item.itemName || ''),
      styleNo: (item.styleNo as string) || null,
      quantity: Number(item.quantity) || 0,
      unitValue: Number(item.unitValue) || 0,
      totalValue: Math.round((Number(item.quantity) || 0) * (Number(item.unitValue) || 0) * 100) / 100,
      reason: (item.reason as string) || null,
    }))

    const totalQty = returnItems.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0)
    const totalValue = returnItems.reduce((s: number, i: { totalValue: number }) => s + i.totalValue, 0)

    // Create return, then items
    const { data: ret, error: retErr } = await supabase.from('Return').insert({
      returnNo, returnType,
      referenceId, referenceNo,
      partyName, reason,
      totalQty, totalValue,
      refundAmount: totalValue,
      notes: (p.notes as string) || null,
    }).select().single()
    if (retErr) throw retErr

    // Create return items
    const returnItemsWithId = returnItems.map(i => ({ ...i, returnId: ret.id }))
    const { error: riErr } = await supabase.from('ReturnItem').insert(returnItemsWithId)
    if (riErr) throw riErr

    console.log(`[create_return] ${returnNo} created — ${returnType} return from ${partyName}, ${totalQty} items, ${fmt(totalValue)}`)

    return {
      success: true, count: 1,
      summary: `Return ${returnNo} created — ${returnType} return from ${partyName}, ${totalQty} pcs, value ${fmt(totalValue)}`,
      data: { returnNo, returnType, referenceNo, partyName, reason, totalQty, totalValue, refundAmount: totalValue, items: returnItems },
    }
  },

  // ── WRITE: Create GRN ──────────────────────────────────────────────
  create_grn: async (p) => {
    const supplierName = (p.supplierName as string || '').trim()
    if (!supplierName) return { success: false, data: null, summary: 'supplierName is required.' }

    const { data: supplier, error: supErr } = await supabase.from('Supplier').select('*').ilike('name', `%${supplierName}%`).limit(1).single()
    if (supErr || !supplier) return { success: false, data: null, summary: `Supplier "${supplierName}" not found. Use get_suppliers to find the exact name.` }

    const rawItems = Array.isArray(p.items) ? p.items : []
    if (rawItems.length === 0) return { success: false, data: null, summary: 'At least one GRN item is required.' }

    let poId: string | undefined
    let purchaseOrder: { id: string; receivedQty: number; quantity: number } | null = null
    if (p.poNumber) {
      const { data: po } = await supabase.from('PurchaseOrder').select('id, receivedQty, quantity').eq('poNumber', String(p.poNumber)).limit(1).single()
      if (po) {
        purchaseOrder = po
        poId = po.id
      }
    }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('GrnNote').select('*', { count: 'exact', head: true }).gte('receivedDate', start.toISOString()).lt('receivedDate', end.toISOString())
    const grnNo = `GRN-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const grnItems = rawItems.map((item: Record<string, unknown>) => {
      const accepted = Number(item.acceptedQty) || 0
      const rate = Number(item.ratePerUnit) || 0
      return {
        fabricName: String(item.fabricName || ''),
        orderedQty: Number(item.orderedQty) || 0,
        receivedQty: Number(item.receivedQty) || 0,
        acceptedQty: accepted,
        rejectedQty: Number(item.rejectedQty) || 0,
        defectNotes: (item.defectNotes as string) || null,
        ratePerUnit: rate,
        totalValue: Math.round(accepted * rate * 100) / 100,
      }
    })

    const totalReceivedQty = grnItems.reduce((s: number, i: { receivedQty: number }) => s + i.receivedQty, 0)
    const acceptedQty = grnItems.reduce((s: number, i: { acceptedQty: number }) => s + i.acceptedQty, 0)
    const rejectedQty = grnItems.reduce((s: number, i: { rejectedQty: number }) => s + i.rejectedQty, 0)

    // Sequential operations (equivalent to $transaction)
    // 1. Create GRN note
    const { data: note, error: noteErr } = await supabase.from('GrnNote').insert({
      grnNo, poId, supplierId: supplier.id,
      supplierName: supplier.name,
      totalReceivedQty, acceptedQty, rejectedQty,
      notes: (p.notes as string) || null,
      receivedDate: new Date(),
    }).select('*, grnItems:GrnItem(*)').single()
    if (noteErr) throw noteErr

    // 2. Create GRN items
    const grnItemsWithId = grnItems.map(i => ({ ...i, grnId: note.id }))
    const { error: giErr } = await supabase.from('GrnItem').insert(grnItemsWithId)
    if (giErr) throw giErr

    // 3. Update FabricStock for each item
    for (const item of grnItems) {
      const { data: stock } = await supabase.from('FabricStock').select('id, fabricName, availableMeters, averageCost').ilike('fabricName', `%${item.fabricName}%`).limit(1).single()
      if (stock) {
        const newMeters = Math.round((stock.availableMeters + item.acceptedQty) * 100) / 100
        const newTotalValue = Math.round(newMeters * stock.averageCost * 100) / 100
        await supabase.from('FabricStock').update({ availableMeters: newMeters, totalValue: newTotalValue }).eq('id', stock.id)
        console.log(`[create_grn] Updated stock ${stock.fabricName}: +${item.acceptedQty}m = ${newMeters}m`)
      }
    }

    // 4. Update PurchaseOrder receivedQty
    if (purchaseOrder) {
      const newReceivedQty = Math.round((purchaseOrder.receivedQty + acceptedQty) * 100) / 100
      await supabase.from('PurchaseOrder').update({ receivedQty: newReceivedQty }).eq('id', purchaseOrder.id)
      console.log(`[create_grn] Updated PO ${String(p.poNumber)} receivedQty: ${newReceivedQty}/${purchaseOrder.quantity}`)
    }

    console.log(`[create_grn] ${grnNo} created from ${supplier.name}, ${totalReceivedQty}m received, ${acceptedQty}m accepted`)

    return {
      success: true, count: 1,
      summary: `GRN ${grnNo} created from ${supplier.name}, ${totalReceivedQty}m received, ${acceptedQty}m accepted, ${rejectedQty}m rejected`,
      data: { grnNo, supplier: supplier.name, poNumber: p.poNumber || null, totalReceivedQty, acceptedQty, rejectedQty, items: grnItems },
    }
  },

  // ── WRITE: Create Vendor Bill ──────────────────────────────────────
  create_vendor_bill: async (p) => {
    const vendorName = (p.vendorName as string || '').trim()
    const description = (p.description as string || '').trim()
    const totalQty = Number(p.totalQty) || 0
    const perPieceRate = Number(p.perPieceRate) || 0
    if (!vendorName || !description || !totalQty || !perPieceRate) return { success: false, data: null, summary: 'vendorName, description, totalQty, and perPieceRate are required.' }

    const { data: vendor, error: venErr } = await supabase.from('Vendor').select('*').ilike('vendorName', `%${vendorName}%`).limit(1).single()
    if (venErr || !vendor) return { success: false, data: null, summary: `Vendor "${vendorName}" not found in database.` }

    const { start, end, dateStr } = todayRange()
    const { count: todayCount } = await supabase.from('VendorBill').select('*', { count: 'exact', head: true }).gte('billDate', start.toISOString()).lt('billDate', end.toISOString())
    const billNo = `VB-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    const gstType = (p.gstType as string) || 'IntraState'
    const gstPercent = Number(p.gstPercent) || 18
    const taxableAmount = Math.round(totalQty * perPieceRate * 100) / 100
    const { gstAmount, cgstAmount, sgstAmount, igstAmount } = calcGst(taxableAmount, gstType, gstPercent)
    const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100

    const { data: bill, error } = await supabase.from('VendorBill').insert({
      billNo, vendorId: vendor.id,
      description, totalQty, perPieceRate,
      gstType, gstPercent,
      taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst: gstAmount, totalAmount,
      billDate: new Date(),
      dueDate: p.dueDate ? new Date(String(p.dueDate)) : null,
      notes: (p.notes as string) || null,
    }).select().single()
    if (error) throw error

    console.log(`[create_vendor_bill] ${billNo} created for ${vendor.vendorName}, ${fmt(totalAmount)}`)

    return {
      success: true, count: 1,
      summary: `Vendor Bill ${billNo} created for ${vendor.vendorName} — ${description}, ${fmt(totalAmount)} (incl. GST)`,
      data: { billNo, vendor: vendor.vendorName, description, totalQty, perPieceRate, taxableAmount, totalGst: gstAmount, totalAmount, dueDate: bill.dueDate },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // UPDATE EXECUTORS
  // ═══════════════════════════════════════════════════════════════════════

  // ── UPDATE: Order Status ───────────────────────────────────────────
  update_order_status: async (p) => {
    const orderNo = (p.orderNo as string || '').trim()
    const status = (p.status as string || '').trim()
    if (!orderNo || !status) return { success: false, data: null, summary: 'orderNo and status are required.' }

    const { data: order, error: findErr } = await supabase.from('SalesOrder').select('*').eq('orderNo', orderNo).limit(1).single()
    if (findErr || !order) return { success: false, data: null, summary: `Order "${orderNo}" not found.` }

    const data: Record<string, unknown> = { status }
    if (p.paymentStatus) data.paymentStatus = p.paymentStatus
    if (p.notes) data.notes = String(p.notes)

    const { data: updated, error } = await supabase.from('SalesOrder').update(data).eq('id', order.id).select().single()
    if (error) throw error
    console.log(`[update_order_status] ${orderNo}: ${order.status} → ${status}`)

    return {
      success: true, count: 1,
      summary: `Order ${orderNo} status updated to "${status}"${p.paymentStatus ? `, payment: ${p.paymentStatus}` : ''}`,
      data: { orderNo, previousStatus: order.status, newStatus: status, paymentStatus: updated.paymentStatus },
    }
  },

  // ── UPDATE: Production Status ──────────────────────────────────────
  update_production_status: async (p) => {
    const jobNo = (p.jobNo as string || '').trim()
    const status = (p.status as string || '').trim()
    if (!jobNo || !status) return { success: false, data: null, summary: 'jobNo and status are required.' }

    const { data: job, error: findErr } = await supabase.from('ProductionJob').select('*').eq('jobNo', jobNo).limit(1).single()
    if (findErr || !job) return { success: false, data: null, summary: `Production job "${jobNo}" not found.` }

    const data: Record<string, unknown> = { status }
    if (p.stage) data.stage = p.stage
    if (p.completedQty !== undefined && p.completedQty !== null) data.completedQty = Number(p.completedQty)
    if (status === 'Completed' && p.completedQty === undefined) data.completedQty = job.targetQty
    if (status === 'Completed') data.endDate = new Date().toISOString()

    const { data: updated, error } = await supabase.from('ProductionJob').update(data).eq('id', job.id).select().single()
    if (error) throw error
    console.log(`[update_production_status] ${jobNo}: ${job.status} → ${status}`)

    return {
      success: true, count: 1,
      summary: `Production Job ${jobNo} updated — status: ${status}, completed: ${updated.completedQty}/${updated.targetQty}`,
      data: { jobNo, previousStatus: job.status, newStatus: status, stage: updated.stage, completedQty: updated.completedQty, targetQty: updated.targetQty },
    }
  },

  // ── UPDATE: Dispatch Status ────────────────────────────────────────
  update_dispatch_status: async (p) => {
    const dispatchNo = (p.dispatchNo as string || '').trim()
    const status = (p.status as string || '').trim()
    if (!dispatchNo || !status) return { success: false, data: null, summary: 'dispatchNo and status are required.' }

    const { data: dispatch, error: findErr } = await supabase.from('Dispatch').select('*').eq('dispatchNo', dispatchNo).limit(1).single()
    if (findErr || !dispatch) return { success: false, data: null, summary: `Dispatch "${dispatchNo}" not found.` }

    const data: Record<string, unknown> = { status }
    if (p.trackingNo) data.trackingNo = String(p.trackingNo)

    const { data: updated, error } = await supabase.from('Dispatch').update(data).eq('id', dispatch.id).select().single()
    if (error) throw error
    console.log(`[update_dispatch_status] ${dispatchNo}: ${dispatch.status} → ${status}`)

    return {
      success: true, count: 1,
      summary: `Dispatch ${dispatchNo} status updated to "${status}"`,
      data: { dispatchNo, previousStatus: dispatch.status, newStatus: status, trackingNo: updated.trackingNo },
    }
  },

  // ── UPDATE: Cost Sheet ─────────────────────────────────────────────
  update_cost_sheet: async (p) => {
    const sheetNo = (p.sheetNo as string || '').trim()
    if (!sheetNo) return { success: false, data: null, summary: 'sheetNo is required.' }

    const { data: sheet, error: findErr } = await supabase.from('CostSheet').select('*').eq('sheetNo', sheetNo).limit(1).single()
    if (findErr || !sheet) return { success: false, data: null, summary: `Cost sheet "${sheetNo}" not found.` }

    const data: Record<string, unknown> = {}
    let needsRecalc = false

    if (p.status) data.status = p.status
    if (p.notes) data.notes = String(p.notes)

    let profitPercent = sheet.profitPercent
    let brokerCommissionPercent = sheet.brokerCommissionPercent

    if (p.profitPercent !== undefined && p.profitPercent !== null) {
      profitPercent = Number(p.profitPercent)
      data.profitPercent = profitPercent
      needsRecalc = true
    }
    if (p.brokerCommissionPercent !== undefined && p.brokerCommissionPercent !== null) {
      brokerCommissionPercent = Number(p.brokerCommissionPercent)
      data.brokerCommissionPercent = brokerCommissionPercent
      needsRecalc = true
    }

    if (needsRecalc) {
      const sellingPrice = Math.round(sheet.totalCost * (1 + profitPercent / 100) * 100) / 100
      const brokerCommissionAmount = Math.round(sellingPrice * (brokerCommissionPercent / 100) * 100) / 100
      data.sellingPrice = sellingPrice
      data.brokerCommissionAmount = brokerCommissionAmount
    }

    const { data: updated, error } = await supabase.from('CostSheet').update(data).eq('id', sheet.id).select().single()
    if (error) throw error
    console.log(`[update_cost_sheet] ${sheetNo} updated`)

    return {
      success: true, count: 1,
      summary: `Cost Sheet ${sheetNo} updated — status: ${updated.status}, selling price: ${fmt(updated.sellingPrice)}/pc, broker: ${updated.brokerCommissionPercent}%`,
      data: { sheetNo, status: updated.status, totalCost: updated.totalCost, sellingPrice: updated.sellingPrice, profitPercent: updated.profitPercent, brokerCommissionPercent: updated.brokerCommissionPercent, brokerCommissionAmount: updated.brokerCommissionAmount },
    }
  },

  // ── UPDATE: Quotation Status ───────────────────────────────────────
  update_quotation_status: async (p) => {
    const quotationNo = (p.quotationNo as string || '').trim()
    const status = (p.status as string || '').trim()
    if (!quotationNo || !status) return { success: false, data: null, summary: 'quotationNo and status are required.' }

    const { data: quotation, error: findErr } = await supabase.from('Quotation').select('*').eq('quotationNo', quotationNo).limit(1).single()
    if (findErr || !quotation) return { success: false, data: null, summary: `Quotation "${quotationNo}" not found.` }

    const data: Record<string, unknown> = { status }
    if (p.notes) data.notes = String(p.notes)

    const { data: updated, error } = await supabase.from('Quotation').update(data).eq('id', quotation.id).select().single()
    if (error) throw error
    console.log(`[update_quotation_status] ${quotationNo}: ${quotation.status} → ${status}`)

    return {
      success: true, count: 1,
      summary: `Quotation ${quotationNo} status updated to "${status}"`,
      data: { quotationNo, previousStatus: quotation.status, newStatus: status, amount: updated.totalAmount },
    }
  },

  // ── UPDATE: Sample Status ──────────────────────────────────────────
  update_sample_status: async (p) => {
    const sampleNo = (p.sampleNo as string || '').trim()
    const status = (p.status as string || '').trim()
    if (!sampleNo || !status) return { success: false, data: null, summary: 'sampleNo and status are required.' }

    const { data: sample, error: findErr } = await supabase.from('Sample').select('*').eq('sampleNo', sampleNo).limit(1).single()
    if (findErr || !sample) return { success: false, data: null, summary: `Sample "${sampleNo}" not found.` }

    const data: Record<string, unknown> = { status }
    if (p.stage) data.stage = p.stage
    if (status === 'Approved') data.approvedDate = new Date().toISOString()
    if (status === 'Submitted') data.submissionDate = new Date().toISOString()

    const { data: updated, error } = await supabase.from('Sample').update(data).eq('id', sample.id).select().single()
    if (error) throw error
    console.log(`[update_sample_status] ${sampleNo}: ${sample.status} → ${status}`)

    return {
      success: true, count: 1,
      summary: `Sample ${sampleNo} updated — status: ${status}, stage: ${updated.stage}`,
      data: { sampleNo, previousStatus: sample.status, newStatus: status, stage: updated.stage, styleName: updated.styleName },
    }
  },

  // ── UPDATE: Stock ──────────────────────────────────────────────────
  update_stock: async (p) => {
    const fabricStockId = (p.fabricStockId as string || '').trim()
    const adjustment = Number(p.adjustment) || 0
    if (!fabricStockId || !adjustment) return { success: false, data: null, summary: 'fabricStockId and adjustment are required.' }

    const { data: stock, error: findErr } = await supabase.from('FabricStock').select('*').eq('id', fabricStockId).limit(1).single()
    if (findErr || !stock) return { success: false, data: null, summary: `Fabric stock "${fabricStockId}" not found.` }

    const newMeters = Math.round((stock.availableMeters + adjustment) * 100) / 100
    if (newMeters < 0) return { success: false, data: null, summary: `Adjustment would make stock negative (${newMeters}m). Current: ${stock.availableMeters}m.` }

    const newTotalValue = Math.round(newMeters * stock.averageCost * 100) / 100
    const { data: updated, error } = await supabase.from('FabricStock').update({ availableMeters: newMeters, totalValue: newTotalValue }).eq('id', fabricStockId).select().single()
    if (error) throw error

    const reason = (p.reason as string) || 'Manual adjustment'
    console.log(`[update_stock] ${stock.fabricName}: ${stock.availableMeters}m → ${newMeters}m (${adjustment > 0 ? '+' : ''}${adjustment}m), reason: ${reason}`)

    return {
      success: true, count: 1,
      summary: `Stock updated: ${stock.fabricName} ${stock.availableMeters}m → ${newMeters}m (${adjustment > 0 ? '+' : ''}${adjustment}m), value: ${fmt(newTotalValue)}`,
      data: { fabricStockId, fabricName: stock.fabricName, previousMeters: stock.availableMeters, newMeters, adjustment, totalValue: newTotalValue, averageCost: stock.averageCost, reason },
    }
  },

  // ── UPDATE: Payment Status ─────────────────────────────────────────
  update_payment_status: async (p) => {
    const referenceType = (p.referenceType as string || '').trim()
    const referenceNo = (p.referenceNo as string || '').trim()
    const amount = Number(p.amount) || 0
    if (!referenceType || !referenceNo || !amount) return { success: false, data: null, summary: 'referenceType, referenceNo, and amount are required.' }

    if (referenceType === 'SalesOrder') {
      const { data: order, error: findErr } = await supabase.from('SalesOrder').select('*').eq('orderNo', referenceNo).limit(1).single()
      if (findErr || !order) return { success: false, data: null, summary: `Order "${referenceNo}" not found.` }

      const newPaidAmount = Math.round((order.paidAmount + amount) * 100) / 100
      let paymentStatus = 'Unpaid'
      if (newPaidAmount >= order.totalAmount) paymentStatus = 'Paid'
      else if (newPaidAmount > 0) paymentStatus = 'Partial'

      const { data: updated, error } = await supabase.from('SalesOrder').update({ paidAmount: newPaidAmount, paymentStatus }).eq('id', order.id).select().single()
      if (error) throw error

      console.log(`[update_payment_status] Order ${referenceNo}: paid ${fmt(amount)}, total paid: ${fmt(newPaidAmount)}/${fmt(order.totalAmount)}, status: ${paymentStatus}`)

      return {
        success: true, count: 1,
        summary: `Payment of ${fmt(amount)} recorded on Order ${referenceNo}. Total paid: ${fmt(newPaidAmount)}/${fmt(order.totalAmount)} (${paymentStatus})`,
        data: { referenceType, referenceNo, amountPaid: amount, totalPaid: newPaidAmount, totalAmount: order.totalAmount, paymentStatus, balance: Math.round((order.totalAmount - newPaidAmount) * 100) / 100 },
      }
    }

    if (referenceType === 'VendorBill') {
      const { data: bill, error: findErr } = await supabase.from('VendorBill').select('*').eq('billNo', referenceNo).limit(1).single()
      if (findErr || !bill) return { success: false, data: null, summary: `Vendor Bill "${referenceNo}" not found.` }

      const newPaidAmount = Math.round((bill.paidAmount + amount) * 100) / 100
      let status = 'Pending'
      if (newPaidAmount >= bill.totalAmount) status = 'Paid'
      else if (newPaidAmount > 0) status = 'Partially Paid'

      const { data: updated, error } = await supabase.from('VendorBill').update({ paidAmount: newPaidAmount, status }).eq('id', bill.id).select().single()
      if (error) throw error

      console.log(`[update_payment_status] VendorBill ${referenceNo}: paid ${fmt(amount)}, total paid: ${fmt(newPaidAmount)}/${fmt(bill.totalAmount)}, status: ${status}`)

      return {
        success: true, count: 1,
        summary: `Payment of ${fmt(amount)} recorded on Vendor Bill ${referenceNo}. Total paid: ${fmt(newPaidAmount)}/${fmt(bill.totalAmount)} (${status})`,
        data: { referenceType, referenceNo, amountPaid: amount, totalPaid: newPaidAmount, totalAmount: bill.totalAmount, status, balance: Math.round((bill.totalAmount - newPaidAmount) * 100) / 100 },
      }
    }

    return { success: false, data: null, summary: `Invalid referenceType "${referenceType}". Must be SalesOrder or VendorBill.` }
  },
}

// ─── Execute Tool ─────────────────────────────────────────────────────────────

export async function executeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[name]
  if (!executor) return { success: false, data: null, summary: `Tool "${name}" does not exist. Available tools: ${Object.keys(TOOL_EXECUTORS).join(', ')}` }

  try {
    const result = await executor(params)
    return result
  } catch (error) {
    return { success: false, data: null, summary: `Error running tool "${name}": ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
