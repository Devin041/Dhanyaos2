import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    // Fetch all matching samples with photos (sorted by sortOrder) and customer
    let query = supabase
      .from('Sample')
      .select('*, photos:SamplePhoto(id, imageUrl, sortOrder), customer:customerId(id, companyName)')
      .order('createdAt', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: samples, error } = await query
    if (error) throw error

    let filtered = samples || []

    // Apply search filter in JS
    if (search) {
      const term = search.toLowerCase()
      filtered = filtered.filter((s: any) =>
        (s.styleNo || '').toLowerCase().includes(term) ||
        (s.styleName || '').toLowerCase().includes(term) ||
        (s.sampleNo || '').toLowerCase().includes(term)
      )
    }

    // Sort photos by sortOrder
    for (const s of filtered as any[]) {
      if (s.photos) s.photos.sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    }

    // Fetch all cost sheets and build a styleNo -> costSheet map
    const { data: costSheets } = await supabase
      .from('CostSheet')
      .select('id, sheetNo, styleNo, totalCost, sellingPrice, status')

    const costSheetMap = new Map<string, { id: string; sheetNo: string; totalCost: number; sellingPrice: number; status: string }>()
    for (const cs of (costSheets || [])) {
      costSheetMap.set((cs as any).styleNo, {
        id: cs.id,
        sheetNo: cs.sheetNo,
        totalCost: cs.totalCost,
        sellingPrice: cs.sellingPrice,
        status: cs.status,
      })
    }

    // Combine data
    const result = (filtered as any[]).map((s) => {
      const firstPhoto = s.photos && s.photos.length > 0 ? s.photos[0] : null
      const costSheet = costSheetMap.get(s.styleNo) ?? null

      return {
        id: s.id,
        sampleNo: s.sampleNo,
        styleNo: s.styleNo,
        styleName: s.styleName,
        stage: s.stage,
        status: s.status,
        customer: s.customer
          ? { id: s.customer.id, companyName: s.customer.companyName }
          : null,
        photoCount: s.photos?.length || 0,
        firstPhotoUrl: firstPhoto?.imageUrl ?? null,
        costSheet,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/samples-with-costing error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch samples with costing' },
      { status: 500 }
    )
  }
}
