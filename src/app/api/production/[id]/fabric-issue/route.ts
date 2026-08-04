import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { fabricStockId, plannedMeters } = body
    if (!fabricStockId || !plannedMeters || plannedMeters <= 0)
      return NextResponse.json({ error: 'fabricStockId and plannedMeters (> 0) are required' }, { status: 400 })
    const { data: job } = await supabase.from('ProductionJob').select('id, jobNo').eq('id', id).single()
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    const { data: stock } = await supabase.from('FabricStock').select('*').eq('id', fabricStockId).single()
    if (!stock) return NextResponse.json({ error: 'Fabric stock not found' }, { status: 404 })
    const s = stock as any
    const available = s.availableMeters - s.reservedMeters
    if (plannedMeters > available)
      return NextResponse.json({ error: `Insufficient fabric. Available: ${available.toFixed(2)}m, Requested: ${plannedMeters}m` }, { status: 400 })
    await supabase.from('ProductionJob').update({ fabricStockId, plannedFabricMeters: plannedMeters, updatedAt: new Date().toISOString() }).eq('id', id)
    await supabase.from('FabricStock').update({ reservedMeters: s.reservedMeters + plannedMeters, updatedAt: new Date().toISOString() }).eq('id', fabricStockId)
    const { data: updatedJob } = await supabase.from('ProductionJob').select('*, fabricStock:fabricStockId(id, fabricName, availableMeters, reservedMeters)').eq('id', id).single()
    return NextResponse.json({ success: true, message: `Reserved ${plannedMeters}m of ${s.fabricName} for job ${(job as any).jobNo}`, job: updatedJob })
  } catch (error) {
    console.error('POST /api/production/[id]/fabric-issue error:', error)
    return NextResponse.json({ error: 'Failed to issue fabric' }, { status: 500 })
  }
}
