import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { computeBomRequirement } from '@/lib/bom-requirement'
import { batchResolveStyleImages } from '@/lib/style-image'

/**
 * GET /api/production/[id]/fabric-issue-data
 *
 * ONE call powering the whole Fabric Issue dialog (Phase 4):
 *   - job basics (select('*') defensive — includes color/parentJobId live cols)
 *   - stock candidates: FabricStock rows relevant to this job:
 *       1. styleNo exact match on job.styleNo
 *       2. stock.id === job.fabricStockId (linked at job creation)
 *       3. fabricName ↔ job.styleNo/styleName contains-match
 *          (catches e.g. 'Farsi Kurti Long Size' stock for that job)
 *       4. un-styled stock whose fabricName contains-matches active-BOM
 *          FABRIC material names (grain-match instead of nothing)
 *   - Supplier.name via ONE batch join (no N+1)
 *   - FabricReceipt rows per candidate, batch-joined to GrnNote.grnNo +
 *     PurchaseOrder.poNumber (the GRN receipt chips data)
 *   - alreadyIssued: FabricConsumption rows for this job (issue history)
 *   - requirement via computeBomRequirement (BOM truth)
 *   - styleImage via batchResolveStyleImages (job.styleNo + stock-stamped
 *     styleNo fallback — e.g. fabric received against a PO for EL-01111)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Production job id is required' }, { status: 400 })

    // ── 1. Job ────────────────────────────────────────────────────────────
    const { data: jobRow, error: jobErr } = await supabase
      .from('ProductionJob')
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))')
      .eq('id', id)
      .single()
    if (jobErr || !jobRow) {
      return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    }
    const job = jobRow as any

    // ── 2. Stock candidates ───────────────────────────────────────────────
    const { data: allStockRaw, error: stockErr } = await supabase
      .from('FabricStock')
      .select('*')
      .order('availableMeters', { ascending: false })
    if (stockErr) throw stockErr
    const allStock = (allStockRaw || []) as any[]

    // BOM FABRIC material names (active BOM only — best effort)
    let bomFabricNames: string[] = []
    try {
      const { data: boms } = await supabase
        .from('BOM')
        .select('id')
        .eq('styleNo', job.styleNo)
        .eq('isActive', true)
        .order('version', { ascending: false })
        .limit(1)
      if (boms && boms.length > 0) {
        const { data: bomLines } = await supabase
          .from('BOMLine')
          .select('materialType, materialName')
          .eq('bomId', (boms[0] as any).id)
        for (const l of bomLines || []) {
          if (String((l as any).materialType || 'FABRIC').toUpperCase() === 'FABRIC' && (l as any).materialName) {
            bomFabricNames.push(String((l as any).materialName).toLowerCase())
          }
        }
      }
    } catch {
      // BOM names are best-effort candidates only
    }

    const jobStyleNo = String(job.styleNo || '').toLowerCase()
    const jobStyleName = String(job.styleName || '').toLowerCase()

    const candidates = allStock.filter((s) => {
      // 1. exact styleNo stamp
      if (jobStyleNo && s.styleNo && String(s.styleNo).toLowerCase() === jobStyleNo) return true
      // 2. linked stock row
      if (job.fabricStockId && s.id === job.fabricStockId) return true
      // 3. fabricName ↔ job style name contains-match
      const stockName = String(s.fabricName || '').toLowerCase()
      if (jobStyleNo && stockName && (stockName.includes(jobStyleNo) || jobStyleNo.includes(stockName))) return true
      if (jobStyleName && stockName && (stockName.includes(jobStyleName) || jobStyleName.includes(stockName))) return true
      // 4. un-styled stock whose name contains-matches an active-BOM fabric
      if (!s.styleNo && stockName) {
        for (const n of bomFabricNames) {
          if (n && (stockName.includes(n) || n.includes(stockName))) return true
        }
      }
      return false
    })

    // ── 3. Supplier names (batch join, no N+1) ────────────────────────────
    const supplierIds = [...new Set(candidates.map((s) => s.supplierId).filter(Boolean))] as string[]
    const supplierMap: Record<string, string> = {}
    if (supplierIds.length > 0) {
      try {
        const { data: suppliers } = await supabase
          .from('Supplier')
          .select('id, name')
          .in('id', supplierIds)
        for (const s of suppliers || []) supplierMap[(s as any).id] = (s as any).name
      } catch {
        // supplier names are display-only
      }
    }

    // ── 4. Receipts per candidate (batch joins → chips) ───────────────────
    const candidateIds = candidates.map((s) => s.id)
    let receipts: any[] = []
    if (candidateIds.length > 0) {
      try {
        const { data: receiptRows } = await supabase
          .from('FabricReceipt')
          .select('*')
          .in('fabricStockId', candidateIds)
          .order('receivedDate', { ascending: false })
        receipts = receiptRows || []
      } catch {
        // receipts are display-only chips
      }
    }

    const grnIds = [...new Set(receipts.map((r) => r.grnId).filter(Boolean))] as string[]
    const poIds = [...new Set(receipts.map((r) => r.poId).filter(Boolean))] as string[]
    const grnMap: Record<string, string> = {}
    const poMap: Record<string, string> = {}
    if (grnIds.length > 0) {
      try {
        const { data: grns } = await supabase.from('GrnNote').select('id, grnNo').in('id', grnIds)
        for (const g of grns || []) grnMap[(g as any).id] = (g as any).grnNo
      } catch { /* chip data best-effort */ }
    }
    if (poIds.length > 0) {
      try {
        const { data: pos } = await supabase.from('PurchaseOrder').select('id, poNumber').in('id', poIds)
        for (const p of pos || []) poMap[(p as any).id] = (p as any).poNumber
      } catch { /* chip data best-effort */ }
    }

    const receiptsByStock: Record<string, any[]> = {}
    for (const r of receipts) {
      if (!r.fabricStockId) continue
      const key = String(r.fabricStockId)
      if (!receiptsByStock[key]) receiptsByStock[key] = []
      receiptsByStock[key].push({
        id: r.id,
        grnNo: r.grnId ? grnMap[r.grnId] || null : null,
        poNumber: r.poId ? poMap[r.poId] || null : null,
        receivedDate: r.receivedDate || null,
        receivedQty: Number(r.receivedQty) || 0,
        acceptedQty: Number(r.acceptedQty) || 0,
        rejectedQty: Math.max(0, (Number(r.receivedQty) || 0) - (Number(r.acceptedQty) || 0)),
        color: r.color || null,
        lotNumber: r.lotNumber || null,
        ratePerUnit: Number(r.ratePerUnit) || 0,
        notes: r.notes || null,
      })
    }

    // ── 5. Stock rows for the dialog (with receipts attached) ────────────
    const stocks = candidates.map((s) => ({
      id: s.id,
      fabricName: s.fabricName || '',
      color: s.color || null,
      lotNumber: s.lotNumber || null,
      styleNo: s.styleNo || null,
      availableMeters: Number(s.availableMeters) || 0,
      reservedMeters: Number(s.reservedMeters) || 0,
      averageCost: Number(s.averageCost) || 0,
      totalValue: Number(s.totalValue) || 0,
      supplierId: s.supplierId || null,
      supplierName: s.supplierId ? supplierMap[s.supplierId] || null : null,
      _matchedReason:
        job.fabricStockId && s.id === job.fabricStockId
          ? 'linked'
          : jobStyleNo && s.styleNo && String(s.styleNo).toLowerCase() === jobStyleNo
          ? 'styleNo'
          : 'name',
      receipts: receiptsByStock[s.id] || [],
    }))

    // ── 6. Already-issued FabricConsumption rows (history + totals) ───────
    let alreadyIssued: any[] = []
    try {
      const { data: issuedRows } = await supabase
        .from('FabricConsumption')
        .select('*')
        .eq('productionJobId', id)
        .order('consumptionDate', { ascending: false })
      alreadyIssued = (issuedRows || []).map((c: any) => ({
        id: c.id,
        consumptionNo: c.consumptionNo,
        fabricStockId: c.fabricStockId,
        fabricName: c.fabricName || '',
        issuedQty: Number(c.issuedQty) || 0,
        consumedQty: Number(c.consumedQty) || 0,
        wastageQty: Number(c.wastageQty) || 0,
        wastageReason: c.wastageReason || null,
        wastageRemarks: c.wastageRemarks || null,
        plannedQty: Number(c.plannedQty) || 0,
        consumptionPerPc: Number(c.consumptionPerPc) || 0,
        recordedBy: c.recordedBy || null,
        consumptionDate: c.consumptionDate || null,
        isReturn: String(c.wastageReason || '') === 'Fabric Return',
      }))
    } catch {
      // history is display-only
    }

    // ── 7. BOM requirement (computeBomRequirement — shared lib) ──────────
    let requirement: any = null
    let requirementNote: string | null = null
    try {
      const outcome = await computeBomRequirement(String(job.styleNo || ''), Number(job.targetQty) || 0)
      if (outcome.ok) {
        requirement = {
          lines: outcome.requirement.lines,
          summary: outcome.requirement.summary,
          bomVersion: (outcome.bom as any)?.version ?? null,
        }
      } else if (outcome.reason === 'no-active-bom') {
        requirementNote = 'No active BOM for this style — requirement chips unavailable'
      } else if (outcome.reason === 'missing-params') {
        requirementNote = 'Style or qty missing — requirement chips unavailable'
      }
    } catch {
      requirementNote = 'Failed to compute BOM requirement'
    }

    // ── 8. Style image (job styleNo first, stock-stamped styleNo fallback) ─
    let styleImage: string | null = null
    try {
      // Fallback chain: the linked stock's stamp, else any candidate stamp
      const fallbackStyleNo =
        candidates.find((s) => s.styleNo && job.fabricStockId && s.id === job.fabricStockId)?.styleNo ||
        candidates.find((s) => s.styleNo)?.styleNo ||
        null
      const styleNos = [job.styleNo, fallbackStyleNo].filter(Boolean) as string[]
      if (styleNos.length > 0) {
        const images = await batchResolveStyleImages(styleNos)
        styleImage = (images[job.styleNo]?.url) || (fallbackStyleNo ? images[fallbackStyleNo]?.url : null) || null
      }
    } catch {
      // image is display-only
    }

    return NextResponse.json({
      job: {
        id: job.id,
        jobNo: job.jobNo,
        salesOrderId: job.salesOrderId || null,
        salesOrder: job.salesOrder || null,
        styleNo: job.styleNo || '',
        styleName: job.styleName || '',
        color: job.color || null,
        targetQty: Number(job.targetQty) || 0,
        completedQty: Number(job.completedQty) || 0,
        stage: job.stage || 'Fabric Issue',
        status: job.status || 'In Progress',
        plannedFabricMeters: Number(job.plannedFabricMeters) || 0,
        actualFabricConsumed: Number(job.actualFabricConsumed) || 0,
        actualFabricCost: Number(job.actualFabricCost) || 0,
        fabricStockId: job.fabricStockId || null,
        endDate: job.endDate || null,
      },
      stocks,
      alreadyIssued,
      requirement,
      requirementNote,
      styleImage,
      summary: {
        totalIssuedMeters: alreadyIssued
          .filter((c) => !c.isReturn)
          .reduce((sum, c) => sum + (Number(c.issuedQty) || 0), 0),
        totalReturnedMeters: alreadyIssued
          .filter((c) => c.isReturn)
          .reduce((sum, c) => sum + (Number(c.wastageQty) || 0), 0),
        candidateCount: stocks.length,
      },
    })
  } catch (error) {
    console.error('GET /api/production/[id]/fabric-issue-data error:', error)
    return NextResponse.json({ error: 'Failed to load fabric issue data' }, { status: 500 })
  }
}
