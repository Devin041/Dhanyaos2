import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

/**
 * U5 BACKFILL — close out ProductionJobs whose output has already been
 * DELIVERED via Dispatch (one-off repair for dispatches delivered BEFORE the
 * deliver route learned to close jobs).
 *
 * Logic mirrors /api/dispatch/[id]/deliver:
 *   - aggregate dispatched qty per (styleNo, color) across ALL Delivered
 *     dispatches of each sales order
 *   - a job is Completed when every FG bin it produced from is drained
 *     (handles QC-reduced outputs: target 120, 118 shipped) OR delivered >=
 *     target
 *   - partial deliveries keep the job In Progress with proportional
 *     completedQty
 *
 * Idempotent — safe to re-run.
 * Run: bun scripts/backfill-job-closeout.ts
 */

const env = readFileSync(new URL('../.env', import.meta.url), 'utf-8')
const get = (k: string) => {
  const line = env.split('\n').find((l) => l.startsWith(`${k}=`))
  return line ? line.split('=').slice(1).join('=').trim() : ''
}

const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Missing Supabase credentials in .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  console.log('=== U5 BACKFILL: close out ProductionJobs for delivered dispatches ===\n')

  // All delivered dispatches with their items
  const { data: dispatches, error: dErr } = await supabase
    .from('Dispatch')
    .select('id, dispatchNo, salesOrderId, status, dispatchItems:DispatchItem(styleNo, color, dispatchedQty)')
    .eq('status', 'Delivered')
  if (dErr) { console.error('Dispatch fetch failed:', dErr.message); process.exit(1) }
  console.log(`Delivered dispatches: ${dispatches?.length ?? 0}`)

  const byOrder = new Map<string, any[]>()
  for (const d of (dispatches || []) as any[]) {
    if (!d.salesOrderId) continue
    if (!byOrder.has(d.salesOrderId)) byOrder.set(d.salesOrderId, [])
    byOrder.get(d.salesOrderId)!.push(d)
  }

  let updatedJobs = 0

  for (const [soId, dds] of byOrder) {
    // aggregate per color/style
    const byColor: Record<string, number> = {}
    const byStyle: Record<string, number> = {}
    for (const dd of dds) {
      for (const di of (dd.dispatchItems || []) as any[]) {
        const qty = Number(di.dispatchedQty) || 0
        if (qty <= 0) continue
        const ck = `${di.styleNo || ''}|${di.color || ''}`
        byColor[ck] = (byColor[ck] || 0) + qty
        byStyle[di.styleNo || ''] = (byStyle[di.styleNo || ''] || 0) + qty
      }
    }

    const { data: jobs } = await supabase
      .from('ProductionJob')
      .select('id, jobNo, styleNo, color, targetQty, completedQty, status, stage')
      .eq('salesOrderId', soId)
      .neq('status', 'Cancelled')
    if (!jobs || jobs.length === 0) continue

    const styleKeys = [...new Set(jobs.map((j: any) => j.styleNo).filter(Boolean))]
    const { data: bins } = await supabase
      .from('FGStockBin')
      .select('styleNo, color, availableQty')
      .in('styleNo', styleKeys)
    const binRows: any[] = bins || []
    const jobBins = (styleNo: string | null, color: string | null) =>
      binRows.filter((b) => b.styleNo === styleNo && (color ? b.color === color : true))

    for (const job of jobs as any[]) {
      const delivered = job.color
        ? byColor[`${job.styleNo || ''}|${job.color}`] || 0
        : byStyle[job.styleNo || ''] || 0
      const target = Number(job.targetQty) || 0
      const bins = jobBins(job.styleNo, job.color)
      const producedAllGone = bins.length > 0 && bins.every((b) => (Number(b.availableQty) || 0) <= 0)
      const fullyDelivered = producedAllGone || (target > 0 && delivered >= target)

      const newCompleted = delivered
      const newStatus = fullyDelivered ? 'Completed' : (delivered > 0 ? 'In Progress' : job.status)
      if ((Number(job.completedQty) || 0) === newCompleted && job.status === newStatus && job.stage === (fullyDelivered ? 'Dispatched' : job.stage)) {
        continue
      }

      const payload: Record<string, any> = {
        completedQty: newCompleted,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      }
      if (fullyDelivered) payload.stage = 'Dispatched'
      const { error } = await supabase.from('ProductionJob').update(payload).eq('id', job.id)
      if (error) {
        console.error(`  ✗ ${job.jobNo}: ${error.message}`)
      } else {
        updatedJobs++
        console.log(`  ✓ ${job.jobNo}: completedQty ${job.completedQty ?? 0} → ${newCompleted}, status ${job.status} → ${newStatus}${fullyDelivered ? `, stage → Dispatched` : ''}`)
      }
    }
  }

  console.log(`\nDone. Jobs updated: ${updatedJobs}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
