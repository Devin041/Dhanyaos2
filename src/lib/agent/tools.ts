import { supabase } from '@/lib/supabase-db'
import { parseDateInput, istToday, istTodayEnd, istNow, istDayName, istMonthName, istYesterday, timeAgo } from './date-utils'
import { resultCache, hashParams } from './cache'
import { isWriteTool } from './tool-schemas'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>
}

export interface ToolResult {
  success: boolean
  data: unknown
  summary: string
  count?: number
}

type ToolExecutor = (params: Record<string, unknown>) => Promise<ToolResult>

// ─── Helper ──────────────────────────────────────────────────────────────────

export const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

// ─── Tool Definitions (24 tools: 20 READ + 2 WRITE + 2 UTILITY) ─────────────

export const TOOLS: ToolDef[] = [
  {
    name: 'get_orders',
    description: 'Get sales orders with optional filters. Returns order number, customer, amount, status, delivery date, payment status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Pending', 'Confirmed', 'In Production', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'] },
      paymentStatus: { type: 'string', description: 'Filter by payment status', enum: ['Unpaid', 'Partial', 'Paid'] },
      customerId: { type: 'string', description: 'Filter by customer ID' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max orders to return (default 10, max 50)' },
      search: { type: 'string', description: 'Search by order number or customer name' },
    },
  },
  {
    name: 'get_order_detail',
    description: 'Get full detail of a single sales order by order number. Includes items, production jobs, dispatches.',
    parameters: {
      orderNo: { type: 'string', description: 'Order number like SO-20260704-001', required: true },
    },
  },
  {
    name: 'get_inventory',
    description: 'Get fabric stock list. Shows fabric name, available meters, reserved meters, average cost, total value.',
    parameters: {
      lowStockOnly: { type: 'boolean', description: 'Only show fabrics with <=100m available' },
      search: { type: 'string', description: 'Search by fabric name' },
      limit: { type: 'number', description: 'Max fabrics to return (default 20)' },
    },
  },
  {
    name: 'get_cost_sheets',
    description: 'Get cost sheets with style name, total cost, selling price, margin, status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Draft', 'Approved', 'Active', 'Archived'] },
      search: { type: 'string', description: 'Search by style name or sheet number' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max sheets to return (default 10)' },
    },
  },
  {
    name: 'get_cost_sheet_detail',
    description: 'Get full cost sheet detail with all cost items and color breakdown by sheet number.',
    parameters: {
      sheetNo: { type: 'string', description: 'Sheet number like CS-20260711-002', required: true },
    },
  },
  {
    name: 'get_production_jobs',
    description: 'Get production jobs with style, target qty, completed qty, progress %, stage, status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'] },
      salesOrderId: { type: 'string', description: 'Filter by sales order ID' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max jobs to return (default 15)' },
    },
  },
  {
    name: 'get_customers',
    description: 'Get customer list with company name, phone, city, GST number. Use this to find customer IDs for quotation creation.',
    parameters: {
      search: { type: 'string', description: 'Search by company name' },
      limit: { type: 'number', description: 'Max customers (default 20)' },
    },
  },
  {
    name: 'get_suppliers',
    description: 'Get supplier list with name, fabric types, contact info.',
    parameters: {
      search: { type: 'string', description: 'Search by supplier name' },
      limit: { type: 'number', description: 'Max suppliers (default 20)' },
    },
  },
  {
    name: 'get_dispatches',
    description: 'Get dispatch records with dispatch number, date, status, quantities.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Pending', 'Packed', 'Shipped', 'Delivered'] },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max dispatches (default 10)' },
    },
  },
  {
    name: 'get_purchase_orders',
    description: 'Get purchase orders with PO number, fabric, supplier, quantity, amount, status, expected delivery.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Pending', 'Approved', 'Ordered', 'Received', 'Cancelled'] },
      supplierId: { type: 'string', description: 'Filter by supplier ID' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max POs (default 10)' },
    },
  },
  {
    name: 'get_transactions',
    description: 'Get financial transactions with date, type, category, amount, description.',
    parameters: {
      type: { type: 'string', description: 'Filter by type', enum: ['Income', 'Expense', 'Transfer'] },
      category: { type: 'string', description: 'Filter by category' },
      referenceNo: { type: 'string', description: 'Filter by reference number' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max transactions (default 15)' },
    },
  },
  {
    name: 'get_daily_summary',
    description: 'Get business snapshot for a date — cash balance, revenue, expenses, profit, receivables, payables, orders count, production qty. Uses live data from all tables.',
    parameters: {
      date: { type: 'string', description: 'Date for summary (YYYY-MM-DD or: today, yesterday). Default: today' },
    },
  },
  {
    name: 'get_overdue_orders',
    description: 'Get overdue/delayed orders — orders past their delivery date. Returns days late, customer, amount.',
    parameters: {
      limit: { type: 'number', description: 'Max orders (default 10)' },
    },
  },
  {
    name: 'get_quotations',
    description: 'Get quotation list with quote number, customer, amount, status, validity.',
    parameters: {
      status: { type: 'string', description: 'Filter by status' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max quotations (default 10)' },
    },
  },
  {
    name: 'get_employees',
    description: 'Get employee/worker list with name, role, department, phone.',
    parameters: {
      department: { type: 'string', description: 'Filter by department' },
      search: { type: 'string', description: 'Search by name' },
    },
  },
  {
    name: 'get_grn_notes',
    description: 'Get Goods Received Notes with GRN number, supplier, fabric, quantity received, date.',
    parameters: {
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max GRNs (default 10)' },
    },
  },
  {
    name: 'get_samples',
    description: 'Get sample/trial records with sample number, style, customer, status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max samples (default 10)' },
    },
  },
  {
    name: 'get_quality_checks',
    description: 'Get quality check records with style, date, result, defects found.',
    parameters: {
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max records (default 10)' },
    },
  },
  {
    name: 'get_returns',
    description: 'Get return records with return number, order, customer, reason, quantity, status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status' },
      fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or: today, yesterday, last_7_days, this_week, this_month)' },
      toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Max returns (default 10)' },
    },
  },
  {
    name: 'search_all',
    description: 'Cross-module search — searches across all tables (orders, customers, suppliers, fabrics, cost sheets, transactions, quotations, samples, jobs, dispatches, employees, GRNs, quality checks, returns, vendors). Use when unsure where data lives.',
    parameters: {
      query: { type: 'string', description: 'Search keyword', required: true },
    },
  },
  // ── UTILITY TOOLS ────────────────────────────────────────────────────
  {
    name: 'get_date_context',
    description: 'Get current date context in IST — today, yesterday, this week/month start, day name. Use this to resolve "aaj", "kal", "is mahine" etc.',
    parameters: {},
  },
  {
    name: 'get_system_info',
    description: 'Get system health — record counts per table, last activity dates, data freshness. Use when user asks about data quality or "kitna data hai".',
    parameters: {},
  },
  // ── WRITE TOOLS ──────────────────────────────────────────────────────
  {
    name: 'create_cost_sheet',
    description: 'DIRECTLY CREATE a cost sheet in the database with all items and colors. Calculates totalCost, sellingPrice, brokerCommission automatically. Returns the created sheet number and details. Use this when user says "cost sheet banao", "costing add karo", "save karo" etc.',
    parameters: {
      styleNo: { type: 'string', description: 'Style number e.g. DH-07', required: true },
      styleName: { type: 'string', description: 'Style name e.g. Pleating Kurti', required: true },
      targetQty: { type: 'number', description: 'Total quantity e.g. 400', required: true },
      profitPercent: { type: 'number', description: 'Profit margin percent e.g. 30' },
      brokerCommissionPercent: { type: 'number', description: 'Broker commission percent e.g. 5' },
      items: { type: 'array', description: 'Array of cost items. Each item: {category: string, itemName: string, consumption: number, unit: string, unitRate: number, wastagePercent: number}', required: true },
      colors: { type: 'array', description: 'Array of {color: string, quantity: number}. Quantities should sum to targetQty.', required: true },
    },
  },
  {
    name: 'create_quotation',
    description: 'DIRECTLY CREATE a quotation in the database for a customer. Calculates GST, totals automatically. Returns the quotation number. Use this when user says "quotation banao", "quote do", "quotation add karo" etc.',
    parameters: {
      customerName: { type: 'string', description: 'Customer company name to search in database', required: true },
      validDays: { type: 'number', description: 'Validity in days from today e.g. 30' },
      gstType: { type: 'string', description: 'GST type: IntraState or InterState' },
      gstPercent: { type: 'number', description: 'GST percent e.g. 18' },
      items: { type: 'array', description: 'Array of {styleName: string, quantity: number, unitPrice: number, unitCost: number}', required: true },
      notes: { type: 'string', description: 'Notes for the quotation' },
    },
  },
]

// ─── Tool Executor Registry ──────────────────────────────────────────────────

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  get_orders: async (p) => {
    let query = supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName, phone)')
      .order('orderDate', { ascending: false })
      .limit(Math.min(Number(p.limit) || 10, 50))

    if (p.status) query = query.eq('status', p.status)
    if (p.paymentStatus) query = query.eq('paymentStatus', p.paymentStatus)
    if (p.customerId) query = query.eq('customerId', p.customerId)
    if (p.search) query = query.or(`orderNo.ilike.%${p.search}%,customer.companyName.ilike.%${p.search}%`)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('orderDate', startDate.toISOString())
    if (endDate) query = query.lte('orderDate', endDate.toISOString())

    const { data: orders } = await query
    return {
      success: true,
      count: orders?.length ?? 0,
      summary: `${orders?.length ?? 0} orders found`,
      data: (orders ?? []).map((o: any) => ({
        orderNo: o.orderNo, customer: o.customer?.companyName,
        amount: o.totalAmount, cost: o.totalCost, profit: o.grossProfit, margin: o.grossMargin,
        status: o.status, paymentStatus: o.paymentStatus, paidAmount: o.paidAmount,
        orderDate: o.orderDate, deliveryDate: o.deliveryDate,
      })),
    }
  },

  get_order_detail: async (p) => {
    const { data: order } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName, phone, gstNumber), items:OrderItem(*), productionJobs:ProductionJob(*), dispatches:Dispatch(*)')
      .eq('orderNo', p.orderNo as string)
      .limit(1).single()

    if (!order) return { success: false, data: null, summary: `Order "${p.orderNo}" not found in database.` }
    const o = order as any
    return {
      success: true, count: 1,
      summary: `Order ${o.orderNo} — ${o.customer?.companyName}, ${fmt(o.totalAmount)}`,
      data: {
        orderNo: o.orderNo, customer: o.customer, status: o.status,
        amount: o.totalAmount, cost: o.totalCost, profit: o.grossProfit, margin: o.grossMargin,
        paymentStatus: o.paymentStatus, paidAmount: o.paidAmount, brokerName: o.brokerName,
        commissionPercent: o.commissionPercent, commissionAmount: o.commissionAmount,
        netAmount: o.netAmount, netProfit: o.netProfit, netMargin: o.netMargin,
        orderDate: o.orderDate, deliveryDate: o.deliveryDate,
        items: (o.items ?? []).map((i: any) => ({ styleName: i.styleName, qty: i.quantity, price: i.unitPrice, cost: i.unitCost })),
        productionJobs: (o.productionJobs ?? []).map((j: any) => ({ jobNo: j.jobNo, target: j.targetQty, completed: j.completedQty, status: j.status })),
        dispatches: (o.dispatches ?? []).map((d: any) => ({ dispatchNo: d.dispatchNo, date: d.dispatchDate, qty: d.totalDispatchedQty, status: d.status })),
      },
    }
  },

  get_inventory: async (p) => {
    let query = supabase.from('FabricStock')
      .select('*')
      .order('availableMeters', { ascending: true })
      .limit(Math.min(Number(p.limit) || 20, 50))

    if (p.lowStockOnly) query = query.lte('availableMeters', 100)
    if (p.search) query = query.ilike('fabricName', `%${p.search}%`)

    const [fabricsRes, allFabricsRes] = await Promise.all([
      query,
      supabase.from('FabricStock').select('totalValue, availableMeters, reservedMeters'),
    ])
    const fabrics = fabricsRes.data ?? []
    const allFabrics = allFabricsRes.data ?? []
    const totalValue = allFabrics.reduce((s, f) => s + (f.totalValue ?? 0), 0)
    const totalAvailable = allFabrics.reduce((s, f) => s + (f.availableMeters ?? 0), 0)
    const totalReserved = allFabrics.reduce((s, f) => s + (f.reservedMeters ?? 0), 0)

    return {
      success: true, count: fabrics.length,
      summary: `${fabrics.length} fabrics, total value ${fmt(totalValue)}, ${Math.round(totalAvailable)}m available`,
      data: fabrics.map((f: any) => ({
        fabricName: f.fabricName, available: f.availableMeters, reserved: f.reservedMeters,
        free: f.availableMeters - f.reservedMeters, avgCost: f.averageCost, value: f.totalValue,
        gsm: f.gsm, width: f.width,
      })),
    }
  },

  get_cost_sheets: async (p) => {
    let query = supabase.from('CostSheet')
      .select('*, customer:customerId(companyName), costItems:CostItem(id), colorBreakdown:CostSheetColor(id)')
      .order('createdAt', { ascending: false })
      .limit(Math.min(Number(p.limit) || 10, 50))

    if (p.status) query = query.eq('status', p.status)
    if (p.search) query = query.or(`styleNo.ilike.%${p.search}%,styleName.ilike.%${p.search}%,sheetNo.ilike.%${p.search}%`)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('createdAt', startDate.toISOString())
    if (endDate) query = query.lte('createdAt', endDate.toISOString())

    const { data: sheets } = await query
    return {
      success: true, count: sheets?.length ?? 0,
      summary: `${sheets?.length ?? 0} cost sheets found`,
      data: (sheets ?? []).map((s: any) => ({
        sheetNo: s.sheetNo, styleNo: s.styleNo, styleName: s.styleName,
        customer: s.customer?.companyName, status: s.status,
        totalCost: s.totalCost, sellingPrice: s.sellingPrice, margin: s.profitPercent,
        broker: s.brokerCommissionPercent, targetQty: s.targetQty,
        itemsCount: (s.costItems ?? []).length, colorsCount: (s.colorBreakdown ?? []).length,
        breakdown: { fabric: s.fabricCost, trim: s.trimCost, labor: s.laborCost, wash: s.washCost, packaging: s.packagingCost, overhead: s.overheadCost, other: s.otherCost },
      })),
    }
  },

  get_cost_sheet_detail: async (p) => {
    const { data: sheet } = await supabase.from('CostSheet')
      .select('*, customer:customerId(companyName), costItems:CostItem(*), colorBreakdown:CostSheetColor(*)')
      .eq('sheetNo', p.sheetNo as string)
      .limit(1).single()

    if (!sheet) return { success: false, data: null, summary: `Cost sheet "${p.sheetNo}" not found in database.` }
    const s = sheet as any
    const costItems = [...(s.costItems ?? [])].sort((a: any, b: any) => a.category.localeCompare(b.category))
    const colorBreakdown = [...(s.colorBreakdown ?? [])]
    return {
      success: true, count: 1,
      summary: `${s.sheetNo} — ${s.styleName}, ${fmt(s.totalCost)}/piece, ${costItems.length} items, ${colorBreakdown.length} colors`,
      data: {
        sheetNo: s.sheetNo, styleNo: s.styleNo, styleName: s.styleName,
        customer: s.customer?.companyName, status: s.status, sizeRange: s.sizeRange,
        targetQty: s.targetQty, totalCost: s.totalCost, sellingPrice: s.sellingPrice,
        margin: s.profitPercent, broker: s.brokerCommissionPercent,
        items: costItems.map((i: any) => ({ category: i.category, name: i.itemName, consumption: i.consumption, unit: i.unit, rate: i.unitRate, waste: i.wastagePercent, cost: i.itemCost })),
        colors: colorBreakdown.map((c: any) => ({ color: c.color, quantity: c.quantity })),
      },
    }
  },

  get_production_jobs: async (p) => {
    let query = supabase.from('ProductionJob')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(Math.min(Number(p.limit) || 15, 50))

    if (p.status) query = query.eq('status', p.status)
    if (p.salesOrderId) query = query.eq('salesOrderId', p.salesOrderId)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('startDate', startDate.toISOString())
    if (endDate) query = query.lte('startDate', endDate.toISOString())

    const [jobsRes, allJobsRes] = await Promise.all([
      query,
      supabase.from('ProductionJob').select('status, targetQty, completedQty'),
    ])
    const jobs = jobsRes.data ?? []
    const allJobs = allJobsRes.data ?? []

    // Manual groupBy
    const statusMap: Record<string, { count: number; target: number; completed: number }> = {}
    for (const j of allJobs) {
      const st = j.status ?? 'Unknown'
      if (!statusMap[st]) statusMap[st] = { count: 0, target: 0, completed: 0 }
      statusMap[st].count++
      statusMap[st].target += j.targetQty ?? 0
      statusMap[st].completed += j.completedQty ?? 0
    }
    const byStatus = Object.entries(statusMap).map(([status, s]) => ({ status, _count: s.count, _sum: { targetQty: s.target, completedQty: s.completed } }))

    return {
      success: true, count: jobs.length,
      summary: `${jobs.length} jobs found. Status: ${byStatus.map(s => `${s.status}=${s._count}`).join(', ')}`,
      data: {
        summary: byStatus.map(s => ({ status: s.status, count: s._count, target: s._sum.targetQty, completed: s._sum.completedQty })),
        jobs: jobs.map((j: any) => ({
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
    let query = supabase.from('Customer')
      .select('*')
      .order('companyName', { ascending: true })
      .limit(Math.min(Number(p.limit) || 20, 50))

    if (p.search) query = query.ilike('companyName', `%${p.search}%`)

    const { data: customers } = await query
    return {
      success: true, count: customers?.length ?? 0,
      summary: `${customers?.length ?? 0} customers found`,
      data: (customers ?? []).map(c => ({ id: c.id, name: c.companyName, phone: c.phone, gstNumber: c.gstNumber, billingAddress: c.billingAddress })),
    }
  },

  get_suppliers: async (p) => {
    let query = supabase.from('Supplier')
      .select('*')
      .order('name', { ascending: true })
      .limit(Math.min(Number(p.limit) || 20, 50))

    if (p.search) query = query.ilike('name', `%${p.search}%`)

    const { data: suppliers } = await query
    return {
      success: true, count: suppliers?.length ?? 0,
      summary: `${suppliers?.length ?? 0} suppliers found`,
      data: (suppliers ?? []).map(s => ({ id: s.id, name: s.name, phone: s.phone, paymentTerms: s.paymentTerms, rating: s.rating, status: s.status })),
    }
  },

  get_dispatches: async (p) => {
    let query = supabase.from('Dispatch')
      .select('*')
      .order('dispatchDate', { ascending: false })
      .limit(Math.min(Number(p.limit) || 10, 50))

    if (p.status) query = query.eq('status', p.status)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('dispatchDate', startDate.toISOString())
    if (endDate) query = query.lte('dispatchDate', endDate.toISOString())

    const { data: dispatches } = await query
    return {
      success: true, count: dispatches?.length ?? 0,
      summary: `${dispatches?.length ?? 0} dispatches found`,
      data: (dispatches ?? []).map(d => ({ dispatchNo: d.dispatchNo, date: d.dispatchDate, status: d.status, totalQty: d.totalDispatchedQty, vehicleNo: d.vehicleNo, transporter: d.transporter })),
    }
  },

  get_purchase_orders: async (p) => {
    let query = supabase.from('PurchaseOrder')
      .select('*, supplier:supplierId(name)')
      .order('createdAt', { ascending: false })
      .limit(Math.min(Number(p.limit) || 10, 50))

    if (p.status) query = query.eq('status', p.status)
    if (p.supplierId) query = query.eq('supplierId', p.supplierId)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('createdAt', startDate.toISOString())
    if (endDate) query = query.lte('createdAt', endDate.toISOString())

    const { data: pos } = await query
    return {
      success: true, count: pos?.length ?? 0,
      summary: `${pos?.length ?? 0} purchase orders found`,
      data: (pos ?? []).map((po: any) => ({ poNumber: po.poNumber, fabricName: po.fabricName, supplier: po.supplier?.name, qty: po.quantity, unitRate: po.ratePerUnit, amount: po.totalAmount, status: po.status, expectedDelivery: po.expectedDelivery })),
    }
  },

  get_transactions: async (p) => {
    const limit = Math.min(Number(p.limit) || 15, 50)
    const buildQuery = (select: string) => {
      let q = supabase.from('Transaction').select(select).order('date', { ascending: false })
      if (p.type) q = q.eq('type', p.type)
      if (p.category) q = q.eq('category', p.category)
      if (p.referenceNo) q = q.ilike('referenceNo', `%${p.referenceNo}%`)
      const startDate = parseDateInput(p.fromDate as string | undefined)
      const endDate = parseDateInput(p.toDate as string | undefined)
      if (startDate) q = q.gte('date', startDate.toISOString())
      if (endDate) q = q.lte('date', endDate.toISOString())
      return q
    }
    const [{ data: txns = [] }, { data: sumRows = [] }] = await Promise.all([
      buildQuery('*').limit(limit),
      buildQuery('amount'),
    ])
    const total = sumRows.reduce((s, t: any) => s + Number(t.amount || 0), 0)
    return {
      success: true, count: txns.length,
      summary: `${txns.length} transactions, total ${fmt(total)}`,
      data: txns.map((t: any) => ({ date: t.date, type: t.type, category: t.category, amount: t.amount, description: t.description, reference: t.referenceNo })),
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REWRITTEN: get_daily_summary — Live data, IST timezone, no DailySnapshot
  // ═══════════════════════════════════════════════════════════════════════
  get_daily_summary: async (p) => {
    const dateInput = p.date as string | undefined
    const todayStart = dateInput ? parseDateInput(dateInput) || parseDateInput('today')! : parseDateInput('today')!
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1)
    const todayStartISO = todayStart.toISOString()
    const todayEndISO = todayEnd.toISOString()

    const dateLabel = dateInput || 'today'

    // ── 11 parallel queries ──
    const [
      { data: dayOrders = [] },
      { data: dayIncomeTxns = [] },
      { data: dayExpenseTxns = [] },
      { data: dayDispatches = [] },
      { data: dayCompletedJobs = [] },
      { data: allUnpaidOrders = [] },
      { data: allUnpaidPOs = [] },
      { data: allFabrics = [] },
      { data: activeOrders = [] },
      { count: overdueOrders = 0 },
      { data: lastTxn },
    ] = await Promise.all([
      // 1. Sales orders with orderDate in range
      supabase.from('SalesOrder').select('orderNo, totalAmount, customer:customerId(companyName)')
        .gte('orderDate', todayStartISO).lte('orderDate', todayEndISO),
      // 2. Income transactions
      supabase.from('Transaction').select('amount, category, description')
        .eq('type', 'Income').gte('date', todayStartISO).lte('date', todayEndISO),
      // 3. Expense transactions
      supabase.from('Transaction').select('amount, category, description')
        .eq('type', 'Expense').gte('date', todayStartISO).lte('date', todayEndISO),
      // 4. Dispatches
      supabase.from('Dispatch').select('dispatchNo, totalDispatchedQty')
        .gte('dispatchDate', todayStartISO).lte('dispatchDate', todayEndISO),
      // 5. Completed production jobs
      supabase.from('ProductionJob').select('completedQty')
        .gte('updatedAt', todayStartISO).lte('updatedAt', todayEndISO).eq('status', 'Completed'),
      // 6. All unpaid orders
      supabase.from('SalesOrder').select('totalAmount, paidAmount')
        .in('paymentStatus', ['Unpaid', 'Partial']),
      // 7. All unpaid POs
      supabase.from('PurchaseOrder').select('totalAmount, paidAmount')
        .in('paymentStatus', ['Unpaid', 'Partial']),
      // 8. All fabric stock
      supabase.from('FabricStock').select('fabricName, availableMeters, averageCost, totalValue'),
      // 9. Active orders
      supabase.from('SalesOrder').select('totalAmount')
        .in('status', ['Pending', 'Confirmed', 'In Production', 'Ready']),
      // 10. Overdue order count (IST-based)
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true })
        .in('status', ['Pending', 'Confirmed', 'In Production']).lt('deliveryDate', parseDateInput('today')!.toISOString()),
      // 11. Last transaction
      supabase.from('Transaction').select('date').order('date', { ascending: false }).limit(1).single(),
    ])

    // ── Calculate live metrics ──
    const todayRevenue = dayOrders.reduce((s, o: any) => s + Number(o.totalAmount || 0), 0)
    const todayIncome = dayIncomeTxns.reduce((s, t: any) => s + Number(t.amount || 0), 0)
    const todayExpense = dayExpenseTxns.reduce((s, t: any) => s + Number(t.amount || 0), 0)
    const todayNetProfit = todayIncome - todayExpense
    const receivables = allUnpaidOrders.reduce((s, o: any) => s + (Number(o.totalAmount || 0) - Number(o.paidAmount || 0)), 0)
    const payables = allUnpaidPOs.reduce((s, po: any) => s + (Number(po.totalAmount || 0) - Number(po.paidAmount || 0)), 0)
    const inventoryValue = allFabrics.reduce((s, f: any) => s + Number(f.totalValue || 0), 0)
    const activeOrdersValue = activeOrders.reduce((s, o: any) => s + Number(o.totalAmount || 0), 0)

    // Cash balance from ALL transactions (not DailySnapshot!)
    const [{ data: incomeRows = [] }, { data: expenseRows = [] }] = await Promise.all([
      supabase.from('Transaction').select('amount').eq('type', 'Income'),
      supabase.from('Transaction').select('amount').eq('type', 'Expense'),
    ])
    const cashBalance = incomeRows.reduce((s, t: any) => s + Number(t.amount || 0), 0)
      - expenseRows.reduce((s, t: any) => s + Number(t.amount || 0), 0)

    const dispatchQty = dayDispatches.reduce((s, d: any) => s + Number(d.totalDispatchedQty || 0), 0)
    const productionQty = dayCompletedJobs.reduce((s, j: any) => s + Number(j.completedQty || 0), 0)

    const todayStr = dateInput || istToday()
    const summary = `${dateLabel}: ${dayOrders.length} orders, income ${fmt(todayIncome)}, expense ${fmt(todayExpense)}, cash balance ${fmt(cashBalance)}`

    return {
      success: true, count: 1,
      summary,
      data: {
        date: todayStr,
        revenue: Math.round(todayRevenue),
        todayIncome: Math.round(todayIncome),
        todayExpense: Math.round(todayExpense),
        todayNetProfit: Math.round(todayNetProfit),
        cashBalance: Math.round(cashBalance),
        receivables: Math.round(receivables),
        payables: Math.round(payables),
        inventoryValue: Math.round(inventoryValue),
        ordersCount: dayOrders.length,
        activeOrdersCount: activeOrders.length,
        activeOrdersValue: Math.round(activeOrdersValue),
        productionQty,
        dispatchQty,
        overdueCount: overdueOrders,
        unpaidOrderCount: allUnpaidOrders.length,
        fabricCount: allFabrics.length,
        lastTransactionDate: (lastTxn as any)?.date?.toISOString() || null,
        // Detailed breakdowns
        orders: dayOrders.map((o: any) => ({ orderNo: o.orderNo, customer: o.customer?.companyName, amount: o.totalAmount })),
        incomeBreakdown: dayIncomeTxns.map((t: any) => ({ amount: t.amount, category: t.category, description: t.description })),
        expenseBreakdown: dayExpenseTxns.map((t: any) => ({ amount: t.amount, category: t.category, description: t.description })),
      },
    }
  },

  get_overdue_orders: async (p) => {
    // Use IST-based date for "today" comparison
    const todayIST = parseDateInput('today')!
    const limit = Math.min(Number(p.limit) || 10, 50)
    const { data: overdue = [] } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName, phone)')
      .in('status', ['Pending', 'Confirmed', 'In Production'])
      .lt('deliveryDate', todayIST.toISOString())
      .order('deliveryDate', { ascending: true })
      .limit(limit)
    return {
      success: true, count: overdue.length,
      summary: overdue.length > 0 ? `${overdue.length} overdue orders found` : 'Koi overdue order nahi hai! Sab timely hain.',
      data: overdue.map((o: any) => {
        const daysLate = Math.max(0, Math.floor((todayIST.getTime() - (o.deliveryDate ? new Date(o.deliveryDate).getTime() : todayIST.getTime())) / 86400000))
        return { orderNo: o.orderNo, customer: o.customer?.companyName, amount: o.totalAmount, deliveryDate: o.deliveryDate, daysLate, status: o.status }
      }),
    }
  },

  get_quotations: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Quotation')
      .select('*, customer:customerId(companyName)')
      .order('createdAt', { ascending: false })
      .limit(limit)

    if (p.status) query = query.eq('status', p.status)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('quotationDate', startDate.toISOString())
    if (endDate) query = query.lte('quotationDate', endDate.toISOString())

    const { data: quotes = [] } = await query
    return {
      success: true, count: quotes.length,
      summary: `${quotes.length} quotations found`,
      data: quotes.map((q: any) => ({ quoteNo: q.quotationNo, customer: q.customer?.companyName, amount: q.totalAmount, status: q.status, validUntil: q.validUntil, createdAt: q.createdAt })),
    }
  },

  get_employees: async (p) => {
    let query = supabase.from('Employee')
      .select('*')
      .order('name', { ascending: true })
      .limit(30)

    if (p.department) query = query.eq('department', p.department)
    if (p.search) query = query.or(`name.ilike.%${p.search}%,designation.ilike.%${p.search}%,department.ilike.%${p.search}%`)

    const { data: emps = [] } = await query
    return {
      success: true, count: emps.length,
      summary: `${emps.length} employees found`,
      data: emps.map((e: any) => ({ id: e.id, name: e.name, designation: e.designation, department: e.department, phone: e.phone, dailyWage: e.dailyWage, salary: e.salary })),
    }
  },

  get_grn_notes: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('GrnNote')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(limit)

    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('receivedDate', startDate.toISOString())
    if (endDate) query = query.lte('receivedDate', endDate.toISOString())

    const { data: grns = [] } = await query
    return {
      success: true, count: grns.length,
      summary: `${grns.length} GRN notes found`,
      data: grns.map((g: any) => ({ grnNo: g.grnNo, supplier: g.supplierName, fabric: g.fabricName, totalQty: g.totalReceivedQty, status: g.status, date: g.receivedDate })),
    }
  },

  get_samples: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Sample')
      .select('*, customer:customerId(companyName)')
      .order('createdAt', { ascending: false })
      .limit(limit)

    if (p.status) query = query.eq('status', p.status)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('createdAt', startDate.toISOString())
    if (endDate) query = query.lte('createdAt', endDate.toISOString())

    const { data: samples = [] } = await query
    return {
      success: true, count: samples.length,
      summary: `${samples.length} samples found`,
      data: samples.map((s: any) => ({ sampleNo: s.sampleNo, styleName: s.styleName, customer: s.customer?.companyName, status: s.status, stage: s.stage })),
    }
  },

  get_quality_checks: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('QualityCheck')
      .select('*, productionJob:productionJobId(jobNo, styleName)')
      .order('createdAt', { ascending: false })
      .limit(limit)

    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('checkedAt', startDate.toISOString())
    if (endDate) query = query.lte('checkedAt', endDate.toISOString())

    const { data: qcs = [] } = await query
    return {
      success: true, count: qcs.length,
      summary: `${qcs.length} quality check records found`,
      data: qcs.map((q: any) => ({ id: q.id, jobNo: q.productionJob?.jobNo, point: q.inspectionPoint, checkedQty: q.checkedQty, passedQty: q.passedQty, failedQty: q.failedQty, defectType: q.defectType, status: q.status, inspector: q.inspectorName, date: q.checkedAt })),
    }
  },

  get_returns: async (p) => {
    const limit = Math.min(Number(p.limit) || 10, 50)
    let query = supabase.from('Return')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(limit)

    if (p.status) query = query.eq('status', p.status)
    const startDate = parseDateInput(p.fromDate as string | undefined)
    const endDate = parseDateInput(p.toDate as string | undefined)
    if (startDate) query = query.gte('createdAt', startDate.toISOString())
    if (endDate) query = query.lte('createdAt', endDate.toISOString())

    const { data: returns = [] } = await query
    return {
      success: true, count: returns.length,
      summary: `${returns.length} returns found`,
      data: returns.map((r: any) => ({ returnNo: r.returnNo, referenceNo: r.referenceNo, party: r.partyName, reason: r.reason, quantity: r.totalQty, status: r.status })),
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REWRITTEN: search_all — 16 tables, take 3 from each
  // ═══════════════════════════════════════════════════════════════════════
  search_all: async (p) => {
    const q = (p.query as string || '').trim()
    if (!q) return { success: false, data: null, summary: 'Search query is required.' }

    const [
      orders,
      fabrics,
      costSheets,
      customers,
      suppliers,
      purchaseOrders,
      transactions,
      quotations,
      samples,
      productionJobs,
      dispatches,
      employees,
      grnNotes,
      qualityChecks,
      returns,
      vendors,
    ] = await Promise.all([
      // 1. Sales orders (orderNo or customer.companyName)
      (async () => {
        const { data: byNo = [] } = await supabase.from('SalesOrder').select('*, customer:customerId(companyName)').ilike('orderNo', `%${q}%`).limit(3)
        if (byNo.length >= 3) return byNo
        const { data: custIds } = await supabase.from('Customer').select('id').ilike('companyName', `%${q}%`).limit(10)
        const cids = (custIds || []).map((c: any) => c.id)
        if (cids.length > 0) {
          const { data: byCust = [] } = await supabase.from('SalesOrder').select('*, customer:customerId(companyName)').in('customerId', cids).limit(3)
          return [...byNo, ...byCust].slice(0, 3)
        }
        return byNo
      })(),
      // 2. Fabrics
      (async () => { const { data = [] } = await supabase.from('FabricStock').select('*').ilike('fabricName', `%${q}%`).limit(3); return data || [] })(),
      // 3. Cost sheets
      (async () => { const { data = [] } = await supabase.from('CostSheet').select('*').or(`styleNo.ilike.%${q}%,styleName.ilike.%${q}%,sheetNo.ilike.%${q}%`).limit(3); return data || [] })(),
      // 4. Customers
      (async () => { const { data = [] } = await supabase.from('Customer').select('*').ilike('companyName', `%${q}%`).limit(3); return data || [] })(),
      // 5. Suppliers
      (async () => { const { data = [] } = await supabase.from('Supplier').select('*').ilike('name', `%${q}%`).limit(3); return data || [] })(),
      // 6. Purchase orders
      (async () => { const { data = [] } = await supabase.from('PurchaseOrder').select('*').or(`poNumber.ilike.%${q}%,fabricName.ilike.%${q}%`).limit(3); return data || [] })(),
      // 7. Transactions
      (async () => { const { data = [] } = await supabase.from('Transaction').select('*').or(`referenceNo.ilike.%${q}%,description.ilike.%${q}%`).limit(3); return data || [] })(),
      // 8. Quotations
      (async () => { const { data = [] } = await supabase.from('Quotation').select('*').ilike('quotationNo', `%${q}%`).limit(3); return data || [] })(),
      // 9. Samples
      (async () => { const { data = [] } = await supabase.from('Sample').select('*').or(`sampleNo.ilike.%${q}%,styleName.ilike.%${q}%`).limit(3); return data || [] })(),
      // 10. Production jobs
      (async () => { const { data = [] } = await supabase.from('ProductionJob').select('*').or(`jobNo.ilike.%${q}%,styleName.ilike.%${q}%`).limit(3); return data || [] })(),
      // 11. Dispatches
      (async () => { const { data = [] } = await supabase.from('Dispatch').select('*').ilike('dispatchNo', `%${q}%`).limit(3); return data || [] })(),
      // 12. Employees
      (async () => { const { data = [] } = await supabase.from('Employee').select('*').or(`name.ilike.%${q}%,designation.ilike.%${q}%,department.ilike.%${q}%`).limit(3); return data || [] })(),
      // 13. GRN notes
      (async () => { const { data = [] } = await supabase.from('GrnNote').select('*').or(`grnNo.ilike.%${q}%,supplierName.ilike.%${q}%`).limit(3); return data || [] })(),
      // 14. Quality checks
      (async () => { const { data = [] } = await supabase.from('QualityCheck').select('*').ilike('checkNo', `%${q}%`).limit(3); return data || [] })(),
      // 15. Returns
      (async () => { const { data = [] } = await supabase.from('Return').select('*').or(`returnNo.ilike.%${q}%,partyName.ilike.%${q}%`).limit(3); return data || [] })(),
      // 16. Vendors
      (async () => { const { data = [] } = await supabase.from('Vendor').select('*').ilike('vendorName', `%${q}%`).limit(3); return data || [] })(),
    ])

    const totalMatches = orders.length + fabrics.length + costSheets.length + customers.length
      + suppliers.length + purchaseOrders.length + transactions.length + quotations.length
      + samples.length + productionJobs.length + dispatches.length + employees.length
      + grnNotes.length + qualityChecks.length + returns.length + vendors.length

    return {
      success: true,
      summary: `Found ${totalMatches} results across 16 tables: orders(${orders.length}) fabrics(${fabrics.length}) costSheets(${costSheets.length}) customers(${customers.length}) suppliers(${suppliers.length}) POs(${purchaseOrders.length}) transactions(${transactions.length}) quotations(${quotations.length}) samples(${samples.length}) jobs(${productionJobs.length}) dispatches(${dispatches.length}) employees(${employees.length}) GRNs(${grnNotes.length}) QC(${qualityChecks.length}) returns(${returns.length}) vendors(${vendors.length})`,
      count: totalMatches,
      data: {
        orders: orders.map((o: any) => ({ orderNo: o.orderNo, customer: o.customer?.companyName, amount: o.totalAmount, status: o.status })),
        fabrics: fabrics.map((f: any) => ({ name: f.fabricName, available: f.availableMeters, avgCost: f.averageCost })),
        costSheets: costSheets.map((c: any) => ({ sheetNo: c.sheetNo, style: c.styleName, cost: c.totalCost, status: c.status })),
        customers: customers.map((c: any) => ({ name: c.companyName, phone: c.phone, gstNumber: c.gstNumber })),
        suppliers: suppliers.map((s: any) => ({ name: s.name, phone: s.phone })),
        purchaseOrders: purchaseOrders.map((po: any) => ({ poNumber: po.poNumber, fabric: po.fabricName, amount: po.totalAmount, status: po.status })),
        transactions: transactions.map((t: any) => ({ reference: t.referenceNo, amount: t.amount, type: t.type, date: t.date })),
        quotations: quotations.map((q2: any) => ({ quotationNo: q2.quotationNo, amount: q2.totalAmount, status: q2.status })),
        samples: samples.map((s: any) => ({ sampleNo: s.sampleNo, styleName: s.styleName, status: s.status })),
        productionJobs: productionJobs.map((j: any) => ({ jobNo: j.jobNo, styleName: j.styleName, status: j.status })),
        dispatches: dispatches.map((d: any) => ({ dispatchNo: d.dispatchNo, date: d.dispatchDate, status: d.status })),
        employees: employees.map((e: any) => ({ name: e.name, designation: e.designation, department: e.department })),
        grnNotes: grnNotes.map((g: any) => ({ grnNo: g.grnNo, supplier: g.supplierName, fabric: g.fabricName })),
        qualityChecks: qualityChecks.map((q2: any) => ({ checkNo: q2.checkNo, status: q2.status, date: q2.checkedAt })),
        returns: returns.map((r: any) => ({ returnNo: r.returnNo, party: r.partyName, reason: r.reason, status: r.status })),
        vendors: vendors.map((v: any) => ({ name: v.vendorName })),
      },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY TOOLS
  // ═══════════════════════════════════════════════════════════════════════

  get_date_context: async () => {
    const now = istNow()
    const today = istToday()
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    // Calculate week start (Monday)
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - mondayOffset)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    return {
      success: true,
      summary: `Today: ${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`,
      data: {
        today, yesterday: istYesterday(), dayOfWeek: days[now.getDay()],
        thisWeekStart: weekStartStr, thisMonthStart: monthStart,
        currentMonth: months[now.getMonth()], currentYear: now.getFullYear(),
      },
    }
  },

  get_system_info: async () => {
    const [
      { count: orderCount = 0 },
      { data: latestOrder },
      { count: txnCount = 0 },
      { data: latestTxn },
      { count: csCount = 0 },
      { count: quoteCount = 0 },
      { count: jobCount = 0 },
      { count: fabricCount = 0 },
      { count: customerCount = 0 },
      { count: supplierCount = 0 },
      { count: dispatchCount = 0 },
      { count: sampleCount = 0 },
      { count: qcCount = 0 },
      { count: returnCount = 0 },
      { count: poCount = 0 },
    ] = await Promise.all([
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }),
      supabase.from('SalesOrder').select('orderNo, createdAt').order('createdAt', { ascending: false }).limit(1).single(),
      supabase.from('Transaction').select('*', { count: 'exact', head: true }),
      supabase.from('Transaction').select('date').order('date', { ascending: false }).limit(1).single(),
      supabase.from('CostSheet').select('*', { count: 'exact', head: true }),
      supabase.from('Quotation').select('*', { count: 'exact', head: true }),
      supabase.from('ProductionJob').select('*', { count: 'exact', head: true }),
      supabase.from('FabricStock').select('*', { count: 'exact', head: true }),
      supabase.from('Customer').select('*', { count: 'exact', head: true }),
      supabase.from('Supplier').select('*', { count: 'exact', head: true }),
      supabase.from('Dispatch').select('*', { count: 'exact', head: true }),
      supabase.from('Sample').select('*', { count: 'exact', head: true }),
      supabase.from('QualityCheck').select('*', { count: 'exact', head: true }),
      supabase.from('Return').select('*', { count: 'exact', head: true }),
      supabase.from('PurchaseOrder').select('*', { count: 'exact', head: true }),
    ])

    const lo = latestOrder as any
    const lt = latestTxn as any

    return {
      success: true,
      summary: `${orderCount} orders, ${txnCount} transactions, ${customerCount} customers, ${supplierCount} suppliers, ${fabricCount} fabrics, ${jobCount} production jobs, ${quoteCount} quotations, ${dispatchCount} dispatches, ${sampleCount} samples, ${qcCount} QC records, ${returnCount} returns, ${poCount} purchase orders`,
      data: {
        orders: { count: orderCount, latest: lo?.createdAt },
        transactions: { count: txnCount, latest: lt?.date },
        costSheets: csCount, quotations: quoteCount, productionJobs: jobCount,
        fabrics: fabricCount, customers: customerCount, suppliers: supplierCount,
        dispatches: dispatchCount, samples: sampleCount, qualityChecks: qcCount,
        returns: returnCount, purchaseOrders: poCount,
        dataFreshness: {
          lastOrderDate: lo?.createdAt,
          lastTransactionDate: lt?.date,
          daysSinceLastOrder: lo ? Math.floor((Date.now() - new Date(lo.createdAt).getTime()) / 86400000) : null,
          daysSinceLastTransaction: lt ? Math.floor((Date.now() - new Date(lt.date).getTime()) / 86400000) : null,
        },
      },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WRITE TOOLS — These CREATE records directly in the database
  // ═══════════════════════════════════════════════════════════════════════

  // ── WRITE: Create Cost Sheet ───────────────────────────────────────
  create_cost_sheet: async (p) => {
    const styleNo = (p.styleNo as string || '').trim()
    const styleName = (p.styleName as string || '').trim()
    const targetQty = Number(p.targetQty) || 0
    const profitPercent = Number(p.profitPercent) || 30
    const brokerCommissionPercent = Number(p.brokerCommissionPercent) || 0
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
    const { data: lastArr } = await supabase.from('CostSheet').select('sheetNo').ilike('sheetNo', `${prefix}%`).order('sheetNo', { ascending: false }).limit(1)
    const last = (lastArr || [])[0] as any
    const nextNum = last ? parseInt((last.sheetNo as string).slice(prefix.length), 10) + 1 : 1
    const sheetNo = `${prefix}${String(nextNum).padStart(3, '0')}`

    // Calculate costs from items
    const costItemsData = rawItems.map((item: Record<string, unknown>) => {
      const consumption = Number(item.consumption) || 0
      const unitRate = Number(item.unitRate) || 0
      const wastage = Number(item.wastagePercent) || 0
      const itemCost = consumption * unitRate * (1 + wastage / 100)
      return {
        category: String(item.category || 'Other'),
        itemName: String(item.itemName || ''),
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

    const colorsData = rawColors.map((c: Record<string, unknown>) => ({
      color: String(c.color || ''),
      quantity: Number(c.quantity) || 0,
    }))

    const { data: sheet, error: sheetErr } = await supabase.from('CostSheet').insert({
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
    }).select().single()
    if (sheetErr || !sheet) return { success: false, data: null, summary: `Failed to create cost sheet: ${sheetErr?.message || 'Unknown error'}` }

    // Insert cost items
    if (costItemsData.length > 0) {
      await supabase.from('CostItem').insert(costItemsData.map(ci => ({ ...ci, costSheetId: (sheet as any).id })))
    }
    // Insert color breakdown
    if (colorsData.length > 0) {
      await supabase.from('ColorBreakdown').insert(colorsData.map(c => ({ ...c, costSheetId: (sheet as any).id })))
    }

    const netProfitPerPc = sellingPrice - brokerCommissionAmount - totalCost
    const brokerPerPc = brokerCommissionAmount

    return {
      success: true, count: 1,
      summary: `Cost Sheet ${(sheet as any).sheetNo} created successfully! ${(sheet as any).styleName} — ${costItemsData.length} items, ${colorsData.length} colors, ${fmt((sheet as any).totalCost)}/pc cost, ${fmt(sellingPrice)}/pc selling, ${fmt(brokerPerPc)}/pc broker, ${fmt(netProfitPerPc)}/pc net profit`,
      data: {
        sheetNo: (sheet as any).sheetNo, styleNo: (sheet as any).styleNo, styleName: (sheet as any).styleName,
        targetQty: (sheet as any).targetQty, totalCost: (sheet as any).totalCost, sellingPrice: (sheet as any).sellingPrice,
        profitPercent: (sheet as any).profitPercent, brokerCommissionPercent: (sheet as any).brokerCommissionPercent,
        brokerCommissionAmount: (sheet as any).brokerCommissionAmount,
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
    const { data: custArr } = await supabase.from('Customer').select('*').ilike('companyName', `%${customerName}%`).limit(1)
    const customer = (custArr || [])[0] as any
    if (!customer) {
      return { success: false, data: null, summary: `Customer "${customerName}" not found in database. Please use get_customers tool to find the exact name.` }
    }

    // Generate quotation number
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86400000)
    const { count: todayCount = 0 } = await supabase.from('Quotation').select('*', { count: 'exact', head: true }).gte('quotationDate', todayStart.toISOString()).lt('quotationDate', todayEnd.toISOString())
    const quotationNo = `QT-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`

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

    const { data: quotation, error: quotErr } = await supabase.from('Quotation').insert({
      quotationNo, customerId: customer.id,
      validUntil, status: 'Draft',
      gstType, gstPercent,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      cgstAmount, sgstAmount, igstAmount,
      totalGst: gstAmount,
      totalAmount, totalCost,
      notes,
    }).select().single()
    if (quotErr || !quotation) return { success: false, data: null, summary: `Failed to create quotation: ${quotErr?.message || 'Unknown error'}` }

    // Insert quotation items
    if (quotationItems.length > 0) {
      await supabase.from('QuotationItem').insert(quotationItems.map(i => ({ ...i, quotationId: (quotation as any).id })))
    }

    const q = quotation as any
    return {
      success: true, count: 1,
      summary: `Quotation ${q.quotationNo} created for ${customer.companyName}! Total: ${fmt(q.totalAmount)} (incl. ${fmt(gstAmount)} GST), Valid until: ${validUntil.toLocaleDateString('en-IN')}`,
      data: {
        quotationNo: q.quotationNo, customer: customer.companyName,
        totalAmount: q.totalAmount, totalCost: q.totalCost,
        taxableAmount: q.taxableAmount, gstAmount: q.totalGst,
        cgst: q.cgstAmount, sgst: q.sgstAmount, igst: q.igstAmount,
        items: quotationItems.map(i => ({ style: i.styleName, qty: i.quantity, price: i.unitPrice, cost: i.unitCost, total: i.totalAmount })),
        validUntil: q.validUntil,
      },
    }
  },
}

// ─── Execute Tool ─────────────────────────────────────────────────────────────

export async function executeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
  // ── Cache check for READ tools (skip write tools) ──
  if (!isWriteTool(name)) {
    const cacheKey = `${name}:${hashParams(params)}`
    const cached = resultCache.get<ToolResult>(cacheKey)
    if (cached) {
      console.log(`[Tools] Cache HIT: ${name}`)
      return cached
    }
  }

  // Try core executors first
  let executor = (ALL_EXECUTORS as Record<string, WriteExec>)[name]
  
  // Fall back to lazy-loaded write/advanced/predictive/gst/scheduled executors
  if (!executor) {
    const writeEx = await getWriteExecutors()
    executor = writeEx[name]
  }
  if (!executor) {
    const advEx = await getAdvancedExecutors()
    executor = advEx[name]
  }
  if (!executor) {
    const predEx = await getPredictiveExecutors()
    executor = predEx[name]
  }
  if (!executor) {
    const gstEx = await getGstExecutors()
    executor = gstEx[name]
  }
  if (!executor) {
    const schedEx = await getScheduledExecutors()
    executor = schedEx[name]
  }
  
  if (!executor) return { success: false, data: null, summary: `Tool "${name}" does not exist.` }

  try {
    const result = await executor(params)
    // ── Cache successful READ tool results (60s TTL) ──
    if (!isWriteTool(name) && result.success) {
      const cacheKey = `${name}:${hashParams(params)}`
      resultCache.set(cacheKey, result, 60_000)
    }
    return result
  } catch (error) {
    return { success: false, data: null, summary: `Error running tool "${name}": ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

// ─── Import tools from other modules (lazy — loaded on first tool call) ─────────
// Static imports cause OOM during turbopack compilation of 3600+ lines.
// These are loaded lazily when executeTool is called for a non-core tool.
type WriteExec = (p: Record<string, unknown>) => Promise<ToolResult>

async function getWriteExecutors(): Promise<Record<string, WriteExec>> {
  try {
    const m = await import('./tools-write')
    return m.TOOL_EXECUTORS_WRITE || {}
  } catch (e) {
    console.error('[Tools] Failed to load write tools:', e)
    return {}
  }
}

async function getAdvancedExecutors(): Promise<Record<string, WriteExec>> {
  try {
    const m = await import('./tools-advanced')
    return m.TOOL_EXECUTORS_ADVANCED || {}
  } catch (e) {
    console.error('[Tools] Failed to load advanced tools:', e)
    return {}
  }
}

async function getPredictiveExecutors(): Promise<Record<string, WriteExec>> {
  try {
    const m = await import('./tools-predictive')
    return m.TOOL_EXECUTORS_PREDICTIVE || {}
  } catch (e) {
    console.error('[Tools] Failed to load predictive tools:', e)
    return {}
  }
}

async function getGstExecutors(): Promise<Record<string, WriteExec>> {
  try {
    const m = await import('./tools-gst')
    const executors: Record<string, WriteExec> = {
      get_gst_summary: (p) => m.executeGstTool('get_gst_summary', p),
      get_gstr1_draft: (p) => m.executeGstTool('get_gstr1_draft', p),
      get_gstr3b_draft: (p) => m.executeGstTool('get_gstr3b_draft', p),
      get_gst_hsn_summary: (p) => m.executeGstTool('get_gst_hsn_summary', p),
    }
    return executors
  } catch (e) {
    console.error('[Tools] Failed to load GST tools:', e)
    return {}
  }
}

async function getScheduledExecutors(): Promise<Record<string, WriteExec>> {
  try {
    const m = await import('./tools-scheduled')
    // Scheduled tools export executeScheduledTool instead of an executor map
    const executors: Record<string, WriteExec> = {
      create_scheduled_report: (p) => m.executeScheduledTool('create_scheduled_report', p),
      list_scheduled_reports: (p) => m.executeScheduledTool('list_scheduled_reports', p),
      delete_scheduled_report: (p) => m.executeScheduledTool('delete_scheduled_report', p),
    }
    return executors
  } catch (e) {
    console.error('[Tools] Failed to load scheduled tools:', e)
    return {}
  }
}

// Core tools — always available
export const ALL_TOOLS = TOOLS
export const ALL_EXECUTORS = TOOL_EXECUTORS

// ─── Lazy-loaded full tool definitions (for system prompt) ─────────────
// Tool definitions are small JSON objects; lazy loading avoids OOM from
// parsing 2000+ lines of executor code at import time.

let _fullToolDefs: ToolDef[] | null = null

export async function getAllToolDefinitions(): Promise<ToolDef[]> {
  if (_fullToolDefs) return _fullToolDefs
  try {
    const [writeMod, advMod, predMod, gstMod, schedMod] = await Promise.all([
      import('./tools-write'),
      import('./tools-advanced'),
      import('./tools-predictive'),
      import('./tools-gst'),
      import('./tools-scheduled'),
    ])
    _fullToolDefs = [
      ...TOOLS,
      ...writeMod.TOOLS_WRITE,
      ...advMod.TOOLS_ADVANCED,
      ...predMod.TOOLS_PREDICTIVE,
      ...gstMod.TOOLS_GST,
      ...schedMod.TOOLS_SCHEDULED,
    ]
    return _fullToolDefs
  } catch (e) {
    console.error('[Tools] Failed to load full tool definitions, using core only:', e)
    return TOOLS
  }
}