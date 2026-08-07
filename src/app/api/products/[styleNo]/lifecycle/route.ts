import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'

/**
 * GET /api/products/[styleNo]/lifecycle
 *
 * Product Lifecycle Tracker — shows the entire journey of a product from
 * Sample Catalog to Payment, with profit analysis.
 *
 * Returns:
 *   - Sample info (photo, status, stage)
 *   - Costing details (estimated cost, selling price, margin)
 *   - Purchase Orders (fabric ordered, received)
 *   - Sampling records (PP samples)
 *   - Sales Orders (qty ordered, revenue)
 *   - Production jobs (progress, stage, actual costs)
 *   - Dispatch records (shipped qty)
 *   - Invoices & Payments (billed, collected, outstanding)
 *   - Profit Analysis (estimated vs actual cost, actual profit)
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ styleNo: string }> }) {
  try {
    const { styleNo } = await params
    if (!styleNo) return NextResponse.json({ error: 'styleNo is required' }, { status: 400 })

    // ── 1. Sample ──
    let sample: any = null
    try {
      const { data, error } = await supabase
        .from('Sample')
        .select('id, sampleNo, styleNo, styleName, stage, status, createdAt, photos:SamplePhoto(imageUrl, sortOrder)')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()
      if (!error && data) {
        const sortedPhotos = (data.photos || []).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        sample = { ...data, photos: undefined, photoCount: sortedPhotos.length, firstPhoto: sortedPhotos[0]?.imageUrl || null }
      }
    } catch { /* no sample */ }

    // ── 2. Costing ──
    let costing: any = null
    try {
      const { data, error } = await supabase
        .from('CostSheet')
        .select('id, sheetNo, totalCost, sellingPrice, profitPercent, status, image')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()
      if (!error && data) costing = data
    } catch { /* no costing */ }

    // ── 3. Purchase Orders ──
    let purchaseOrders: any[] = []
    try {
      const { data, error } = await supabase
        .from('PurchaseOrder')
        .select('id, poNumber, supplier:supplierId(name), fabricName, quantity, ratePerUnit, totalAmount, status, paymentStatus, paidAmount, receivedQty, expectedDelivery, createdAt')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
      if (!error && data) purchaseOrders = data
    } catch { /* table may not have styleNo column */ }

    // ── 4. Sampling records ──
    let samplings: any[] = []
    try {
      const { data, error } = await supabase
        .from('Sample')
        .select('id, sampleNo, stage, status, assignedTo, createdAt')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
      if (!error && data) samplings = data
    } catch { /* ignore */ }

    // ── 5. Sales Orders ──
    let salesOrders: any[] = []
    try {
      const { data: orderItems, error: oiErr } = await supabase
        .from('SalesOrderItem')
        .select('id, salesOrderId, styleNo, quantity, unitPrice, unitCost, totalAmount')
        .eq('styleNo', styleNo)

      if (!oiErr && orderItems && orderItems.length > 0) {
        const orderIds = [...new Set(orderItems.map((oi: any) => oi.salesOrderId))]
        const { data: orders } = await supabase
          .from('SalesOrder')
          .select('id, orderNo, customer:customerId(companyName), orderDate, deliveryDate, status, totalAmount, paidAmount, paymentStatus')
          .in('id', orderIds)
          .order('orderDate', { ascending: false })

        salesOrders = (orders || []).map((o: any) => {
          const matchingItems = orderItems.filter((oi: any) => oi.salesOrderId === o.id)
          const qty = matchingItems.reduce((s: number, oi: any) => s + (oi.quantity || 0), 0)
          const revenue = matchingItems.reduce((s: number, oi: any) => s + (oi.totalAmount || 0), 0)
          return { ...o, productQty: qty, productRevenue: revenue }
        })
      }
    } catch { /* ignore */ }

    // ── 6. Production Jobs ──
    let productionJobs: any[] = []
    try {
      const { data, error } = await supabase
        .from('ProductionJob')
        .select('id, jobNo, salesOrderId, styleNo, styleName, targetQty, completedQty, stage, status, startDate, endDate, salesOrder:salesOrderId(orderNo, customer:customerId(companyName))')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
      if (!error && data) productionJobs = data
    } catch { /* ignore */ }

    // ── 7. Dispatch ──
    let dispatches: any[] = []
    try {
      const salesOrderIds = salesOrders.map((o: any) => o.id)
      if (salesOrderIds.length > 0) {
        const { data, error } = await supabase
          .from('Dispatch')
          .select('id, dispatchNo, salesOrderId, dispatchDate, status, totalDispatchedQty, customer:customerId(companyName)')
          .in('salesOrderId', salesOrderIds)
          .order('dispatchDate', { ascending: false })
        if (!error && data) dispatches = data
      }
    } catch { /* ignore */ }

    // ── 8. Invoices ──
    let invoices: any[] = []
    try {
      const salesOrderIds = salesOrders.map((o: any) => o.id)
      if (salesOrderIds.length > 0) {
        const { data, error } = await supabase
          .from('Invoice')
          .select('id, invoiceNo, totalAmount, paidAmount, paymentStatus, paymentTerms, dueDate, invoiceDate')
          .in('salesOrderId', salesOrderIds)
          .order('invoiceDate', { ascending: false })
        if (!error && data) invoices = data
      }
    } catch { /* table may not exist yet */ }

    // ── 9. Payments ──
    let payments: any[] = []
    try {
      const invoiceIds = invoices.map((i: any) => i.id)
      if (invoiceIds.length > 0) {
        const { data, error } = await supabase
          .from('Payment')
          .select('id, paymentNo, amount, paymentDate, paymentMode')
          .in('invoiceId', invoiceIds)
          .order('paymentDate', { ascending: false })
        if (!error && data) payments = data
      }
    } catch { /* table may not exist yet */ }

    // ── 10. Profit Analysis ──
    const estimatedCost = costing?.totalCost || 0
    const sellingPrice = costing?.sellingPrice || 0
    const totalQtySold = salesOrders.reduce((s: number, o: any) => s + (o.productQty || 0), 0)
    const totalRevenue = salesOrders.reduce((s: number, o: any) => s + (o.productRevenue || 0), 0)
    const totalCollected = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const totalOutstanding = invoices.reduce((s: number, i: any) => s + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0)

    // Actual cost (from PO data — fabric cost)
    const actualFabricCost = purchaseOrders.reduce((s: number, po: any) => s + (po.totalAmount || 0), 0)
    const estimatedTotalCost = estimatedCost * totalQtySold

    const profitAnalysis = {
      estimatedCostPerPiece: estimatedCost,
      sellingPricePerPiece: sellingPrice,
      estimatedMargin: sellingPrice > 0 ? Math.round(((sellingPrice - estimatedCost) / sellingPrice) * 1000) / 10 : 0,
      totalQtySold,
      totalRevenue: Math.round(totalRevenue),
      totalCollected: Math.round(totalCollected),
      totalOutstanding: Math.round(totalOutstanding),
      estimatedTotalCost: Math.round(estimatedTotalCost),
      estimatedProfit: Math.round(totalRevenue - estimatedTotalCost),
      actualFabricCost: Math.round(actualFabricCost),
      actualProfit: Math.round(totalRevenue - actualFabricCost), // simplified — will improve with actual labor cost
    }

    // ── 11. Pipeline Status ──
    const stages = [
      { key: 'sample', label: 'Sample Catalog', status: sample ? 'done' : 'pending', detail: sample ? `${sample.sampleNo} — ${sample.status}` : 'Not created' },
      { key: 'costing', label: 'Costing', status: costing ? 'done' : 'pending', detail: costing ? `₹${costing.totalCost} cost → ₹${costing.sellingPrice} sell` : 'No cost sheet' },
      { key: 'po', label: 'Purchase Order', status: purchaseOrders.length > 0 ? 'done' : 'pending', detail: purchaseOrders.length > 0 ? `${purchaseOrders.length} PO(s)` : 'No POs' },
      { key: 'sampling', label: 'Sampling', status: samplings.length > 0 ? 'done' : 'pending', detail: samplings.length > 0 ? `${samplings.length} sample(s)` : 'No sampling' },
      { key: 'sales', label: 'Sales Order', status: salesOrders.length > 0 ? 'done' : 'pending', detail: salesOrders.length > 0 ? `${salesOrders.length} order(s) — ${totalQtySold} pcs` : 'No orders' },
      { key: 'production', label: 'Production', status: productionJobs.length > 0 ? 'done' : 'pending', detail: productionJobs.length > 0 ? `${productionJobs.length} job(s)` : 'No production' },
      { key: 'dispatch', label: 'Dispatch', status: dispatches.length > 0 ? 'done' : 'pending', detail: dispatches.length > 0 ? `${dispatches.length} dispatch(es)` : 'Not dispatched' },
      { key: 'invoice', label: 'Invoice', status: invoices.length > 0 ? 'done' : 'pending', detail: invoices.length > 0 ? `${invoices.length} invoice(s)` : 'No invoices' },
      { key: 'payment', label: 'Payment', status: payments.length > 0 ? 'done' : 'pending', detail: payments.length > 0 ? `${payments.length} payment(s)` : 'No payments' },
    ]

    return NextResponse.json({
      styleNo,
      styleName: sample?.styleName || costing?.styleName || productionJobs[0]?.styleName || styleNo,
      image: sample?.firstPhoto || costing?.image || null,
      sample,
      costing,
      purchaseOrders,
      samplings,
      salesOrders,
      productionJobs,
      dispatches,
      invoices,
      payments,
      profitAnalysis,
      pipeline: stages,
    })
  } catch (error) {
    console.error('Product lifecycle API error:', error)
    return NextResponse.json({ error: 'Failed to load product lifecycle' }, { status: 500 })
  }
}
