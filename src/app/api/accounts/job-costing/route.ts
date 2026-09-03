import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'

/**
 * GET /api/accounts/job-costing?styleNo=EL-007
 *
 * Job Costing — actual cost per production job vs estimated cost.
 *
 * Cost Elements:
 *   1. Fabric Cost (from FabricConsumption: consumed qty × rate)
 *   2. Labor Cost (from LaborTimesheet: hours × wage)
 *   3. Overhead (monthly expenses ÷ total pieces × this job's pieces)
 *   4. Outsourced Cost (from VendorBill linked to job)
 *   5. Wastage Cost (issued - consumed) × rate
 *
 * Returns: per-job cost breakdown + variance analysis
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const styleNo = searchParams.get('styleNo')
    const jobId = searchParams.get('jobId')

    let query = supabase
      .from('ProductionJob')
      .select('id, jobNo, styleNo, styleName, targetQty, completedQty, stage, status, startDate, endDate, costSheetId, actualFabricCost, actualLaborCost, actualOverheadCost, totalActualCost, salesOrder:salesOrderId(orderNo, customer:customerId(companyName))')
      .order('createdAt', { ascending: false })

    if (styleNo) query = query.eq('styleNo', styleNo)
    if (jobId) query = query.eq('id', jobId)

    const { data: jobs, error } = await query
    if (error) throw error

    // Fetch cost sheets for estimated costs
    // E2E-test fix: include id + targetQty + createdAt so we can (a) prefer the
    // job's OWN costSheetId and (b) divide totalCost by the sheet's targetQty —
    // CostSheet.totalCost is a TOTAL for the sheet, not a per-piece figure.
    const styleNos = [...new Set((jobs || []).map((j: any) => j.styleNo).filter(Boolean))]
    let costSheetMap: Record<string, any> = {}
    let costSheetById: Record<string, any> = {}
    if (styleNos.length > 0) {
      const { data: costSheets } = await supabase
        .from('CostSheet')
        .select('id, styleNo, targetQty, totalCost, sellingPrice, fabricCost, trimCost, laborCost, overheadCost, otherCost, createdAt')
        .in('styleNo', styleNos)
        .order('createdAt', { ascending: false })
      for (const cs of (costSheets || [])) {
        costSheetById[cs.id] = cs
        if (!costSheetMap[cs.styleNo]) costSheetMap[cs.styleNo] = cs // latest first
      }
    }

    // Fetch fabric consumption per job
    const jobIds = (jobs || []).map((j: any) => j.id)
    let fabricMap: Record<string, { issued: number; consumed: number; cost: number; details: any[] }> = {}
    if (jobIds.length > 0) {
      const { data: fabricData } = await supabase
        .from('FabricConsumption')
        .select('productionJobId, fabricName, issuedQty, consumedQty, fabricStock:fabricStockId(averageCost)')
        .in('productionJobId', jobIds)

      for (const fc of (fabricData || [])) {
        const jid = fc.productionJobId
        if (!fabricMap[jid]) fabricMap[jid] = { issued: 0, consumed: 0, cost: 0, details: [] }
        const rate = (fc.fabricStock as any)?.averageCost || 0
        const consumed = fc.consumedQty || 0
        const issued = fc.issuedQty || 0
        fabricMap[jid].issued += issued
        fabricMap[jid].consumed += consumed
        fabricMap[jid].cost += consumed * rate
        fabricMap[jid].details.push({
          fabricName: fc.fabricName,
          issuedQty: issued,
          consumedQty: consumed,
          ratePerUnit: rate,
          cost: Math.round(consumed * rate),
          wastage: issued - consumed,
          wastageCost: Math.round((issued - consumed) * rate),
        })
      }
    }

    // Fetch labor timesheets per job
    let laborMap: Record<string, { hours: number; cost: number; details: any[] }> = {}
    try {
      const { data: laborData } = await supabase
        .from('LaborTimesheet')
        .select('productionJobId, workerName, date, hoursWorked, wagePerHour, totalCost, stage')
        .in('productionJobId', jobIds)

      for (const lt of (laborData || [])) {
        const jid = lt.productionJobId
        if (!laborMap[jid]) laborMap[jid] = { hours: 0, cost: 0, details: [] }
        laborMap[jid].hours += lt.hoursWorked || 0
        laborMap[jid].cost += lt.totalCost || 0
        laborMap[jid].details.push({
          workerName: lt.workerName,
          date: lt.date,
          hours: lt.hoursWorked,
          wagePerHour: lt.wagePerHour,
          cost: lt.totalCost,
          stage: lt.stage,
        })
      }
    } catch { /* LaborTimesheet table may not exist yet */ }

    // Fetch vendor bills per job (via StageTracking)
    // E2E-test fix: the FK lives on VendorBill.stageTrackingId (StageTracking
    // has no vendorBillId column), so the old query silently returned zero
    // bills. Query VendorBill by the job's StageTracking ids instead.
    let vendorMap: Record<string, { cost: number; count: number }> = {}
    try {
      const { data: jobStageRows } = await supabase
        .from('StageTracking')
        .select('id, productionJobId')
        .in('productionJobId', jobIds)
      const stageIdToJob = new Map(
        (jobStageRows || []).map((st: any) => [st.id, st.productionJobId])
      )
      const stageIds = [...stageIdToJob.keys()]
      if (stageIds.length > 0) {
        const { data: billRows } = await supabase
          .from('VendorBill')
          .select('id, totalAmount, stageTrackingId')
          .in('stageTrackingId', stageIds)
        for (const bill of (billRows || [])) {
          const jid = stageIdToJob.get(bill.stageTrackingId)
          if (!jid) continue
          if (!vendorMap[jid]) vendorMap[jid] = { cost: 0, count: 0 }
          vendorMap[jid].cost += bill.totalAmount || 0
          vendorMap[jid].count++
        }
      }
    } catch { /* ignore */ }

    // E2E-test fix: in-house stage labor. StageTracking rows with
    // locationType 'In-House' carry perPieceRate × receivedQty (the job's
    // stitching/finishing/packing labor) — previously only LaborTimesheet
    // rows counted, so jobs without timesheets showed ₹0 labor.
    let stageLaborMap: Record<string, { cost: number; details: any[] }> = {}
    try {
      const { data: stageLaborRows } = await supabase
        .from('StageTracking')
        .select('id, productionJobId, stageName, sentQty, receivedQty, perPieceRate, totalAmount, locationType')
        .in('productionJobId', jobIds)
        .eq('locationType', 'In-House')
      for (const st of (stageLaborRows || [])) {
        const rate = Number(st.perPieceRate) || 0
        const qty = Number(st.receivedQty) || 0
        if (rate <= 0 || qty <= 0) continue
        const jid = st.productionJobId
        if (!stageLaborMap[jid]) stageLaborMap[jid] = { cost: 0, details: [] }
        const cost = Number(st.totalAmount) || Math.round(rate * qty)
        stageLaborMap[jid].cost += cost
        stageLaborMap[jid].details.push({
          stage: st.stageName,
          qty,
          ratePerPiece: rate,
          cost,
        })
      }
    } catch { /* ignore */ }

    // Calculate monthly overhead (from transactions)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: monthExpenses } = await supabase
      .from('Transaction')
      .select('amount')
      .eq('type', 'Debit')
      .gte('date', monthStart)

    const monthlyOverhead = (monthExpenses || []).reduce((s: number, t: any) => s + (t.amount || 0), 0)
    const totalPiecesThisMonth = (jobs || []).reduce((s: number, j: any) => s + (j.completedQty || 0), 0)
    const overheadPerPiece = totalPiecesThisMonth > 0 ? monthlyOverhead / totalPiecesThisMonth : 0

    // Build result
    const result = (jobs || []).map((job: any) => {
      const jid = job.id
      const cs = (job.costSheetId && costSheetById[job.costSheetId]) || costSheetMap[job.styleNo]
      const fabric = fabricMap[jid] || { issued: 0, consumed: 0, cost: 0, details: [] }
      const labor = laborMap[jid] || { hours: 0, cost: 0, details: [] }
      const stageLabor = stageLaborMap[jid] || { cost: 0, details: [] }
      const vendor = vendorMap[jid] || { cost: 0, count: 0 }
      const overhead = Math.round(overheadPerPiece * (job.completedQty || job.targetQty || 0))

      const actualFabricCost = Math.round(fabric.cost)
      const actualLaborCost = Math.round(labor.cost + stageLabor.cost)
      const actualOutsourcedCost = Math.round(vendor.cost)
      const actualOverheadCost = overhead
      const totalActualCost = actualFabricCost + actualLaborCost + actualOutsourcedCost + actualOverheadCost

      // E2E-test fix: CostSheet totals are for the WHOLE sheet (targetQty).
      // Per-piece = total / targetQty; the per-JOB estimate scales the sheet
      // proportionally to this job's quantity (child job 120 of 480 → ¼).
      const sheetTargetQty = Number(cs?.targetQty) || 0
      const estimatedCostPerPiece = cs
        ? (sheetTargetQty > 0 ? (Number(cs.totalCost) || 0) / sheetTargetQty : Number(cs.totalCost) || 0)
        : 0
      const estimatedCost = cs
        ? Math.round(estimatedCostPerPiece * (job.targetQty || 0))
        : 0
      const jobFraction = sheetTargetQty > 0 ? (job.targetQty || 0) / sheetTargetQty : 1
      const actualCostPerPiece = (job.targetQty || 0) > 0 ? Math.round(totalActualCost / job.targetQty) : 0
      const variance = totalActualCost - estimatedCost
      const variancePercent = estimatedCost > 0 ? Math.round((variance / estimatedCost) * 1000) / 10 : 0

      const wastageCost = fabric.details.reduce((s: number, d: any) => s + (d.wastageCost || 0), 0)

      return {
        id: job.id,
        jobNo: job.jobNo,
        styleNo: job.styleNo,
        styleName: job.styleName,
        targetQty: job.targetQty,
        completedQty: job.completedQty,
        stage: job.stage,
        status: job.status,
        salesOrder: job.salesOrder,
        // Estimated (from CostSheet — proportional to this job's qty)
        estimatedCostPerPiece: Math.round(estimatedCostPerPiece),
        estimatedTotalCost: estimatedCost,
        estimatedFabric: cs ? Math.round((cs.fabricCost || 0) * jobFraction) : 0,
        estimatedLabor: cs ? Math.round((cs.laborCost || 0) * jobFraction) : 0,
        estimatedOverhead: cs ? Math.round((cs.overheadCost || 0) * jobFraction) : 0,
        // Actual (from PO+GRN+Timesheet+StageLabor+Vendor)
        actualFabricCost,
        actualLaborCost,
        actualOutsourcedCost,
        actualOverheadCost,
        totalActualCost,
        actualCostPerPiece,
        // Variance
        variance,
        variancePercent,
        // Details
        fabricDetails: fabric.details,
        laborDetails: [...labor.details, ...stageLabor.details],
        vendorBillCount: vendor.count,
        wastageCost,
      }
    })

    return NextResponse.json({
      jobs: result,
      summary: {
        totalJobs: result.length,
        totalEstimated: result.reduce((s: number, j: any) => s + j.estimatedTotalCost, 0),
        totalActual: result.reduce((s: number, j: any) => s + j.totalActualCost, 0),
        totalVariance: result.reduce((s: number, j: any) => s + j.variance, 0),
        monthlyOverhead: Math.round(monthlyOverhead),
        overheadPerPiece: Math.round(overheadPerPiece),
      },
    })
  } catch (error) {
    console.error('Job Costing API error:', error)
    return NextResponse.json({ error: 'Failed to load job costing' }, { status: 500 })
  }
}
