import { NextRequest, NextResponse } from 'next/server'
import { resolveStyleImage, batchResolveStyleImages, clearImageCache } from '@/lib/style-image'

/**
 * GET /api/style-image?styleNo=DH-01
 * GET /api/style-image?styleNo=DH-01,DH-02,DH-03  (batch)
 * 
 * Resolves product image for given styleNo(s).
 * Resolution chain: Sample → CostSheet → FGStockBin
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNoParam = searchParams.get('styleNo')?.trim()

    if (!styleNoParam) {
      return NextResponse.json({ error: 'styleNo is required' }, { status: 400 })
    }

    // Batch mode: comma-separated styleNos
    if (styleNoParam.includes(',')) {
      const styleNos = styleNoParam.split(',').map(s => s.trim()).filter(Boolean)
      const images = await batchResolveStyleImages(styleNos)
      return NextResponse.json({ images })
    }

    // Single mode
    const result = await resolveStyleImage(styleNoParam)
    return NextResponse.json({
      styleNo: styleNoParam,
      imageUrl: result.url,
      source: result.source,
    })
  } catch (error: any) {
    console.error('[style-image GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to resolve style image' }, { status: 500 })
  }
}

/**
 * DELETE /api/style-image?styleNo=DH-01   (clear cache for one style)
 * DELETE /api/style-image                   (clear all cache)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNo = searchParams.get('styleNo')?.trim()
    clearImageCache(styleNo || undefined)
    return NextResponse.json({ success: true, cleared: styleNo || 'all' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
