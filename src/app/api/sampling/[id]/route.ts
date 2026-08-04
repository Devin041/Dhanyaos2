import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const SAMPLE_STAGES = [
  'Design',
  'Fabric Sourcing',
  'Pattern Making',
  'Cutting',
  'Stitching',
  'Finishing',
  'Ready',
] as const

// --- GET /api/sampling/[id] ---

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: sample, error } = await supabase
      .from('Sample')
      .select('*, customer:customerId(companyName, buyerName)')
      .eq('id', id)
      .single()

    if (!sample || error) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    return NextResponse.json(sample)
  } catch (error) {
    console.error('GET /api/sampling/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 })
  }
}

// --- PATCH /api/sampling/[id] ---

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const { data: existing, error: fetchErr } = await supabase
      .from('Sample')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing || fetchErr) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }

    // --- Stage advancement ---
    if (body.nextStage === true) {
      const currentIdx = SAMPLE_STAGES.indexOf(existing.stage as (typeof SAMPLE_STAGES)[number])
      if (currentIdx >= 0 && currentIdx < SAMPLE_STAGES.length - 1) {
        updateData.stage = SAMPLE_STAGES[currentIdx + 1]
      }
    } else if (body.stage) {
      updateData.stage = body.stage
    }

    // --- Status transitions ---
    if (body.status) {
      const newStatus = body.status

      if (newStatus === 'Submitted' && existing.status === 'In Progress') {
        updateData.status = 'Submitted'
        updateData.submissionDate = new Date().toISOString()
      }
      else if (newStatus === 'Approved' && existing.status === 'Submitted') {
        updateData.status = 'Approved'
        updateData.approvedDate = new Date().toISOString()
      }
      else if (newStatus === 'Rejected' && existing.status === 'Submitted') {
        updateData.status = 'Rejected'
      }
      else if (newStatus === 'Revised' && existing.status === 'Rejected') {
        updateData.status = 'In Progress'
        updateData.stage = 'Design'
        updateData.submissionDate = null
        updateData.approvedDate = null
      }
      else {
        updateData.status = newStatus
      }
    }

    // --- Field updates ---
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.cost !== undefined) updateData.cost = Number(body.cost)
    if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo || null
    if (body.customerId !== undefined) updateData.customerId = body.customerId || null

    const { data: updated, error } = await supabase
      .from('Sample')
      .update(updateData)
      .eq('id', id)
      .select('*, customer:customerId(companyName, buyerName)')
      .single()

    if (error) throw error

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/sampling/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update sample' }, { status: 500 })
  }
}
