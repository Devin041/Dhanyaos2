import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { getActiveBom } from '@/lib/bom-requirement'

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
 *   - BOM (active version + line count — Phase 6)
 *   - Fabric flow: GRNs, receipts, consumption + summary (Phase 6)
 *   - Sampling records (PP samples)
 *   - Sales Orders (qty ordered, revenue)
 *   - Production jobs (progress, stage, actual costs; leaf jobs only, w/ color)
 *   - Dispatch records (shipped qty)
 *   - Invoices & Payments (billed, collected, outstanding)
 *   - Profit Analysis (estimated vs actual cost, actual profit)
 *   - Product P&L — 4 views (Phase C.1): TARGET (cost-sheet plan) |
 *     ACTUAL (invoiced pre-tax revenue − actual direct costs, matching
 *     basis: fabric CONSUMED not purchased) | NET (− net GST − indirect) |
 *     CASH (collected vs paid-out vs committed dues — the cash-gap red
 *     flag) + component variance + leftover assets.
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
        .select('id, sheetNo, totalCost, sellingPrice, profitPercent, status, image, targetQty, brokerCommissionAmount, brokerCommissionPercent')
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
        .select('id, poNumber, supplier:supplierId(name), fabricName, quantity, ratePerUnit, totalAmount, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, status, paymentStatus, paidAmount, receivedQty, expectedDelivery, createdAt')
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
    // E2E-test fix: the orders API writes line items to "OrderItem" (see
    // src/app/api/orders/route.ts). The previous "SalesOrderItem" table does
    // not exist in the live DB (PGRST205), so this whole section silently
    // returned zero orders → dispatches/invoices/payments/profit all blank
    // in the Product Tracker.
    let salesOrders: any[] = []
    let orderItems: any[] = []
    try {
      const { data: oiRows, error: oiErr } = await supabase
        .from('OrderItem')
        .select('id, salesOrderId, styleNo, quantity, unitPrice, unitCost, totalAmount')
        .eq('styleNo', styleNo)
      orderItems = oiRows || []

      if (!oiErr && orderItems.length > 0) {
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

    // ── 6. Production Jobs (LEAF JOBS ONLY — Phase 5b) ──
    // Color-group parents are Σ rollups of their children; showing both would
    // double-count. color + parentJobId come along for the tracker's chips.
    let productionJobs: any[] = []
    try {
      const { data, error } = await supabase
        .from('ProductionJob')
        .select('id, jobNo, salesOrderId, styleNo, styleName, targetQty, completedQty, stage, status, startDate, endDate, color, parentJobId, salesOrder:salesOrderId(orderNo, customer:customerId(companyName))')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
      if (!error && data) {
        const parentIds = new Set(
          data.map((j: any) => j.parentJobId).filter((p: unknown): p is string => !!p)
        )
        productionJobs = data.filter((j: any) => !parentIds.has(j.id))
      }
    } catch { /* ignore */ }

    // ── 6b. BOM (Phase 6) ──
    // Active BOM + line count via the shared helper (defensive version /
    // isActive coalescing). null when the style has no active BOM.
    let bom: any = null
    try {
      const activeBom = await getActiveBom(styleNo)
      if (activeBom) {
        const { count: lineCount } = await supabase
          .from('BOMLine')
          .select('*', { count: 'exact', head: true })
          .eq('bomId', activeBom.id)
        bom = {
          id: activeBom.id,
          styleNo: activeBom.styleNo ?? styleNo,
          version: activeBom.version ?? 1,
          isActive: activeBom.isActive ?? true,
          lineCount: lineCount ?? 0,
          notes: activeBom.notes ?? null,
        }
      }
    } catch { /* no BOM */ }

    // ── 6c. Fabric flow (Phase 6): GRNs / receipts / consumption ──
    // Style linkage, two merged paths:
    //   A. FabricStock.styleNo stamps (stamped from the PO at GRN approval)
    //      → FabricReceipt rows on those stocks → their grnId → GrnNote
    //   B. PurchaseOrder.styleNo header (or POItem.styleNo fallback for older
    //      POs that never persisted the header) → GrnNote.poId
    let grns: any[] = []
    let fabricReceipts: any[] = []
    let fabricConsumption: any[] = []
    let fabricSummary: any = {
      received: 0, issued: 0, consumed: 0,
      receiptCount: 0, consumptionCount: 0, stockCount: 0, availableMeters: 0,
    }
    try {
      // (a) style-stocked fabric rows
      const { data: styleStocks } = await supabase
        .from('FabricStock')
        .select('id, fabricName, color, lotNumber, availableMeters')
        .eq('styleNo', styleNo)
      const stocks = (styleStocks || []) as any[]
      const stockIds = stocks.map(s => s.id)

      // (b) purchase orders for this style (header styleNo …)
      const { data: headerPOs } = await supabase
        .from('PurchaseOrder')
        .select('id, poNumber')
        .eq('styleNo', styleNo)
      let poMap: Record<string, string> = Object.fromEntries(
        ((headerPOs || []) as any[]).map(p => [p.id, p.poNumber])
      )
      // … or POItem.styleNo fallback (older POs kept style only on lines)
      const { data: poiRows } = await supabase
        .from('POItem')
        .select('purchaseOrderId')
        .eq('styleNo', styleNo)
      const poiPoIds = [...new Set(((poiRows || []) as any[]).map(r => r.purchaseOrderId).filter(Boolean))]
      const missingPoIds = poiPoIds.filter(id => !poMap[id])
      if (missingPoIds.length > 0) {
        const { data: extraPOs } = await supabase
          .from('PurchaseOrder')
          .select('id, poNumber')
          .in('id', missingPoIds)
        for (const p of ((extraPOs || []) as any[])) poMap[p.id] = p.poNumber
      }
      const poIds = Object.keys(poMap)

      // (c) receipts on the style-stocked stocks (audit ledger)
      let receipts: any[] = []
      if (stockIds.length > 0) {
        const { data: receiptRows } = await supabase
          .from('FabricReceipt')
          .select('*')
          .in('fabricStockId', stockIds)
          .order('receivedDate', { ascending: false })
        receipts = (receiptRows || []) as any[]
      }

      // (d) GRN ids from BOTH paths (receipt grnIds ∪ GRNs of style POs)
      const grnIdsFromReceipts = [...new Set(receipts.map(r => r.grnId).filter(Boolean))] as string[]
      let grnRows: any[] = []
      if (grnIdsFromReceipts.length > 0) {
        const { data: rows } = await supabase
          .from('GrnNote')
          .select('id, grnNo, supplierName, receivedDate, status, totalReceivedQty, acceptedQty, rejectedQty, poId')
          .in('id', grnIdsFromReceipts)
          .order('receivedDate', { ascending: false })
        grnRows = (rows || []) as any[]
      }
      if (poIds.length > 0) {
        const { data: rows } = await supabase
          .from('GrnNote')
          .select('id, grnNo, supplierName, receivedDate, status, totalReceivedQty, acceptedQty, rejectedQty, poId')
          .in('poId', poIds)
          .order('receivedDate', { ascending: false })
        for (const row of ((rows || []) as any[])) {
          if (!grnRows.some(g => g.id === row.id)) grnRows.push(row)
        }
      }
      grns = grnRows.map(g => ({ ...g, poNumber: g.poId ? poMap[g.poId] || null : null }))

      // (e) receipts flattened with GRN/PO/supplier joins (batched)
      const receiptGrnIds = [...new Set(receipts.map(r => r.grnId).filter(Boolean))] as string[]
      const receiptSupplierIds = [...new Set(receipts.map(r => r.supplierId).filter(Boolean))] as string[]
      const [grnJoinRes, supplierJoinRes] = await Promise.all([
        receiptGrnIds.length > 0
          ? supabase.from('GrnNote').select('id, grnNo, supplierName').in('id', receiptGrnIds)
          : Promise.resolve({ data: [] as any[] }),
        receiptSupplierIds.length > 0
          ? supabase.from('Supplier').select('id, name').in('id', receiptSupplierIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const grnNoMap: Record<string, any> = Object.fromEntries(((grnJoinRes.data || []) as any[]).map(g => [g.id, g]))
      const supplierNameMap: Record<string, any> = Object.fromEntries(((supplierJoinRes.data || []) as any[]).map(s => [s.id, s]))
      fabricReceipts = receipts.map(r => ({
        id: r.id,
        fabricStockId: r.fabricStockId,
        fabricName: r.fabricName,
        color: r.color ?? null,
        lotNumber: r.lotNumber ?? null,
        receivedQty: Number(r.receivedQty) || 0,
        acceptedQty: Number(r.acceptedQty) || 0,
        ratePerUnit: Number(r.ratePerUnit) || 0,
        totalValue: Number(r.totalValue) || 0,
        receivedDate: r.receivedDate,
        grnNo: r.grnId ? grnNoMap[r.grnId]?.grnNo || null : null,
        poNumber: r.poId ? poMap[r.poId] || null : null,
        supplierName:
          (r.supplierId ? supplierNameMap[r.supplierId]?.name || null : null) ||
          (r.grnId ? grnNoMap[r.grnId]?.supplierName || null : null),
      }))

      // (f) fabric consumption for this style's jobs (batched)
      const { data: styleJobs } = await supabase
        .from('ProductionJob')
        .select('id, jobNo')
        .eq('styleNo', styleNo)
      const jobIds = ((styleJobs || []) as any[]).map(j => j.id)
      if (jobIds.length > 0) {
        const { data: consumptionRows } = await supabase
          .from('FabricConsumption')
          .select('*')
          .in('productionJobId', jobIds)
          .order('consumptionDate', { ascending: false })
        const jobNoMap: Record<string, string> = Object.fromEntries(
          ((styleJobs || []) as any[]).map(j => [j.id, j.jobNo])
        )
        fabricConsumption = ((consumptionRows || []) as any[]).map(c => ({
          id: c.id,
          consumptionNo: c.consumptionNo,
          productionJobId: c.productionJobId,
          jobNo: jobNoMap[c.productionJobId] || null,
          fabricStockId: c.fabricStockId,
          fabricName: c.fabricName,
          issuedQty: Number(c.issuedQty) || 0,
          consumedQty: Number(c.consumedQty) || 0,
          wastageQty: Number(c.wastageQty) || 0,
          plannedQty: Number(c.plannedQty) || 0,
          outputQty: Number(c.outputQty) || 0,
          consumptionPerPc: Number(c.consumptionPerPc) || 0,
          consumptionDate: c.consumptionDate,
        }))
      }

      // (g) summary aggregates
      const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
      fabricSummary = {
        received: round2(fabricReceipts.reduce((s, r) => s + (Number(r.receivedQty) || 0), 0)),
        issued: round2(fabricConsumption.reduce((s, c) => s + (Number(c.issuedQty) || 0), 0)),
        consumed: round2(fabricConsumption.reduce((s, c) => s + (Number(c.consumedQty) || 0), 0)),
        receiptCount: fabricReceipts.length,
        consumptionCount: fabricConsumption.length,
        stockCount: stocks.length,
        availableMeters: round2(stocks.reduce((s, st) => s + (Number(st.availableMeters) || 0), 0)),
      }
    } catch { /* fabric flow is best-effort — sections stay empty */ }

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
          .select('id, invoiceNo, totalAmount, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, paidAmount, paymentStatus, paymentTerms, dueDate, invoiceDate')
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
    // E2E-test fix: CostSheet.totalCost can be EITHER a total for targetQty
    // (this app's convention for total-based sheets) or a per-piece figure
    // (older legacy sheets). The order line items carry the REAL unitPrice /
    // unitCost the business traded at — prefer those, fall back to the
    // costing sheet divided by its targetQty.
    const totalQtySold = salesOrders.reduce((s: number, o: any) => s + (o.productQty || 0), 0)
    const totalRevenue = salesOrders.reduce((s: number, o: any) => s + (o.productRevenue || 0), 0)
    const totalCollected = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const totalOutstanding = invoices.reduce((s: number, i: any) => s + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0)

    const orderCost = orderItems.reduce((s: number, oi: any) => s + (Number(oi.unitCost) || 0) * (Number(oi.quantity) || 0), 0)
    const orderSell = orderItems.reduce((s: number, oi: any) => s + (Number(oi.unitPrice) || 0) * (Number(oi.quantity) || 0), 0)
    const costingTargetQty = Number(costing?.targetQty) || 0
    const costingPerPiece = costing && costingTargetQty > 0
      ? (Number(costing.totalCost) || 0) / costingTargetQty
      : (Number(costing?.totalCost) || 0)
    const costingSellPerPiece = costing && costingTargetQty > 0
      ? (Number(costing.sellingPrice) || 0) / costingTargetQty
      : (Number(costing?.sellingPrice) || 0)

    const estimatedCostPerPiece = totalQtySold > 0 ? orderCost / totalQtySold : costingPerPiece
    const sellingPricePerPiece = totalQtySold > 0 ? orderSell / totalQtySold : costingSellPerPiece

    // Actual cost (from PO data — fabric cost)
    const actualFabricCost = purchaseOrders.reduce((s: number, po: any) => s + (po.totalAmount || 0), 0)
    const estimatedTotalCost = Math.round(estimatedCostPerPiece * totalQtySold)

    const profitAnalysis = {
      estimatedCostPerPiece: Math.round(estimatedCostPerPiece),
      sellingPricePerPiece: Math.round(sellingPricePerPiece),
      estimatedMargin: sellingPricePerPiece > 0 ? Math.round(((sellingPricePerPiece - estimatedCostPerPiece) / sellingPricePerPiece) * 1000) / 10 : 0,
      totalQtySold,
      totalRevenue: Math.round(totalRevenue),
      totalCollected: Math.round(totalCollected),
      totalOutstanding: Math.round(totalOutstanding),
      estimatedTotalCost: Math.round(estimatedTotalCost),
      estimatedProfit: Math.round(totalRevenue - estimatedTotalCost),
      actualFabricCost: Math.round(actualFabricCost),
      actualProfit: Math.round(totalRevenue - actualFabricCost), // simplified — will improve with actual labor cost
    }

    // ── 10b. Product P&L — 4 views (Phase C.1) ──
    // TARGET: cost-sheet plan (sell − cost). ACTUAL: invoiced pre-tax revenue
    // − actual direct costs (fabric CONSUMED × receipt rate, job-work bills,
    // broker, direct expenses). NET: − net GST (cross-utilized) − indirect.
    // CASH: collected − paid-out − committed dues = the cash-gap red flag.
    let styleVendorBills: any[] = []
    try {
      // bills link to this style's jobs via StageTracking.productionJobId
      const { data: allStyleJobs } = await supabase
        .from('ProductionJob')
        .select('id, jobNo')
        .eq('styleNo', styleNo)
      const allJobIds = ((allStyleJobs || []) as any[]).map(j => j.id)
      if (allJobIds.length > 0) {
        const { data: stageRows } = await supabase
          .from('StageTracking')
          .select('id, productionJobId')
          .in('productionJobId', allJobIds)
        const stageIds = (((stageRows || []) as any[]).map(s => s.id)).filter(Boolean)
        if (stageIds.length > 0) {
          const { data: billRows } = await supabase
            .from('VendorBill')
            .select('id, billNo, totalAmount, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, paidAmount, status, billDate')
            .in('stageTrackingId', stageIds)
          styleVendorBills = ((billRows || []) as any[]).filter(b => b.status !== 'Cancelled')
        }
      }
    } catch { /* bills are best-effort */ }

    let orderExpenses: any[] = []
    try {
      const { data: expRows } = await supabase
        .from('ExpenseVoucher')
        .select('id, voucherNo, category, amount, gstAmount, directType, salesOrderId, styleNo, expenseDate')
        .eq('styleNo', styleNo)
      orderExpenses = ((expRows || []) as any[]).filter(e => e.directType !== 'INDIRECT')
    } catch { /* ExpenseVoucher may be empty */ }

    // fabric consumed cost — receipt rate per fabric stock (fallback: PO rate)
    const r2p = (n: number) => Math.round((Number(n) || 0) * 100) / 100
    const rateByStock: Record<string, number> = {}
    for (const r of fabricReceipts) {
      const cur = rateByStock[r.fabricStockId]
      rateByStock[r.fabricStockId] = cur == null
        ? (r.ratePerUnit || 0)
        : (cur + (r.ratePerUnit || 0)) / 2
    }
    const poPreTax = purchaseOrders.reduce((s: number, p: any) => s + (Number(p.taxableAmount) || Number(p.totalAmount) || 0), 0)
    const fallbackRate = purchaseOrders.length > 0 && poPreTax > 0
      ? poPreTax / Math.max(1, purchaseOrders.reduce((s: number, p: any) => s + (Number(p.receivedQty) || Number(p.quantity) || 0), 0))
      : 0
    const consumedMeters = fabricConsumption.reduce((s: number, c: any) => s + (Number(c.consumedQty) || 0), 0)
    const consumedCost = r2p(fabricConsumption.reduce(
      (s: number, c: any) => s + (Number(c.consumedQty) || 0) * (rateByStock[c.fabricStockId] ?? fallbackRate), 0))
    const fabricRate = consumedMeters > 0 ? r2p(consumedCost / consumedMeters) : r2p(fallbackRate)
    const purchasedPreTax = r2p(poPreTax)
    const leftoverMeters = r2p(fabricSummary.availableMeters || 0)
    const leftoverValue = r2p(leftoverMeters * (fabricRate || fallbackRate))

    // job-work + direct expenses
    const jobWorkBilled = r2p(styleVendorBills.reduce((s: number, b: any) => s + (Number(b.totalAmount) || 0), 0))
    const jobWorkPaid = r2p(styleVendorBills.reduce((s: number, b: any) => s + (Number(b.paidAmount) || 0), 0))
    const jobWorkDue = r2p(Math.max(0, jobWorkBilled - jobWorkPaid))
    const directExpenses = r2p(orderExpenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0) - (Number(e.gstAmount) || 0), 0))

    // revenue (pre-tax, invoiced)
    const invoicedGross = invoices.reduce((s: number, i: any) => s + (Number(i.totalAmount) || 0), 0)
    const invoicedTaxable = invoices.reduce(
      (s: number, i: any) => s + (Number(i.taxableAmount) || Math.max(0, (Number(i.totalAmount) || 0) - (Number(i.totalGst) || 0))), 0)
    const collected = r2p(totalCollected)
    const outstanding = r2p(totalOutstanding)

    // broker (latest cost sheet) + TDS 194H 5%
    const brokerCommission = r2p(Number(costing?.brokerCommissionAmount) || 0)
    const brokerTds = r2p(brokerCommission * 0.05)
    const brokerPayable = r2p(brokerCommission - brokerTds)

    // per-order GST with statutory cross-utilization (Sec 49(5) / Rule 88A)
    let outC = 0, outS = 0, outI = 0
    for (const i of invoices) { outC += Number(i.cgstAmount) || 0; outS += Number(i.sgstAmount) || 0; outI += Number(i.igstAmount) || 0 }
    let inC = 0, inS = 0, inI = 0
    for (const p of purchaseOrders) { inC += Number(p.cgstAmount) || 0; inS += Number(p.sgstAmount) || 0; inI += Number(p.igstAmount) || 0 }
    for (const b of styleVendorBills) { inC += Number(b.cgstAmount) || 0; inS += Number(b.sgstAmount) || 0; inI += Number(b.igstAmount) || 0 }
    let crI = inI, crC = inC, crS = inS
    let liabI = Math.max(0, outI)
    let use = Math.min(liabI, crI); liabI -= use; crI -= use
    use = Math.min(liabI, crC); liabI -= use; crC -= use
    use = Math.min(liabI, crS); liabI -= use; crS -= use
    let liabC = Math.max(0, outC)
    use = Math.min(liabC, crC); liabC -= use; crC -= use
    use = Math.min(liabC, crI); liabC -= use; crI -= use
    let liabS = Math.max(0, outS)
    use = Math.min(liabS, crS); liabS -= use; crS -= use
    use = Math.min(liabS, crI); liabS -= use; crI -= use
    const netGst = r2p(liabI + liabC + liabS)

    // cash committed-out (unpaid dues + GST + broker gross incl. TDS)
    const fabricDue = r2p(purchaseOrders.reduce(
      (s: number, p: any) => s + Math.max(0, (Number(p.totalAmount) || 0) - (Number(p.paidAmount) || 0)), 0))
    const paidOut = r2p(
      purchaseOrders.reduce((s: number, p: any) => s + (Number(p.paidAmount) || 0), 0)
      + jobWorkPaid + orderExpenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0))
    const committedOut = r2p(fabricDue + jobWorkDue + brokerCommission + netGst)
    const cashGap = r2p(collected - paidOut - committedOut)

    // views
    const tSell = Number(costing?.sellingPrice) || 0
    const tCost = Number(costing?.totalCost) || 0
    const tQty = Number(costing?.targetQty) || totalQtySold
    const targetGp = r2p(tSell - tCost)
    const actualDirect = r2p(consumedCost + jobWorkBilled + brokerCommission + directExpenses)
    const actualGp = r2p(invoicedTaxable - actualDirect)
    const indirectAllocated = 0 // no indirect vouchers exist yet; shown as a labeled line
    const netProfit = r2p(actualGp - netGst - indirectAllocated)

    const producedQty = productionJobs.reduce((s: number, j: any) => s + (Number(j.completedQty) || 0), 0)
    const dispatchedQty = dispatches.reduce((s: number, d: any) => s + (Number(d.totalDispatchedQty) || 0), 0)
    const costPerPiece = producedQty > 0 ? r2p(actualDirect / producedQty) : 0
    const defectiveQty = Math.max(0, (totalQtySold || producedQty) - producedQty)

    const productPnl: any = {
      qty: {
        ordered: totalQtySold,
        produced: producedQty,
        dispatched: dispatchedQty,
        defective: defectiveQty,
        defectiveValue: r2p(defectiveQty * costPerPiece),
      },
      target: {
        label: 'Cost-sheet plan at booking time',
        qty: tQty,
        sellPrice: r2p(tSell),
        totalCost: r2p(tCost),
        brokerCommission,
        grossProfit: targetGp,
        margin: tSell > 0 ? Math.round((targetGp / tSell) * 1000) / 10 : 0,
      },
      actual: {
        label: 'Invoiced revenue (pre-tax) − actual direct costs (fabric consumed, matching basis)',
        revenue: r2p(invoicedTaxable),
        revenueGross: r2p(invoicedGross),
        costs: {
          fabricConsumed: { meters: r2p(consumedMeters), rate: fabricRate, amount: consumedCost },
          fabricPurchased: purchasedPreTax,
          jobWork: { bills: styleVendorBills.length, amount: jobWorkBilled },
          broker: brokerCommission,
          directExpenses: { vouchers: orderExpenses.length, amount: directExpenses },
        },
        totalDirectCost: actualDirect,
        grossProfit: actualGp,
        margin: invoicedTaxable > 0 ? Math.round((actualGp / invoicedTaxable) * 1000) / 10 : 0,
      },
      net: {
        label: 'Actual gross profit − net GST − allocated overheads',
        netGst,
        gstDetail: { output: r2p(outC + outS + outI), input: r2p(inC + inS + inI), crossUtilized: true },
        indirectAllocated,
        netProfit,
        margin: invoicedTaxable > 0 ? Math.round((netProfit / invoicedTaxable) * 1000) / 10 : 0,
      },
      cash: {
        label: 'Paisa aya vs gaya vs jaana padega',
        collected,
        paidOut,
        outstanding,
        dues: {
          fabricSupplier: fabricDue,
          jobWorkVendors: jobWorkDue,
          brokerGross: brokerCommission,
          brokerTds,
          brokerPayable,
          gstPayable: netGst,
        },
        committedOut,
        cashGap,
        redFlag: cashGap < 0,
      },
      variance: [
        { component: 'Revenue (pre-tax)', target: r2p(tSell), actual: r2p(invoicedTaxable), delta: r2p(invoicedTaxable - tSell), note: defectiveQty > 0 ? `${defectiveQty} defective pcs not invoiced` : '' },
        { component: 'Fabric', target: purchasedPreTax, actual: consumedCost, delta: r2p(consumedCost - purchasedPreTax), note: leftoverMeters > 0 ? `${leftoverMeters}m leftover (asset ₹${leftoverValue})` : '' },
        { component: 'Job-work (vendor bills)', target: 0, actual: jobWorkBilled, delta: jobWorkBilled, note: `${styleVendorBills.length} bills` },
        { component: 'Broker commission', target: brokerCommission, actual: brokerCommission, delta: 0, note: costing?.brokerCommissionPercent ? `${costing.brokerCommissionPercent}% per cost sheet` : '' },
        { component: 'Direct expenses', target: 0, actual: directExpenses, delta: directExpenses, note: orderExpenses.length > 0 ? `${orderExpenses.length} voucher(s)` : 'none booked' },
      ],
      assets: {
        leftoverFabric: { meters: leftoverMeters, rate: fabricRate, value: leftoverValue },
        defective: { qty: defectiveQty, value: r2p(defectiveQty * costPerPiece) },
        receivable: outstanding,
      },
    }

    // ── 11. Pipeline Status ──
    // Production detail appends the distinct garment-color count (Phase 5b)
    const productionColorCount = new Set(
      productionJobs
        .map((j: any) => String(j.color || '').trim())
        .filter((c: string) => c !== '' && c.toLowerCase() !== 'free')
    ).size
    const productionDetail = productionJobs.length > 0
      ? `${productionJobs.length} job(s)${productionColorCount > 0 ? ` — ${productionColorCount} color(s)` : ''}`
      : 'No production'
    const stages = [
      { key: 'sample', label: 'Sample Catalog', status: sample ? 'done' : 'pending', detail: sample ? `${sample.sampleNo} — ${sample.status}` : 'Not created' },
      { key: 'costing', label: 'Costing', status: costing ? 'done' : 'pending', detail: costing ? `₹${costing.totalCost} cost → ₹${costing.sellingPrice} sell` : 'No cost sheet' },
      { key: 'po', label: 'Purchase Order', status: purchaseOrders.length > 0 ? 'done' : 'pending', detail: purchaseOrders.length > 0 ? `${purchaseOrders.length} PO(s)` : 'No POs' },
      { key: 'bom', label: 'BOM', status: bom ? 'done' : 'pending', detail: bom ? `v${bom.version} · ${bom.lineCount} lines` : 'No BOM' },
      { key: 'fabric', label: 'GRN / Fabric', status: (grns.length > 0 || fabricReceipts.length > 0) ? 'done' : 'pending', detail: fabricSummary.received > 0 ? `${fabricSummary.received}m received · ${fabricSummary.consumed}m consumed` : (grns.length > 0 ? `${grns.length} GRN(s)` : 'No fabric receipts') },
      { key: 'sampling', label: 'Sampling', status: samplings.length > 0 ? 'done' : 'pending', detail: samplings.length > 0 ? `${samplings.length} sample(s)` : 'No sampling' },
      { key: 'sales', label: 'Sales Order', status: salesOrders.length > 0 ? 'done' : 'pending', detail: salesOrders.length > 0 ? `${salesOrders.length} order(s) — ${totalQtySold} pcs` : 'No orders' },
      { key: 'production', label: 'Production', status: productionJobs.length > 0 ? 'done' : 'pending', detail: productionDetail },
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
      bom,
      grns,
      fabricReceipts,
      fabricConsumption,
      fabricSummary,
      samplings,
      salesOrders,
      productionJobs,
      dispatches,
      invoices,
      payments,
      profitAnalysis,
      productPnl,
      pipeline: stages,
    })
  } catch (error) {
    console.error('Product lifecycle API error:', error)
    return NextResponse.json({ error: 'Failed to load product lifecycle' }, { status: 500 })
  }
}
