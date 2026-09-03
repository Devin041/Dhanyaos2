import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateSequentialMovementNo } from '@/lib/fg-color-code'

// ─── POST: Mark dispatch as delivered & deduct FG stock bins ──────────────
// FG stock lives in FGStockBin (color/size bins), NOT the legacy FinishedGood
// table. Per DispatchItem we deduct from matching bins (largest availableQty
// first, never below 0) and write an Outward FGStockMovement ledger row per
// deduction. Stock problems surface as warnings[] — they never block marking
// the dispatch itself as Delivered.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const { data: dispatch, error: dErr } = await supabase
      .from('Dispatch')
      .select('*, dispatchItems:DispatchItem(*), customer:customerId(companyName)')
      .eq('id', id)
      .single()

    if (dErr || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    if (dispatch.status === 'Delivered') {
      return NextResponse.json({ error: 'Already marked as delivered' }, { status: 400 })
    }

    const customerName = (dispatch as any).customer?.companyName || null

    // Mark Delivered first — per-item stock problems below become warnings.
    const { data: updated, error: updErr } = await supabase
      .from('Dispatch')
      .update({ status: 'Delivered', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select('*, salesOrder:salesOrderId(orderNo), customer:customerId(companyName), dispatchItems:DispatchItem(*)')
      .single()
    if (updErr) throw updErr

    // Deduct FG stock per dispatch item
    const warnings: string[] = []
    for (const item of (updated.dispatchItems ?? [])) {
      const it = item as any
      if (it.dispatchedQty <= 0) continue
      try {
        const need = Number(it.dispatchedQty) || 0
        const styleNo = it.styleNo

        // Match bins by styleNo; narrow by color/size only when the dispatch
        // row carries a non-null, non-empty value (these are newer columns).
        let binsQuery = supabase.from('FGStockBin').select('*').eq('styleNo', styleNo)
        if (it.color) binsQuery = binsQuery.eq('color', it.color)
        if (it.size) binsQuery = binsQuery.eq('size', it.size)
        const { data: bins, error: binsErr } = await binsQuery
        if (binsErr) throw binsErr

        const matched = (bins || []) as any[]
        if (matched.length === 0) {
          warnings.push(`No FG bin for style ${styleNo} — stock not deducted.`)
          continue
        }

        const totalAvailable = matched.reduce((s, b) => s + (Number(b.availableQty) || 0), 0)
        if (totalAvailable < need) {
          warnings.push(
            `Insufficient FG stock for ${styleNo}${it.color ? ` (${it.color})` : ''}: have ${totalAvailable}, need ${need} — deducted available stock only.`,
          )
        }

        // Deduct from the largest-availableQty bin first, never below 0.
        matched.sort((a, b) => (Number(b.availableQty) || 0) - (Number(a.availableQty) || 0))
        let remaining = need
        for (const bin of matched) {
          if (remaining <= 0) break
          const available = Number(bin.availableQty) || 0
          if (available <= 0) continue
          const take = Math.min(available, remaining)
          const newQty = available - take

          // Outward ledger row per deduction (positive qty)
          await supabase.from('FGStockMovement').insert({
            movementNo: await generateSequentialMovementNo(),
            movementType: 'Outward',
            fgStockBinId: bin.id,
            styleNo: bin.styleNo,
            styleName: bin.styleName,
            colorCode: bin.colorCode,
            color: bin.color,
            size: bin.size,
            quantity: take,
            previousQty: available,
            newQty,
            unitCost: Number(bin.unitCost) || 0,
            referenceType: 'Dispatch',
            referenceId: dispatch.id,
            referenceNo: (dispatch as any).dispatchNo,
            partyId: (dispatch as any).customerId,
            partyName: customerName,
            movedBy: 'System',
          })

          await supabase
            .from('FGStockBin')
            .update({
              availableQty: newQty,
              lastMovementDate: new Date().toISOString(),
              // Phase 6: stamp the delivery date on the bin so FG inventory
              // can show "last dispatched" even before/without the movement
              // ledger being queried.
              lastDispatchDate: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .eq('id', bin.id)

          remaining -= take
        }
      } catch (itemErr: any) {
        warnings.push(`Stock deduction failed for style ${(item as any).styleNo}: ${itemErr?.message || 'unknown error'}`)
      }
    }

    // ─── U5 FIX: close out linked production jobs ──────────────────────
    // A job whose FG bins are drained (or whose delivered qty covers its
    // target) becomes status=Completed / stage=Dispatched, so Inventory/WIP
    // stops showing "Dispatch Ready / In Progress" rows for goods that already
    // left the factory. Recomputed from ALL delivered dispatches of the order,
    // so multi-dispatch orders and re-runs stay correct. Partial dispatches
    // keep the job In Progress with a proportional completedQty.
    try {
      const soId = (updated as any).salesOrderId as string | null
      if (soId) {
        const { data: deliveredDispatches } = await supabase
          .from('Dispatch')
          .select('id, dispatchItems:DispatchItem(styleNo, color, dispatchedQty)')
          .eq('salesOrderId', soId)
          .eq('status', 'Delivered')

        const byColor: Record<string, number> = {}
        const byStyle: Record<string, number> = {}
        for (const dd of (deliveredDispatches || []) as any[]) {
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
          .select('id, jobNo, styleNo, color, targetQty, completedQty, status')
          .eq('salesOrderId', soId)
          .neq('status', 'Cancelled')

        if (jobs && jobs.length > 0) {
          // A job is DONE when every FG bin it produced from is drained —
          // this handles QC-reduced outputs (target 120, 118 accepted+shipped).
          const styleKeys = [...new Set(jobs.map((j: any) => j.styleNo).filter(Boolean))]
          let binRows: any[] = []
          if (styleKeys.length > 0) {
            const { data: bins } = await supabase
              .from('FGStockBin')
              .select('styleNo, color, availableQty')
              .in('styleNo', styleKeys)
            binRows = bins || []
          }
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
            if ((Number(job.completedQty) || 0) === newCompleted && job.status === newStatus) continue

            const payload: Record<string, any> = {
              completedQty: newCompleted,
              status: newStatus,
              updatedAt: new Date().toISOString(),
            }
            if (fullyDelivered) payload.stage = 'Dispatched'
            await supabase.from('ProductionJob').update(payload).eq('id', job.id)
          }
        }
      }
    } catch (jobErr: any) {
      warnings.push(`Production job close-out failed: ${jobErr?.message || 'unknown error'}`)
    }

    return NextResponse.json({ dispatch: updated, warnings: warnings.length > 0 ? warnings : undefined })
  } catch (error) {
    console.error('POST /api/dispatch/[id]/deliver error:', error)
    return NextResponse.json({ error: 'Failed to mark as delivered' }, { status: 500 })
  }
}
