// ─── Fact Card Generator — Anti-Hallucination Layer ─────────────────────────
// Generates verified fact strings from tool results.
// LLM uses these facts as TRUTH — numbers are LOCKED.

import { fmt } from './tools'
import { istToday, istDayName, istMonthName, istNow, timeAgo } from './date-utils'
import type { ToolResult } from './tools'

export interface FactNumber {
  label: string
  value: number
  unit: string
  source: string
  isStale: boolean
  staleNote?: string
}

export interface FactCard {
  facts: string[]
  numbers: FactNumber[]
  queryType: 'summary' | 'detail' | 'aggregate' | 'create' | 'update' | 'search'
  toolsUsed: string[]
  dataFreshness: 'live' | 'stale' | 'empty'
  timestamp: string
  rawSummary: string
}

/** Generate a Fact Card from a tool result */
export function generateFactCard(toolName: string, result: ToolResult): FactCard {
  if (!result.success) {
    return {
      facts: [`Error: ${result.summary}`],
      numbers: [],
      queryType: 'detail',
      toolsUsed: [toolName],
      dataFreshness: 'empty',
      timestamp: new Date().toISOString(),
      rawSummary: result.summary,
    }
  }

  const d = result.data as Record<string, unknown>
  const today = istToday()

  switch (toolName) {
    // ── READ tools with rich cards ──
    case 'get_daily_summary':
      return dailySummaryCard(d)
    case 'get_orders':
      return ordersCard(d, result.count || 0)
    case 'get_order_detail':
      return orderDetailCard(d)
    case 'get_inventory':
      return inventoryCard(d, result.summary)
    case 'get_transactions':
      return transactionsCard(d, result.summary)
    case 'get_production_jobs':
      return productionCard(d, result.summary)
    case 'get_overdue_orders':
      return overdueCard(d, result.count || 0)
    case 'get_cost_sheets':
      return costSheetsCard(d, result.count || 0)
    case 'get_quotations':
      return quotationsCard(d, result.count || 0)
    case 'get_dispatches':
      return listCard(toolName, d, result, 'dispatch')
    case 'get_purchase_orders':
      return listCard(toolName, d, result, 'purchase order')
    case 'get_samples':
      return listCard(toolName, d, result, 'sample')
    case 'get_quality_checks':
      return qualityChecksCard(d, result.count || 0)
    case 'get_returns':
      return listCard(toolName, d, result, 'return')
    case 'get_grn_notes':
      return listCard(toolName, d, result, 'GRN note')
    // ── CREATE tools ──
    case 'create_cost_sheet':
      return createCard(toolName, d, result, 'Cost Sheet')
    case 'create_quotation':
      return createCard(toolName, d, result, 'Quotation')
    case 'create_sales_order':
      return createCard(toolName, d, result, 'Sales Order')
    case 'create_production_job':
      return createCard(toolName, d, result, 'Production Job')
    case 'create_purchase_order':
      return createCard(toolName, d, result, 'Purchase Order')
    case 'create_transaction':
      return createTransactionCard(d, result)
    case 'create_dispatch':
      return createCard(toolName, d, result, 'Dispatch')
    case 'create_grn_note':
      return createCard(toolName, d, result, 'GRN Note')
    case 'create_sample':
      return createCard(toolName, d, result, 'Sample')
    case 'create_quality_check':
      return createCard(toolName, d, result, 'Quality Check')
    case 'create_return':
      return createCard(toolName, d, result, 'Return')
    case 'create_customer':
      return createCard(toolName, d, result, 'Customer')
    case 'create_supplier':
      return createCard(toolName, d, result, 'Supplier')
    case 'create_employee':
      return createCard(toolName, d, result, 'Employee')
    case 'create_quotation_from_cost_sheet':
      return createCard(toolName, d, result, 'Quotation from Cost Sheet')
    // ── UPDATE tools ──
    case 'update_order_status':
    case 'record_payment':
    case 'update_production_job':
    case 'update_po_status':
    case 'update_dispatch_status':
    case 'update_inventory':
    case 'update_sample_status':
    case 'update_quotation_status':
    case 'update_cost_sheet_status':
      return updateCard(toolName, d, result)
    // ── WORKFLOW tools ──
    case 'convert_quotation_to_order':
      return workflowCard(toolName, d, result, 'Quotation converted to Order')
    case 'record_dispatch_from_order':
      return workflowCard(toolName, d, result, 'Dispatch recorded from Order')
    case 'record_grn_and_update_stock':
      return workflowCard(toolName, d, result, 'GRN recorded and stock updated')
    case 'close_order':
      return workflowCard(toolName, d, result, 'Order closed')
    case 'bulk_order_status_update':
      return workflowCard(toolName, d, result, 'Bulk status update')
    // ── ANALYTICS tools ──
    case 'get_revenue_report':
      return analyticsCard(toolName, d, result)
    case 'get_customer_ledger':
      return analyticsCard(toolName, d, result)
    case 'get_profit_analysis':
      return analyticsCard(toolName, d, result)
    case 'get_inventory_alerts':
      return analyticsCard(toolName, d, result)
    case 'get_production_efficiency':
      return analyticsCard(toolName, d, result)
    case 'get_aged_receivables':
      return analyticsCard(toolName, d, result)
    default:
      return genericCard(toolName, result)
  }
}

// ─── Card Generators ──────────────────────────────────────────────────────

function dailySummaryCard(d: Record<string, unknown>): FactCard {
  const facts: string[] = []
  const numbers: FactNumber[] = []
  const revenue = Number(d.revenue || 0)
  const todayIncome = Number(d.todayIncome || 0)
  const todayExpense = Number(d.todayExpense || 0)
  const cashBalance = Number(d.cashBalance || 0)
  const inventoryValue = Number(d.inventoryValue || 0)
  const ordersCount = Number(d.ordersCount || 0)
  const activeOrdersCount = Number(d.activeOrdersCount || 0)
  const activeOrdersValue = Number(d.activeOrdersValue || 0)
  const receivables = Number(d.receivables || 0)
  const payables = Number(d.payables || 0)
  const overdueCount = Number(d.overdueCount || 0)
  const dispatchQty = Number(d.dispatchQty || 0)
  const prodQty = Number(d.productionQty || 0)

  // Build facts with conditional messaging
  const dateStr = String(d.date || istToday())
  if (ordersCount === 0) {
    facts.push(`Aaj (${dateStr}, ${istDayName()}) koi naya order nahi bana hai`)
  } else {
    facts.push(`Aaj ${ordersCount} naye orders aaye — total ${fmt(revenue)}`)
  }

  if (todayIncome === 0) {
    facts.push(`Aaj koi income (payment) nahi aayi`)
  } else {
    facts.push(`Aaj ki total income: ${fmt(todayIncome)}`)
  }

  if (todayExpense === 0) {
    facts.push(`Aaj koi expense record nahi hai`)
  } else {
    facts.push(`Aaj ki total expense: ${fmt(todayExpense)}`)
  }

  const netProfit = todayIncome - todayExpense
  facts.push(`Aaj ka net cash flow: ${fmt(netProfit)} (${todayIncome === 0 && todayExpense === 0 ? 'koi transaction nahi' : netProfit >= 0 ? 'positive' : 'negative'})`)

  // Cash balance — check staleness
  const lastTxnDate = d.lastTransactionDate as string | null | undefined
  const isCashStale = !lastTxnDate || (Date.now() - new Date(lastTxnDate).getTime() > 2 * 86400000)
  if (isCashStale) {
    facts.push(`Cash balance: ${fmt(cashBalance)} (calculated from all transactions — WARNING: last transaction ${lastTxnDate ? timeAgo(new Date(lastTxnDate)) : 'never'})`)
  } else {
    facts.push(`Cash balance: ${fmt(cashBalance)} (from transactions)`)
  }

  facts.push(`Active orders: ${activeOrdersCount} worth ${fmt(activeOrdersValue)}`)
  facts.push(`Inventory value: ${fmt(inventoryValue)}`)
  facts.push(`Receivables (unpaid): ${fmt(receivables)}`)
  facts.push(`Payables (unpaid POs): ${fmt(payables)}`)

  if (overdueCount > 0) {
    facts.push(`⚠️ ${overdueCount} overdue orders hain`)
  } else {
    facts.push(`Koi overdue order nahi hai ✅`)
  }

  if (dispatchQty > 0) facts.push(`Aaj ${dispatchQty} pcs dispatch hue`)
  if (prodQty > 0) facts.push(`Aaj ${prodQty} pcs production complete hui`)

  // Numbers for validation
  numbers.push(
    { label: "Today's New Orders", value: ordersCount, unit: 'count', source: 'SalesOrder.orderDate', isStale: false },
    { label: "Today's Order Revenue", value: revenue, unit: 'INR', source: 'SalesOrder.orderDate', isStale: false },
    { label: "Today's Income", value: todayIncome, unit: 'INR', source: 'Transaction.type=Income', isStale: false },
    { label: "Today's Expense", value: todayExpense, unit: 'INR', source: 'Transaction.type=Expense', isStale: false },
    { label: "Cash Balance", value: cashBalance, unit: 'INR', source: 'Transaction aggregate', isStale: isCashStale, staleNote: lastTxnDate ? `Last txn ${timeAgo(new Date(lastTxnDate))}` : 'No transactions' },
    { label: 'Receivables', value: receivables, unit: 'INR', source: 'SalesOrder unpaid', isStale: false },
    { label: 'Payables', value: payables, unit: 'INR', source: 'PurchaseOrder unpaid', isStale: false },
    { label: 'Inventory Value', value: inventoryValue, unit: 'INR', source: 'FabricStock', isStale: false },
    { label: 'Active Orders', value: activeOrdersCount, unit: 'count', source: 'SalesOrder', isStale: false },
    { label: 'Overdue Orders', value: overdueCount, unit: 'count', source: 'SalesOrder', isStale: false },
  )

  return {
    facts,
    numbers,
    queryType: 'summary',
    toolsUsed: ['get_daily_summary'],
    dataFreshness: ordersCount === 0 && todayIncome === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `${dateStr} | Orders: ${ordersCount} | Income: ${fmt(todayIncome)} | Expense: ${fmt(todayExpense)} | Cash: ${fmt(cashBalance)}`,
  }
}

function ordersCard(d: unknown, count: number): FactCard {
  const items = d as Array<Record<string, unknown>>
  const facts: string[] = []
  const numbers: FactNumber[] = []

  if (count === 0) {
    facts.push('Koi orders nahi mile filter ke hisaab se')
  } else {
    facts.push(`${count} orders mile`)
    const totalAmount = items.reduce((s, o) => s + Number(o.amount || 0), 0)
    facts.push(`Total value: ${fmt(totalAmount)}`)
    numbers.push({ label: 'Total Orders', value: count, unit: 'count', source: 'SalesOrder', isStale: false })
    numbers.push({ label: 'Total Value', value: totalAmount, unit: 'INR', source: 'SalesOrder.totalAmount', isStale: false })
  }

  return {
    facts, numbers,
    queryType: 'detail',
    toolsUsed: ['get_orders'],
    dataFreshness: count === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `${count} orders found`,
  }
}

function orderDetailCard(d: Record<string, unknown>): FactCard {
  const facts: string[] = [
    `Order ${d.orderNo} — ${d.customer}`,
    `Amount: ${fmt(d.amount)}`,
    `Status: ${d.status}`,
    `Payment: ${d.paymentStatus} (${fmt(d.paidAmount)} paid of ${fmt(d.amount)})`,
  ]
  if (d.items) {
    const items = d.items as Array<Record<string, unknown>>
    facts.push(`${items.length} items`)
  }
  if (d.productionJobs) {
    const jobs = d.productionJobs as Array<Record<string, unknown>>
    facts.push(`${jobs.length} production jobs`)
  }

  return {
    facts,
    numbers: [
      { label: 'Order Amount', value: Number(d.amount || 0), unit: 'INR', source: 'SalesOrder', isStale: false },
      { label: 'Paid Amount', value: Number(d.paidAmount || 0), unit: 'INR', source: 'SalesOrder', isStale: false },
    ],
    queryType: 'detail',
    toolsUsed: ['get_order_detail'],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `Order ${d.orderNo}`,
  }
}

function inventoryCard(d: unknown, summary: string): FactCard {
  const fabrics = d as Array<Record<string, unknown>>
  const totalValue = fabrics.reduce((s, f) => s + Number(f.value || 0), 0)
  const lowStock = fabrics.filter(f => Number(f.free || f.available) < 50)

  return {
    facts: [
      summary,
      lowStock.length > 0 ? `⚠️ ${lowStock.length} fabrics me kam stock hai (< 50m free)` : 'Sab fabrics me sufficient stock hai',
    ],
    numbers: [
      { label: 'Total Fabrics', value: fabrics.length, unit: 'count', source: 'FabricStock', isStale: false },
      { label: 'Total Value', value: totalValue, unit: 'INR', source: 'FabricStock', isStale: false },
    ],
    queryType: 'detail',
    toolsUsed: ['get_inventory'],
    dataFreshness: fabrics.length === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: summary,
  }
}

function transactionsCard(d: unknown, summary: string): FactCard {
  const txns = d as Array<Record<string, unknown>>
  const totalAmount = txns.reduce((s, t) => s + Number(t.amount || 0), 0)

  return {
    facts: [
      summary,
      txns.length === 0 ? 'Koi transactions nahi mile filter ke hisaab se' : undefined,
    ].filter(Boolean) as string[],
    numbers: [
      { label: 'Transaction Count', value: txns.length, unit: 'count', source: 'Transaction', isStale: false },
      { label: 'Total Amount', value: totalAmount, unit: 'INR', source: 'Transaction.amount', isStale: false },
    ],
    queryType: 'detail',
    toolsUsed: ['get_transactions'],
    dataFreshness: txns.length === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: summary,
  }
}

function productionCard(d: unknown, summary: string): FactCard {
  const data = d as Record<string, unknown>
  const jobs = (data.jobs || []) as Array<Record<string, unknown>>
  const summaryData = (data.summary || []) as Array<Record<string, unknown>>

  return {
    facts: [summary],
    numbers: summaryData.map(s => ({
      label: `Status: ${s.status}`,
      value: Number(s.count || 0),
      unit: 'count',
      source: 'ProductionJob',
      isStale: false,
    })),
    queryType: 'detail',
    toolsUsed: ['get_production_jobs'],
    dataFreshness: jobs.length === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: summary,
  }
}

function overdueCard(d: unknown, count: number): FactCard {
  const orders = d as Array<Record<string, unknown>>

  return {
    facts: count > 0
      ? [`${count} overdue orders hain`, ...orders.slice(0, 5).map(o => `${o.orderNo} — ${o.customer} — ${fmt(o.amount)} — ${o.daysLate} days late`)]
      : ['Koi overdue order nahi hai! Sab timely hain. ✅'],
    numbers: [
      { label: 'Overdue Orders', value: count, unit: 'count', source: 'SalesOrder', isStale: false },
    ],
    queryType: 'detail',
    toolsUsed: ['get_overdue_orders'],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `${count} overdue orders`,
  }
}

// ─── Shared Card Generators for WRITE/UPDATE/WORKFLOW/ANALYTICS ────────────

function costSheetsCard(d: unknown, count: number): FactCard {
  const items = d as Array<Record<string, unknown>>
  return {
    facts: count === 0
      ? ['Koi cost sheets nahi mile filter ke hisaab se']
      : [`${count} cost sheets mile`, ...items.slice(0, 5).map(c => `${c.sheetNo} — ${c.styleName} — cost: ${fmt(c.totalCost)} — selling: ${fmt(c.sellingPrice)} — ${c.status}`)],
    numbers: items.map(c => ({
      label: `${c.sheetNo} cost`, value: Number(c.totalCost || 0), unit: 'INR', source: 'CostSheet', isStale: false,
    })),
    queryType: 'detail',
    toolsUsed: ['get_cost_sheets'],
    dataFreshness: count === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `${count} cost sheets`,
  }
}

function quotationsCard(d: unknown, count: number): FactCard {
  const items = d as Array<Record<string, unknown>>
  return {
    facts: count === 0
      ? ['Koi quotations nahi mile filter ke hisaab se']
      : [`${count} quotations mile`, ...items.slice(0, 5).map(q => `${q.quoteNo} — ${q.customer} — ${fmt(q.amount)} — ${q.status}`)],
    numbers: items.map(q => ({
      label: `${q.quoteNo} amount`, value: Number(q.amount || 0), unit: 'INR', source: 'Quotation', isStale: false,
    })),
    queryType: 'detail',
    toolsUsed: ['get_quotations'],
    dataFreshness: count === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `${count} quotations`,
  }
}

function qualityChecksCard(d: unknown, count: number): FactCard {
  const items = d as Array<Record<string, unknown>>
  const passed = items.filter(q => q.status === 'Pass').length
  const failed = items.filter(q => q.status === 'Fail').length
  return {
    facts: [
      `${count} quality check records`,
      passed > 0 ? `${passed} passed ✅` : undefined,
      failed > 0 ? `${failed} failed ❌` : undefined,
    ].filter(Boolean) as string[],
    numbers: [
      { label: 'Total Checks', value: count, unit: 'count', source: 'QualityCheck', isStale: false },
      { label: 'Passed', value: passed, unit: 'count', source: 'QualityCheck', isStale: false },
      { label: 'Failed', value: failed, unit: 'count', source: 'QualityCheck', isStale: false },
    ],
    queryType: 'detail',
    toolsUsed: ['get_quality_checks'],
    dataFreshness: count === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: `${count} quality checks`,
  }
}

function listCard(toolName: string, d: unknown, result: ToolResult, itemType: string): FactCard {
  const items = d as Array<Record<string, unknown>>
  const count = result.count || items.length
  return {
    facts: count === 0
      ? [`Koi ${itemType} nahi mila filter ke hisaab se`]
      : [`${count} ${itemType}s found`],
    numbers: count > 0 ? [{ label: `${itemType} Count`, value: count, unit: 'count', source: toolName, isStale: false }] : [],
    queryType: 'detail',
    toolsUsed: [toolName],
    dataFreshness: count === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

function createCard(toolName: string, d: Record<string, unknown>, result: ToolResult, label: string): FactCard {
  // Extract the auto-generated number/key from data
  const keys = Object.keys(d)
  const numberKey = keys.find(k => /no|number|id/i.test(k) && typeof d[k] === 'string' && d[k].length < 30)
  const amountKey = keys.find(k => /amount|total|value|cost|price/i.test(k) && typeof d[k] === 'number')
  const ref = numberKey ? `${d[numberKey]}` : label

  const facts = [`${label} ${ref} successfully created ✅`, result.summary]
  const numbers: FactNumber[] = []
  if (amountKey && Number(d[amountKey]) > 0) {
    numbers.push({ label: `${ref} amount`, value: Number(d[amountKey]), unit: 'INR', source: toolName, isStale: false })
  }

  return {
    facts,
    numbers,
    queryType: 'create',
    toolsUsed: [toolName],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

function createTransactionCard(d: Record<string, unknown>, result: ToolResult): FactCard {
  const type = String(d.type || 'Transaction')
  const amount = Number(d.amount || 0)
  return {
    facts: [
      `${type} transaction of ${fmt(amount)} recorded ✅`,
      `Category: ${d.category}`,
      `Description: ${d.description}`,
    ],
    numbers: [
      { label: 'Transaction Amount', value: amount, unit: 'INR', source: 'Transaction', isStale: false },
    ],
    queryType: 'create',
    toolsUsed: ['create_transaction'],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

function updateCard(toolName: string, d: Record<string, unknown>, result: ToolResult): FactCard {
  return {
    facts: [`Update successful ✅`, result.summary],
    numbers: [],
    queryType: 'update',
    toolsUsed: [toolName],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

function workflowCard(toolName: string, d: Record<string, unknown>, result: ToolResult, action: string): FactCard {
  // Extract key numbers from workflow result
  const numbers: FactNumber[] = []
  const keys = Object.keys(d)
  for (const k of keys) {
    if (/amount|total|value|balance|qty|quantity/i.test(k) && typeof d[k] === 'number' && Number(d[k]) > 0) {
      numbers.push({ label: k, value: Number(d[k]), unit: /qty|quantity/i.test(k) ? 'count' : 'INR', source: toolName, isStale: false })
    }
  }
  return {
    facts: [`${action} — completed ✅`, result.summary],
    numbers,
    queryType: 'update',
    toolsUsed: [toolName],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

function analyticsCard(toolName: string, d: Record<string, unknown>, result: ToolResult): FactCard {
  // Extract all numeric values from analytics data
  const numbers: FactNumber[] = []
  const extractNumbers = (obj: Record<string, unknown>, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number' && v !== 0) {
        numbers.push({
          label: prefix ? `${prefix} — ${k}` : k,
          value: v,
          unit: /amount|revenue|cost|profit|value|balance|payable|receivable/i.test(k) ? 'INR' : 'count',
          source: toolName,
          isStale: false,
        })
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        extractNumbers(v as Record<string, unknown>, k)
      }
    }
  }
  extractNumbers(d)

  return {
    facts: [result.summary],
    numbers: numbers.slice(0, 20), // Cap at 20 numbers to avoid token bloat
    queryType: 'aggregate',
    toolsUsed: [toolName],
    dataFreshness: 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

function genericCard(toolName: string, result: ToolResult): FactCard {
  return {
    facts: [result.summary],
    numbers: result.count !== undefined ? [{
      label: 'Record Count', value: result.count, unit: 'count', source: toolName, isStale: false,
    }] : [],
    queryType: 'detail',
    toolsUsed: [toolName],
    dataFreshness: (result.count || 0) === 0 ? 'empty' : 'live',
    timestamp: new Date().toISOString(),
    rawSummary: result.summary,
  }
}

// ─── Post-LLM Validation ──────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean
  issues: string[]
}

/** Basic validation: check if LLM response contains obviously wrong numbers */
export function validateResponse(factCard: FactCard, llmResponse: string): ValidationResult {
  const issues: string[] = []

  // If fact card says 0 orders, LLM should not claim orders exist
  const zeroFacts = factCard.numbers.filter(n => n.value === 0)
  for (const zf of zeroFacts) {
    // Look for patterns like "X orders" where X > 0 when it should be 0
    if (zf.unit === 'count' && zf.label.toLowerCase().includes('order')) {
      const orderCountMatch = llmResponse.match(/(\d+)\s*(orders?|अर्डर)/i)
      if (orderCountMatch && parseInt(orderCountMatch[1]) > 0) {
        issues.push(`Fact card says ${zf.label} = 0, but LLM mentioned ${orderCountMatch[1]} orders`)
      }
    }
    // Check for currency amounts that shouldn't exist
    if (zf.unit === 'INR') {
      // Extract all ₹ amounts from response
      const amounts = llmResponse.match(/₹\s*[\d,]+/g) || []
      for (const amt of amounts) {
        const num = parseInt(amt.replace(/[₹,\s]/g, ''))
        if (num > 0 && num > 1000 && zf.value === 0) {
          // Might be hallucination if fact says 0 but LLM cites large number
          // This is a soft check — only flag if the label matches context
          if (zf.label.toLowerCase().includes('revenue') || zf.label.toLowerCase().includes('income') || zf.label.toLowerCase().includes('expense')) {
            const responseLower = llmResponse.toLowerCase()
            if ((zf.label.toLowerCase().includes('revenue') && responseLower.includes('revenue')) ||
                (zf.label.toLowerCase().includes('income') && responseLower.includes('income'))) {
              issues.push(`Fact card says ${zf.label} = ₹0, but LLM mentioned ${amt}`)
            }
          }
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}