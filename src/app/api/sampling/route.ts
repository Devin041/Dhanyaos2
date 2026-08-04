import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

// --- GET /api/sampling ---

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status')
    const stage = searchParams.get('stage')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))

    // Fetch all samples with customer for counts
    let allQuery = supabase
      .from('Sample')
      .select('*, customer:customerId(companyName, buyerName)')
      .order('createdAt', { ascending: false })

    const { data: allSamples, error: allErr } = await allQuery
    if (allErr) throw allErr

    let all = allSamples || []

    // Compute counts
    const statusCounts: Record<string, number> = {}
    const stageCounts: Record<string, number> = {}
    let totalCost = 0

    for (const s of all as any[]) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1
      stageCounts[s.stage] = (stageCounts[s.stage] || 0) + 1
      totalCost += s.cost || 0
    }

    const total = all.length

    // Apply filters
    let filtered = all
    if (status && status !== 'all') {
      filtered = filtered.filter((s: any) => s.status === status)
    }
    if (stage && stage !== 'all') {
      filtered = filtered.filter((s: any) => s.stage === stage)
    }
    if (search) {
      const term = search.toLowerCase()
      filtered = filtered.filter((s: any) =>
        (s.sampleNo || '').toLowerCase().includes(term) ||
        (s.styleNo || '').toLowerCase().includes(term) ||
        (s.styleName || '').toLowerCase().includes(term) ||
        (s.customer?.companyName || '').toLowerCase().includes(term)
      )
    }

    // Apply pagination
    const skip = (page - 1) * limit
    const samples = filtered.slice(skip, skip + limit)

    const approvedCount = statusCounts['Approved'] || 0
    const approvedRate = total > 0 ? Math.round((approvedCount / total) * 100) : 0
    const inProgress = statusCounts['In Progress'] || 0

    return NextResponse.json({
      samples,
      total,
      page,
      limit,
      statusCounts,
      stageCounts,
      summary: {
        totalSamples: total,
        approvedRate,
        inProgress,
        avgCost: total > 0 ? Math.round((totalCost / total) * 100) / 100 : 0,
        totalCost: Math.round(totalCost * 100) / 100,
      },
    })
  } catch (error) {
    console.error('GET /api/sampling error:', error)
    return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
  }
}

// --- POST /api/sampling ---

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { styleNo, styleName, customerId, assignedTo, cost, notes } = body

    if (!styleNo || !styleName) {
      return NextResponse.json(
        { error: 'styleNo and styleName are required' },
        { status: 400 }
      )
    }

    // Generate sequential sample number
    const { data: lastSample } = await supabase
      .from('Sample')
      .select('sampleNo')
      .order('createdAt', { ascending: false })
      .limit(1)
      .single()

    let nextNum = 1
    if (lastSample) {
      const match = lastSample.sampleNo.match(/SMP-(\d{4})/)
      if (match) {
        nextNum = parseInt(match[1], 10) + 1
      }
    }

    const sampleNo = `SMP-${String(nextNum).padStart(4, '0')}`

    const { data: sample, error } = await supabase
      .from('Sample')
      .insert({
        sampleNo,
        styleNo,
        styleName,
        customerId: customerId || null,
        assignedTo: assignedTo || null,
        cost: cost ? Number(cost) : 0,
        notes: notes || null,
        stage: 'Design',
        status: 'In Progress',
      })
      .select('*, customer:customerId(companyName, buyerName)')
      .single()

    if (error) throw error

    return NextResponse.json(sample, { status: 201 })
  } catch (error) {
    console.error('POST /api/sampling error:', error)
    return NextResponse.json({ error: 'Failed to create sample' }, { status: 500 })
  }
}
