import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { decorateBom, parseBomLine } from '@/lib/bom-utils'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: bom, error } = await supabase.from('BOM').select('*').eq('id', id).single()
    if (error || !bom) return NextResponse.json({ error: 'BOM not found' }, { status: 404 })

    const { data: lines } = await supabase
      .from('BOMLine')
      .select('*')
      .eq('bomId', id)
      .order('createdAt', { ascending: true })

    return NextResponse.json({ bom: decorateBom(bom, lines || []) })
  } catch (error) {
    console.error('BOM [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch BOM' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const now = new Date().toISOString()

    const { data: existing } = await supabase.from('BOM').select('*').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'BOM not found' }, { status: 404 })

    const updatePayload: Record<string, any> = { updatedAt: now }
    if (body.notes !== undefined) updatePayload.notes = body.notes ? String(body.notes) : null
    if (body.isActive !== undefined) {
      updatePayload.isActive = Boolean(body.isActive)
      // Enforce single-active-per-product when activating
      if (updatePayload.isActive) {
        await supabase.from('BOM').update({ isActive: false, updatedAt: now }).eq('styleNo', existing.styleNo).neq('id', id)
      }
    }

    const { data: updated, error } = await supabase.from('BOM').update(updatePayload).eq('id', id).select().single()
    if (error) throw error

    let lines = [] as any[]
    const { data: currentLines } = await supabase
      .from('BOMLine')
      .select('*')
      .eq('bomId', id)
      .order('createdAt', { ascending: true })
    lines = currentLines || []

    if (Array.isArray(body.lines)) {
      await supabase.from('BOMLine').delete().eq('bomId', id)
      const cleanLines = body.lines.map(parseBomLine).filter((l: any) => l.materialName)
      if (cleanLines.length > 0) {
        const rows = cleanLines.map((l: any) => ({ ...l, bomId: id }))
        const { data: inserted, error: linesErr } = await supabase.from('BOMLine').insert(rows).select()
        if (linesErr) throw linesErr
        lines = inserted || []
      } else {
        lines = []
      }
    }

    return NextResponse.json({ bom: decorateBom(updated, lines) })
  } catch (error: any) {
    console.error('BOM [id] PATCH error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update BOM' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Soft delete — keep BOM history for traceability
    const { data: updated, error } = await supabase
      .from('BOM')
      .update({ isActive: false, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error || !updated) return NextResponse.json({ error: 'BOM not found' }, { status: 404 })
    return NextResponse.json({ success: true, bom: updated })
  } catch (error) {
    console.error('BOM [id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete BOM' }, { status: 500 })
  }
}
