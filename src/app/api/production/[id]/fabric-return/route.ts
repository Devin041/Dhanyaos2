import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { returnedMeters } = body
    if (!returnedMeters || returnedMeters <= 0) return NextResponse.json({ error: 'returnedMeters (> 0) is required' }, { status: 400 })
    const { data: job } = await supabase.from('ProductionJob').select('*, fabricStock:fabricStockId(id, fabricName, reservedMeters, availableMeters)').eq('id', id).single()
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    const j = job as any
    if (!j.fabricStockId) return NextResponse.json({ error: 'No fabric linked to this job' }, { status: 400 })
    const returnable = Math.min(returnedMeters, j.plannedFabricMeters)
    if (returnable <= 0) return NextResponse.json({ error: 'No fabric to return' }, { status: 400 })
    const fs = j.fabricStock as any
    await supabase.from('FabricStock').update({ reservedMeters: fs.reservedMeters - returnable, updatedAt: new Date().toISOString() }).eq('id', j.fabricStockId)
    const newPlanned = j.plannedFabricMeters - returnable
    const consumed = j.plannedFabricMeters - returnable
    const newActual = (j.actualFabricConsumed || 0) + consumed
    await supabase.from('ProductionJob').update({ plannedFabricMeters: newPlanned, actualFabricConsumed: newActual, updatedAt: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ success: true, message: `Returned ${returnable}m. Consumed: ${consumed}m` })
  } catch (error) {
    console.error('POST /api/production/[id]/fabric-return error:', error)
    return NextResponse.json({ error: 'Failed to return fabric' }, { status: 500 })
  }
}
