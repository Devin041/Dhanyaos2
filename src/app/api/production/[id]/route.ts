import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const PRODUCTION_STAGES = [
  'Fabric Issue', 'Cutting', 'Embroidery', 'Printing', 'Stitching',
  'Finishing', 'Quality Check', 'Packing', 'Dispatch Ready', 'Dispatched',
] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: job, error } = await supabase
      .from('ProductionJob')
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))')
      .eq('id', id)
      .single()
    if (!job || error) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    return NextResponse.json(job)
  } catch (error) {
    console.error('Production [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch production job' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { data: existing, error: fetchErr } = await supabase.from('ProductionJob').select('*, salesOrder:salesOrderId(id, status)').eq('id', id).single()
    if (!existing || fetchErr) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    const ex = existing as any
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    let autoComplete = false

    if (body.nextStage !== undefined) {
      const currentIdx = PRODUCTION_STAGES.indexOf(ex.stage as typeof PRODUCTION_STAGES[number])
      if (currentIdx === -1) return NextResponse.json({ error: `Invalid current stage: ${ex.stage}` }, { status: 400 })
      let targetStage = body.nextStage
      if (targetStage === 'next') {
        if (currentIdx >= PRODUCTION_STAGES.length - 1) return NextResponse.json({ error: 'Already at final stage' }, { status: 400 })
        targetStage = PRODUCTION_STAGES[currentIdx + 1]
      }
      const targetIdx = PRODUCTION_STAGES.indexOf(targetStage)
      if (targetIdx === -1) return NextResponse.json({ error: `Invalid target stage: ${targetStage}` }, { status: 400 })
      if (targetIdx <= currentIdx && body.nextStage !== 'next') return NextResponse.json({ error: 'Can only advance to a later stage' }, { status: 400 })
      updateData.stage = targetStage
      if (targetStage === 'Dispatched') autoComplete = true
      if (ex.endDate && new Date(ex.endDate) < new Date() && ex.status !== 'Completed' && ex.status !== 'Cancelled') {
        if (!autoComplete) updateData.status = 'Delayed'
      }
    }
    if (body.status !== undefined) {
      const validStatuses = ['In Progress', 'Completed', 'Delayed', 'Cancelled']
      if (!validStatuses.includes(body.status)) return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
      updateData.status = body.status
    }
    if (body.completedQty !== undefined) updateData.completedQty = Number(body.completedQty)
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate).toISOString() : null
    if (body.actualFabricConsumed !== undefined) updateData.actualFabricConsumed = Number(body.actualFabricConsumed)
    if (autoComplete) { updateData.status = 'Completed'; updateData.completedQty = ex.targetQty }

    const { data: updated, error } = await supabase.from('ProductionJob').update(updateData).eq('id', id)
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))').single()
    if (error) throw error

    // NEW: Fabric consumption automation
    // When stage advances PAST "Fabric Issue" (i.e., Fabric Issue complete),
    // consume the planned fabric: availableMeters -= planned, reservedMeters -= planned,
    // actualFabricConsumed = planned (default assumption).
    const wasFabricIssueStage = ex.stage === 'Fabric Issue'
    const newStage = updateData.stage
    const advancedPastFabricIssue = wasFabricIssueStage && newStage && newStage !== 'Fabric Issue'
    if (advancedPastFabricIssue && ex.fabricStockId && (ex.plannedFabricMeters || 0) > 0) {
      try {
        const { data: fs } = await supabase
          .from('FabricStock')
          .select('id, availableMeters, reservedMeters')
          .eq('id', ex.fabricStockId)
          .single()
        if (fs) {
          const planned = ex.plannedFabricMeters || 0
          const newAvailable = Math.max(0, (fs.availableMeters || 0) - planned)
          const newReserved = Math.max(0, (fs.reservedMeters || 0) - planned)
          await supabase
            .from('FabricStock')
            .update({ availableMeters: newAvailable, reservedMeters: newReserved, updatedAt: new Date().toISOString() })
            .eq('id', ex.fabricStockId)
          // Record actual consumption (default: consumed = planned; user can edit later)
          await supabase
            .from('ProductionJob')
            .update({ actualFabricConsumed: planned })
            .eq('id', id)
          // Sync the StockReservation ledger row created at job creation
          try {
            await supabase
              .from('StockReservation')
              .update({ consumedQty: planned, status: 'Fully Consumed', updatedAt: new Date().toISOString() })
              .eq('referenceType', 'ProductionJob')
              .eq('referenceId', id)
          } catch (resErr) {
            console.error('StockReservation consume sync (non-fatal):', resErr)
          }
        }
      } catch (fabricErr) {
        console.error('Fabric consumption automation (non-fatal):', fabricErr)
      }
    }

    // When job is marked Completed, if actualFabricConsumed < plannedFabricMeters,
    // return the unused fabric to FabricStock.availableMeters.
    const becomingCompleted = (updateData.status === 'Completed') && ex.status !== 'Completed'
    if (becomingCompleted && ex.fabricStockId) {
      try {
        const actualConsumed = Number(updateData.actualFabricConsumed ?? ex.actualFabricConsumed ?? ex.plannedFabricMeters ?? 0)
        const planned = Number(ex.plannedFabricMeters ?? 0)
        const unused = Math.max(0, planned - actualConsumed)
        if (unused > 0) {
          const { data: fs } = await supabase
            .from('FabricStock')
            .select('id, availableMeters')
            .eq('id', ex.fabricStockId)
            .single()
          if (fs) {
            await supabase
              .from('FabricStock')
              .update({ availableMeters: (fs.availableMeters || 0) + unused, updatedAt: new Date().toISOString() })
              .eq('id', ex.fabricStockId)
          }
        }
      } catch (returnErr) {
        console.error('Fabric return on completion (non-fatal):', returnErr)
      }
    }

    // NEW: FG auto-entry on production complete — when a production job is marked
    // Completed, automatically create/update FGStockBin rows so the finished
    // goods are immediately available for sale/dispatch.
    //
    // Logic:
    // 1. Determine the completed quantity (targetQty if auto-completed, else completedQty)
    // 2. If the linked SalesOrder has a color×size breakdown (OrderItemColor rows
    //    with size), distribute the completed qty across those color/size combos.
    // 3. Otherwise, create a single FGStockBin entry with color='Free', size='Free'.
    // 4. Upsert FGStockBin (find by styleNo + color + size, increment availableQty).
    if (becomingCompleted) {
      try {
        const completedQty = Number(updateData.completedQty ?? ex.completedQty ?? ex.targetQty ?? 0)
        if (completedQty > 0) {
          // Try to fetch color×size breakdown from linked SalesOrder items
          let colorSizeRows: Array<{ color: string; size: string; qty: number }> = []
          if (ex.salesOrderId) {
            const { data: orderItems } = await supabase
              .from('OrderItem')
              .select('id, styleNo, quantity')
              .eq('salesOrderId', ex.salesOrderId)
              .or(`styleNo.eq.${ex.styleNo},styleName.ilike.%${ex.styleName}%`)
            for (const oi of (orderItems || [])) {
              const { data: colorBreakdown } = await supabase
                .from('OrderItemColor')
                .select('color, size, quantity')
                .eq('orderItemId', (oi as any).id)
              for (const cb of (colorBreakdown || [])) {
                colorSizeRows.push({
                  color: (cb as any).color || 'Free',
                  size: (cb as any).size || 'Free',
                  qty: Number((cb as any).quantity) || 0,
                })
              }
            }
          }
          // If no color×size breakdown found, create a single "Free" entry
          if (colorSizeRows.length === 0) {
            colorSizeRows = [{ color: 'Free', size: 'Free', qty: completedQty }]
          } else {
            // Scale the breakdown to match completedQty (in case production made
            // a different qty than ordered)
            const totalOrdered = colorSizeRows.reduce((s, r) => s + r.qty, 0)
            if (totalOrdered > 0 && totalOrdered !== completedQty) {
              const scale = completedQty / totalOrdered
              colorSizeRows = colorSizeRows.map(r => ({
                ...r,
                qty: Math.round(r.qty * scale),
              }))
            }
          }
          // Upsert FGStockBin for each color×size combo
          const ts = new Date().toISOString()
          for (const row of colorSizeRows) {
            if (row.qty <= 0) continue
            // Try to find existing FGStockBin row
            const { data: existingFg } = await supabase
              .from('FGStockBin')
              .select('id, availableQty')
              .eq('styleNo', ex.styleNo)
              .eq('color', row.color)
              .eq('size', row.size)
              .limit(1)
            if (existingFg && existingFg.length > 0) {
              // Update existing row
              const fg = existingFg[0] as any
              await supabase
                .from('FGStockBin')
                .update({
                  availableQty: (fg.availableQty || 0) + row.qty,
                  lastMovementDate: ts,
                  updatedAt: ts,
                })
                .eq('id', fg.id)
            } else {
              // Create new FGStockBin row
              await supabase
                .from('FGStockBin')
                .insert({
                  styleNo: ex.styleNo,
                  styleName: ex.styleName,
                  colorCode: `${ex.styleNo}-${row.color.slice(0, 2).toUpperCase()}-01`,
                  color: row.color,
                  size: row.size,
                  availableQty: row.qty,
                  reservedQty: 0,
                  qcPendingQty: 0,
                  underRepairQty: 0,
                  defectiveQty: 0,
                  scrappedQty: 0,
                  exhibitionQty: 0,
                  unitCost: 0,
                  unitSellPrice: 0,
                  firstInDate: ts,
                  lastMovementDate: ts,
                  location: 'Warehouse',
                  createdAt: ts,
                  updatedAt: ts,
                })
            }
          }
        }
      } catch (fgErr) {
        console.error('FG auto-entry on completion (non-fatal):', fgErr)
      }
    }

    if (ex.salesOrderId && updateData.stage) {
      const newStage = updateData.stage as string
      let newOrderStatus: string | null = null
      if (newStage === 'Dispatched') newOrderStatus = 'Dispatched'
      else if (newStage === 'Dispatch Ready') newOrderStatus = 'In Production'
      if (newOrderStatus && ex.salesOrder) {
        const cur = (ex.salesOrder as any).status
        if (cur !== 'Cancelled' && cur !== 'Completed')
          await supabase.from('SalesOrder').update({ status: newOrderStatus, updatedAt: new Date().toISOString() }).eq('id', ex.salesOrderId)
      }
    }
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Production [id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update production job' }, { status: 500 })
  }
}
