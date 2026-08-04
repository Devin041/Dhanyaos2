import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const { data: catalogs } = await supabase
      .from('SampleCatalog')
      .select('*, customer:customerId(id, companyName), items:SampleCatalogItem(*, sample:SampleId(id, sampleNo, styleNo, styleName))')
      .order('sentDate', { ascending: false })

    return NextResponse.json(catalogs || [])
  } catch (error) {
    console.error('GET /api/sample-catalogs error:', error)
    return NextResponse.json({ error: 'Failed to fetch catalogs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customerId, sampleIds, notes } = body

    if (!customerId || !sampleIds || sampleIds.length === 0) {
      return NextResponse.json({ error: 'customerId and sampleIds are required' }, { status: 400 })
    }

    const { count } = await supabase
      .from('SampleCatalog')
      .select('*', { count: 'exact', head: true })
    const catalogNo = `SC-${String((count || 0) + 1).padStart(3, '0')}`

    const now = new Date().toISOString()

    const { data: catalog, error } = await supabase
      .from('SampleCatalog')
      .insert({
        catalogNo,
        customerId,
        status: 'Sent',
        notes: notes || '',
        sentDate: now,
        createdAt: now,
        updatedAt: now,
      })
      .select('*, customer:customerId(*), items:SampleCatalogItem(*, sample:SampleId(*))')
      .single()

    if (error) throw error

    // Insert items
    if (catalog && sampleIds.length > 0) {
      const itemRows = sampleIds.map((sampleId: string) => ({
        catalogId: catalog.id,
        sampleId,
        createdAt: now,
        updatedAt: now,
      }))
      await supabase.from('SampleCatalogItem').insert(itemRows)
    }

    // Re-fetch with items
    const { data: finalCatalog } = await supabase
      .from('SampleCatalog')
      .select('*, customer:customerId(*), items:SampleCatalogItem(*, sample:SampleId(*))')
      .eq('id', catalog.id)
      .single()

    return NextResponse.json(finalCatalog, { status: 201 })
  } catch (error) {
    console.error('POST /api/sample-catalogs error:', error)
    return NextResponse.json({ error: 'Failed to create catalog' }, { status: 500 })
  }
}
