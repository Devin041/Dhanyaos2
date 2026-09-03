import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { batchResolveStyleImages } from '@/lib/style-image'

const PRODUCTION_STAGES = ['Fabric Issue','Cutting','Embroidery','Printing','Stitching','Finishing','Quality Check','Packing','Dispatch Ready','Dispatched'] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Next job sequence for today's PJ-YYYYMMDD- prefix. Parses the LEADING
 * DIGITS via regex so suffixed color-child numbers ("PJ-…-001-TES") count
 * toward the max just like plain "PJ-…-001".
 */
async function nextJobNoSeq(prefix: string): Promise<number> {
  const { data: todayJobs } = await supabase
    .from('ProductionJob')
    .select('jobNo')
    .ilike('jobNo', `${prefix}%`)
  let maxSeq = 0
  for (const row of (todayJobs || []) as any[]) {
    const m = String(row.jobNo || '').slice(prefix.length).match(/^(\d+)/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > maxSeq) maxSeq = n
    }
  }
  return maxSeq + 1
}

/**
 * Fabric reservation automation (extracted in Phase 5a, semantics identical
 * to the previous inline block): when a job row carries a fabricStockId +
 * planned meters, bump FabricStock.reservedMeters and write the
 * StockReservation ledger row. Best-effort — never throws.
 */
async function reserveFabricForJob(
  job: { id: string; jobNo: string; fabricStockId?: string | null },
  plannedMeters: number,
  dateStr: string
): Promise<void> {
  if (!job.fabricStockId || !(plannedMeters > 0)) return
  try {
    const { data: fabricStock } = await supabase
      .from('FabricStock')
      .select('id, availableMeters, reservedMeters')
      .eq('id', job.fabricStockId)
      .single()
    if (fabricStock) {
      const ts = new Date().toISOString()
      const newReserved = (fabricStock.reservedMeters || 0) + plannedMeters
      // Sanity check: can't reserve more than available
      if (newReserved > (fabricStock.availableMeters || 0)) {
        // Still reserve (production will catch the shortfall) but warn in logs
        console.warn(`Production ${job.jobNo}: reserving ${plannedMeters}m but only ${fabricStock.availableMeters}m available`)
      }
      await supabase
        .from('FabricStock')
        .update({ reservedMeters: newReserved, updatedAt: ts })
        .eq('id', job.fabricStockId)

      // StockReservation ledger row so reservations are auditable and
      // consumable via the standard reservation lifecycle (not just a
      // silent column bump on FabricStock).
      try {
        const todayPrefix = `SR-${dateStr}-`
        const { data: lastRes } = await supabase
          .from('StockReservation')
          .select('reservationNo')
          .ilike('reservationNo', `${todayPrefix}%`)
          .order('reservationNo', { ascending: false })
          .limit(1)
        let resSeq = 1
        if (lastRes && lastRes.length > 0) {
          const parsed = parseInt(lastRes[0].reservationNo.slice(todayPrefix.length), 10)
          if (!isNaN(parsed)) resSeq = parsed + 1
        }
        await supabase.from('StockReservation').insert({
          reservationNo: `${todayPrefix}${String(resSeq).padStart(3, '0')}`,
          fabricStockId: job.fabricStockId,
          referenceType: 'ProductionJob',
          referenceId: job.id,
          referenceNo: job.jobNo,
          reservedQty: plannedMeters,
          consumedQty: 0,
          status: 'Active',
          notes: `Auto-reserved for production job ${job.jobNo}`,
        })
      } catch (resErr: any) {
        console.error('StockReservation insert (non-fatal):', resErr?.message)
      }
    }
  } catch (fabricErr) {
    // Fabric reservation failure shouldn't fail the production job creation
    console.error('Fabric reservation (non-fatal):', fabricErr)
  }
}

/**
 * BOM-derived fabric consumption per piece (Σ FABRIC lines'
 * qtyPerPiece × (1+wastage/100)); 0 when no active BOM. Best-effort.
 */
async function deriveConsumptionPerPiece(styleNo: string): Promise<{ perPiece: number; source: string }> {
  if (!styleNo) return { perPiece: 0, source: 'explicit' }
  try {
    const { computeBomRequirement } = await import('@/lib/bom-requirement')
    const outcome = await computeBomRequirement(styleNo, 1)
    if (outcome.ok) {
      const fabricLines = outcome.requirement.lines.filter(
        (l: any) => l.materialType === 'FABRIC' && l.unit === 'meters'
      )
      if (fabricLines.length > 0) {
        const consumptionPerPiece = fabricLines.reduce(
          (sum: number, l: any) => sum + Number(l.qtyPerPiece) * (1 + (Number(l.wastagePercent) || 0) / 100),
          0
        )
        if (consumptionPerPiece > 0) {
          const v = Number((outcome.bom as any)?.version) || 0
          return { perPiece: consumptionPerPiece, source: v ? `BOM v${v}` : 'BOM' }
        }
      }
    }
  } catch {
    // best-effort — fall through to default
  }
  return { perPiece: 0, source: 'explicit' }
}

// ─── GET: production jobs (kanban board data) ────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status')
    const stage = searchParams.get('stage')
    const search = searchParams.get('search')
    const parentId = searchParams.get('parentId')

    // Fetch all jobs with salesOrder relation
    const { data: allJobsRaw, error } = await supabase
      .from('ProductionJob')
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))')
      .order('createdAt', { ascending: false })
    if (error) throw error

    // ── COLOR-SPLIT METADATA (Phase 5a) — computed on the FULL job list BEFORE
    // any filter so derived values stay stable regardless of search/status/
    // stage filters:
    //   _childCount  — per job; >0 marks a color-group PARENT (group header)
    //   _parentJobNo — per child job (its parent's jobNo, for the ↳ group chip)
    // PARENT display values are DERIVED (response-only — the stored row is
    // untouched): completedQty = Σ children, stage = earliest stage any child
    // sits in (min of own+children), status = Completed when all children are
    // / Delayed when any child is.
    const allJobs = (allJobsRaw || []) as any[]
    const jobNoById = new Map<string, string>(allJobs.map((j) => [j.id, j.jobNo]))
    const childrenByParent = new Map<string, any[]>()
    for (const j of allJobs) {
      if (j.parentJobId) {
        if (!childrenByParent.has(j.parentJobId)) childrenByParent.set(j.parentJobId, [])
        childrenByParent.get(j.parentJobId)!.push(j)
      }
    }
    const stagesArr = PRODUCTION_STAGES as readonly string[]
    for (const j of allJobs) {
      const children = childrenByParent.get(j.id) || []
      j._childCount = children.length
      j._parentJobNo = j.parentJobId ? (jobNoById.get(j.parentJobId) || null) : null
      if (children.length > 0) {
        j.completedQty = children.reduce((s: number, c: any) => s + (Number(c.completedQty) || 0), 0)
        const stageIdxs = [j.stage, ...children.map((c: any) => c.stage)]
          .map((s: any) => stagesArr.indexOf(s))
          .filter((i: number) => i >= 0)
        if (stageIdxs.length > 0) j.stage = stagesArr[Math.min(...stageIdxs)]
        if (children.every((c: any) => c.status === 'Completed')) j.status = 'Completed'
        else if (children.some((c: any) => c.status === 'Delayed')) j.status = 'Delayed'
      }
    }

    let jobsFiltered = allJobs
    if (search) {
      const term = search.toLowerCase()
      // We need to also search by salesOrder.orderNo, fetch those separately
      const { data: matchingOrders } = await supabase.from('SalesOrder').select('id, orderNo').ilike('orderNo', `%${search}%`)
      const orderIds = new Set((matchingOrders || []).map((o: any) => o.id))
      jobsFiltered = jobsFiltered.filter((j: any) =>
        (j.jobNo || '').toLowerCase().includes(term) ||
        (j.styleNo || '').toLowerCase().includes(term) ||
        (j.styleName || '').toLowerCase().includes(term) ||
        (j.color || '').toLowerCase().includes(term) ||
        (j.salesOrderId && orderIds.has(j.salesOrderId))
      )
    }

    // Children lookup for the detail dialog: ?parentId=X returns only the
    // color-group children of that parent.
    if (parentId) {
      jobsFiltered = jobsFiltered.filter((j: any) => j.parentJobId === parentId)
    }

    // Resolve sample images for all jobs
    const jobsImaged = [...jobsFiltered]
    const styleNos = [...new Set(jobsImaged.map((j: any) => j.styleNo).filter(Boolean))]
    if (styleNos.length > 0) {
      const images = await batchResolveStyleImages(styleNos)
      for (const job of jobsImaged) {
        (job as any)._image = images[job.styleNo]?.url || null
      }
    }

    // Compute counts across all jobs (search-filtered only, no status/stage filter)
    const stageCounts: Record<string, number> = {}
    const statusCounts: Record<string, number> = {}
    for (const job of jobsImaged) {
      stageCounts[job.stage] = (stageCounts[job.stage] || 0) + 1
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1
    }
    for (const s of PRODUCTION_STAGES) { if (!stageCounts[s]) stageCounts[s] = 0 }

    // Re-apply filters on image-enriched data
    let jobs = jobsImaged
    if (status) jobs = jobs.filter((j: any) => j.status === status)
    if (stage) jobs = jobs.filter((j: any) => j.stage === stage)

    return NextResponse.json({ jobs, total: jobs.length, stageCounts, statusCounts })
  } catch (error) {
    console.error('Production GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch production jobs' }, { status: 500 })
  }
}

// ─── POST: create production job(s) ──────────────────────────────────────────
//
// Two modes:
//   1. LEGACY — flat body {styleNo, styleName, targetQty, ...} → one job row
//      (now also accepts `color`, default 'Free').
//   2. COLOR-SPLIT (Phase 5a) — body carries `colorSplits` (len ≥ 1):
//      [{orderItemColorId?, color, size?, quantity}] → a PARENT group-header
//      job (targetQty = Σ splits, color null, fabricStockId null) + one
//      colored CHILD job per split row, grouped via parentJobId. Children are
//      inserted in ONE batch; each gets 10 StageTracking rows (single batch
//      with the parent) and its own fabric reservation. The SalesOrder status
//      is updated ONCE. Response: { jobs:[parent,...children], parentId,
//      job: parent (back-compat singular), childCount } @ 201.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { salesOrderId, styleNo, styleName, targetQty, endDate, startDate, costSheetId,
            // NEW: fabric consumption automation
            fabricStockId, plannedFabricMeters,
            // NEW: legacy/manual job color (free text, default 'Free')
            color } = body

    const colorSplits: any[] = Array.isArray(body.colorSplits) ? body.colorSplits : null
    const isColorSplit = !!colorSplits && colorSplits.length >= 1

    if (!styleNo || !styleName) return NextResponse.json({ error: 'styleNo, styleName, and targetQty are required' }, { status: 400 })
    if (!isColorSplit && !targetQty) return NextResponse.json({ error: 'styleNo, styleName, and targetQty are required' }, { status: 400 })

    // Color-split validation — every row must be valid (all-or-nothing)
    if (isColorSplit) {
      for (let i = 0; i < colorSplits.length; i++) {
        const row = colorSplits[i] || {}
        const rowColor = typeof row.color === 'string' ? row.color.trim() : ''
        const rowQty = Number(row.quantity)
        if (!rowColor || !Number.isFinite(rowQty) || rowQty <= 0) {
          return NextResponse.json(
            { error: `colorSplits[${i}]: color is required and quantity must be > 0` },
            { status: 400 }
          )
        }
        if (rowQty !== Math.floor(rowQty)) {
          return NextResponse.json(
            { error: `colorSplits[${i}]: quantity must be a whole number` },
            { status: 400 }
          )
        }
      }
    }

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

      // Auto-update order status to 'In Production' if not already (ONCE —
      // color-split children never repeat this)
      if ((order as any).status !== 'In Production') {
        await supabase.from('SalesOrder').update({ status: 'In Production', updatedAt: new Date().toISOString() }).eq('id', salesOrderId)
      }

      // Try to resolve costSheetId from order items (separate query)
      // (OrderItem is the real table — live OrderItem rows carry styleNo +
      // costSheetId columns; 'SalesOrderItem' was a ghost-table name)
      if (!resolvedCostSheetId) {
        const { data: orderItems } = await supabase
          .from('OrderItem')
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
    const ts = new Date().toISOString()
    const startIso = startDate ? new Date(startDate).toISOString() : today.toISOString()
    const endIso = endDate ? new Date(endDate).toISOString() : null

    // ── MODE 2: COLOR-SPLIT (Phase 5a) ──────────────────────────────────────
    if (isColorSplit) {
      const splits = colorSplits.map((row: any) => ({
        orderItemColorId: row.orderItemColorId || null,
        color: String(row.color).trim(),
        size: row.size || null,
        quantity: Math.floor(Number(row.quantity)),
      }))
      const totalSplitQty = splits.reduce((s: number, r: any) => s + r.quantity, 0)

      // Per-child planned meters: BOM-derived consumptionPerPiece × qty. An
      // EXPLICIT plannedFabricMeters in the body is treated as the TOTAL and
      // distributed proportionally across children.
      let consumptionPerPiece = 0
      let metersSource = 'explicit'
      if (!(Number(plannedFabricMeters) > 0)) {
        const derived = await deriveConsumptionPerPiece(styleNo)
        consumptionPerPiece = derived.perPiece
        metersSource = derived.source
      }
      if (consumptionPerPiece <= 0 && !(Number(plannedFabricMeters) > 0)) {
        consumptionPerPiece = 2.5
        metersSource = 'default 2.5 m/pc'
      }

      const explicitTotal = Number(plannedFabricMeters) > 0 ? Number(plannedFabricMeters) : 0
      const childPlans = splits.map((r: any) => {
        if (explicitTotal > 0) {
          return Math.round((explicitTotal * r.quantity / totalSplitQty) * 100) / 100
        }
        return Math.round(consumptionPerPiece * r.quantity * 100) / 100
      })
      const parentPlanned = Math.round(childPlans.reduce((s: number, v: number) => s + v, 0) * 100) / 100

      console.log(`[Production POST (color-split)] ${splits.length + 1} jobs for ${totalSplitQty} pcs — plannedFabricMeters ${parentPlanned}m total @ ${metersSource === 'explicit' ? 'explicit' : `${consumptionPerPiece} m/pc`} (${metersSource})`)

      // PARENT group-header job — normal PJ-YYYYMMDD-NNN sequence with a
      // collision-checked insert loop (retry with next seq on unique hits).
      const parentBase: Record<string, any> = {
        jobNo: '',
        salesOrderId: salesOrderId || null,
        styleNo, styleName,
        targetQty: totalSplitQty,
        completedQty: 0,
        stage: 'Fabric Issue',
        status: 'In Progress',
        // group header: no single color, no parent, Σ children planned meters
        // (display only), no fabric stock (reservations are per CHILD)
        color: null,
        parentJobId: null,
        orderItemColorId: null,
        plannedFabricMeters: parentPlanned,
        actualFabricConsumed: 0,
        fabricStockId: null,
        startDate: startIso,
        endDate: endIso,
        createdAt: ts, updatedAt: ts,
      }
      let nextSeq = await nextJobNoSeq(prefix)
      let parent: any = null
      let lastInsertError: any = null
      for (let attempt = 0; attempt < 5 && !parent; attempt++) {
        parentBase.jobNo = `${prefix}${String(nextSeq).padStart(3, '0')}`
        const { data: inserted, error: insErr } = await supabase
          .from('ProductionJob')
          .insert(parentBase)
          .select('id, jobNo, targetQty, color, parentJobId, plannedFabricMeters, fabricStockId')
          .single()
        if (insErr) {
          lastInsertError = insErr
          const msg = String(insErr.message || '')
          if (msg.includes('duplicate') || (insErr as any).code === '23505') {
            nextSeq++
            continue
          }
          throw insErr
        }
        parent = inserted
      }
      if (!parent) {
        throw new Error(lastInsertError?.message || 'Job number collision — please retry')
      }

      // CHILD jobNos: <parentJobNo>-<ABBREV> (3-letter uppercase, non-
      // alphanumerics stripped). Collision set = existing rows under the
      // parent prefix (one ilike query) + the in-request set. Fallbacks:
      // full ≤12-char token, then numeric -2..-99. (e.g. TestRed → -TES;
      // TestBlue also abbreviates TES → falls back to -TESTBLUE.)
      const { data: existingChildren } = await supabase
        .from('ProductionJob')
        .select('jobNo')
        .ilike('jobNo', `${parent.jobNo}-%`)
      const usedSuffixes = new Set<string>(
        ((existingChildren || []) as any[]).map((r: any) => String(r.jobNo || '').slice(parent.jobNo.length + 1))
      )
      const childNumbers: string[] = []
      for (const row of splits) {
        const token = String(row.color).replace(/[^a-z0-9]/gi, '')
        let suffix = token.slice(0, 3).toUpperCase()
        if (!suffix || usedSuffixes.has(suffix)) {
          const full = token.slice(0, 12).toUpperCase()
          if (full && !usedSuffixes.has(full)) {
            suffix = full
          } else {
            let n = 2
            while (n <= 99 && usedSuffixes.has(String(n))) n++
            suffix = String(n)
          }
        }
        usedSuffixes.add(suffix)
        childNumbers.push(`${parent.jobNo}-${suffix}`)
      }

      // Children in ONE batch insert
      const childRows = splits.map((row: any, i: number) => ({
        jobNo: childNumbers[i],
        salesOrderId: salesOrderId || null,
        styleNo, styleName,
        targetQty: row.quantity,
        completedQty: 0,
        stage: 'Fabric Issue',
        status: 'In Progress',
        color: row.color,
        parentJobId: parent.id,
        orderItemColorId: row.orderItemColorId || null,
        plannedFabricMeters: childPlans[i],
        actualFabricConsumed: 0,
        fabricStockId: fabricStockId || null,
        startDate: startIso,
        endDate: endIso,
        createdAt: ts, updatedAt: ts,
      }))
      const { data: insertedChildren, error: childErr } = await supabase
        .from('ProductionJob')
        .insert(childRows)
        .select('id, jobNo, color, targetQty, parentJobId, orderItemColorId, plannedFabricMeters, fabricStockId')
      if (childErr) throw childErr
      const children = (insertedChildren || []) as any[]

      // 10 StageTracking rows for the parent AND each child — single batch
      const stageRows: any[] = []
      for (const jobRow of [parent, ...children]) {
        PRODUCTION_STAGES.forEach((stageName, idx) => {
          stageRows.push({
            productionJobId: jobRow.id, stageName, sequence: idx,
            status: idx === 0 ? 'In Progress' : 'Pending', locationType: 'In-House',
            createdAt: ts, updatedAt: ts,
          })
        })
      }
      await supabase.from('StageTracking').insert(stageRows)

      // Fabric reservation per CHILD (identical semantics to the legacy
      // inline code, via the extracted helper)
      for (const child of children) {
        await reserveFabricForJob(child, Number(child.plannedFabricMeters) || 0, dateStr)
      }

      // costSheetId best-effort on parent + children (one update)
      if (resolvedCostSheetId) {
        try {
          await supabase
            .from('ProductionJob')
            .update({ costSheetId: resolvedCostSheetId })
            .in('id', [parent.id, ...children.map((c: any) => c.id)])
        } catch {
          // Column may not exist in Supabase yet — ignore
        }
      }

      // Final fetch with the salesOrder relation for a complete response
      const allIds = [parent.id, ...children.map((c: any) => c.id)]
      const { data: finalRows } = await supabase
        .from('ProductionJob')
        .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))')
        .in('id', allIds)
      const finalById = new Map(((finalRows || []) as any[]).map((r: any) => [r.id, r]))
      const parentFinal = finalById.get(parent.id) || parent
      const childrenFinal = children.map((c: any) => finalById.get(c.id) || c)
      parentFinal._childCount = childrenFinal.length
      parentFinal._parentJobNo = null
      for (const c of childrenFinal) {
        c._childCount = 0
        c._parentJobNo = parentFinal.jobNo
      }
      return NextResponse.json(
        { jobs: [parentFinal, ...childrenFinal], parentId: parent.id, job: parentFinal, childCount: childrenFinal.length },
        { status: 201 }
      )
    }

    // ── MODE 1: LEGACY single job (byte-identical behavior + color field) ──

    const nextSeq = await nextJobNoSeq(prefix)
    const jobNo = `${prefix}${String(nextSeq).padStart(3, '0')}`

    // Planned fabric meters: explicit value wins; else derive from ACTIVE BOM
    // (sum FABRIC lines' qtyPerPiece × (1+wastage/100)); fallback 2.5 m/pc.
    // Best-effort — never blocks job creation.
    let plannedMeters = Number(plannedFabricMeters) || 0
    let metersSource = 'explicit'
    if (plannedMeters <= 0 && styleNo) {
      const derived = await deriveConsumptionPerPiece(styleNo)
      if (derived.perPiece > 0) {
        plannedMeters = Math.round(Number(targetQty) * derived.perPiece * 100) / 100
        metersSource = derived.source
      }
    }
    if (plannedMeters <= 0) {
      plannedMeters = Math.round(Number(targetQty) * 2.5 * 100) / 100
      metersSource = 'default 2.5 m/pc'
    }
    console.log(`[Production POST] plannedFabricMeters=${plannedMeters}m for ${targetQty} pcs (${metersSource})`)

    const { data: job, error } = await supabase.from('ProductionJob').insert({
      jobNo,
      salesOrderId: salesOrderId || null,
      styleNo, styleName,
      targetQty: Number(targetQty),
      completedQty: 0,
      stage: 'Fabric Issue',
      status: 'In Progress',
      // NEW: job color (free text for manual jobs; 'Free' = one-color job)
      color: (typeof color === 'string' && color.trim()) ? color.trim() : 'Free',
      parentJobId: null,
      orderItemColorId: null,
      // NEW: fabric linkage + planned consumption
      fabricStockId: fabricStockId || null,
      plannedFabricMeters: plannedMeters,
      actualFabricConsumed: 0,
      startDate: startIso,
      endDate: endIso,
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

    // NEW: Fabric reservation automation — when a production job is created with
    // a linked fabricStockId + plannedFabricMeters, immediately reserve that
    // much fabric in FabricStock. The fabric stays "available" but is marked as
    // reserved so other jobs don't try to use the same stock.
    // (Phase 5a: extracted into reserveFabricForJob() — semantics identical.)
    await reserveFabricForJob(job, plannedMeters, dateStr)

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
