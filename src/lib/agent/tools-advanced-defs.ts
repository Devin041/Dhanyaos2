import type { ToolDef } from './tools'

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS ONLY — 5 WORKFLOW + 6 ANALYTICS (lightweight, no db import)
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS_ADVANCED: ToolDef[] = [
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
  // ANALYTICS TOOLS
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