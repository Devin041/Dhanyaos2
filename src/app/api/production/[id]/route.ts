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
    if (autoComplete) { updateData.status = 'Completed'; updateData.completedQty = ex.targetQty }

    const { data: updated, error } = await supabase.from('ProductionJob').update(updateData).eq('id', id)
      .select('*, salesOrder:salesOrderId(id, orderNo, status, customer:customerId(companyName))').single()
    if (error) throw error

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
