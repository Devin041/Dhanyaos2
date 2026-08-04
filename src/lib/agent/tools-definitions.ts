import type { ToolDef } from './tools-types'

// ─── Tool Definitions (40 tools: 20 READ + 12 WRITE + 8 UPDATE) ─────────────

export const TOOLS: ToolDef[] = [
  {
    name: 'get_orders',
    description: 'Get sales orders with optional filters. Returns order number, customer, amount, status, delivery date, payment status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Pending', 'Confirmed', 'In Production', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'] },
      paymentStatus: { type: 'string', description: 'Filter by payment status', enum: ['Unpaid', 'Partial', 'Paid'] },
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
      limit: { type: 'number', description: 'Max dispatches (default 10)' },
    },
  },
  {
    name: 'get_purchase_orders',
    description: 'Get purchase orders with PO number, fabric, supplier, quantity, amount, status, expected delivery.',
    parameters: {
      status: { type: 'string', description: 'Filter by status', enum: ['Pending', 'Approved', 'Ordered', 'Received', 'Cancelled'] },
      limit: { type: 'number', description: 'Max POs (default 10)' },
    },
  },
  {
    name: 'get_transactions',
    description: 'Get financial transactions with date, type, category, amount, description.',
    parameters: {
      type: { type: 'string', description: 'Filter by type', enum: ['Income', 'Expense', 'Transfer'] },
      category: { type: 'string', description: 'Filter by category' },
      limit: { type: 'number', description: 'Max transactions (default 15)' },
    },
  },
  {
    name: 'get_daily_summary',
    description: 'Get TODAY\'S LIVE business data — real revenue & expenses calculated from today\'s transactions (NOT snapshots). Also returns cash balance, receivables, payables from latest snapshot. Always use this for "aaj ki revenue", "today\'s summary", "daily briefing" type queries.',
    parameters: {},
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
      limit: { type: 'number', description: 'Max GRNs (default 10)' },
    },
  },
  {
    name: 'get_samples',
    description: 'Get sample/trial records with sample number, style, customer, status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status' },
      limit: { type: 'number', description: 'Max samples (default 10)' },
    },
  },
  {
    name: 'get_quality_checks',
    description: 'Get quality check records with style, date, result, defects found.',
    parameters: {
      limit: { type: 'number', description: 'Max records (default 10)' },
    },
  },
  {
    name: 'get_returns',
    description: 'Get return records with return number, order, customer, reason, quantity, status.',
    parameters: {
      status: { type: 'string', description: 'Filter by status' },
      limit: { type: 'number', description: 'Max returns (default 10)' },
    },
  },
  {
    name: 'search_all',
    description: 'Cross-module search — searches across orders, customers, styles, fabrics, cost sheets. Use when unsure where data lives.',
    parameters: {
      query: { type: 'string', description: 'Search keyword', required: true },
    },
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
  // ── WRITE TOOLS (continued) ───────────────────────────────────────
  {
    name: 'create_order',
    description: 'Create a new sales order with items and color breakdown. Auto-generates order number, calculates GST, totals, commission. Use when user says "order banao", "new order add karo".',
    parameters: {
      customerName: { type: 'string', description: 'Customer company name', required: true },
      items: { type: 'array', description: 'Array of {styleName, quantity, unitPrice, unitCost, colorBreakdown: [{color, quantity}]}', required: true },
      notes: { type: 'string', description: 'Order notes' },
      gstType: { type: 'string', description: 'IntraState or InterState', enum: ['IntraState', 'InterState'] },
      gstPercent: { type: 'number', description: 'GST percent e.g. 18' },
      brokerName: { type: 'string', description: 'Broker name if any' },
      commissionPercent: { type: 'number', description: 'Broker commission percent e.g. 5' },
      discountPercent: { type: 'number', description: 'Discount percent e.g. 5' },
    },
  },
  {
    name: 'create_sample',
    description: 'Create a new sample/trial record. Auto-generates sample number. Use when user says "sample add karo", "new sample banao".',
    parameters: {
      customerName: { type: 'string', description: 'Customer company name (optional)' },
      styleNo: { type: 'string', description: 'Style number e.g. DH-07', required: true },
      styleName: { type: 'string', description: 'Style name e.g. Pleating Kurti', required: true },
      stage: { type: 'string', description: 'Current stage', enum: ['Design', 'Fabric Sourcing', 'Pattern Making', 'Cutting', 'Stitching', 'Finishing', 'Ready'] },
      status: { type: 'string', description: 'Status', enum: ['In Progress', 'Submitted', 'Approved', 'Rejected', 'Revised'] },
      assignedTo: { type: 'string', description: 'Person assigned to' },
      notes: { type: 'string', description: 'Notes' },
      cost: { type: 'number', description: 'Sample cost' },
    },
  },
  {
    name: 'create_production_job',
    description: 'Create a new production job. Auto-generates job number. Use when user says "production job add karo", "job banao".',
    parameters: {
      salesOrderNo: { type: 'string', description: 'Sales order number to link (optional)' },
      styleNo: { type: 'string', description: 'Style number e.g. DH-07', required: true },
      styleName: { type: 'string', description: 'Style name', required: true },
      targetQty: { type: 'number', description: 'Target quantity to produce', required: true },
      stage: { type: 'string', description: 'Starting stage', enum: ['Fabric Issue', 'Cutting', 'Stitching', 'Finishing', 'QC', 'Packing'] },
      fabricStockId: { type: 'string', description: 'Fabric stock ID to link (optional)' },
    },
  },
  {
    name: 'create_dispatch',
    description: 'Create a dispatch record with items. Auto-generates dispatch number. Updates order status to Dispatched if fully dispatched. Use when user says "dispatch banao", "shipping add karo".',
    parameters: {
      salesOrderNo: { type: 'string', description: 'Sales order number', required: true },
      items: { type: 'array', description: 'Array of {styleNo, styleName, orderedQty, dispatchedQty}', required: true },
      trackingNo: { type: 'string', description: 'Tracking number' },
      transporter: { type: 'string', description: 'Transporter name' },
      vehicleNo: { type: 'string', description: 'Vehicle number' },
      notes: { type: 'string', description: 'Notes' },
      shippingAddress: { type: 'string', description: 'Shipping address override' },
    },
  },
  {
    name: 'create_purchase_order',
    description: 'Create a purchase order for fabric/material. Auto-generates PO number, calculates GST. Use when user says "PO banao", "purchase order add karo".',
    parameters: {
      supplierName: { type: 'string', description: 'Supplier name', required: true },
      fabricName: { type: 'string', description: 'Fabric/material name', required: true },
      quantity: { type: 'number', description: 'Quantity to order', required: true },
      unit: { type: 'string', description: 'Unit (default: meters)' },
      ratePerUnit: { type: 'number', description: 'Rate per unit', required: true },
      expectedDelivery: { type: 'string', description: 'Expected delivery date (YYYY-MM-DD)' },
      gstType: { type: 'string', description: 'IntraState or InterState', enum: ['IntraState', 'InterState'] },
      gstPercent: { type: 'number', description: 'GST percent e.g. 18' },
    },
  },
  {
    name: 'create_transaction',
    description: 'Create a financial transaction (Receipt/Payment/Contra/Journal). Auto-generates display ID. Use when user says "payment record karo", "transaction add karo".',
    parameters: {
      type: { type: 'string', description: 'Transaction type', required: true, enum: ['Receipt', 'Payment', 'Contra', 'Journal'] },
      category: { type: 'string', description: 'Category e.g. Sales, Purchase, Salary, Rent, Transport, Fabric, Trim, Other', required: true },
      amount: { type: 'number', description: 'Amount', required: true },
      description: { type: 'string', description: 'Description', required: true },
      referenceNo: { type: 'string', description: 'Reference number' },
      date: { type: 'string', description: 'Transaction date (YYYY-MM-DD)' },
    },
  },
  {
    name: 'create_quality_check',
    description: 'Create a quality check record for a production job. Auto-generates check number. Use when user says "QC add karo", "quality check banao".',
    parameters: {
      jobNo: { type: 'string', description: 'Production job number', required: true },
      inspectionPoint: { type: 'string', description: 'Inspection point', required: true, enum: ['Fabric Check', 'Cutting Check', 'In-Process Check', 'Finishing Check', 'Final Inspection'] },
      checkedQty: { type: 'number', description: 'Quantity checked' },
      passedQty: { type: 'number', description: 'Quantity passed' },
      failedQty: { type: 'number', description: 'Quantity failed' },
      defectType: { type: 'string', description: 'Type of defect found' },
      defectCount: { type: 'number', description: 'Number of defects' },
      severity: { type: 'string', description: 'Severity', enum: ['Minor', 'Major', 'Critical'] },
      status: { type: 'string', description: 'Result status', enum: ['Pass', 'Fail', 'Conditional'] },
      inspectorName: { type: 'string', description: 'Inspector name' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'create_return',
    description: 'Create a return record (customer or supplier return). Auto-generates return number. Use when user says "return add karo", "return banao".',
    parameters: {
      returnType: { type: 'string', description: 'Customer or Supplier', required: true, enum: ['Customer', 'Supplier'] },
      referenceNo: { type: 'string', description: 'Reference number (SO-xxx, PO-xxx, VB-xxx)', required: true },
      partyName: { type: 'string', description: 'Customer or supplier name', required: true },
      reason: { type: 'string', description: 'Return reason', required: true },
      items: { type: 'array', description: 'Array of {itemName, styleNo, quantity, unitValue, reason}', required: true },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'create_grn',
    description: 'Create a Goods Received Note with items. Auto-generates GRN number. Updates fabric stock and PO received quantity. Use when user says "GRN add karo", "goods received note banao".',
    parameters: {
      supplierName: { type: 'string', description: 'Supplier name', required: true },
      poNumber: { type: 'string', description: 'Purchase order number to link (optional)' },
      items: { type: 'array', description: 'Array of {fabricName, orderedQty, receivedQty, acceptedQty, rejectedQty, defectNotes, ratePerUnit}', required: true },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'create_vendor_bill',
    description: 'Create a vendor bill for outsourcing work. Auto-generates bill number, calculates GST. Use when user says "vendor bill banao", "bill add karo".',
    parameters: {
      vendorName: { type: 'string', description: 'Vendor name', required: true },
      description: { type: 'string', description: 'Bill description e.g. "Embroidery - 100 pcs"', required: true },
      totalQty: { type: 'number', description: 'Total quantity', required: true },
      perPieceRate: { type: 'number', description: 'Rate per piece', required: true },
      gstType: { type: 'string', description: 'IntraState or InterState', enum: ['IntraState', 'InterState'] },
      gstPercent: { type: 'number', description: 'GST percent (default 18)' },
      dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  // ── UPDATE TOOLS ────────────────────────────────────────────────────
  {
    name: 'update_order_status',
    description: 'Update sales order status and optionally payment status. Use when user says "order status update karo", "mark order as dispatched".',
    parameters: {
      orderNo: { type: 'string', description: 'Order number', required: true },
      status: { type: 'string', description: 'New status', required: true, enum: ['Pending', 'Confirmed', 'In Production', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'] },
      paymentStatus: { type: 'string', description: 'Payment status', enum: ['Unpaid', 'Partial', 'Paid'] },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'update_production_status',
    description: 'Update production job status, stage, and completed quantity. Use when user says "job status update karo", "mark production complete".',
    parameters: {
      jobNo: { type: 'string', description: 'Job number', required: true },
      status: { type: 'string', description: 'New status', required: true, enum: ['In Progress', 'Completed', 'On Hold', 'Cancelled'] },
      stage: { type: 'string', description: 'New stage' },
      completedQty: { type: 'number', description: 'Completed quantity' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'update_dispatch_status',
    description: 'Update dispatch status and tracking. Use when user says "dispatch status update karo", "mark as delivered".',
    parameters: {
      dispatchNo: { type: 'string', description: 'Dispatch number', required: true },
      status: { type: 'string', description: 'New status', required: true, enum: ['Packed', 'InTransit', 'Delivered'] },
      trackingNo: { type: 'string', description: 'Tracking number' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'update_cost_sheet',
    description: 'Update cost sheet fields like status, profit percent, broker commission. Recalculates selling price and broker amount automatically.',
    parameters: {
      sheetNo: { type: 'string', description: 'Sheet number', required: true },
      status: { type: 'string', description: 'New status', enum: ['Draft', 'Approved', 'Active', 'Archived'] },
      profitPercent: { type: 'number', description: 'Profit margin percent' },
      brokerCommissionPercent: { type: 'number', description: 'Broker commission percent' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'update_quotation_status',
    description: 'Update quotation status. Use when user says "quotation status change karo", "mark quote as accepted".',
    parameters: {
      quotationNo: { type: 'string', description: 'Quotation number', required: true },
      status: { type: 'string', description: 'New status', required: true, enum: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'] },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'update_sample_status',
    description: 'Update sample status and stage. Use when user says "sample status update karo", "mark sample as approved".',
    parameters: {
      sampleNo: { type: 'string', description: 'Sample number', required: true },
      status: { type: 'string', description: 'New status', required: true, enum: ['In Progress', 'Submitted', 'Approved', 'Rejected', 'Revised'] },
      stage: { type: 'string', description: 'New stage' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
  {
    name: 'update_stock',
    description: 'Update fabric stock quantity. Positive adjustment adds stock, negative removes. Recalculates total value. Use when user says "stock update karo", "fabric add karo".',
    parameters: {
      fabricStockId: { type: 'string', description: 'Fabric stock ID (cuid)', required: true },
      adjustment: { type: 'number', description: 'Quantity to adjust (positive to add, negative to remove)', required: true },
      reason: { type: 'string', description: 'Reason for adjustment' },
    },
  },
  {
    name: 'update_payment_status',
    description: 'Record a payment against a sales order or vendor bill. Updates paid amount and payment status automatically. Use when user says "payment receive karo", "bill pay karo".',
    parameters: {
      referenceType: { type: 'string', description: 'SalesOrder or VendorBill', required: true, enum: ['SalesOrder', 'VendorBill'] },
      referenceNo: { type: 'string', description: 'Order number or bill number', required: true },
      amount: { type: 'number', description: 'Amount being paid', required: true },
      paymentMethod: { type: 'string', description: 'Payment method', enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque'] },
      referenceNoPayment: { type: 'string', description: 'Cheque/reference number for the payment' },
      notes: { type: 'string', description: 'Notes' },
    },
  },
]
