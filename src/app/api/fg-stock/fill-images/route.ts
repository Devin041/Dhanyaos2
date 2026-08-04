import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { clearImageCache } from '@/lib/style-image'

/**
 * POST /api/fg-stock/fill-images
 * One-time admin script: fills null images in FinishedGood and FGGrnNote from Sample photos.
 * 
 * Body: { dryRun?: boolean }  — if true, only reports what would be updated
 */

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    // ── Find all bins with null image from Supabase ──
    const { data: bins } = await supabase
      .from('FinishedGood')
      .select('id, styleNo, styleName')
      .is('image', null)

    // ── Find all GRNs with null image from Supabase ──
    const { data: grnNotes } = await supabase
      .from('FGGrnNote')
      .select('id, styleNo, styleName')
      .is('image', null)

    // ── Get unique styleNos ──
    const allStyleNos = [
      ...new Set([
        ...(bins || []).map((b: any) => b.styleNo),
        ...(grnNotes || []).map((g: any) => g.styleNo),
      ]),
    ]

    // ── Resolve images from Sample (Supabase) ──
    const { data: samples, error: sampleErr } = await supabase
      .from('Sample')
      .select('id, styleNo')
      .in('styleNo', allStyleNos)
    if (sampleErr) throw sampleErr

    const sampleIds = (samples || []).map((s: any) => s.id)

    let photos: any[] = []
    if (sampleIds.length > 0) {
      const { data: samplePhotos } = await supabase
        .from('SamplePhoto')
        .select('sampleId, imageUrl, sortOrder')
        .in('sampleId', sampleIds)
        .order('sortOrder', { ascending: true })
      photos = samplePhotos || []
    }

    // Build styleNo → first photo URL map
    const sampleStyleMap: Record<string, string> = {}
    for (const s of (samples || [])) {
      const firstPhoto = photos.find((p: any) => p.sampleId === s.id)
      if (firstPhoto?.imageUrl) {
        sampleStyleMap[s.styleNo] = firstPhoto.imageUrl
      }
    }

    // ── Update bins in Supabase ──
    const binResults: { id: string; styleNo: string; updated: boolean; imageUrl: string | null }[] = []
    for (const bin of (bins || [])) {
      const imageUrl = sampleStyleMap[bin.styleNo] || null
      if (imageUrl && !dryRun) {
        await supabase.from('FinishedGood').update({ image: imageUrl }).eq('id', bin.id)
      }
      binResults.push({ id: bin.id, styleNo: bin.styleNo, updated: !!imageUrl, imageUrl })
    }

    // ── Update GRNs in Supabase ──
    const grnResults: { id: string; styleNo: string; updated: boolean; imageUrl: string | null }[] = []
    for (const grn of (grnNotes || [])) {
      const imageUrl = sampleStyleMap[grn.styleNo] || null
      if (imageUrl && !dryRun) {
        await supabase.from('FGGrnNote').update({ image: imageUrl }).eq('id', grn.id)
      }
      grnResults.push({ id: grn.id, styleNo: grn.styleNo, updated: !!imageUrl, imageUrl })
    }

    // ── Clear cache ──
    clearImageCache()

    const binsUpdated = binResults.filter(r => r.updated).length
    const grnsUpdated = grnResults.filter(r => r.updated).length

    return NextResponse.json({
      dryRun,
      binsChecked: (bins || []).length,
      binsUpdated,
      grnsChecked: (grnNotes || []).length,
      grnsUpdated,
      stylesResolved: Object.keys(sampleStyleMap).length,
      binResults,
      grnResults,
    })
  } catch (error: any) {
    console.error('[fill-images POST]', error)
    return NextResponse.json({ error: error.message || 'Failed to fill images' }, { status: 500 })
  }
}
