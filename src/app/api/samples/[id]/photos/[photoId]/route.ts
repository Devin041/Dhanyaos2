import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  try {
    const { id, photoId } = await params
    const { data: photo, error: photoErr } = await supabase
      .from('SamplePhoto')
      .select('id, sampleId')
      .eq('id', photoId)
      .single()

    if (photoErr || !photo || (photo as any).sampleId !== id) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    const { error } = await supabase.from('SamplePhoto').delete().eq('id', photoId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE photo error:', error)
    return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
  }
}
