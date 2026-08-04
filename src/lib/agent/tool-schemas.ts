import type { ToolDef } from './tools'

// ═══════════════════════════════════════════════════════════════════════════════
// OPENAI FUNCTION SCHEMA CONVERTER
// Converts our internal ToolDef format → OpenAI native tool calling format
// ═══════════════════════════════════════════════════════════════════════════════

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description: string
        enum?: string[]
        items?: Record<string, unknown>
      }>
      required: string[]
      additionalProperties: boolean
    }
  }
}

/** Convert an array of ToolDef to OpenAI function schema format */
export function toOpenAITools(defs: ToolDef[]): OpenAITool[] {
  return defs.map(def => {
    const properties: Record<string, { type: string; description: string; enum?: string[]; items?: Record<string, unknown> }> = {}
    const required: string[] = []

    for (const [key, param] of Object.entries(def.parameters)) {
      const prop: { type: string; description: string; enum?: string[]; items?: Record<string, unknown> } = {
        type: param.type,
        description: param.description,
      }
      if (param.enum && param.enum.length > 0) {
        prop.enum = param.enum
      }
      // For array types, add generic object items so JSON Schema validates
      if (param.type === 'array') {
        prop.items = { type: 'object' }
      }
      properties[key] = prop
      if (param.required) {
        required.push(key)
      }
    }

    return {
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: {
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        },
      },
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOL_CATEGORIES = {
  // ── READ (24 tools) ───────────────────────────────────────────────────
  READ: new Set([
    'get_orders', 'get_order_detail', 'get_inventory', 'get_cost_sheets',
    'get_cost_sheet_detail', 'get_production_jobs', 'get_customers',
    'get_suppliers', 'get_dispatches', 'get_purchase_orders',
    'get_transactions', 'get_daily_summary', 'get_overdue_orders',
    'get_quotations', 'get_employees', 'get_grn_notes', 'get_samples',
    'get_quality_checks', 'get_returns', 'search_all',
    'get_revenue_report', 'get_customer_ledger', 'get_profit_analysis',
    'get_inventory_alerts', 'get_production_efficiency', 'get_aged_receivables',
  ]),

  // ── CREATE (13 tools) ─────────────────────────────────────────────────
  CREATE: new Set([
    'create_cost_sheet', 'create_quotation', 'create_sales_order',
    'create_production_job', 'create_purchase_order', 'create_transaction',
    'create_dispatch', 'create_grn_note', 'create_sample',
    'create_quality_check', 'create_return', 'create_customer',
    'create_supplier', 'create_employee', 'create_quotation_from_cost_sheet',
  ]),

  // ── UPDATE (9 tools) ──────────────────────────────────────────────────
  UPDATE: new Set([
    'update_order_status', 'update_production_job', 'record_payment',
    'update_po_status', 'update_dispatch_status', 'update_inventory',
    'update_sample_status', 'update_quotation_status', 'update_cost_sheet_status',
  ]),

  // ── WORKFLOW (5 tools) ────────────────────────────────────────────────
  WORKFLOW: new Set([
    'convert_quotation_to_order', 'record_dispatch_from_order',
    'record_grn_and_update_stock', 'close_order', 'bulk_order_status_update',
  ]),

  // ── ANALYTICS (6 tools) ───────────────────────────────────────────────
  ANALYTICS: new Set([
    'get_revenue_report', 'get_customer_ledger', 'get_profit_analysis',
    'get_inventory_alerts', 'get_production_efficiency', 'get_aged_receivables',
  ]),

  // ── PREDICTIVE (3 tools) ─────────────────────────────────────────────
  PREDICTIVE: new Set([
    'get_demand_forecast', 'get_stock_prediction', 'get_trend_analysis',
  ]),

  // ── GST (4 tools) ────────────────────────────────────────────────────
  GST: new Set([
    'get_gst_summary', 'get_gstr1_draft', 'get_gstr3b_draft', 'get_gst_hsn_summary',
  ]),

  // ── SCHEDULED (3 tools) ──────────────────────────────────────────────
  SCHEDULED: new Set([
    'create_scheduled_report', 'list_scheduled_reports', 'delete_scheduled_report',
  ]),

  // ── UTILITY (2 tools) ─────────────────────────────────────────────────
  UTILITY: new Set(['get_date_context', 'get_system_info']),
} as const

/** Check if a tool is a write/update/workflow tool (requires confirmation) */
export function isWriteTool(name: string): boolean {
  return TOOL_CATEGORIES.CREATE.has(name)
    || TOOL_CATEGORIES.UPDATE.has(name)
    || TOOL_CATEGORIES.WORKFLOW.has(name)
}

/** Get category of a tool */
export function getToolCategory(name: string): string | null {
  for (const [cat, tools] of Object.entries(TOOL_CATEGORIES)) {
    if (tools.has(name)) return cat
  }
  return null
}