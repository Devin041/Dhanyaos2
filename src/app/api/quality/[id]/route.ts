import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: check, error } = await supabase
      .from('QualityCheck')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !check) {
      return NextResponse.json({ error: 'Quality check not found' }, { status: 404 })
    }

    // Fetch related production job
    let productionJob = null
    if (check.productionJobId) {
      const { data: job } = await supabase
        .from('ProductionJob')
        .select('*')
        .eq('id', check.productionJobId)
        .single()
      productionJob = job || null
    }

    return NextResponse.json({ ...check, productionJob })
  } catch (error) {
    console.error('Quality [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch quality check' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const { data: existing, error: existErr } = await supabase
      .from('QualityCheck')
      .select('*')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Quality check not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() }

    if (body.status !== undefined) {
      const validStatuses = ['Pass', 'Fail', 'Conditional']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
      }
      updateData.status = body.status
    }

    if (body.passedQty !== undefined) {
      updateData.passedQty = Number(body.passedQty)
      // Recalculate failedQty
      updateData.failedQty = existing.checkedQty - Number(body.passedQty)
    }

    if (body.failedQty !== undefined) {
      updateData.failedQty = Number(body.failedQty)
    }

    if (body.defectType !== undefined) {
      updateData.defectType = body.defectType || null
    }

    if (body.severity !== undefined) {
      const validSeverities = ['Minor', 'Major', 'Critical']
      if (!validSeverities.includes(body.severity)) {
        return NextResponse.json({ error: `Invalid severity: ${body.severity}` }, { status: 400 })
      }
      updateData.severity = body.severity
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes || null
    }

    const { data: updated, error } = await supabase
      .from('QualityCheck')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    // Fetch related production job
    let productionJob = null
    if (updated.productionJobId) {
      const { data: job } = await supabase
        .from('ProductionJob')
        .select('*')
        .eq('id', updated.productionJobId)
        .single()
      productionJob = job || null
    }

    return NextResponse.json({ ...updated, productionJob })
  } catch (error) {
    console.error('Quality [id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update quality check' }, { status: 500 })
  }
}
