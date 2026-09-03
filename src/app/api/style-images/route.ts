import { NextRequest, NextResponse } from 'next/server'
import { batchResolveStyleImages } from '@/lib/style-image'

/**
 * GET /api/style-images?styleNos=A,B,C   (preferred — batch)
 * GET /api/style-images?styleNo=A        (fallback — single styleNo)
 *
 * FLAT response — plain URL strings, nulls skipped:
 *   { "images": { "EL-024": "https://res.cloudinary.com/…" } }
 *
 * Unlike /api/style-image (whose batch mode returns {url, source} objects),
 * this endpoint is safe to feed straight into <img src=> — it exists to fix
 * the "[object Object]" image bug in the BOM module.
 *
 * styleNos are deduped and capped at 200. The underlying resolver has a
 * 5-minute in-memory cache.
 */

const MAX_STYLE_NOS = 200

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get('styleNos')?.trim() || searchParams.get('styleNo')?.trim() || ''

    if (!raw) {
      return NextResponse.json(
        { error: 'styleNos (or styleNo) is required — e.g. ?styleNos=EL-001,EL-002' },
        { status: 400 },
      )
    }

    const styleNos = [...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )].slice(0, MAX_STYLE_NOS)

    if (styleNos.length === 0) {
      return NextResponse.json({ error: 'No valid styleNos provided' }, { status: 400 })
    }

    const resolved = await batchResolveStyleImages(styleNos)

    // FLATTEN: plain URL strings only, nulls skipped
    const images: Record<string, string> = {}
    for (const styleNo of styleNos) {
      const url = resolved[styleNo]?.url
      if (url) images[styleNo] = url
    }

    return NextResponse.json({ images })
  } catch (error: any) {
    console.error('[style-images GET]', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to resolve style images' },
      { status: 500 },
    )
  }
}
