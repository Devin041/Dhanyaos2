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
    const styleNos = [...new Set((jobs || []).map((j: any) => j.styleNo).filter(Boolean))]
    let costSheetMap: Record<string, any> = {}
    if (styleNos.length > 0) {
      const { data: costSheets } = await supabase
        .from('CostSheet')
        .select('id, styleNo, totalCost, sellingPrice, fabricCost, trimCost, laborCost, overheadCost, otherCost')
        .in('styleNo', styleNos)
      for (const cs of (costSheets || [])) {
        if (!costSheetMap[cs.styleNo]) costSheetMap[cs.styleNo] = cs
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
    let vendorMap: Record<string, { cost: number; count: number }> = {}
    try {
      const { data: stageData } = await supabase
        .from('StageTracking')
        .select('productionJobId, vendorBillId, vendorBill:vendorBillId(id, totalAmount, vendorName)')
        .in('productionJobId', jobIds)
        .not('vendorBillId', 'is', null)

      for (const st of (stageData || [])) {
        const jid = st.productionJobId
        if (!vendorMap[jid]) vendorMap[jid] = { cost: 0, count: 0 }
        const bill = st.vendorBill as any
        if (bill) {
          vendorMap[jid].cost += bill.totalAmount || 0
          vendorMap[jid].count++
        }
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
      const cs = costSheetMap[job.styleNo]
      const fabric = fabricMap[jid] || { issued: 0, consumed: 0, cost: 0, details: [] }
      const labor = laborMap[jid] || { hours: 0, cost: 0, details: [] }
      const vendor = vendorMap[jid] || { cost: 0, count: 0 }
      const overhead = Math.round(overheadPerPiece * (job.completedQty || job.targetQty || 0))

      const actualFabricCost = Math.round(fabric.cost)
      const actualLaborCost = Math.round(labor.cost)
      const actualOutsourcedCost = Math.round(vendor.cost)
      const actualOverheadCost = overhead
      const totalActualCost = actualFabricCost + actualLaborCost + actualOutsourcedCost + actualOverheadCost

      const estimatedCost = cs ? Math.round(cs.totalCost * (job.targetQty || 0)) : 0
      const estimatedCostPerPiece = cs?.totalCost || 0
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
        // Estimated (from CostSheet)
        estimatedCostPerPiece,
        estimatedTotalCost: estimatedCost,
        estimatedFabric: cs?.fabricCost || 0,
        estimatedLabor: cs?.laborCost || 0,
        estimatedOverhead: cs?.overheadCost || 0,
        // Actual (from PO+GRN+Timesheet+Vendor)
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
        laborDetails: labor.details,
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
