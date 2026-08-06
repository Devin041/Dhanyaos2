import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { batchResolveStyleImages } from '@/lib/style-image'

const PRODUCTION_STAGES = ['Fabric Issue','Cutting','Embroidery','Printing','Stitching','Finishing','Quality Check','Packing','Dispatch Ready','Dispatched'] as const

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status')
    const stage = searchParams.get('stage')
    const search = searchParams.get('search')

    // Fetch all jobs with salesOrder relation
    const { data: allJobsRaw, error } = await supabase
      .from('ProductionJob')
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))')
      .order('createdAt', { ascending: false })
    if (error) throw error

    let allJobsRaw2 = allJobsRaw || []
    if (search) {
      const term = search.toLowerCase()
      // We need to also search by salesOrder.orderNo, fetch those separately
      const { data: matchingOrders } = await supabase.from('SalesOrder').select('id, orderNo').ilike('orderNo', `%${search}%`)
      const orderIds = new Set((matchingOrders || []).map((o: any) => o.id))
      allJobsRaw2 = allJobsRaw2.filter((j: any) =>
        (j.jobNo || '').toLowerCase().includes(term) ||
        (j.styleNo || '').toLowerCase().includes(term) ||
        (j.styleName || '').toLowerCase().includes(term) ||
        (j.salesOrderId && orderIds.has(j.salesOrderId))
      )
    }

    // Resolve sample images for all jobs
    const allJobsRaw3 = [...allJobsRaw2]
    const styleNos = [...new Set(allJobsRaw3.map((j: any) => j.styleNo).filter(Boolean))]
    if (styleNos.length > 0) {
      const images = await batchResolveStyleImages(styleNos)
      for (const job of allJobsRaw3) {
        (job as any)._image = images[job.styleNo]?.url || null
      }
    }

    // Compute counts across all jobs (search-filtered only, no status/stage filter)
    const stageCounts: Record<string, number> = {}
    const statusCounts: Record<string, number> = {}
    for (const job of allJobsRaw3) {
      stageCounts[(job as any).stage] = (stageCounts[(job as any).stage] || 0) + 1
      statusCounts[(job as any).status] = (statusCounts[(job as any).status] || 0) + 1
    }
    for (const s of PRODUCTION_STAGES) { if (!stageCounts[s]) stageCounts[s] = 0 }

    // Re-apply filters on image-enriched data
    let jobs = allJobsRaw3
    if (status) jobs = jobs.filter((j: any) => j.status === status)
    if (stage) jobs = jobs.filter((j: any) => j.stage === stage)

    return NextResponse.json({ jobs, total: jobs.length, stageCounts, statusCounts })
  } catch (error) {
    console.error('Production GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch production jobs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { salesOrderId, styleNo, styleName, targetQty, endDate, startDate, costSheetId } = body
    if (!styleNo || !styleName || !targetQty) return NextResponse.json({ error: 'styleNo, styleName, and targetQty are required' }, { status: 400 })

    // If linked to sales order, fetch order to verify and get items
    let resolvedCostSheetId = costSheetId || null
    if (salesOrderId) {
      const { data: order, error: ordErr } = await supabase
        .from('SalesOrder')
        .select('id, status')
        .eq('id', salesOrderId)
        .single()

      if (ordErr || !order) return NextResponse.json({ error: 'Sales order not found' }, { status: 404 })
      if (['Dispatched', 'Completed', 'Cancelled'].includes((order as any).status))
        return NextResponse.json({ error: `Cannot start production for order in "${(order as any).status}" status` }, { status: 400 })

      // Auto-update order status to 'In Production' if not already
      if ((order as any).status !== 'In Production') {
        await supabase.from('SalesOrder').update({ status: 'In Production', updatedAt: new Date().toISOString() }).eq('id', salesOrderId)
      }

      // Try to resolve costSheetId from order items (separate query)
      if (!resolvedCostSheetId) {
        const { data: orderItems } = await supabase
          .from('SalesOrderItem')
          .select('styleNo, costSheetId')
          .eq('salesOrderId', salesOrderId)
          .eq('styleNo', styleNo)
          .limit(1)
        if (orderItems && orderItems.length > 0 && (orderItems[0] as any).costSheetId) {
          resolvedCostSheetId = (orderItems[0] as any).costSheetId
        }
      }
    }

    // If still no costSheetId, try to find from CostSheet table by styleNo
    if (!resolvedCostSheetId && styleNo) {
      const { data: costSheet } = await supabase
        .from('CostSheet')
        .select('id')
        .eq('styleNo', styleNo)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()
      if (costSheet) resolvedCostSheetId = (costSheet as any).id
    }

    const today = new Date()
    const dateStr = today.getFullYear().toString() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0')
    const prefix = `PJ-${dateStr}-`
    const { data: todayJobs } = await supabase.from('ProductionJob').select('jobNo').ilike('jobNo', `${prefix}%`).order('jobNo', { ascending: false }).limit(1)
    let nextSeq = 1
    if (todayJobs && todayJobs.length > 0) {
      const lastSeq = parseInt((todayJobs[0] as any).jobNo.slice(prefix.length), 10)
      nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1
    }
    const jobNo = `${prefix}${String(nextSeq).padStart(3, '0')}`
    const ts = new Date().toISOString()

    const { data: job, error } = await supabase.from('ProductionJob').insert({
      jobNo,
      salesOrderId: salesOrderId || null,
      styleNo, styleName,
      targetQty: Number(targetQty),
      completedQty: 0,
      stage: 'Fabric Issue',
      status: 'In Progress',
      startDate: startDate ? new Date(startDate).toISOString() : today.toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      createdAt: ts, updatedAt: ts,
    }).select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))').single()

    if (error) throw error

    // If we resolved a costSheetId, try to update the job (may fail if column doesn't exist in Supabase)
    if (resolvedCostSheetId) {
      try {
        await supabase.from('ProductionJob').update({ costSheetId: resolvedCostSheetId }).eq('id', job.id)
      } catch {
        // Column may not exist in Supabase yet — ignore
      }
    }

    // Auto-create stage tracking records
    await supabase.from('StageTracking').insert(PRODUCTION_STAGES.map((stageName, idx) => ({
      productionJobId: job!.id, stageName, sequence: idx, status: idx === 0 ? 'In Progress' : 'Pending', locationType: 'In-House', createdAt: ts, updatedAt: ts,
    })))

    return NextResponse.json(job, { status: 201 })
  } catch (error) {
    console.error('Production POST error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    const short = msg.includes('duplicate') || msg.includes('unique') ? 'Job number collision — please retry' : 'Failed to create production job'
    return NextResponse.json({ error: short }, { status: 500 })
  }
}
