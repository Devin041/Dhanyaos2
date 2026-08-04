import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════════
// ID GENERATORS — collision-safe (never throws Unique constraint)
// ═══════════════════════════════════════════════════════════════════

async function generateSampleNo(): Promise<string> {
  const { data: existing, error } = await supabase
    .from('Sample')
    .select('sampleNo')

  if (error) throw error

  const nums = (existing || [])
    .map(s => parseInt((s as any).sampleNo.replace('SMP-', ''), 10))
    .filter(n => !isNaN(n))

  let candidate = 1
  while (nums.includes(candidate)) candidate++
  return `SMP-${String(candidate).padStart(4, '0')}`
}

async function generateStyleNo(): Promise<string> {
  const { data: existing, error } = await supabase
    .from('Sample')
    .select('styleNo')

  if (error) throw error

  const nums = (existing || [])
    .map(s => parseInt((s as any).styleNo.replace(/^EL-/, ''), 10))
    .filter(n => !isNaN(n))

  let candidate = 1
  while (nums.includes(candidate)) candidate++
  return `EL-${String(candidate).padStart(3, '0')}`
}

// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    // Auto-generate next style number
    if (searchParams.get('nextStyleNo') === '1') {
      const nextStyleNo = await generateStyleNo()
      return NextResponse.json({ nextStyleNo })
    }

    let query = supabase
      .from('Sample')
      .select('*, photos:SamplePhoto(id, sortOrder), customer:customerId(id, companyName)')
      .order('createdAt', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    // Supabase doesn't support OR across multiple fields in a single call easily
    // We'll fetch all and filter in JS if search is provided
    const { data: samples, error } = status
      ? await query
      : await query

    if (error) throw error

    let filtered = samples || []

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

    return NextResponse.json((filtered as any[]).map(s => ({
      ...s,
      photoCount: s.photos?.length || 0,
      photos: undefined,
    })))
  } catch (error) {
    console.error('GET /api/samples error:', error)
    return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { styleNo, styleName, customerId, notes, stage } = body

    if (!styleNo || !styleName) {
      return NextResponse.json({ error: 'styleNo and styleName are required' }, { status: 400 })
    }

    const sampleNo = await generateSampleNo()

    const { data: sample, error } = await supabase
      .from('Sample')
      .insert({
        sampleNo,
        styleNo,
        styleName,
        customerId: customerId || null,
        notes: notes || '',
        stage: stage || 'Design',
        status: 'In Progress',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(sample, { status: 201 })
  } catch (error) {
    console.error('POST /api/samples error:', error)
    return NextResponse.json({ error: 'Failed to create sample' }, { status: 500 })
  }
}
