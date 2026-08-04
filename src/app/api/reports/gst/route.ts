import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const report = searchParams.get('report') as 'gstr1' | 'gstr3b' | 'itc' | null
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!report || !from || !to) {
      return NextResponse.json(
        { error: 'Missing required parameters: report, from, to' },
        { status: 400 }
      )
    }

    const validReports = ['gstr1', 'gstr3b', 'itc']
    if (!validReports.includes(report)) {
      return NextResponse.json(
        { error: 'Invalid report type. Use gstr1, gstr3b, or itc' },
        { status: 400 }
      )
    }

    const startDate = new Date(from)
    const endDate = new Date(to)
    endDate.setHours(23, 59, 59, 999)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    if (report === 'gstr1') return gstr1Report(startDate, endDate)
    if (report === 'gstr3b') return gstr3bReport(startDate, endDate)
    return itcReport(startDate, endDate)
  } catch (error) {
    console.error('GST Report error:', error)
    return NextResponse.json(
      { error: 'Failed to generate GST report' },
      { status: 500 }
    )
  }
}

// ─── GSTR-1: Outward Supplies ──────────────────────────────────────────────

async function gstr1Report(startDate: Date, endDate: Date) {
  const startDateStr = startDate.toISOString()
  const endDateStr = endDate.toISOString()

  const { data: orders } = await supabase
    .from('SalesOrder')
    .select('id, orderNo, orderDate, status, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount, customerId')
    .gte('orderDate', startDateStr)
    .lte('orderDate', endDateStr)
    .neq('status', 'Cancelled')
    .order('orderDate', { ascending: true })

  const ordersArr: any[] = orders || []

  // Fetch customers
  const customerIds = [...new Set(ordersArr.map((o: any) => o.customerId).filter(Boolean))]
  let customerMap: Record<string, any> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('Customer')
      .select('id, companyName, gstNumber')
      .in('id', customerIds)
    if (customers) {
      customerMap = Object.fromEntries(customers.map((c: any) => [c.id, c]))
    }
  }

  // Split into B2B (has GSTIN) and B2C (no GSTIN)
  const b2b = ordersArr
    .filter((o: any) => {
      const c = customerMap[o.customerId]
      return c && c.gstNumber && c.gstNumber.trim() !== ''
    })
    .map((o: any) => {
      const c = customerMap[o.customerId]
      return {
        customerGSTIN: c.gstNumber,
        customerName: c.companyName,
        invoiceNo: o.orderNo,
        date: o.orderDate.split('T')[0],
        taxableAmount: o.taxableAmount,
        cgstAmount: o.cgstAmount,
        sgstAmount: o.sgstAmount,
        igstAmount: o.igstAmount,
        totalTax: o.totalGst,
        totalAmount: o.totalAmount,
      }
    })

  const b2c = ordersArr.filter((o: any) => {
    const c = customerMap[o.customerId]
    return !c || !c.gstNumber || c.gstNumber.trim() === ''
  })

  const b2cSummary = {
    count: b2c.length,
    taxableAmount: b2c.reduce((s: number, o: any) => s + (o.taxableAmount || 0), 0),
    cgstAmount: b2c.reduce((s: number, o: any) => s + (o.cgstAmount || 0), 0),
    sgstAmount: b2c.reduce((s: number, o: any) => s + (o.sgstAmount || 0), 0),
    igstAmount: b2c.reduce((s: number, o: any) => s + (o.igstAmount || 0), 0),
    totalTax: b2c.reduce((s: number, o: any) => s + (o.totalGst || 0), 0),
    totalAmount: b2c.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0),
  }

  // Grand totals
  const totals = {
    totalOrders: ordersArr.length,
    b2bCount: b2b.length,
    b2cCount: b2c.length,
    taxableAmount: ordersArr.reduce((s: number, o: any) => s + (o.taxableAmount || 0), 0),
    cgstAmount: ordersArr.reduce((s: number, o: any) => s + (o.cgstAmount || 0), 0),
    sgstAmount: ordersArr.reduce((s: number, o: any) => s + (o.sgstAmount || 0), 0),
    igstAmount: ordersArr.reduce((s: number, o: any) => s + (o.igstAmount || 0), 0),
    totalTax: ordersArr.reduce((s: number, o: any) => s + (o.totalGst || 0), 0),
    totalAmount: ordersArr.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0),
  }

  return NextResponse.json({ report: 'gstr1', b2b, b2cSummary, totals })
}

// ─── GSTR-3B: Monthly Summary ─────────────────────────────────────────────

async function gstr3bReport(startDate: Date, endDate: Date) {
  const startDateStr = startDate.toISOString()
  const endDateStr = endDate.toISOString()

  const [salesRes, poRes, vbRes] = await Promise.all([
    supabase.from('SalesOrder')
      .select('taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst')
      .gte('orderDate', startDateStr)
      .lte('orderDate', endDateStr)
      .neq('status', 'Cancelled'),
    supabase.from('PurchaseOrder')
      .select('taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst')
      .gte('createdAt', startDateStr)
      .lte('createdAt', endDateStr)
      .neq('status', 'Cancelled'),
    supabase.from('VendorBill')
      .select('taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst')
      .gte('billDate', startDateStr)
      .lte('billDate', endDateStr)
      .neq('status', 'Cancelled'),
  ])

  const salesOrders = salesRes.data || []
  const purchaseOrders = poRes.data || []
  const vendorBills = vbRes.data || []

  // Table 3.1: Outward supplies
  const outward = {
    taxableAmount: salesOrders.reduce((s: number, o: any) => s + (o.taxableAmount || 0), 0),
    cgstAmount: salesOrders.reduce((s: number, o: any) => s + (o.cgstAmount || 0), 0),
    sgstAmount: salesOrders.reduce((s: number, o: any) => s + (o.sgstAmount || 0), 0),
    igstAmount: salesOrders.reduce((s: number, o: any) => s + (o.igstAmount || 0), 0),
    totalTax: salesOrders.reduce((s: number, o: any) => s + (o.totalGst || 0), 0),
    orderCount: salesOrders.length,
  }

  // Table 4: Inward supplies (ITC from purchase orders + vendor bills)
  const inwardTaxable = purchaseOrders.reduce((s: number, o: any) => s + (o.taxableAmount || 0), 0) + vendorBills.reduce((s: number, v: any) => s + (v.taxableAmount || 0), 0)
  const inwardCgst = purchaseOrders.reduce((s: number, o: any) => s + (o.cgstAmount || 0), 0) + vendorBills.reduce((s: number, v: any) => s + (v.cgstAmount || 0), 0)
  const inwardSgst = purchaseOrders.reduce((s: number, o: any) => s + (o.sgstAmount || 0), 0) + vendorBills.reduce((s: number, v: any) => s + (v.sgstAmount || 0), 0)
  const inwardIgst = purchaseOrders.reduce((s: number, o: any) => s + (o.igstAmount || 0), 0) + vendorBills.reduce((s: number, v: any) => s + (v.igstAmount || 0), 0)
  const inwardTotalTax = purchaseOrders.reduce((s: number, o: any) => s + (o.totalGst || 0), 0) + vendorBills.reduce((s: number, v: any) => s + (v.totalGst || 0), 0)

  const inward = {
    taxableAmount: inwardTaxable,
    cgstAmount: inwardCgst,
    sgstAmount: inwardSgst,
    igstAmount: inwardIgst,
    totalTax: inwardTotalTax,
    poCount: purchaseOrders.length,
    vbCount: vendorBills.length,
  }

  // Net tax payable
  const netTaxPayable = {
    cgst: outward.cgstAmount - inward.cgstAmount,
    sgst: outward.sgstAmount - inward.sgstAmount,
    igst: outward.igstAmount - inward.igstAmount,
    total:
      (outward.cgstAmount - inward.cgstAmount) +
      (outward.sgstAmount - inward.sgstAmount) +
      (outward.igstAmount - inward.igstAmount),
  }

  return NextResponse.json({ report: 'gstr3b', outward, inward, netTaxPayable })
}

// ─── ITC Register: Input Tax Credit ────────────────────────────────────────

async function itcReport(startDate: Date, endDate: Date) {
  const startDateStr = startDate.toISOString()
  const endDateStr = endDate.toISOString()

  // Purchase Orders with supplier
  const { data: purchaseOrders } = await supabase
    .from('PurchaseOrder')
    .select('id, poNumber, createdAt, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount, supplierId')
    .gte('createdAt', startDateStr)
    .lte('createdAt', endDateStr)
    .neq('status', 'Cancelled')
    .order('createdAt', { ascending: true })

  const poArr: any[] = purchaseOrders || []

  // Fetch suppliers
  const poSupplierIds = [...new Set(poArr.map((po: any) => po.supplierId).filter(Boolean))]
  let poSupplierMap: Record<string, any> = {}
  if (poSupplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from('Supplier')
      .select('id, name')
      .in('id', poSupplierIds)
    if (suppliers) {
      poSupplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
    }
  }

  const poEntries = poArr.map((po: any) => ({
    date: po.createdAt.split('T')[0],
    supplierName: poSupplierMap[po.supplierId]?.name || 'Unknown',
    billNo: po.poNumber,
    source: 'Purchase Order' as const,
    taxableAmount: po.taxableAmount || 0,
    cgstAmount: po.cgstAmount || 0,
    sgstAmount: po.sgstAmount || 0,
    igstAmount: po.igstAmount || 0,
    totalTax: po.totalGst || 0,
    totalAmount: po.totalAmount || 0,
    eligibleITC: po.totalGst || 0,
  }))

  // Vendor Bills with vendor
  const { data: vendorBills } = await supabase
    .from('VendorBill')
    .select('id, billNo, billDate, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount, vendorId')
    .gte('billDate', startDateStr)
    .lte('billDate', endDateStr)
    .neq('status', 'Cancelled')
    .order('billDate', { ascending: true })

  const vbArr: any[] = vendorBills || []

  // Fetch vendors
  const vendorIds = [...new Set(vbArr.map((vb: any) => vb.vendorId).filter(Boolean))]
  let vendorMap: Record<string, any> = {}
  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
      .from('Vendor')
      .select('id, vendorName')
      .in('id', vendorIds)
    if (vendors) {
      vendorMap = Object.fromEntries(vendors.map((v: any) => [v.id, v]))
    }
  }

  const vbEntries = vbArr.map((vb: any) => ({
    date: vb.billDate.split('T')[0],
    supplierName: vendorMap[vb.vendorId]?.vendorName || 'Unknown',
    billNo: vb.billNo,
    source: 'Vendor Bill' as const,
    taxableAmount: vb.taxableAmount || 0,
    cgstAmount: vb.cgstAmount || 0,
    sgstAmount: vb.sgstAmount || 0,
    igstAmount: vb.igstAmount || 0,
    totalTax: vb.totalGst || 0,
    totalAmount: vb.totalAmount || 0,
    eligibleITC: vb.totalGst || 0,
  }))

  // Combine and sort by date
  const entries = [...poEntries, ...vbEntries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.billNo.localeCompare(b.billNo)
  )

  // Totals
  const totals = {
    entryCount: entries.length,
    poCount: poEntries.length,
    vbCount: vbEntries.length,
    taxableAmount: entries.reduce((s: number, e: any) => s + e.taxableAmount, 0),
    cgstAmount: entries.reduce((s: number, e: any) => s + e.cgstAmount, 0),
    sgstAmount: entries.reduce((s: number, e: any) => s + e.sgstAmount, 0),
    igstAmount: entries.reduce((s: number, e: any) => s + e.igstAmount, 0),
    totalTax: entries.reduce((s: number, e: any) => s + e.totalTax, 0),
    totalAmount: entries.reduce((s: number, e: any) => s + e.totalAmount, 0),
    eligibleITC: entries.reduce((s: number, e: any) => s + e.eligibleITC, 0),
  }

  return NextResponse.json({ report: 'itc', entries, totals })
}
