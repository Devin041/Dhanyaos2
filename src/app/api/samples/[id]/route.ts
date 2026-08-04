import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: sample, error } = await supabase
      .from('Sample')
      .select('*, photos:SamplePhoto(*), customer:customerId(id, companyName)')
      .eq('id', id)
      .single()

    if (error || !sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

    // Sort photos by sortOrder
    const s = sample as any
    if (s.photos) s.photos.sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    return NextResponse.json(sample)
  } catch (error) {
    console.error('GET /api/samples/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const updateData: Record<string, any> = {
      styleNo: body.styleNo,
      styleName: body.styleName,
      customerId: body.customerId || null,
      stage: body.stage,
      status: body.status,
      notes: body.notes,
      cost: body.cost ?? null,
      submissionDate: body.submissionDate ? new Date(body.submissionDate).toISOString() : null,
      approvedDate: body.approvedDate ? new Date(body.approvedDate).toISOString() : null,
      updatedAt: new Date().toISOString(),
    }

    const { data: sample, error } = await supabase
      .from('Sample')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(sample)
  } catch (error) {
    console.error('PUT /api/samples/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update sample' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Cascade delete photos first
    await supabase.from('SamplePhoto').delete().eq('sampleId', id)

    // Then delete sample
    const { error } = await supabase.from('Sample').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/samples/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 })
  }
}
