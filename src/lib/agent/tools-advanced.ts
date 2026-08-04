import { supabase } from '@/lib/supabase-db'
import type { ToolDef, ToolResult } from './tools'
import { parseDateInput, istToday, istNow, istMonthStart, istWeekStart, istQuarterStart, istYearStart } from './date-utils'

// ─── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const rnd = (n: number) => Math.round(n * 100) / 100

function todayPrefix(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** Generate next sequential number for a prefix pattern */
async function nextSeq(prefix: string, table: string, field: string): Promise<number> {
  const { data: last } = await supabase.from(table)
    .select(field)
    .ilike(field, `${prefix}%`)
    .order(field, { ascending: false })
    .limit(1)
    .single()
  return last ? parseInt((last as any)[field].slice(prefix.length), 10) + 1 : 1
}

/** Get date range from period string */
function getDateRange(period: string, fromDate?: string, toDate?: string): { from: Date; to: Date; label: string } {
  if (fromDate || toDate) {
    return {
      from: parseDateInput(fromDate) || new Date(2020, 0, 1),
      to: parseDateInput(toDate) || istNow(),
      label: 'Custom',
    }
  }

  switch (period) {
    case 'today': {
      const d = parseDateInput('today')!
      return { from: d, to: istNow(), label: 'Today' }
    }
    case 'this_week': {
      const ws = istWeekStart()
      return { from: new Date(ws + 'T00:00:00.000Z'), to: istNow(), label: 'This Week' }
    }
    case 'this_month': {
      const ms = istMonthStart()
      return { from: new Date(ms + 'T00:00:00.000Z'), to: istNow(), label: 'This Month' }
    }
    case 'this_quarter': {
      const qs = istQuarterStart()
      return { from: new Date(qs + 'T00:00:00.000Z'), to: istNow(), label: 'This Quarter' }
    }
    case 'this_year': {
      const ys = istYearStart()
      return { from: new Date(ys + 'T00:00:00.000Z'), to: istNow(), label: 'This Year' }
    }
    default: {
      const ms = istMonthStart()
      return { from: new Date(ms + 'T00:00:00.000Z'), to: istNow(), label: 'This Month' }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS — 5 WORKFLOW + 6 ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS_ADVANCED: ToolDef[] = [
  // ── WORKFLOW TOOLS (W1–W5) ───────────────────────────────────────────
  {
    name: 'convert_quotation_to_order',
    description: 'Convert a sent/accepted quotation into a sales order. Creates the order, updates quotation status to Converted, and creates production jobs for each item. Atomic transaction.',
    parameters: {
      quotationNo: { type: 'string', description: 'Quotation number to convert', required: true },
    },
  },
  {
    name: 'record_dispatch_from_order',
    description: 'Record a dispatch against a sales order with item-level quantities. Creates Dispatch + DispatchItems in a transaction.',
    parameters: {
      salesOrderId: { type: 'string', description: 'Sales order ID', required: true },
      items: { type: 'array', description: 'Array of {styleNo, styleName, orderedQty, dispatchedQty}', required: true },
      transporter: { type: 'string', description: 'Transporter name' },
      vehicleNo: { type: 'string', description: 'Vehicle number' },
      trackingNo: { type: 'string', description: 'Tracking/AWB number' },
      notes: { type: 'string', description: 'Dispatch notes' },
    },
  },
  {
    name: 'record_grn_and_update_stock',
    description: 'Record a GRN note AND automatically update fabric stock. Creates GRN + GRNItems and updates FabricStock in a transaction.',
    parameters: {
      supplierName: { type: 'string', description: 'Supplier name', required: true },
      items: { type: 'array', description: 'Array of {fabricName, receivedQty, acceptedQty, ratePerUnit}', required: true },
      purchaseOrderId: { type: 'string', description: 'Linked purchase order ID' },
      notes: { type: 'string', description: 'GRN notes' },
    },
  },
  {
    name: 'close_order',
    description: 'Mark a sales order as Delivered and return a completion summary with totals, payments, balance, and profit.',
    parameters: {
      orderNo: { type: 'string', description: 'Order number', required: true },
    },
  },
  {
    name: 'bulk_order_status_update',
    description: 'Update status of multiple orders at once. Filters by current status and optional date range.',
    parameters: {
      currentStatus: { type: 'string', description: 'Current status to filter orders', required: true },
      newStatus: { type: 'string', description: 'New status to set', required: true },
      fromDate: { type: 'string', description: 'Optional: only update orders created after this date' },
      toDate: { type: 'string', description: 'Optional: only update orders created before this date' },
    },
  },

  // ── ANALYTICS TOOLS (A1–A6) ──────────────────────────────────────────
  {
    name: 'get_revenue_report',
    description: 'Get a revenue report for a period. Shows order revenue, income, expenses, profit, order count, average order value, and top orders.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_customer_ledger',
    description: 'Get a customer ledger showing all orders, total ordered, total paid, and outstanding balance.',
    parameters: {
      customerName: { type: 'string', description: 'Customer company name', required: true },
      fromDate: { type: 'string', description: 'Filter orders from this date' },
      toDate: { type: 'string', description: 'Filter orders to this date' },
    },
  },
  {
    name: 'get_profit_analysis',
    description: 'Analyze profit by order, style, customer, or month. Returns top and bottom performers.',
    parameters: {
      groupBy: { type: 'string', description: 'Group profit by', enum: ['order', 'style', 'customer', 'month'], required: true },
      fromDate: { type: 'string', description: 'Start date' },
      toDate: { type: 'string', description: 'End date' },
      topN: { type: 'number', description: 'Number of top/bottom results (default 5)' },
    },
  },
  {
    name: 'get_inventory_alerts',
    description: 'Get inventory alerts — low stock fabrics (<100m free), zero stock fabrics, and total inventory value. No params needed.',
    parameters: {},
  },
  {
    name: 'get_production_efficiency',
    description: 'Get production efficiency metrics — completion rate, delayed jobs, stage distribution.',
    parameters: {
      fromDate: { type: 'string', description: 'Start date' },
      toDate: { type: 'string', description: 'End date' },
      jobNo: { type: 'string', description: 'Optional: filter by specific job number' },
    },
  },
  {
    name: 'get_aged_receivables',
    description: 'Get aged receivables report — outstanding amounts grouped by aging buckets (0-30, 30-60, 60-90, 90-180, 180+ days).',
    parameters: {
      buckets: { type: 'array', description: 'Aging bucket boundaries in days (default: [0, 30, 60, 90, 180])' },
    },
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS — 5 WORKFLOW + 6 ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOL_EXECUTORS_ADVANCED: Record<string, (p: Record<string, unknown>) => Promise<ToolResult>> = {

  // ═══════════════════════════════════════════════════════════════════════
  // WORKFLOW TOOLS
  // ═══════════════════════════════════════════════════════════════════════

  // ── W1: Convert Quotation to Order ───────────────────────────────────
  convert_quotation_to_order: async (p) => {
    const quotationNo = (p.quotationNo as string || '').trim()

    if (!quotationNo) return { success: false, data: null, summary: 'quotationNo is required.' }

    try {
      // Fetch quotation with items
      const { data: quotation, error: qErr } = await supabase.from('Quotation')
        .select('*, customer:customerId(*), items:QuotationItem(*)')
        .eq('quotationNo', quotationNo)
        .limit(1)
        .single()

      if (qErr || !quotation) return { success: false, data: null, summary: `Quotation "${quotationNo}" not found.` }
      if (quotation.status !== 'Sent' && quotation.status !== 'Accepted') {
        return { success: false, data: null, summary: `Quotation must be Sent or Accepted to convert. Current status: ${quotation.status}.` }
      }

      const qItems = (quotation.items as any[]) || []
      const qCustomer = quotation.customer as any

      // Generate order number
      const prefix = `SO-${todayPrefix()}-`
      const nextNum = await nextSeq(prefix, 'SalesOrder', 'orderNo')
      const orderNo = `${prefix}${String(nextNum).padStart(3, '0')}`

      const taxableAmount = quotation.taxableAmount
      const totalAmount = quotation.totalAmount
      const totalCost = quotation.totalCost
      const grossProfit = rnd(totalAmount - totalCost)
      const grossMargin = totalAmount > 0 ? rnd(grossProfit / totalAmount * 100) : 0
      const commissionAmount = 0
      const netAmount = totalAmount
      const netProfit = grossProfit
      const netMargin = grossMargin
      const now = new Date().toISOString()

      // Create sales order
      const { data: order, error: oErr } = await supabase.from('SalesOrder').insert({
        orderNo, customerId: quotation.customerId,
        shippingAddress: qCustomer?.shippingAddress || null,
        gstType: quotation.gstType, gstPercent: quotation.gstPercent,
        taxableAmount, cgstAmount: quotation.cgstAmount, sgstAmount: quotation.sgstAmount,
        igstAmount: quotation.igstAmount, totalGst: quotation.totalGst,
        totalAmount, totalCost, grossProfit, grossMargin,
        commissionAmount, netAmount, netProfit, netMargin,
        quotationId: quotation.id,
        orderDate: new Date(),
        status: 'Pending',
        paymentStatus: 'Unpaid',
        paidAmount: 0,
        discountPercent: 0,
        itemsCount: qItems.length,
        createdAt: now, updatedAt: now,
      }).select().single()

      if (oErr || !order) return { success: false, data: null, summary: `Failed to create order: ${oErr?.message}` }

      // Create order items
      const orderItems = qItems.map(item => ({
        salesOrderId: order.id,
        styleName: item.styleName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        totalAmount: item.totalAmount,
        totalCost: item.totalCost,
        profit: item.profit,
        createdAt: now, updatedAt: now,
      }))
      const { error: oiErr } = await supabase.from('OrderItem').insert(orderItems)
      if (oiErr) return { success: false, data: null, summary: `Failed to create order items: ${oiErr.message}` }

      // Update quotation status
      const { error: quErr } = await supabase.from('Quotation')
        .update({ status: 'Converted', convertedOrderId: order.id, updatedAt: now })
        .eq('id', quotation.id)
      if (quErr) return { success: false, data: null, summary: `Failed to update quotation: ${quErr.message}` }

      // Create production jobs for each item
      const pjPrefix = `PJ-${todayPrefix()}-`
      let pjSeq = await nextSeq(pjPrefix, 'ProductionJob', 'jobNo')
      const productionJobs: { jobNo: string; styleName: string; targetQty: number }[] = []

      for (const item of qItems) {
        const jobNo = `${pjPrefix}${String(pjSeq).padStart(3, '0')}`
        pjSeq++
        const { error: pjErr } = await supabase.from('ProductionJob').insert({
          jobNo, salesOrderId: order.id,
          styleNo: item.styleName.split(' ')[0] || 'N/A',
          styleName: item.styleName,
          targetQty: item.quantity,
          completedQty: 0,
          stage: 'Fabric Issue',
          status: 'Pending',
          createdAt: now, updatedAt: now,
        })
        if (pjErr) return { success: false, data: null, summary: `Failed to create production job: ${pjErr.message}` }
        productionJobs.push({ jobNo, styleName: item.styleName, targetQty: item.quantity })
      }

      return {
        success: true, count: 1,
        summary: `Quotation ${quotationNo} → Order ${orderNo} created! ${qItems.length} items, ${productionJobs.length} production jobs auto-created`,
        data: {
          orderNo, quotationNo,
          itemCount: qItems.length,
          totalAmount: order.totalAmount,
          productionJobs,
        },
      }
    } catch (err: any) {
      return { success: false, data: null, summary: `Error converting quotation: ${err.message}` }
    }
  },

  // ── W2: Record Dispatch from Order ───────────────────────────────────
  record_dispatch_from_order: async (p) => {
    const salesOrderId = (p.salesOrderId as string || '').trim()
    const rawItems = Array.isArray(p.items) ? p.items as Record<string, unknown>[] : []
    const transporter = (p.transporter as string) || null
    const vehicleNo = (p.vehicleNo as string) || null
    const trackingNo = (p.trackingNo as string) || null
    const notes = (p.notes as string) || null

    if (!salesOrderId || rawItems.length === 0) return { success: false, data: null, summary: 'salesOrderId and items are required.' }

    try {
      // Fetch order
      const { data: order, error: oErr } = await supabase.from('SalesOrder')
        .select('*, customer:customerId(*), items:OrderItem(*)')
        .eq('id', salesOrderId)
        .single()

      if (oErr || !order) return { success: false, data: null, summary: `Sales order "${salesOrderId}" not found.` }
      const orderAny = order as any
      if (orderAny.status !== 'Ready' && orderAny.status !== 'In Production') {
        return { success: false, data: null, summary: `Order status must be Ready or In Production to dispatch. Current: ${orderAny.status}.` }
      }

      // Generate dispatch number
      const prefix = `DP-${todayPrefix()}-`
      const nextNum = await nextSeq(prefix, 'Dispatch', 'dispatchNo')
      const dispatchNo = `${prefix}${String(nextNum).padStart(3, '0')}`

      const dispatchItems = rawItems.map(item => ({
        styleNo: String(item.styleNo || ''),
        styleName: String(item.styleName || ''),
        orderedQty: Number(item.orderedQty) || 0,
        dispatchedQty: Number(item.dispatchedQty) || 0,
      }))

      const totalDispatchedQty = dispatchItems.reduce((s, i) => s + i.dispatchedQty, 0)
      const now = new Date().toISOString()

      // Create dispatch
      const { data: dispatch, error: dErr } = await supabase.from('Dispatch').insert({
        dispatchNo, salesOrderId, customerId: orderAny.customerId,
        shippingAddress: orderAny.shippingAddress || orderAny.customer?.shippingAddress || null,
        transporter, vehicleNo, trackingNo,
        totalDispatchedQty, notes,
        dispatchDate: new Date(),
        status: 'Packed',
        createdAt: now, updatedAt: now,
      }).select().single()

      if (dErr || !dispatch) return { success: false, data: null, summary: `Failed to create dispatch: ${dErr?.message}` }

      // Create dispatch items
      const diRows = dispatchItems.map(item => ({
        dispatchId: dispatch.id,
        ...item,
        createdAt: now, updatedAt: now,
      }))
      const { error: diErr } = await supabase.from('DispatchItem').insert(diRows)
      if (diErr) return { success: false, data: null, summary: `Failed to create dispatch items: ${diErr.message}` }

      // Check if fully dispatched
      const orderItems = (orderAny.items as any[]) || []
      let fullyDispatched = true
      for (const oi of orderItems) {
        const dispatched = dispatchItems
          .filter(di => di.styleName === oi.styleName)
          .reduce((s, di) => s + di.dispatchedQty, 0)
        if (dispatched < oi.quantity) { fullyDispatched = false; break }
      }

      if (fullyDispatched) {
        await supabase.from('SalesOrder').update({ status: 'Dispatched', updatedAt: now }).eq('id', salesOrderId)
      }

      return {
        success: true, count: 1,
        summary: `Dispatch ${dispatchNo} created! ${totalDispatchedQty} pcs from ${orderAny.orderNo}${fullyDispatched ? ' → Order marked Dispatched' : ''}`,
        data: { dispatchNo, totalQty: totalDispatchedQty, orderFullyDispatched: fullyDispatched },
      }
    } catch (err: any) {
      return { success: false, data: null, summary: `Error recording dispatch: ${err.message}` }
    }
  },

  // ── W3: Record GRN and Update Stock ──────────────────────────────────
  record_grn_and_update_stock: async (p) => {
    const supplierName = (p.supplierName as string || '').trim()
    const rawItems = Array.isArray(p.items) ? p.items as Record<string, unknown>[] : []
    const purchaseOrderId = (p.purchaseOrderId as string) || null
    const notes = (p.notes as string) || null

    if (!supplierName || rawItems.length === 0) return { success: false, data: null, summary: 'supplierName and items are required.' }

    try {
      // Find supplier
      const { data: supplier } = await supabase.from('Supplier')
        .select('id')
        .ilike('name', `%${supplierName}%`)
        .limit(1)
        .single()

      // Generate GRN number
      const prefix = `GRN-${todayPrefix()}-`
      const nextNum = await nextSeq(prefix, 'GrnNote', 'grnNo')
      const grnNo = `${prefix}${String(nextNum).padStart(3, '0')}`

      const grnItems = rawItems.map(item => {
        const accepted = Number(item.acceptedQty) || 0
        const rate = Number(item.ratePerUnit) || 0
        return {
          fabricName: String(item.fabricName || ''),
          orderedQty: Number(item.orderedQty) || 0,
          receivedQty: Number(item.receivedQty) || 0,
          acceptedQty: accepted,
          rejectedQty: Number(item.rejectedQty) || 0,
          ratePerUnit: rate,
          totalValue: rnd(accepted * rate),
        }
      })

      const totalReceivedQty = grnItems.reduce((s, i) => s + i.receivedQty, 0)
      const acceptedQty = grnItems.reduce((s, i) => s + i.acceptedQty, 0)
      const rejectedQty = grnItems.reduce((s, i) => s + i.rejectedQty, 0)
      const now = new Date().toISOString()

      // Create GRN
      const { data: grn, error: gErr } = await supabase.from('GrnNote').insert({
        grnNo, poId: purchaseOrderId, supplierId: supplier?.id || null,
        supplierName, receivedDate: new Date(),
        totalReceivedQty, acceptedQty, rejectedQty, notes,
        createdAt: now, updatedAt: now,
      }).select().single()

      if (gErr || !grn) return { success: false, data: null, summary: `Failed to create GRN: ${gErr?.message}` }

      // Create GRN items
      const giRows = grnItems.map(item => ({
        grnId: grn.id,
        ...item,
        createdAt: now, updatedAt: now,
      }))
      await supabase.from('GrnItem').insert(giRows)

      // Update stock for each accepted item
      const stockUpdates: { fabricName: string; added: number; newMeters: number }[] = []
      for (const item of grnItems) {
        if (item.acceptedQty <= 0) continue
        const { data: stock } = await supabase.from('FabricStock')
          .select('*')
          .ilike('fabricName', `%${item.fabricName}%`)
          .limit(1)
          .single()
        if (!stock) continue

        const oldMeters = (stock as any).availableMeters
        const newMeters = rnd(oldMeters + item.acceptedQty)
        const avgCost = item.ratePerUnit || (stock as any).averageCost
        const totalValue = rnd(newMeters * avgCost)

        await supabase.from('FabricStock').update({
          availableMeters: newMeters, averageCost: avgCost, totalValue, updatedAt: now,
        }).eq('id', stock.id)

        stockUpdates.push({ fabricName: (stock as any).fabricName, added: item.acceptedQty, newMeters })
      }

      // Update PO if linked
      let poUpdated = false
      if (purchaseOrderId) {
        const { data: po } = await supabase.from('PurchaseOrder')
          .select('id, receivedQty, quantity, status')
          .eq('id', purchaseOrderId)
          .single()
        if (po) {
          const poAny = po as any
          const newReceivedQty = rnd(poAny.receivedQty + acceptedQty)
          const newStatus = newReceivedQty >= poAny.quantity ? 'Received' : poAny.status
          await supabase.from('PurchaseOrder').update({
            receivedQty: newReceivedQty, status: newStatus, updatedAt: now,
          }).eq('id', purchaseOrderId)
          poUpdated = true
        }
      }

      const stockSummary = stockUpdates.map(s => `${s.fabricName}: +${s.added}m → ${s.newMeters}m`).join(', ')

      return {
        success: true, count: 1,
        summary: `GRN ${grnNo} created! ${totalReceivedQty}m received, ${acceptedQty}m accepted. Stock updated: ${stockSummary}${poUpdated ? '. PO status updated.' : ''}`,
        data: { grnNo, totalReceivedQty, stockUpdates, poUpdated },
      }
    } catch (err: any) {
      return { success: false, data: null, summary: `Error recording GRN: ${err.message}` }
    }
  },

  // ── W4: Close Order ──────────────────────────────────────────────────
  close_order: async (p) => {
    const orderNo = (p.orderNo as string || '').trim()

    if (!orderNo) return { success: false, data: null, summary: 'orderNo is required.' }

    const { data: order, error: oErr } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName), items:OrderItem(*), dispatches:Dispatch(*)')
      .eq('orderNo', orderNo)
      .limit(1)
      .single()

    if (oErr || !order) return { success: false, data: null, summary: `Order "${orderNo}" not found.` }

    const now = new Date().toISOString()
    const { data: updated, error: uErr } = await supabase.from('SalesOrder')
      .update({ status: 'Delivered', updatedAt: now })
      .eq('id', order.id)
      .select().single()

    if (uErr) return { success: false, data: null, summary: `Failed to update order: ${uErr.message}` }

    const orderAny = order as any
    const balance = rnd(orderAny.totalAmount - (orderAny.paidAmount || 0))

    return {
      success: true, count: 1,
      summary: `Order ${orderNo} closed! ${orderAny.customer?.companyName} — Total: ${fmt(orderAny.totalAmount)}, Paid: ${fmt(orderAny.paidAmount || 0)}, Balance: ${fmt(balance)}, Profit: ${fmt(orderAny.grossProfit)}`,
      data: {
        orderNo,
        customer: orderAny.customer?.companyName,
        totalAmount: orderAny.totalAmount,
        totalCost: orderAny.totalCost,
        paidAmount: orderAny.paidAmount,
        balance,
        grossProfit: orderAny.grossProfit,
        grossMargin: orderAny.grossMargin,
        itemCount: (orderAny.items || []).length,
        dispatchCount: (orderAny.dispatches || []).length,
      },
    }
  },

  // ── W5: Bulk Order Status Update ─────────────────────────────────────
  bulk_order_status_update: async (p) => {
    const currentStatus = (p.currentStatus as string || '').trim()
    const newStatus = (p.newStatus as string || '').trim()

    if (!currentStatus || !newStatus) return { success: false, data: null, summary: 'currentStatus and newStatus are required.' }

    let query = supabase.from('SalesOrder').select('id').eq('status', currentStatus)

    if (p.fromDate) {
      const from = parseDateInput(p.fromDate as string | undefined)
      if (from) query = query.gte('createdAt', from.toISOString())
    }
    if (p.toDate) {
      const to = parseDateInput(p.toDate as string | undefined)
      if (to) query = query.lte('createdAt', to.toISOString())
    }

    const { count, error: cErr } = await query
    if (cErr) return { success: false, data: null, summary: `Query failed: ${cErr.message}` }

    if (!count || count === 0) return { success: true, count: 0, summary: `No orders found with status "${currentStatus}".`, data: { updated: 0 } }

    // Fetch matching IDs to update
    const { data: matching } = await supabase.from('SalesOrder').select('id').eq('status', currentStatus)
    if (!matching || matching.length === 0) return { success: true, count: 0, summary: `No orders found with status "${currentStatus}".`, data: { updated: 0 } }

    const ids = matching.map(m => m.id)
    const now = new Date().toISOString()
    const { error: uErr } = await supabase.from('SalesOrder')
      .update({ status: newStatus, updatedAt: now })
      .in('id', ids)

    if (uErr) return { success: false, data: null, summary: `Failed to update orders: ${uErr.message}` }

    return {
      success: true, count: ids.length,
      summary: `${ids.length} orders updated: ${currentStatus} → ${newStatus}`,
      data: { updated: ids.length, from: currentStatus, to: newStatus },
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYTICS TOOLS
  // ═══════════════════════════════════════════════════════════════════════

  // ── A1: Get Revenue Report ───────────────────────────────────────────
  get_revenue_report: async (p) => {
    const period = (p.period as string) || 'this_month'
    const { from, to, label } = getDateRange(period, p.fromDate as string | undefined, p.toDate as string | undefined)

    const [orderRes, incomeRes, expenseRes, topOrdersRes] = await Promise.all([
      supabase.from('SalesOrder').select('totalAmount, grossProfit').gte('createdAt', from.toISOString()).lte('createdAt', to.toISOString()),
      supabase.from('Transaction').select('amount').eq('type', 'Income').gte('date', from.toISOString()).lte('date', to.toISOString()),
      supabase.from('Transaction').select('amount').eq('type', 'Expense').gte('date', from.toISOString()).lte('date', to.toISOString()),
      supabase.from('SalesOrder').select('*, customer:customerId(companyName)').gte('createdAt', from.toISOString()).lte('createdAt', to.toISOString()).order('totalAmount', { ascending: false }).limit(5),
    ])

    const orders = orderRes.data ?? []
    const incomes = incomeRes.data ?? []
    const expenses = expenseRes.data ?? []
    const topOrders = (topOrdersRes.data ?? []) as any[]

    const revenue = rnd(orders.reduce((s, o: any) => s + (o.totalAmount || 0), 0))
    const expenseTotal = rnd(expenses.reduce((s, o: any) => s + (o.amount || 0), 0))
    const income = rnd(incomes.reduce((s, o: any) => s + (o.amount || 0), 0))
    const profit = rnd(revenue - expenseTotal)
    const orderCount = orders.length
    const avgOrderValue = orderCount > 0 ? rnd(revenue / orderCount) : 0

    return {
      success: true, count: orderCount,
      summary: `${label}: Revenue ${fmt(revenue)} from ${orderCount} orders, Expenses ${fmt(expenseTotal)}, Net Profit ${fmt(profit)}, Avg Order ${fmt(avgOrderValue)}`,
      data: {
        period: label, dateRange: { from, to },
        revenue, income, expenses: expenseTotal, profit,
        orderCount, avgOrderValue,
        topOrders: topOrders.map((o: any) => ({ orderNo: o.orderNo, customer: o.customer?.companyName, amount: o.totalAmount })),
      },
    }
  },

  // ── A2: Get Customer Ledger ──────────────────────────────────────────
  get_customer_ledger: async (p) => {
    const customerName = (p.customerName as string || '').trim()

    if (!customerName) return { success: false, data: null, summary: 'customerName is required.' }

    const { data: customer, error: cErr } = await supabase.from('Customer')
      .select('*')
      .ilike('companyName', `%${customerName}%`)
      .limit(1)
      .single()

    if (cErr || !customer) return { success: false, data: null, summary: `Customer "${customerName}" not found.` }

    let query = supabase.from('SalesOrder')
      .select('*, items:OrderItem(styleName, quantity)')
      .eq('customerId', customer.id)
      .order('orderDate', { ascending: false })

    if (p.fromDate) {
      const from = parseDateInput(p.fromDate as string | undefined)
      if (from) query = query.gte('createdAt', from.toISOString())
    }
    if (p.toDate) {
      const to = parseDateInput(p.toDate as string | undefined)
      if (to) query = query.lte('createdAt', to.toISOString())
    }

    const { data: orders } = await query
    const ordersArr = (orders ?? []) as any[]

    const totalOrdered = rnd(ordersArr.reduce((s, o) => s + o.totalAmount, 0))
    const totalPaid = rnd(ordersArr.reduce((s, o) => s + (o.paidAmount || 0), 0))
    const balanceOutstanding = rnd(totalOrdered - totalPaid)

    return {
      success: true, count: ordersArr.length,
      summary: `${customer.companyName}: ${ordersArr.length} orders, Ordered: ${fmt(totalOrdered)}, Paid: ${fmt(totalPaid)}, Outstanding: ${fmt(balanceOutstanding)}`,
      data: {
        customer: customer.companyName,
        totalOrdered, totalPaid, balanceOutstanding,
        orderCount: ordersArr.length,
        orders: ordersArr.map(o => ({
          orderNo: o.orderNo, date: o.orderDate,
          amount: o.totalAmount, paid: o.paidAmount,
          balance: rnd(o.totalAmount - (o.paidAmount || 0)),
          status: o.status, paymentStatus: o.paymentStatus,
          items: (o.items || []).map((i: any) => `${i.styleName} × ${i.quantity}`),
        })),
      },
    }
  },

  // ── A3: Get Profit Analysis ──────────────────────────────────────────
  get_profit_analysis: async (p) => {
    const groupBy = (p.groupBy as string) || 'order'
    const topN = Math.min(Number(p.topN) || 5, 20)

    const from = parseDateInput(p.fromDate as string | undefined) || new Date(2020, 0, 1)
    const to = parseDateInput(p.toDate as string | undefined) || istNow()

    const { data: orders } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName), items:OrderItem(styleName)')
      .gte('createdAt', from.toISOString())
      .lte('createdAt', to.toISOString())

    const ordersArr = (orders ?? []) as any[]

    // Group by dimension
    const groups: Record<string, { label: string; profit: number; revenue: number; cost: number; count: number }> = {}

    for (const order of ordersArr) {
      let key = ''
      let label = ''
      switch (groupBy) {
        case 'order':
          key = order.id
          label = order.orderNo
          break
        case 'style': {
          const style = (order.items || []).map((i: any) => i.styleName).join(', ') || 'Unknown'
          key = style
          label = style
          break
        }
        case 'customer':
          key = order.customerId
          label = order.customer?.companyName || 'Unknown'
          break
        case 'month': {
          const d = new Date(order.createdAt)
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          label = key
          break
        }
      }

      if (!groups[key]) groups[key] = { label, profit: 0, revenue: 0, cost: 0, count: 0 }
      groups[key].profit += order.grossProfit || 0
      groups[key].revenue += order.totalAmount || 0
      groups[key].cost += order.totalCost || 0
      groups[key].count++
    }

    const sorted = Object.values(groups).sort((a, b) => b.profit - a.profit)
    const topPerformers = sorted.slice(0, topN).map(g => ({
      label: g.label, profit: rnd(g.profit), revenue: rnd(g.revenue),
      cost: rnd(g.cost), margin: g.revenue > 0 ? rnd(g.profit / g.revenue * 100) : 0, orders: g.count,
    }))
    const bottomPerformers = sorted.slice(-topN).reverse().map(g => ({
      label: g.label, profit: rnd(g.profit), revenue: rnd(g.revenue),
      cost: rnd(g.cost), margin: g.revenue > 0 ? rnd(g.profit / g.revenue * 100) : 0, orders: g.count,
    }))

    const totalProfit = rnd(sorted.reduce((s, g) => s + g.profit, 0))
    const totalRevenue = rnd(sorted.reduce((s, g) => s + g.revenue, 0))
    const avgMargin = totalRevenue > 0 ? rnd(totalProfit / totalRevenue * 100) : 0

    return {
      success: true, count: sorted.length,
      summary: `Profit analysis by ${groupBy}: ${sorted.length} groups, Total Profit: ${fmt(totalProfit)}, Avg Margin: ${avgMargin}%`,
      data: {
        groupBy, totalProfit, avgMargin,
        topPerformers, bottomPerformers,
      },
    }
  },

  // ── A4: Get Inventory Alerts ─────────────────────────────────────────
  get_inventory_alerts: async () => {
    const [lowStockRes, zeroStockRes, allFabricsRes] = await Promise.all([
      supabase.from('FabricStock').select('*').gt('availableMeters', 0).lte('availableMeters', 100).order('availableMeters', { ascending: true }),
      supabase.from('FabricStock').select('fabricName').eq('availableMeters', 0),
      supabase.from('FabricStock').select('*').order('availableMeters', { ascending: true }),
    ])

    const lowStock = lowStockRes.data ?? []
    const zeroStock = zeroStockRes.data ?? []
    const allFabrics = allFabricsRes.data ?? []

    const lowStockList = lowStock.map((f: any) => ({
      fabricName: f.fabricName,
      available: f.availableMeters,
      reserved: f.reservedMeters,
      free: f.availableMeters - (f.reservedMeters || 0),
      value: f.totalValue,
    }))

    const zeroStockList = zeroStock.map((f: any) => ({
      fabricName: f.fabricName,
    }))

    const totalValue = rnd(allFabrics.reduce((s: number, f: any) => s + (f.totalValue || 0), 0))

    return {
      success: true, count: allFabrics.length,
      summary: `${allFabrics.length} fabrics tracked. Alerts: ${lowStock.length} low stock (<100m), ${zeroStock.length} zero stock. Total value: ${fmt(totalValue)}`,
      data: {
        lowStock: lowStockList,
        zeroStock: zeroStockList,
        totalValue, fabricCount: allFabrics.length,
      },
    }
  },

  // ── A5: Get Production Efficiency ────────────────────────────────────
  get_production_efficiency: async (p) => {
    let query = supabase.from('ProductionJob').select('*')

    if (p.jobNo) query = query.eq('jobNo', p.jobNo as string)
    if (p.fromDate) {
      const from = parseDateInput(p.fromDate as string | undefined)
      if (from) query = query.gte('createdAt', from.toISOString())
    }
    if (p.toDate) {
      const to = parseDateInput(p.toDate as string | undefined)
      if (to) query = query.lte('createdAt', to.toISOString())
    }

    const { data: jobs } = await query
    const jobsArr = (jobs ?? []) as any[]

    // Manual groupBy stage
    const stageGroups: Record<string, { count: number; target: number; completed: number }> = {}
    for (const j of jobsArr) {
      const stage = j.stage || 'Unknown'
      if (!stageGroups[stage]) stageGroups[stage] = { count: 0, target: 0, completed: 0 }
      stageGroups[stage].count++
      stageGroups[stage].target += j.targetQty || 0
      stageGroups[stage].completed += j.completedQty || 0
    }

    const totalTarget = jobsArr.reduce((s, j) => s + j.targetQty, 0)
    const totalCompleted = jobsArr.reduce((s, j) => s + j.completedQty, 0)
    const avgCompletionRate = totalTarget > 0 ? rnd(totalCompleted / totalTarget * 100) : 0

    const now = istNow()
    const delayedJobs = jobsArr.filter(j =>
      j.endDate && j.endDate < now && j.status !== 'Completed'
    ).map(j => ({
      jobNo: j.jobNo,
      styleName: j.styleName,
      target: j.targetQty,
      completed: j.completedQty,
      endDate: j.endDate,
    }))

    const stageBreakdown = Object.entries(stageGroups).map(([stage, g]) => ({
      stage,
      count: g.count,
      target: g.target,
      completed: g.completed,
    }))

    return {
      success: true, count: jobsArr.length,
      summary: `${jobsArr.length} jobs: ${avgCompletionRate}% avg completion, ${delayedJobs.length} delayed`,
      data: {
        totalJobs: jobsArr.length, totalTarget, totalCompleted, avgCompletionRate,
        delayedJobs,
        stageBreakdown,
      },
    }
  },

  // ── A6: Get Aged Receivables ────────────────────────────────────────
  get_aged_receivables: async (p) => {
    const defaultBuckets = [0, 30, 60, 90, 180]
    const buckets = Array.isArray(p.buckets) ? (p.buckets as number[]).sort((a, b) => a - b) : defaultBuckets

    const { data: unpaidOrders } = await supabase.from('SalesOrder')
      .select('*, customer:customerId(companyName)')
      .in('paymentStatus', ['Unpaid', 'Partial'])

    const unpaidArr = (unpaidOrders ?? []) as any[]
    const now = Date.now()
    const bucketLabels: { label: string; from: number; to: number; amount: number; count: number; orders: any[] }[] = []

    for (let i = 0; i < buckets.length; i++) {
      const fromDays = buckets[i]
      const toDays = i < buckets.length - 1 ? buckets[i + 1] : 99999
      const fromMs = fromDays * 86400000
      const toMs = toDays * 86400000
      const label = i === buckets.length - 1 ? `${fromDays}+ days` : `${fromDays}-${toDays} days`

      const matching = unpaidArr.filter(o => {
        const age = now - new Date(o.orderDate).getTime()
        return age >= fromMs && age < toMs
      })

      const amount = rnd(matching.reduce((s, o) => s + (o.totalAmount - (o.paidAmount || 0)), 0))

      bucketLabels.push({
        label, from: fromDays, to: toDays,
        amount, count: matching.length,
        orders: matching.slice(0, 5).map(o => ({
          orderNo: o.orderNo, customer: o.customer?.companyName,
          outstanding: rnd(o.totalAmount - (o.paidAmount || 0)),
          daysSince: Math.floor((now - new Date(o.orderDate).getTime()) / 86400000),
        })),
      })
    }

    const totalOutstanding = rnd(bucketLabels.reduce((s, b) => s + b.amount, 0))

    return {
      success: true, count: unpaidArr.length,
      summary: `Total outstanding: ${fmt(totalOutstanding)} across ${unpaidArr.length} unpaid/partial orders`,
      data: { totalOutstanding, buckets: bucketLabels },
    }
  },
}
