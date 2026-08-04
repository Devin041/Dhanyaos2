import { supabase } from '@/lib/supabase-db'

export interface ColumnDef {
  header: string
  key: string
  width?: number
  format?: 'currency' | 'number' | 'percent' | 'date' | 'text'
}

export interface ModuleExportSpec {
  sheetName: string
  columns: ColumnDef[]
  fetchAll: () => Promise<Record<string, unknown>[]>
}

// Helper to map DB rows using columns — not needed inside each fetchAll
// since we pass raw rows and the export utility reads them via dot-notation.

const moduleSpecs: Record<string, ModuleExportSpec> = {
  // ─── 1. Sales Orders ───────────────────────────────────────────────────
  'sales-orders': {
    sheetName: 'Sales Orders',
    columns: [
      { header: 'Order No', key: 'orderNo', width: 20 },
      { header: 'Customer', key: 'customer.companyName', width: 25 },
      { header: 'Order Date', key: 'orderDate', width: 14, format: 'date' },
      { header: 'Delivery Date', key: 'deliveryDate', width: 14, format: 'date' },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Items Count', key: 'itemsCount', width: 12, format: 'number' },
      { header: 'Total Amount (₹)', key: 'totalAmount', width: 16, format: 'currency' },
      { header: 'Total Cost (₹)', key: 'totalCost', width: 16, format: 'currency' },
      { header: 'Gross Profit (₹)', key: 'grossProfit', width: 16, format: 'currency' },
      { header: 'Margin (%)', key: 'grossMargin', width: 12, format: 'percent' },
      { header: 'Payment Status', key: 'paymentStatus', width: 14 },
      { header: 'Paid Amount (₹)', key: 'paidAmount', width: 16, format: 'currency' },
      { header: 'Discount (%)', key: 'discountPercent', width: 12, format: 'percent' },
    ],
    fetchAll: async () => {
      const { data: rows } = await supabase.from('SalesOrder')
        .select('*, customer:customerId(*), items:OrderItem(*)')
        .order('createdAt', { ascending: false })
      return (rows ?? []).map((r: any) => ({
        ...r,
        itemsCount: (r.items ?? []).length,
      }))
    },
  },

  // ─── 2. Purchase Orders ────────────────────────────────────────────────
  'purchase-orders': {
    sheetName: 'Purchase Orders',
    columns: [
      { header: 'PO Number', key: 'poNumber', width: 20 },
      { header: 'Supplier', key: 'supplier.name', width: 25 },
      { header: 'Fabric', key: 'fabricName', width: 20 },
      { header: 'Quantity', key: 'quantity', width: 12, format: 'number' },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Rate/Unit (₹)', key: 'ratePerUnit', width: 14, format: 'currency' },
      { header: 'Total (₹)', key: 'totalAmount', width: 16, format: 'currency' },
      { header: 'Expected Delivery', key: 'expectedDelivery', width: 16, format: 'date' },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Payment Status', key: 'paymentStatus', width: 14 },
      { header: 'Paid (₹)', key: 'paidAmount', width: 14, format: 'currency' },
      { header: 'Received Qty', key: 'receivedQty', width: 14, format: 'number' },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('PurchaseOrder')
        .select('*, supplier:supplierId(*)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 3. Production Jobs ────────────────────────────────────────────────
  production: {
    sheetName: 'Production',
    columns: [
      { header: 'Job No', key: 'jobNo', width: 20 },
      { header: 'Order No', key: 'salesOrder.orderNo', width: 20 },
      { header: 'Style No', key: 'styleNo', width: 16 },
      { header: 'Style Name', key: 'styleName', width: 22 },
      { header: 'Target Qty', key: 'targetQty', width: 12, format: 'number' },
      { header: 'Completed Qty', key: 'completedQty', width: 14, format: 'number' },
      { header: 'Stage', key: 'stage', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Start Date', key: 'startDate', width: 14, format: 'date' },
      { header: 'End Date', key: 'endDate', width: 14, format: 'date' },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('ProductionJob')
        .select('*, salesOrder:salesOrderId(orderNo)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 4. Customers ──────────────────────────────────────────────────────
  customers: {
    sheetName: 'Customers',
    columns: [
      { header: 'Company Name', key: 'companyName', width: 25 },
      { header: 'Buyer Name', key: 'buyerName', width: 20 },
      { header: 'GST Number', key: 'gstNumber', width: 18 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Payment Terms (days)', key: 'paymentTerms', width: 18, format: 'number' },
      { header: 'Credit Limit (₹)', key: 'creditLimit', width: 16, format: 'currency' },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Order Count', key: 'orderCount', width: 12, format: 'number' },
      { header: 'Total Order Value (₹)', key: 'totalOrderValue', width: 18, format: 'currency' },
      { header: 'Pending Amount (₹)', key: 'pendingAmount', width: 18, format: 'currency' },
      { header: 'Avg Margin (%)', key: 'avgMargin', width: 14, format: 'percent' },
      { header: 'Last Order Date', key: 'lastOrderDate', width: 16, format: 'date' },
    ],
    fetchAll: async () => {
      const { data: rows } = await supabase.from('Customer')
        .select('*, orders:SalesOrder(totalAmount, paidAmount, grossMargin, orderDate)')
        .order('createdAt', { ascending: false })
      return (rows ?? []).map((c: any) => {
        const orders = c.orders ?? []
        const orderCount = orders.length
        const totalOrderValue = orders.reduce((s: number, o: any) => s + (o.totalAmount ?? 0), 0)
        const pendingAmount = orders.reduce((s: number, o: any) => s + ((o.totalAmount ?? 0) - (o.paidAmount ?? 0)), 0)
        const avgMargin = orderCount > 0 ? orders.reduce((s: number, o: any) => s + (o.grossMargin ?? 0), 0) / orderCount : 0
        const sortedDates = orders.map((o: any) => new Date(o.orderDate)).sort((a: Date, b: Date) => b.getTime() - a.getTime())
        const lastOrderDate = sortedDates[0] ?? null
        return {
          ...c,
          orderCount,
          totalOrderValue,
          pendingAmount,
          avgMargin,
          lastOrderDate,
        }
      })
    },
  },

  // ─── 5. Suppliers ──────────────────────────────────────────────────────
  suppliers: {
    sheetName: 'Suppliers',
    columns: [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Type', key: 'supplierType', width: 14 },
      { header: 'Contact Person', key: 'contactPerson', width: 20 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Payment Terms', key: 'paymentTerms', width: 14, format: 'number' },
      { header: 'Rating', key: 'rating', width: 10, format: 'number' },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'PO Count', key: 'poCount', width: 12, format: 'number' },
      { header: 'Total PO Value (₹)', key: 'totalPoValue', width: 18, format: 'currency' },
      { header: 'Fabric Stock Value (₹)', key: 'fabricStockValue', width: 18, format: 'currency' },
    ],
    fetchAll: async () => {
      const { data: rows } = await supabase.from('Supplier')
        .select('*, purchaseOrders:PurchaseOrder(totalAmount), fabricStock:FabricStock(totalValue)')
        .order('createdAt', { ascending: false })
      return (rows ?? []).map((s: any) => ({
        ...s,
        poCount: (s.purchaseOrders ?? []).length,
        totalPoValue: (s.purchaseOrders ?? []).reduce((sum: number, po: any) => sum + (po.totalAmount ?? 0), 0),
        fabricStockValue: (s.fabricStock ?? []).reduce((sum: number, fs: any) => sum + (fs.totalValue ?? 0), 0),
      }))
    },
  },

  // ─── 6. Quotations ─────────────────────────────────────────────────────
  quotations: {
    sheetName: 'Quotations',
    columns: [
      { header: 'Quotation No', key: 'quotationNo', width: 20 },
      { header: 'Customer', key: 'customer.companyName', width: 25 },
      { header: 'Quotation Date', key: 'quotationDate', width: 16, format: 'date' },
      { header: 'Valid Until', key: 'validUntil', width: 14, format: 'date' },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Items Count', key: 'itemsCount', width: 12, format: 'number' },
      { header: 'Total Amount (₹)', key: 'totalAmount', width: 16, format: 'currency' },
      { header: 'Total Cost (₹)', key: 'totalCost', width: 16, format: 'currency' },
      { header: 'Discount (%)', key: 'discountPercent', width: 12, format: 'percent' },
    ],
    fetchAll: async () => {
      const { data: rows } = await supabase.from('Quotation')
        .select('*, customer:customerId(*), items:QuotationItem(*)')
        .order('createdAt', { ascending: false })
      return (rows ?? []).map((r: any) => ({
        ...r,
        itemsCount: (r.items ?? []).length,
      }))
    },
  },

  // ─── 7. Fabric Stock ───────────────────────────────────────────────────
  'fabric-stock': {
    sheetName: 'Fabric Stock',
    columns: [
      { header: 'Fabric Name', key: 'fabricName', width: 22 },
      { header: 'Supplier', key: 'supplier.name', width: 25 },
      { header: 'GSM', key: 'gsm', width: 10, format: 'number' },
      { header: 'Width', key: 'width', width: 10, format: 'number' },
      { header: 'Lot Number', key: 'lotNumber', width: 16 },
      { header: 'Available (meters)', key: 'availableMeters', width: 18, format: 'number' },
      { header: 'Reserved (meters)', key: 'reservedMeters', width: 18, format: 'number' },
      { header: 'Avg Cost/meter (₹)', key: 'averageCost', width: 18, format: 'currency' },
      { header: 'Total Value (₹)', key: 'totalValue', width: 16, format: 'currency' },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('FabricStock')
        .select('*, supplier:supplierId(name)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 8. Sampling ───────────────────────────────────────────────────────
  sampling: {
    sheetName: 'Sampling',
    columns: [
      { header: 'Sample No', key: 'sampleNo', width: 20 },
      { header: 'Customer', key: 'customer.companyName', width: 25 },
      { header: 'Style No', key: 'styleNo', width: 16 },
      { header: 'Style Name', key: 'styleName', width: 22 },
      { header: 'Stage', key: 'stage', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Assigned To', key: 'assignedTo', width: 18 },
      { header: 'Submission Date', key: 'submissionDate', width: 16, format: 'date' },
      { header: 'Approved Date', key: 'approvedDate', width: 16, format: 'date' },
      { header: 'Cost (₹)', key: 'cost', width: 14, format: 'currency' },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('Sample')
        .select('*, customer:customerId(companyName)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 9. Quality Checks ─────────────────────────────────────────────────
  'quality-control': {
    sheetName: 'Quality Control',
    columns: [
      { header: 'Check No', key: 'checkNo', width: 20 },
      { header: 'Job No', key: 'productionJob.jobNo', width: 20 },
      { header: 'Style No', key: 'productionJob.styleNo', width: 16 },
      { header: 'Inspection Point', key: 'inspectionPoint', width: 20 },
      { header: 'Checked Qty', key: 'checkedQty', width: 12, format: 'number' },
      { header: 'Passed', key: 'passedQty', width: 10, format: 'number' },
      { header: 'Failed', key: 'failedQty', width: 10, format: 'number' },
      { header: 'Defect Type', key: 'defectType', width: 18 },
      { header: 'Defect Count', key: 'defectCount', width: 14, format: 'number' },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Inspector', key: 'inspectorName', width: 18 },
      { header: 'Checked At', key: 'checkedAt', width: 16, format: 'date' },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('QualityCheck')
        .select('*, productionJob:productionJobId(jobNo, styleNo, styleName)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 10. Workers ───────────────────────────────────────────────────────
  workers: {
    sheetName: 'Workers',
    columns: [
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Designation', key: 'designation', width: 18 },
      { header: 'Skills', key: 'skills', width: 24 },
      { header: 'Salary (₹)', key: 'salary', width: 14, format: 'currency' },
      { header: 'Daily Wage (₹)', key: 'dailyWage', width: 14, format: 'currency' },
      { header: 'Join Date', key: 'joinDate', width: 14, format: 'date' },
      { header: 'Status', key: 'status', width: 12 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('Employee')
        .select('*')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 11. Vendors ───────────────────────────────────────────────────────
  vendors: {
    sheetName: 'Vendors',
    columns: [
      { header: 'Vendor Name', key: 'vendorName', width: 25 },
      { header: 'Contact Person', key: 'contactPerson', width: 20 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Specialization', key: 'specialization', width: 22 },
      { header: 'Payment Terms (days)', key: 'paymentTerms', width: 18, format: 'number' },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Active Jobs Count', key: 'activeJobsCount', width: 16, format: 'number' },
    ],
    fetchAll: async () => {
      const { data: rows } = await supabase.from('Vendor')
        .select('*, stageTrackings:StageTracking(id, status)')
        .order('createdAt', { ascending: false })
      return (rows ?? []).map((v: any) => ({
        ...v,
        activeJobsCount: (v.stageTrackings ?? []).filter((st: any) => st.status === 'In Progress' || st.status === 'Sent Out').length,
      }))
    },
  },

  // ─── 12. Vendor Bills ──────────────────────────────────────────────────
  'vendor-bills': {
    sheetName: 'Vendor Bills',
    columns: [
      { header: 'Bill No', key: 'billNo', width: 20 },
      { header: 'Vendor', key: 'vendor.vendorName', width: 25 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Qty', key: 'totalQty', width: 10, format: 'number' },
      { header: 'Rate/pc (₹)', key: 'perPieceRate', width: 14, format: 'currency' },
      { header: 'Total (₹)', key: 'totalAmount', width: 16, format: 'currency' },
      { header: 'Paid (₹)', key: 'paidAmount', width: 14, format: 'currency' },
      { header: 'Bill Date', key: 'billDate', width: 14, format: 'date' },
      { header: 'Due Date', key: 'dueDate', width: 14, format: 'date' },
      { header: 'Status', key: 'status', width: 14 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('VendorBill')
        .select('*, vendor:vendorId(vendorName)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 13. Style Master ──────────────────────────────────────────────────
  'style-master': {
    sheetName: 'Style Master',
    columns: [
      { header: 'Style No', key: 'styleNo', width: 16 },
      { header: 'Collection', key: 'collectionName', width: 20 },
      { header: 'Season', key: 'season', width: 14 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Fit', key: 'fit', width: 14 },
      { header: 'Fabric Type', key: 'fabricType', width: 18 },
      { header: 'Embroidery', key: 'embroideryType', width: 18 },
      { header: 'Neck Design', key: 'neckDesign', width: 16 },
      { header: 'Sleeve Type', key: 'sleeveType', width: 16 },
      { header: 'Brand', key: 'brand', width: 22 },
      { header: 'Cost Price (₹)', key: 'costPrice', width: 14, format: 'currency' },
      { header: 'Sell Price (₹)', key: 'sellPrice', width: 14, format: 'currency' },
      { header: 'Status', key: 'status', width: 12 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('Style')
        .select('*')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 14. Accounts / Transactions ───────────────────────────────────────
  accounts: {
    sheetName: 'Transactions',
    columns: [
      { header: 'Date', key: 'date', width: 14, format: 'date' },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Amount (₹)', key: 'amount', width: 16, format: 'currency' },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Reference No', key: 'referenceNo', width: 18 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('Transaction')
        .select('*')
        .order('date', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 15. Inventory — Finished Goods ────────────────────────────────────
  inventory: {
    sheetName: 'Finished Goods',
    columns: [
      { header: 'Style No', key: 'styleNo', width: 16 },
      { header: 'Style Name', key: 'styleName', width: 22 },
      { header: 'Quantity', key: 'quantity', width: 12, format: 'number' },
      { header: 'Unit Cost (₹)', key: 'unitCost', width: 14, format: 'currency' },
      { header: 'Total Value (₹)', key: 'totalValue', width: 16, format: 'currency' },
      { header: 'Status', key: 'status', width: 14 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('FinishedGood')
        .select('*')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 16. Vendor Payments ───────────────────────────────────────────────
  'vendor-payments': {
    sheetName: 'Vendor Payments',
    columns: [
      { header: 'Payment No', key: 'paymentNo', width: 20 },
      { header: 'Bill No', key: 'vendorBill.billNo', width: 20 },
      { header: 'Vendor', key: 'vendor.vendorName', width: 25 },
      { header: 'Amount (₹)', key: 'amount', width: 16, format: 'currency' },
      { header: 'Payment Date', key: 'paymentDate', width: 14, format: 'date' },
      { header: 'Method', key: 'paymentMethod', width: 16 },
      { header: 'Reference No', key: 'referenceNo', width: 18 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('VendorPayment')
        .select('*, vendorBill:vendorBillId(billNo), vendor:vendorId(vendorName)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },

  // ─── 17. Cash Flow ─────────────────────────────────────────────────────
  cashflow: {
    sheetName: 'Cash Flow',
    columns: [
      { header: 'Date', key: 'date', width: 14, format: 'date' },
      { header: 'Cash In (₹)', key: 'cashIn', width: 16, format: 'currency' },
      { header: 'Cash Out (₹)', key: 'cashOut', width: 16, format: 'currency' },
      { header: 'Net Flow (₹)', key: 'netFlow', width: 16, format: 'currency' },
      { header: 'Balance (₹)', key: 'cashBalance', width: 16, format: 'currency' },
      { header: 'Revenue (₹)', key: 'revenue', width: 16, format: 'currency' },
      { header: 'Expenses (₹)', key: 'expenses', width: 16, format: 'currency' },
      { header: 'Gross Profit (₹)', key: 'grossProfit', width: 16, format: 'currency' },
    ],
    fetchAll: async () => {
      const { data: rows } = await supabase.from('DailySnapshot')
        .select('*')
        .order('date', { ascending: true })
      return (rows ?? []).map((r: any) => ({
        ...r,
        netFlow: (r.cashIn ?? 0) - (r.cashOut ?? 0),
      }))
    },
  },

  // ─── 18. Cost Sheets ──────────────────────────────────────────────────
  'cost-sheets': {
    sheetName: 'Cost Sheets',
    columns: [
      { header: 'Sheet No', key: 'sheetNo', width: 20 },
      { header: 'Style No', key: 'styleNo', width: 16 },
      { header: 'Style Name', key: 'styleName', width: 22 },
      { header: 'Customer', key: 'customer.companyName', width: 25 },
      { header: 'Size Range', key: 'sizeRange', width: 14 },
      { header: 'Target Qty', key: 'targetQty', width: 12, format: 'number' },
      { header: 'Fabric Cost (₹)', key: 'fabricCost', width: 16, format: 'currency' },
      { header: 'Trim Cost (₹)', key: 'trimCost', width: 16, format: 'currency' },
      { header: 'Labor Cost (₹)', key: 'laborCost', width: 16, format: 'currency' },
      { header: 'Wash Cost (₹)', key: 'washCost', width: 16, format: 'currency' },
      { header: 'Packaging Cost (₹)', key: 'packagingCost', width: 16, format: 'currency' },
      { header: 'Overhead (₹)', key: 'overheadCost', width: 14, format: 'currency' },
      { header: 'Other Cost (₹)', key: 'otherCost', width: 14, format: 'currency' },
      { header: 'Total Cost/Piece (₹)', key: 'totalCost', width: 18, format: 'currency' },
      { header: 'Profit %', key: 'profitPercent', width: 12, format: 'percent' },
      { header: 'Selling Price (₹)', key: 'sellingPrice', width: 16, format: 'currency' },
      { header: 'Status', key: 'status', width: 12 },
    ],
    fetchAll: async () => {
      const { data } = await supabase.from('CostSheet')
        .select('*, customer:customerId(companyName)')
        .order('createdAt', { ascending: false })
      return (data ?? [])
    },
  },
}

/** Get all available module keys */
export function getModuleKeys(): string[] {
  return Object.keys(moduleSpecs)
}

/** Look up a single module export spec by key */
export function getModuleSpec(key: string): ModuleExportSpec | undefined {
  return moduleSpecs[key]
}

/** Look up multiple module specs by keys */
export function getModuleSpecs(keys: string[]): Record<string, ModuleExportSpec> {
  const result: Record<string, ModuleExportSpec> = {}
  for (const k of keys) {
    const spec = moduleSpecs[k]
    if (spec) result[k] = spec
  }
  return result
}

export { moduleSpecs }
