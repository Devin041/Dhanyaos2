import { supabase } from '@/lib/supabase-db'
import type { ToolDef, ToolResult } from './tools'
import { parseDateInput, istToday, istNow, istMonthStart, istWeekStart, istQuarterStart, istYearStart } from './date-utils'

// ─── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const rnd = (n: number) => Math.round(n * 100) / 100

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
// TOOL DEFINITIONS — 4 GST COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS_GST: ToolDef[] = [
  {
    name: 'get_gst_summary',
    description: 'Get GST liability summary — total taxable value, CGST, SGST, IGST collected, and input tax credit available for a period.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_gstr1_draft',
    description: 'Get GSTR-1 draft with outward supply details — B2B invoices, B2C invoices, HSN summary. For GST filing reference.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_gstr3b_draft',
    description: 'Get GSTR-3B return draft — output GST, input credit, net tax liability, late fees if any.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_gst_hsn_summary',
    description: 'Get HSN-code wise GST summary — total taxable value and tax collected per HSN code.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS — 4 GST COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeGstTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
  switch (toolName) {
    case 'get_gst_summary': return getGstSummary(params)
    case 'get_gstr1_draft': return getGstr1Draft(params)
    case 'get_gstr3b_draft': return getGstr3bDraft(params)
    case 'get_gst_hsn_summary': return getGstHsnSummary(params)
    default:
      return { success: false, data: null, summary: `Unknown GST tool: ${toolName}` }
  }
}

// ── GST-1: Get GST Liability Summary ───────────────────────────────────────────

async function getGstSummary(p: Record<string, unknown>): Promise<ToolResult> {
  const { from, to, label } = getDateRange(p.period as string, p.fromDate as string, p.toDate as string)

  // Fetch all orders in period (excluding Cancelled)
  const { data: orders } = await supabase.from('SalesOrder')
    .select('gstType, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount')
    .gte('orderDate', from.toISOString())
    .lte('orderDate', to.toISOString())
    .neq('status', 'Cancelled')

  // Aggregate by gstType
  let intraTaxable = 0, intraCgst = 0, intraSgst = 0, intraTotal = 0, intraCount = 0
  let interTaxable = 0, interIgst = 0, interTotal = 0, interCount = 0
  let exemptTaxable = 0, exemptTotal = 0, exemptCount = 0

  for (const o of (orders ?? [])) {
    if (o.gstType === 'IntraState') {
      intraTaxable += o.taxableAmount ?? 0
      intraCgst += o.cgstAmount ?? 0
      intraSgst += o.sgstAmount ?? 0
      intraTotal += o.totalAmount ?? 0
      intraCount++
    } else if (o.gstType === 'InterState') {
      interTaxable += o.taxableAmount ?? 0
      interIgst += o.igstAmount ?? 0
      interTotal += o.totalAmount ?? 0
      interCount++
    } else {
      exemptTaxable += o.taxableAmount ?? 0
      exemptTotal += o.totalAmount ?? 0
      exemptCount++
    }
  }

  // Input tax credit from purchase orders in the same period
  const { data: purchaseOrders } = await supabase.from('PurchaseOrder')
    .select('cgstAmount, sgstAmount, igstAmount, totalGst, taxableAmount, gstType')
    .gte('createdAt', from.toISOString())
    .lte('createdAt', to.toISOString())
    .neq('status', 'Cancelled')

  let inputCgst = 0, inputSgst = 0, inputIgst = 0, inputTotal = 0
  for (const po of (purchaseOrders ?? [])) {
    inputCgst += po.cgstAmount ?? 0
    inputSgst += po.sgstAmount ?? 0
    inputIgst += po.igstAmount ?? 0
    inputTotal += po.totalGst ?? 0
  }

  // Also check transactions for gst/tax related expenses
  // Supabase OR: filter by category or description containing gst/tax
  const { data: taxTransactions } = await supabase.from('Transaction')
    .select('amount, category, description')
    .gte('date', from.toISOString())
    .lte('date', to.toISOString())
    .or('category.ilike.%gst%,category.ilike.%tax%,description.ilike.%gst%,description.ilike.%tax%')
  const taxExpenseTotal = (taxTransactions ?? []).reduce((s, t) => s + (t.amount ?? 0), 0)

  const totalTaxable = rnd(intraTaxable + interTaxable + exemptTaxable)
  const totalOutputTax = rnd(intraCgst + intraSgst + interIgst)
  const totalInputCredit = rnd(inputTotal)
  const netLiability = rnd(totalOutputTax - totalInputCredit)
  const totalOrders = orders?.length ?? 0

  const summary =
    `GST Summary (${label}): ${totalOrders} orders. ` +
    `Taxable: ${fmt(totalTaxable)}. ` +
    `Output CGST: ${fmt(intraCgst)}, SGST: ${fmt(intraSgst)}, IGST: ${fmt(interIgst)} — total output tax: ${fmt(totalOutputTax)}. ` +
    `Input credit: ${fmt(totalInputCredit)}. ` +
    `Net liability: ${fmt(Math.max(0, netLiability))}.` +
    (taxExpenseTotal > 0 ? ` Tax-related expenses: ${fmt(taxExpenseTotal)}.` : '')

  return {
    success: true,
    data: {
      period: label,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      totalOrders,
      outputTax: {
        intraState: { taxable: rnd(intraTaxable), cgst: rnd(intraCgst), sgst: rnd(intraSgst), total: rnd(intraTotal), count: intraCount },
        interState: { taxable: rnd(interTaxable), igst: rnd(interIgst), total: rnd(interTotal), count: interCount },
        exempt: { taxable: rnd(exemptTaxable), total: rnd(exemptTotal), count: exemptCount },
        totalTaxable,
        totalOutputTax,
      },
      inputCredit: {
        cgst: rnd(inputCgst),
        sgst: rnd(inputSgst),
        igst: rnd(inputIgst),
        total: totalInputCredit,
        purchaseOrderCount: purchaseOrders?.length ?? 0,
      },
      netLiability,
      taxRelatedExpenses: rnd(taxExpenseTotal),
      taxTransactionCount: taxTransactions?.length ?? 0,
    },
    summary,
    count: totalOrders,
  }
}

// ── GST-2: Get GSTR-1 Draft ────────────────────────────────────────────────────

async function getGstr1Draft(p: Record<string, unknown>): Promise<ToolResult> {
  const { from, to, label } = getDateRange(p.period as string, p.fromDate as string, p.toDate as string)

  // Fetch orders with customer details
  const { data: orders } = await supabase.from('SalesOrder')
    .select('orderNo, orderDate, gstType, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount, customer:customerId(companyName, gstNumber)')
    .gte('orderDate', from.toISOString())
    .lte('orderDate', to.toISOString())
    .neq('status', 'Cancelled')
    .order('orderDate', { ascending: true })

  // Split into B2B and B2C
  const b2b = (orders ?? []).filter(o => (o.customer as any)?.gstNumber && (o.customer as any).gstNumber.trim().length > 0)
  const b2c = (orders ?? []).filter(o => !(o.customer as any)?.gstNumber || (o.customer as any).gstNumber.trim().length === 0)

  // B2B invoices (limit to 20)
  const b2bList = b2b.slice(0, 20).map(o => ({
    orderNo: o.orderNo,
    customerName: (o.customer as any)?.companyName ?? '',
    gstNumber: (o.customer as any)?.gstNumber ?? '',
    taxableAmount: rnd(o.taxableAmount),
    cgst: rnd(o.cgstAmount),
    sgst: rnd(o.sgstAmount),
    igst: rnd(o.igstAmount),
    totalTax: rnd(o.totalGst),
    totalAmount: rnd(o.totalAmount),
  }))

  // B2C invoices (limit to 20)
  const b2cList = b2c.slice(0, 20).map(o => ({
    orderNo: o.orderNo,
    customerName: (o.customer as any)?.companyName ?? '',
    taxableAmount: rnd(o.taxableAmount),
    cgst: rnd(o.cgstAmount),
    sgst: rnd(o.sgstAmount),
    igst: rnd(o.igstAmount),
    totalTax: rnd(o.totalGst),
    totalAmount: rnd(o.totalAmount),
  }))

  // Totals
  const b2bTaxable = rnd(b2b.reduce((s, o) => s + (o.taxableAmount ?? 0), 0))
  const b2bCgst = rnd(b2b.reduce((s, o) => s + (o.cgstAmount ?? 0), 0))
  const b2bSgst = rnd(b2b.reduce((s, o) => s + (o.sgstAmount ?? 0), 0))
  const b2bIgst = rnd(b2b.reduce((s, o) => s + (o.igstAmount ?? 0), 0))
  const b2cTaxable = rnd(b2c.reduce((s, o) => s + (o.taxableAmount ?? 0), 0))
  const b2cCgst = rnd(b2c.reduce((s, o) => s + (o.cgstAmount ?? 0), 0))
  const b2cSgst = rnd(b2c.reduce((s, o) => s + (o.sgstAmount ?? 0), 0))
  const b2cIgst = rnd(b2c.reduce((s, o) => s + (o.igstAmount ?? 0), 0))

  const totalTaxable = rnd(b2bTaxable + b2cTaxable)
  const totalCgst = rnd(b2bCgst + b2cCgst)
  const totalSgst = rnd(b2bSgst + b2cSgst)
  const totalIgst = rnd(b2bIgst + b2cIgst)
  const totalTax = rnd(totalCgst + totalSgst + totalIgst)

  const moreB2b = b2b.length > 20 ? ` (+${b2b.length - 20} more)` : ''
  const moreB2c = b2c.length > 20 ? ` (+${b2c.length - 20} more)` : ''

  const summary =
    `GSTR-1 Draft (${label}): ${(orders ?? []).length} total invoices — ` +
    `${b2b.length} B2B (taxable ${fmt(b2bTaxable)}${moreB2b}), ` +
    `${b2c.length} B2C (taxable ${fmt(b2cTaxable)}${moreB2c}). ` +
    `Total taxable: ${fmt(totalTaxable)}. ` +
    `CGST: ${fmt(totalCgst)}, SGST: ${fmt(totalSgst)}, IGST: ${fmt(totalIgst)}. ` +
    `Total tax: ${fmt(totalTax)}.`

  return {
    success: true,
    data: {
      period: label,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      b2b: { count: b2b.length, invoices: b2bList, taxable: b2bTaxable, cgst: b2bCgst, sgst: b2bSgst, igst: b2bIgst },
      b2c: { count: b2c.length, invoices: b2cList, taxable: b2cTaxable, cgst: b2cCgst, sgst: b2cSgst, igst: b2cIgst },
      totals: { taxable: totalTaxable, cgst: totalCgst, sgst: totalSgst, igst: totalIgst, totalTax },
    },
    summary,
    count: orders?.length ?? 0,
  }
}

// ── GST-3: Get GSTR-3B Draft ───────────────────────────────────────────────────

async function getGstr3bDraft(p: Record<string, unknown>): Promise<ToolResult> {
  const { from, to, label } = getDateRange(p.period as string, p.fromDate as string, p.toDate as string)

  // ── Table 3.1: Outward supplies ──
  const { data: orders } = await supabase.from('SalesOrder')
    .select('gstType, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst')
    .gte('orderDate', from.toISOString())
    .lte('orderDate', to.toISOString())
    .neq('status', 'Cancelled')

  let outTaxable = 0, outCgst = 0, outSgst = 0, outIgst = 0, outTotalTax = 0
  let outInterTaxable = 0, outExemptTaxable = 0

  for (const o of (orders ?? [])) {
    outTaxable += o.taxableAmount ?? 0
    outCgst += o.cgstAmount ?? 0
    outSgst += o.sgstAmount ?? 0
    outIgst += o.igstAmount ?? 0
    outTotalTax += o.totalGst ?? 0
    if (o.gstType === 'InterState') outInterTaxable += o.taxableAmount ?? 0
    if (o.gstType === 'Exempt') outExemptTaxable += o.taxableAmount ?? 0
  }

  // ── Table 4: Input tax credit (from purchase orders) ──
  const { data: purchaseOrders } = await supabase.from('PurchaseOrder')
    .select('cgstAmount, sgstAmount, igstAmount, totalGst, taxableAmount')
    .gte('createdAt', from.toISOString())
    .lte('createdAt', to.toISOString())
    .neq('status', 'Cancelled')

  let inCgst = 0, inSgst = 0, inIgst = 0, inTotalCredit = 0
  for (const po of (purchaseOrders ?? [])) {
    inCgst += po.cgstAmount ?? 0
    inSgst += po.sgstAmount ?? 0
    inIgst += po.igstAmount ?? 0
    inTotalCredit += po.totalGst ?? 0
  }

  // Also check transactions for eligible ITC
  const { data: taxTransactions } = await supabase.from('Transaction')
    .select('amount')
    .gte('date', from.toISOString())
    .lte('date', to.toISOString())
    .or('category.ilike.%gst%,category.ilike.%tax%')
    .eq('type', 'expense')
  const taxExpenseCredit = (taxTransactions ?? []).reduce((s, t) => s + (t.amount ?? 0), 0)

  const totalInputCredit = rnd(inTotalCredit + taxExpenseCredit)

  // ── Net liability ──
  const netCgst = rnd(Math.max(0, outCgst - inCgst))
  const netSgst = rnd(Math.max(0, outSgst - inSgst))
  const netIgst = rnd(Math.max(0, outIgst - inIgst))
  const totalNetLiability = rnd(netCgst + netSgst + netIgst)

  // ── Late fee calculation ──
  // GSTR-3B is due by 20th of next month. If filing period has passed, calculate late fees.
  const now = istNow()
  const periodEnd = new Date(to)
  // Filing deadline: 20th of the month following the period end
  const filingDeadline = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 20)
  let lateFee = 0
  let daysLate = 0
  if (now > filingDeadline) {
    daysLate = Math.ceil((now.getTime() - filingDeadline.getTime()) / (1000 * 60 * 60 * 24))
    // Late fee: ₹50/day (₹20 CGST + ₹20 SGST + ₹10 interest) — simplified to ₹50/day
    lateFee = daysLate * 50
  }

  const summary =
    `GSTR-3B Draft (${label}): ` +
    `Output tax — CGST: ${fmt(outCgst)}, SGST: ${fmt(outSgst)}, IGST: ${fmt(outIgst)} (total: ${fmt(outTotalTax)} on ${fmt(outTaxable)} taxable). ` +
    `Input credit: ${fmt(totalInputCredit)} (${purchaseOrders?.length ?? 0} purchase orders + expenses). ` +
    `Net liability: ${fmt(totalNetLiability)}.` +
    (lateFee > 0 ? ` ⚠️ ${daysLate} days late — late fee: ${fmt(lateFee)}.` : ` Filing deadline not yet passed.`)

  return {
    success: true,
    data: {
      period: label,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      table3_1_outwardSupplies: {
        totalTaxable: rnd(outTaxable),
        intraStateTaxable: rnd(outTaxable - outInterTaxable - outExemptTaxable),
        interStateTaxable: rnd(outInterTaxable),
        exemptTaxable: rnd(outExemptTaxable),
        outputCgst: rnd(outCgst),
        outputSgst: rnd(outSgst),
        outputIgst: rnd(outIgst),
        totalOutputTax: rnd(outTotalTax),
        orderCount: orders?.length ?? 0,
      },
      table4_inputCredit: {
        cgst: rnd(inCgst),
        sgst: rnd(inSgst),
        igst: rnd(inIgst),
        fromPurchaseOrders: rnd(inTotalCredit),
        fromTaxExpenses: rnd(taxExpenseCredit),
        total: totalInputCredit,
        purchaseOrderCount: purchaseOrders?.length ?? 0,
      },
      netLiability: {
        cgst: netCgst,
        sgst: netSgst,
        igst: netIgst,
        total: totalNetLiability,
      },
      filing: {
        deadline: filingDeadline.toISOString().split('T')[0],
        daysLate,
        lateFee: rnd(lateFee),
        isOverdue: lateFee > 0,
      },
    },
    summary,
    count: orders?.length ?? 0,
  }
}

// ── GST-4: Get HSN-wise Tax Summary ────────────────────────────────────────────

async function getGstHsnSummary(p: Record<string, unknown>): Promise<ToolResult> {
  const { from, to, label } = getDateRange(p.period as string, p.fromDate as string, p.toDate as string)

  // Fetch orders with items and style details
  const { data: orders } = await supabase.from('SalesOrder')
    .select('id, gstType, gstPercent, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, items:OrderItem(styleName, quantity, totalAmount, style:styleId(category, fabricType))')
    .gte('orderDate', from.toISOString())
    .lte('orderDate', to.toISOString())
    .neq('status', 'Cancelled')

  // Group by fabricType (best proxy for HSN) or category, fallback to styleName
  const groups: Record<string, {
    fabricType: string
    category: string | null
    totalQty: number
    taxableValue: number
    cgst: number
    sgst: number
    igst: number
    totalTax: number
    taxRate: number
    orderCount: number
  }> = {}

  for (const order of (orders ?? [])) {
    const orderAny = order as any
    // Distribute order tax proportionally across items
    const orderTotal = orderAny.taxableAmount || 1 // avoid div by 0

    for (const item of (orderAny.items ?? [])) {
      const itemShare = item.totalAmount / orderTotal
      const itemTaxable = orderAny.taxableAmount * itemShare
      const itemCgst = orderAny.cgstAmount * itemShare
      const itemSgst = orderAny.sgstAmount * itemShare
      const itemIgst = orderAny.igstAmount * itemShare

      // Key: prefer fabricType, fallback to category, fallback to styleName
      const key = item.style?.fabricType || item.style?.category || item.styleName || 'Unclassified'

      if (!groups[key]) {
        groups[key] = {
          fabricType: item.style?.fabricType || 'N/A',
          category: item.style?.category || null,
          totalQty: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0,
          taxRate: orderAny.gstPercent || 18,
          orderCount: 0,
        }
      }

      const g = groups[key]
      g.totalQty += item.quantity ?? 0
      g.taxableValue += itemTaxable
      g.cgst += itemCgst
      g.sgst += itemSgst
      g.igst += itemIgst
      g.totalTax += itemCgst + itemSgst + itemIgst
      g.orderCount++
    }
  }

  // Convert to sorted array
  const hsnList = Object.entries(groups)
    .map(([key, g]) => ({
      hsnKey: key,
      fabricType: g.fabricType,
      category: g.category,
      totalQty: g.totalQty,
      taxableValue: rnd(g.taxableValue),
      taxRate: g.taxRate,
      cgst: rnd(g.cgst),
      sgst: rnd(g.sgst),
      igst: rnd(g.igst),
      totalTax: rnd(g.totalTax),
      orderCount: g.orderCount,
    }))
    .sort((a, b) => b.taxableValue - a.taxableValue)

  const totalTaxable = rnd(hsnList.reduce((s, h) => s + h.taxableValue, 0))
  const totalTax = rnd(hsnList.reduce((s, h) => s + h.totalTax, 0))

  const hasHsnMapping = hsnList.every(h => h.fabricType !== 'N/A' || h.category !== null)

  const summary =
    `HSN Summary (${label}): ${hsnList.length} groups across ${(orders ?? []).length} orders. ` +
    `Total taxable: ${fmt(totalTaxable)}, total tax: ${fmt(totalTax)}. ` +
    (hasHsnMapping
      ? `Grouped by fabric type/category as HSN proxy.`
      : `⚠️ Note: No dedicated HSN codes in the system. Grouped by fabric type and category as proxy. For actual filing, map each group to the correct HSN code (garments typically fall under 6109/6110/6203/6204/6205/6206).`)

  return {
    success: true,
    data: {
      period: label,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      hsnGroups: hsnList,
      totals: {
        groups: hsnList.length,
        taxableValue: totalTaxable,
        totalTax,
        orderCount: orders?.length ?? 0,
      },
      note: hasHsnMapping
        ? 'Grouped by fabric type/category as HSN proxy.'
        : 'No dedicated HSN codes in schema. Fabric type and category used as grouping proxy. Map to actual HSN codes (6109, 6110, 6203, 6204, 6205, 6206 for garments) before filing.',
    },
    summary,
    count: hsnList.length,
  }
}
