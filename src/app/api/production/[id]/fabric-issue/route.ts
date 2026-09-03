import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// Must match PRODUCTION_STAGES in /api/production and /api/production/[id]
const PRODUCTION_STAGES = [
  'Fabric Issue', 'Cutting', 'Embroidery', 'Printing', 'Stitching',
  'Finishing', 'Quality Check', 'Packing', 'Dispatch Ready', 'Dispatched',
] as const

interface IssueLine {
  fabricStockId: string
  meters: number
  note?: string | null
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function todayStr(): string {
  const d = new Date()
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  )
}

/**
 * Next FC-YYYYMMDD-XXX consumption number.
 * Mirrors generateSequentialMovementNo conventions: today's row count + 1,
 * bumped past any existing numbers with the same prefix, so consecutive
 * inserts never collide.
 */
async function nextConsumptionNo(): Promise<string> {
  const prefix = `FC-${todayStr()}-`
  const { data: existing } = await supabase
    .from('FabricConsumption')
    .select('consumptionNo')
    .ilike('consumptionNo', `${prefix}%`)
  const rows = (existing || []) as Array<{ consumptionNo: string }>
  let nextSeq = rows.length + 1
  for (const row of rows) {
    const seq = parseInt(String(row.consumptionNo || '').slice(prefix.length), 10)
    if (!isNaN(seq) && seq + 1 > nextSeq) nextSeq = seq + 1
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`
}

/**
 * Insert one FabricConsumption row; on a duplicate-consumptionNo error,
 * re-bump the sequence and retry once (collision-safe numbering).
 */
async function insertConsumption(payload: Record<string, any>): Promise<any> {
  let consumptionNo = await nextConsumptionNo()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('FabricConsumption')
      .insert({ ...payload, consumptionNo })
      .select()
      .single()
    if (!error) return data
    const msg = String((error as any)?.message || '')
    if (msg.includes('duplicate') || msg.includes('unique')) {
      // Re-bump past the colliding number and retry
      const seq = parseInt(consumptionNo.slice(`FC-${todayStr()}-`.length), 10)
      const bump = isNaN(seq) ? 1 : seq + 1 + attempt
      consumptionNo = `FC-${todayStr()}-${String(bump).padStart(3, '0')}`
      continue
    }
    throw error
  }
  throw new Error('Consumption number collision — could not allocate FC number')
}

/**
 * Release reservations against a job+stock exactly the way /api/production
 * POST books them (referenceType='ProductionJob', status Active/Partially
 * Consumed): consumedQty += take, status transitions to Partially/Fully
 * Consumed, oldest reservations first. FabricStock.reservedMeters is
 * decremented by the total released (clamped at 0).
 *
 * Returns the total meters released from reservation.
 */
async function releaseReservations(jobId: string, stockId: string, meters: number): Promise<number> {
  const now = new Date().toISOString()
  let remaining = round2(meters)
  let released = 0

  try {
    const { data: reservations } = await supabase
      .from('StockReservation')
      .select('*')
      .eq('referenceType', 'ProductionJob')
      .eq('referenceId', jobId)
      .eq('fabricStockId', stockId)
      .in('status', ['Active', 'Partially Consumed'])
      .order('createdAt', { ascending: true }) // oldest first

    for (const res of (reservations || []) as any[]) {
      if (remaining <= 0) break
      const outstanding = round2((Number(res.reservedQty) || 0) - (Number(res.consumedQty) || 0))
      if (outstanding <= 0) continue
      const take = round2(Math.min(remaining, outstanding))
      const newConsumed = round2((Number(res.consumedQty) || 0) + take)
      const newStatus = newConsumed >= (Number(res.reservedQty) || 0) ? 'Fully Consumed' : 'Partially Consumed'
      await supabase
        .from('StockReservation')
        .update({ consumedQty: newConsumed, status: newStatus, updatedAt: now })
        .eq('id', res.id)
      remaining = round2(remaining - take)
      released = round2(released + take)
    }

    if (released > 0) {
      const { data: fs } = await supabase
        .from('FabricStock')
        .select('id, reservedMeters')
        .eq('id', stockId)
        .single()
      if (fs) {
        const newReserved = Math.max(0, (Number((fs as any).reservedMeters) || 0) - released)
        await supabase
          .from('FabricStock')
          .update({ reservedMeters: newReserved, updatedAt: now })
          .eq('id', stockId)
      }
    }
  } catch (resErr: any) {
    // Reservation release is non-fatal — the physical stock deduction below
    // is the source of truth for issue success.
    console.error('StockReservation release (non-fatal):', resErr?.message)
  }

  return released
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const lines: IssueLine[] = Array.isArray(body?.lines) ? body.lines : []
    const note: string | null = body?.note || null
    const recordedBy: string = body?.recordedBy || 'System'
    const advanceStage: boolean = Boolean(body?.advanceStage)

    // ── Validate ALL lines BEFORE any write ─────────────────────────────
    const jobRes = await supabase
      .from('ProductionJob')
      .select('*')
      .eq('id', id)
      .single()
    const job = jobRes.data as any
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    if (job.status === 'Cancelled') {
      return NextResponse.json({ error: 'Cannot issue fabric to a cancelled job' }, { status: 400 })
    }

    const cleanLines: { fabricStockId: string; meters: number; note: string | null; stock: any }[] = []
    const cumulativeByStock: Record<string, number> = {}
    for (const raw of lines) {
      const fabricStockId = String(raw?.fabricStockId || '')
      const meters = round2(Number(raw?.meters))
      if (!fabricStockId || !meters || meters <= 0) {
        return NextResponse.json({ error: 'Each line needs fabricStockId and meters > 0' }, { status: 400 })
      }
      const stockRes = await supabase
        .from('FabricStock')
        .select('*')
        .eq('id', fabricStockId)
        .single()
      const stock = stockRes.data as any
      if (!stock) {
        return NextResponse.json({ error: `Fabric stock not found (${fabricStockId})` }, { status: 404 })
      }
      // Cumulative per-stock meters must stay within availableMeters.
      cumulativeByStock[fabricStockId] = round2((cumulativeByStock[fabricStockId] || 0) + meters)
      if (cumulativeByStock[fabricStockId] > (Number(stock.availableMeters) || 0)) {
        const label = [
          stock.fabricName,
          stock.color ? `color ${stock.color}` : null,
          stock.lotNumber ? `lot ${stock.lotNumber}` : null,
        ].filter(Boolean).join(' · ')
        return NextResponse.json(
          {
            error: `Insufficient fabric — ${label}: available ${round2(Number(stock.availableMeters) || 0)}m, requested ${cumulativeByStock[fabricStockId]}m (short by ${round2(cumulativeByStock[fabricStockId] - (Number(stock.availableMeters) || 0))}m)`,
          },
          { status: 400 },
        )
      }
      cleanLines.push({ fabricStockId, meters, note: raw?.note || null, stock })
    }

    if (cleanLines.length === 0 && !advanceStage) {
      return NextResponse.json({ error: 'Nothing to issue — provide lines[] or advanceStage' }, { status: 400 })
    }

    // ── Validate stage advance BEFORE any write too ──────────────────────
    let advancedTo: string | null = null
    if (advanceStage) {
      const currentIdx = PRODUCTION_STAGES.indexOf(job.stage as (typeof PRODUCTION_STAGES)[number])
      if (currentIdx === -1) {
        return NextResponse.json({ error: `Invalid current stage: ${job.stage}` }, { status: 400 })
      }
      if (currentIdx >= PRODUCTION_STAGES.length - 1) {
        return NextResponse.json({ error: 'Already at final stage' }, { status: 400 })
      }
      advancedTo = PRODUCTION_STAGES[currentIdx + 1]
    }

    const now = new Date().toISOString()
    const issued: any[] = []

    // ── Write each line: reservation release → stock deduction → ledger ─
    for (const line of cleanLines) {
      const s = line.stock
      const meters = line.meters

      // 1. Release any reservations booked against this job+stock
      await releaseReservations(id, s.id, meters)

      // 2. Physical stock deduction + value deduction
      const newAvailable = Math.max(0, round2((Number(s.availableMeters) || 0) - meters))
      const newTotalValue = Math.max(0, round2((Number(s.totalValue) || 0) - meters * (Number(s.averageCost) || 0)))
      await supabase
        .from('FabricStock')
        .update({ availableMeters: newAvailable, totalValue: newTotalValue, updatedAt: now })
        .eq('id', s.id)

      // 3. FabricConsumption ledger row (FC-YYYYMMDD-XXX)
      const totalMeters = round2(cleanLines.reduce((sum, l) => sum + l.meters, 0))
      const planned = Number(job.plannedFabricMeters) || 0
      const plannedQty =
        cleanLines.length === 1
          ? planned
          : totalMeters > 0
          ? round2((meters / totalMeters) * planned)
          : 0

      const consumption = await insertConsumption({
        productionJobId: id,
        fabricStockId: s.id,
        fabricName: s.fabricName || '',
        issuedQty: meters,
        consumedQty: meters,
        wastageQty: 0,
        wastagePercent: 0,
        plannedQty,
        varianceVsPlan: round2(meters - plannedQty),
        consumptionPerPc: Number(job.targetQty) > 0 ? round2(meters / Number(job.targetQty)) : 0,
        wastageReason: null,
        wastageRemarks: line.note || note || null,
        recordedBy: recordedBy || 'System',
        consumptionDate: now,
        createdAt: now,
        updatedAt: now,
      })
      issued.push(consumption)
    }

    // ── Roll up the job ──────────────────────────────────────────────────
    const totalMeters = round2(cleanLines.reduce((sum, l) => sum + l.meters, 0))
    const totalCost = round2(
      cleanLines.reduce((sum, l) => sum + l.meters * (Number(l.stock.averageCost) || 0), 0),
    )

    const jobUpdate: Record<string, any> = { updatedAt: now }
    if (totalMeters > 0) {
      jobUpdate.actualFabricConsumed = round2((Number(job.actualFabricConsumed) || 0) + totalMeters)
      jobUpdate.actualFabricCost = round2((Number(job.actualFabricCost) || 0) + totalCost)
      // totalActualCost re-rollup from components
      jobUpdate.totalActualCost = round2(
        (Number(jobUpdate.actualFabricCost) || 0) +
          (Number(job.actualLaborCost) || 0) +
          (Number(job.actualOverheadCost) || 0),
      )
      // Backfill fabricStockId if the job never had one (first line wins)
      if (!job.fabricStockId && cleanLines.length > 0) {
        jobUpdate.fabricStockId = cleanLines[0].fabricStockId
      }
    }

    // ── Optional stage advance (mirrors PATCH /api/production/[id] minimal) ─
    if (advancedTo) {
      jobUpdate.stage = advancedTo
      // endDate-past → Delayed (mirrors PATCH next-stage logic)
      if (
        job.endDate &&
        new Date(job.endDate) < new Date() &&
        job.status !== 'Completed' &&
        job.status !== 'Cancelled'
      ) {
        jobUpdate.status = 'Delayed'
      }
    }

    const { data: updatedJob, error: updateErr } = await supabase
      .from('ProductionJob')
      .update(jobUpdate)
      .eq('id', id)
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))')
      .single()
    if (updateErr) throw updateErr

    // StageTracking: mark the 'Fabric Issue' row Completed (non-fatal)
    if (advancedTo) {
      try {
        const { data: stageRow } = await supabase
          .from('StageTracking')
          .select('id')
          .eq('productionJobId', id)
          .eq('stageName', 'Fabric Issue')
          .limit(1)
        if (stageRow && stageRow.length > 0) {
          await supabase
            .from('StageTracking')
            .update({
              status: 'Completed',
              sentQty: Number(job.targetQty) || 0,
              receivedQty: Number(job.targetQty) || 0,
              receivedDate: now,
              updatedAt: now,
            })
            .eq('id', (stageRow[0] as any).id)
        }
      } catch (stageErr: any) {
        console.error('StageTracking completion (non-fatal):', stageErr?.message)
      }
    }

    let message = 'No changes'
    if (cleanLines.length > 0) {
      message = `Issued ${totalMeters}m from ${cleanLines.length} stock${cleanLines.length > 1 ? 's' : ''} for ${job.jobNo}`
      if (advancedTo) message += ` — advanced to ${advancedTo}`
    } else if (advancedTo) {
      message = `Advanced ${job.jobNo} to ${advancedTo}`
    }

    return NextResponse.json({
      success: true,
      message,
      job: updatedJob,
      issued: issued.map((c: any) => ({
        id: c.id,
        consumptionNo: c.consumptionNo,
        fabricStockId: c.fabricStockId,
        fabricName: c.fabricName,
        issuedQty: Number(c.issuedQty) || 0,
        plannedQty: Number(c.plannedQty) || 0,
      })),
      summary: {
        lines: cleanLines.length,
        totalMeters,
        totalCost,
        advancedTo,
      },
    })
  } catch (error) {
    console.error('POST /api/production/[id]/fabric-issue error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: msg.includes('collision') ? msg : 'Failed to issue fabric' },
      { status: 500 },
    )
  }
}
