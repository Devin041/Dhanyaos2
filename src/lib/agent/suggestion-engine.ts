// ─── Suggestion Engine ──────────────────────────────────────────────────────────
// Rule-based engine that generates context-aware quick action suggestions
// after each AI agent tool call. ~200 lines, zero dependencies.
// ────────────────────────────────────────────────────────────────────────────────

export interface Suggestion {
  label: string
  message: string
  icon: string
  category: 'drill_down' | 'follow_up' | 'related' | 'action'
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Safely grab the first item from tool result data */
function firstItem(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data) && data.length > 0) return data[0] as Record<string, unknown>
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as Record<string, unknown>).items
    if (Array.isArray(items) && items.length > 0) return items[0] as Record<string, unknown>
  }
  if (data && typeof data === 'object') return data as Record<string, unknown>
  return null
}

/** Try to read a string field from first item */
function field(data: unknown, ...keys: string[]): string {
  const item = firstItem(data)
  if (!item) return ''
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

/** Count of results returned */
function countOf(data: unknown): number {
  if (Array.isArray(data)) return data.length
  if (data && typeof data === 'object' && 'count' in data) return Number((data as Record<string, unknown>).count) || 0
  return 0
}

// ─── Rule Matrix ────────────────────────────────────────────────────────────────

function matchRules(tool: string, data: unknown): Suggestion[] {
  const id = field(data, 'orderNo', 'sheetNo', 'jobNo', 'quotationNo', 'dispatchNo', 'grnNo', 'sampleNo', 'checkNo', 'poNo', 'txNo', 'styleNo')
  const name = field(data, 'customerName', 'fabricName', 'styleName', 'employeeName', 'supplierName', 'name')
  const ref = id || name

  // ── get_orders ──────────────────────────────────────────────────────────────
  if (tool === 'get_orders') {
    const drill = ref ? `Order ${ref} ka detail dikhao` : 'Order detail dikhao'
    return [
      { label: drill, message: ref ? `${ref} ka detail dikhao` : 'Order detail dikhao', icon: 'FileText', category: 'drill_down' },
      { label: 'Overdue orders check karo', message: 'Overdue orders check karo', icon: 'AlertTriangle', category: 'follow_up' },
      { label: 'Revenue report banao', message: 'Revenue report banao', icon: 'BarChart3', category: 'related' },
    ]
  }

  // ── get_daily_summary ──────────────────────────────────────────────────────
  if (tool === 'get_daily_summary') {
    return [
      { label: 'Pending orders dikhao', message: 'Pending orders dikhao', icon: 'Clock', category: 'follow_up' },
      { label: 'Transactions detail', message: 'Aaj ki transactions dikhao', icon: 'Receipt', category: 'follow_up' },
      { label: 'Inventory check', message: 'Low stock inventory check karo', icon: 'Package', category: 'follow_up' },
    ]
  }

  // ── get_inventory / get_inventory_alerts ────────────────────────────────────
  if (tool === 'get_inventory' || tool === 'get_inventory_alerts') {
    const fab = field(data, 'fabricName', 'name')
    return [
      { label: 'Purchase order banao', message: fab ? `${fab} ke liye purchase order banao` : 'Purchase order banao', icon: 'ShoppingCart', category: 'action' },
      { label: 'GRN note dikhao', message: 'Recent GRN notes dikhao', icon: 'FileCheck', category: 'follow_up' },
      { label: 'Fabric consumption', message: 'Fabric consumption report dikhao', icon: 'Scissors', category: 'related' },
    ]
  }

  // ── get_production_jobs ────────────────────────────────────────────────────
  if (tool === 'get_production_jobs') {
    const drill = ref ? `Job ${ref} ka detail dikhao` : 'Job detail dikhao'
    return [
      { label: drill, message: ref ? `${ref} ka detail dikhao` : 'Job detail dikhao', icon: 'Wrench', category: 'drill_down' },
      { label: 'Efficiency report', message: 'Production efficiency report dikhao', icon: 'TrendingUp', category: 'related' },
      { label: 'Delayed jobs', message: 'Delayed production jobs dikhao', icon: 'AlertTriangle', category: 'follow_up' },
    ]
  }

  // ── get_customer_ledger ────────────────────────────────────────────────────
  if (tool === 'get_customer_ledger') {
    return [
      { label: 'Payment record karo', message: 'Payment record karo', icon: 'CreditCard', category: 'action' },
      { label: 'Outstanding report', message: 'Outstanding report dikhao', icon: 'FileWarning', category: 'follow_up' },
    ]
  }

  // ── get_revenue_report ─────────────────────────────────────────────────────
  if (tool === 'get_revenue_report') {
    return [
      { label: 'Profit analysis', message: 'Profit analysis dikhao', icon: 'PieChart', category: 'related' },
      { label: 'Customer wise breakdown', message: 'Customer wise revenue breakdown dikhao', icon: 'Users', category: 'follow_up' },
    ]
  }

  // ── get_transactions ───────────────────────────────────────────────────────
  if (tool === 'get_transactions') {
    return [
      { label: 'Income vs expense', message: 'Income vs expense comparison dikhao', icon: 'ArrowLeftRight', category: 'related' },
      { label: 'Daily summary', message: 'Aaj ka daily summary dikhao', icon: 'CalendarDays', category: 'follow_up' },
    ]
  }

  // ── get_overdue_orders ─────────────────────────────────────────────────────
  if (tool === 'get_overdue_orders') {
    return [
      { label: 'Contact customers', message: 'Overdue order ke customers ko contact karo', icon: 'Phone', category: 'action' },
      { label: 'Update order status', message: 'Order status update karo', icon: 'RefreshCw', category: 'action' },
    ]
  }

  // ── get_cost_sheets ────────────────────────────────────────────────────────
  if (tool === 'get_cost_sheets') {
    const drill = ref ? `Cost sheet ${ref} ka detail` : 'Cost sheet detail'
    return [
      { label: drill, message: ref ? `${ref} ka detail dikhao` : 'Cost sheet detail dikhao', icon: 'FileSpreadsheet', category: 'drill_down' },
      { label: 'Quotation banao', message: ref ? `${ref} se quotation banao` : 'Quotation banao', icon: 'FilePlus2', category: 'action' },
    ]
  }

  // ── get_quotations ─────────────────────────────────────────────────────────
  if (tool === 'get_quotations') {
    const drill = ref ? `Quotation ${ref} detail` : 'Quotation detail'
    return [
      { label: 'Quotation convert karo', message: ref ? `${ref} ko order mein convert karo` : 'Quotation convert karo', icon: 'ArrowRightLeft', category: 'action' },
      { label: drill, message: ref ? `${ref} ka detail dikhao` : 'Quotation detail dikhao', icon: 'FileText', category: 'drill_down' },
    ]
  }

  // ── get_dispatches ─────────────────────────────────────────────────────────
  if (tool === 'get_dispatches') {
    const drill = ref ? `Dispatch ${ref} detail` : 'Dispatch detail'
    return [
      { label: drill, message: ref ? `${ref} ka detail dikhao` : 'Dispatch detail dikhao', icon: 'Truck', category: 'drill_down' },
      { label: 'Pending orders', message: 'Pending orders dikhao', icon: 'Clock', category: 'follow_up' },
    ]
  }

  // ── get_samples ────────────────────────────────────────────────────────────
  if (tool === 'get_samples') {
    return [
      { label: 'Sample status update', message: 'Sample status update karo', icon: 'RefreshCw', category: 'action' },
      { label: 'Cost sheet banao', message: 'Cost sheet banao', icon: 'FilePlus2', category: 'action' },
    ]
  }

  // ── get_quality_checks ─────────────────────────────────────────────────────
  if (tool === 'get_quality_checks') {
    return [
      { label: 'Production status', message: 'Production status dikhao', icon: 'Factory', category: 'follow_up' },
      { label: 'Failed checks detail', message: 'Failed quality checks dikhao', icon: 'XCircle', category: 'follow_up' },
    ]
  }

  // ── get_employees ──────────────────────────────────────────────────────────
  if (tool === 'get_employees') {
    const drill = name ? `${name} ka detail` : 'Employee detail'
    return [
      { label: drill, message: name ? `${name} ka detail dikhao` : 'Employee detail dikhao', icon: 'User', category: 'drill_down' },
      { label: 'Production jobs', message: 'Production jobs dikhao', icon: 'Wrench', category: 'related' },
    ]
  }

  // ── get_suppliers ──────────────────────────────────────────────────────────
  if (tool === 'get_suppliers') {
    return [
      { label: 'Purchase order banao', message: 'Purchase order banao', icon: 'ShoppingCart', category: 'action' },
      { label: 'GRN notes', message: 'GRN notes dikhao', icon: 'FileCheck', category: 'follow_up' },
    ]
  }

  // ── search_all ─────────────────────────────────────────────────────────────
  if (tool === 'search_all') {
    const n = countOf(data)
    const suggestions: Suggestion[] = []
    if (n > 0) {
      suggestions.push({
        label: ref ? `Detail dikhao: ${ref}` : 'Detail dikhao',
        message: ref ? `${ref} ka detail dikhao` : 'Detail dikhao',
        icon: 'Search',
        category: 'drill_down',
      })
    }
    suggestions.push({ label: 'Create new', message: 'Create new entry banao', icon: 'Plus', category: 'action' })
    return suggestions
  }

  // ── create_* tools ─────────────────────────────────────────────────────────
  if (tool.startsWith('create_')) {
    const drill = ref ? `${ref} ka detail dikhao` : 'Detail dikhao'
    return [
      { label: drill, message: drill, icon: 'Eye', category: 'drill_down' },
      { label: 'Print/Export', message: 'Isko print ya export karo', icon: 'Printer', category: 'related' },
    ]
  }

  // ── update_* tools ─────────────────────────────────────────────────────────
  if (tool.startsWith('update_')) {
    return [
      { label: 'Confirm status', message: 'Updated status confirm karo', icon: 'CheckCircle', category: 'follow_up' },
      { label: 'Full detail', message: 'Full detail dikhao', icon: 'Eye', category: 'drill_down' },
    ]
  }

  // ── Analytics tools (get_profit_analysis, get_production_efficiency, get_aged_receivables) ──
  const analyticsTools = ['get_profit_analysis', 'get_production_efficiency', 'get_aged_receivables']
  if (analyticsTools.includes(tool)) {
    return [
      { label: 'Drill down', message: 'Isme drill down karo', icon: 'ArrowDown', category: 'drill_down' },
      { label: 'Compare period', message: 'Previous period se compare karo', icon: 'GitCompareArrows', category: 'related' },
    ]
  }

  return []
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns 3-4 context-aware suggestions based on the last tool called.
 * Returns empty array when there's no context (welcome screen handles its own).
 */
export function getSuggestions(lastToolName: string | null, lastToolData: unknown): Suggestion[] {
  if (!lastToolName) return []
  return matchRules(lastToolName, lastToolData)
}