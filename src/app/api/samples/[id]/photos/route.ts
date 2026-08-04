import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { photos } = body

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: 'photos array is required' }, { status: 400 })
    }

    // Verify sample exists
    const { data: sample, error: sampleErr } = await supabase
      .from('Sample')
      .select('id')
      .eq('id', id)
      .single()

    if (sampleErr || !sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

    // Get current max sort order
    const { data: existingPhotos } = await supabase
      .from('SamplePhoto')
      .select('sortOrder')
      .eq('sampleId', id)
      .order('sortOrder', { ascending: false })
      .limit(1)

    let sortOrder = existingPhotos && existingPhotos.length > 0 ? (existingPhotos[0] as any).sortOrder + 1 : 0

    const rows = photos.map((p: { imageUrl: string; caption?: string }) => ({
      sampleId: id,
      imageUrl: p.imageUrl,
      caption: p.caption || '',
      sortOrder: sortOrder++,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))

    const { error } = await supabase.from('SamplePhoto').insert(rows)
    if (error) throw error

    return NextResponse.json({ created: rows.length }, { status: 201 })
  } catch (error) {
    console.error('POST /api/samples/[id]/photos error:', error)
    return NextResponse.json({ error: 'Failed to upload photos' }, { status: 500 })
  }
}
