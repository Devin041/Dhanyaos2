import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

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
 * POST /api/production/[id]/fabric-return
 *
 * Return un-used issued fabric from a job back to stock:
 *   - validates meters against the total ISSUED from that stock (ledger
 *     FabricConsumption rows for this job+stock, EXCLUDING return rows)
 *   - adds meters back to FabricStock.availableMeters + totalValue at the
 *     stock's average cost
 *   - reduces job.actualFabricConsumed / actualFabricCost (clamped ≥ 0,
 *     totalActualCost re-rollup)
 *   - writes a balancing FabricConsumption ledger row (issuedQty=0 — never
 *     negative, wastageQty=meters, wastageReason='Fabric Return')
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { fabricStockId, meters, reason, recordedBy } = body

    if (!fabricStockId || !meters || Number(meters) <= 0) {
      return NextResponse.json({ error: 'fabricStockId and meters (> 0) are required' }, { status: 400 })
    }
    const returnMeters = round2(Number(meters))

    // ── Job + stock ───────────────────────────────────────────────────────
    const jobRes = await supabase.from('ProductionJob').select('*').eq('id', id).single()
    const job = jobRes.data as any
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })

    const stockRes = await supabase.from('FabricStock').select('*').eq('id', fabricStockId).single()
    const stock = stockRes.data as any
    if (!stock) return NextResponse.json({ error: 'Fabric stock not found' }, { status: 404 })

    // ── Validate against total ISSUED from this stock (ledger truth) ──────
    // Return rows (wastageReason='Fabric Return') are excluded — they are
    // negative entries, not issues.
    const { data: ledgerRows } = await supabase
      .from('FabricConsumption')
      .select('issuedQty, wastageQty, wastageReason')
      .eq('productionJobId', id)
      .eq('fabricStockId', fabricStockId)

    let totalIssued = 0
    let totalReturned = 0
    for (const r of (ledgerRows || []) as any[]) {
      if (String(r.wastageReason || '') === 'Fabric Return') {
        totalReturned = round2(totalReturned + (Number(r.wastageQty) || 0))
      } else {
        totalIssued = round2(totalIssued + (Number(r.issuedQty) || 0))
      }
    }
    const netIssued = round2(totalIssued - totalReturned)

    if (netIssued <= 0) {
      return NextResponse.json(
        { error: 'No fabric issued from this stock for this job — nothing to return' },
        { status: 400 },
      )
    }
    if (returnMeters > netIssued) {
      return NextResponse.json(
        {
          error: `Cannot return ${returnMeters}m — only ${netIssued}m net issued from ${stock.fabricName}${stock.color ? ` (${stock.color})` : ''}${stock.lotNumber ? ` lot ${stock.lotNumber}` : ''}`,
        },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()

    // ── Add meters back to stock (at average cost) ────────────────────────
    const newAvailable = round2((Number(stock.availableMeters) || 0) + returnMeters)
    const newTotalValue = round2((Number(stock.totalValue) || 0) + returnMeters * (Number(stock.averageCost) || 0))
    await supabase
      .from('FabricStock')
      .update({ availableMeters: newAvailable, totalValue: newTotalValue, updatedAt: now })
      .eq('id', fabricStockId)

    // ── Reduce job consumption (clamped ≥ 0, re-rollup totalActualCost) ──
    const costBack = round2(returnMeters * (Number(stock.averageCost) || 0))
    const newActualConsumed = Math.max(0, round2((Number(job.actualFabricConsumed) || 0) - returnMeters))
    const newActualCost = Math.max(0, round2((Number(job.actualFabricCost) || 0) - costBack))
    await supabase
      .from('ProductionJob')
      .update({
        actualFabricConsumed: newActualConsumed,
        actualFabricCost: newActualCost,
        totalActualCost: round2(newActualCost + (Number(job.actualLaborCost) || 0) + (Number(job.actualOverheadCost) || 0)),
        updatedAt: now,
      })
      .eq('id', id)

    // ── Balancing ledger row: FC-YYYYMMDD-XXX (collision-safe) ───────────
    const prefix = `FC-${todayStr()}-`
    const { data: existingNos } = await supabase
      .from('FabricConsumption')
      .select('consumptionNo')
      .ilike('consumptionNo', `${prefix}%`)
    const noRows = (existingNos || []) as Array<{ consumptionNo: string }>
    let nextSeq = noRows.length + 1
    for (const row of noRows) {
      const seq = parseInt(String(row.consumptionNo || '').slice(prefix.length), 10)
      if (!isNaN(seq) && seq + 1 > nextSeq) nextSeq = seq + 1
    }

    const consumptionPayload: Record<string, any> = {
      consumptionNo: `${prefix}${String(nextSeq).padStart(3, '0')}`,
      productionJobId: id,
      fabricStockId,
      fabricName: stock.fabricName || '',
      // NEVER negative — a return row issues nothing
      issuedQty: 0,
      consumedQty: 0,
      wastageQty: returnMeters,
      wastagePercent: 0,
      plannedQty: 0,
      varianceVsPlan: 0,
      consumptionPerPc: 0,
      wastageReason: 'Fabric Return',
      wastageRemarks: reason || null,
      recordedBy: recordedBy || 'System',
      consumptionDate: now,
      createdAt: now,
      updatedAt: now,
    }

    let ledgerRow: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('FabricConsumption')
        .insert(consumptionPayload)
        .select()
        .single()
      if (!error) {
        ledgerRow = data
        break
      }
      const msg = String((error as any)?.message || '')
      if (msg.includes('duplicate') || msg.includes('unique')) {
        // re-bump past the colliding number and retry
        nextSeq = nextSeq + 1 + attempt
        consumptionPayload.consumptionNo = `${prefix}${String(nextSeq).padStart(3, '0')}`
        continue
      }
      throw error
    }
    if (!ledgerRow) throw new Error('Consumption number collision — could not allocate FC number')

    return NextResponse.json({
      success: true,
      message: `Returned ${returnMeters}m of ${stock.fabricName}${stock.color ? ` (${stock.color})` : ''} to stock`,
      consumption: {
        id: ledgerRow.id,
        consumptionNo: ledgerRow.consumptionNo,
        issuedQty: 0,
        wastageQty: returnMeters,
        wastageReason: 'Fabric Return',
        wastageRemarks: reason || null,
      },
      job: {
        id,
        actualFabricConsumed: newActualConsumed,
        actualFabricCost: newActualCost,
      },
      stock: {
        id: fabricStockId,
        availableMeters: newAvailable,
        totalValue: newTotalValue,
      },
      netIssuedAfterReturn: round2(netIssued - returnMeters),
    })
  } catch (error) {
    console.error('POST /api/production/[id]/fabric-return error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: msg.includes('collision') ? msg : 'Failed to return fabric' },
      { status: 500 },
    )
  }
}
