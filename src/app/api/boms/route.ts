import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { decorateBom, parseBomLine } from '@/lib/bom-utils'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const styleNo = searchParams.get('styleNo')
    const activeOnly = searchParams.get('activeOnly') === 'true'
    const search = searchParams.get('search')?.trim()

    let query = supabase.from('BOM').select('*').order('styleNo').order('version', { ascending: false })
    if (styleNo) query = query.eq('styleNo', styleNo)
    if (activeOnly) query = query.eq('isActive', true)
    if (search) query = query.ilike('styleNo', `%${search}%`)

    const { data: boms, error } = await query
    if (error) throw error

    const bomList = boms || []
    const bomIds = bomList.map((b: any) => b.id)

    let linesByBom: Record<string, any[]> = {}
    if (bomIds.length > 0) {
      const { data: allLines, error: linesErr } = await supabase
        .from('BOMLine')
        .select('*')
        .in('bomId', bomIds)
        .order('createdAt', { ascending: true })
      if (!linesErr && allLines) {
        for (const l of allLines) {
          if (!linesByBom[l.bomId]) linesByBom[l.bomId] = []
          linesByBom[l.bomId].push(l)
        }
      }
    }

    return NextResponse.json({
      boms: bomList.map((b: any) => decorateBom(b, linesByBom[b.id] || [])),
      total: bomList.length,
    })
  } catch (error) {
    console.error('BOM GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch BOMs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { styleNo, version, notes, lines = [] } = body

    if (!styleNo || !String(styleNo).trim()) {
      return NextResponse.json({ error: 'styleNo is required' }, { status: 400 })
    }

    const cleanStyleNo = String(styleNo).trim()
    const now = new Date().toISOString()

    // Auto-version: highest existing version for this style + 1
    let versionVal = Number(version) || 0
    if (!versionVal) {
      const { data: existing } = await supabase
        .from('BOM')
        .select('version')
        .eq('styleNo', cleanStyleNo)
        .order('version', { ascending: false })
        .limit(1)
      versionVal = existing && existing.length > 0 ? (existing[0].version || 0) + 1 : 1
    }

    // Only one active BOM per product — deactivate older ones
    await supabase
      .from('BOM')
      .update({ isActive: false, updatedAt: now })
      .eq('styleNo', cleanStyleNo)
      .eq('isActive', true)

    const { data: bom, error } = await supabase
      .from('BOM')
      .insert({
        styleNo: cleanStyleNo,
        version: versionVal,
        isActive: true,
        notes: notes ? String(notes) : null,
      })
      .select()
      .single()
    if (error) throw error

    const cleanLines = lines.map(parseBomLine).filter((l: any) => l.materialName)
    let createdLines: any[] = []
    if (cleanLines.length > 0) {
      const rows = cleanLines.map((l: any) => ({ ...l, bomId: bom.id }))
      const { data: inserted, error: linesErr } = await supabase.from('BOMLine').insert(rows).select()
      if (linesErr) throw linesErr
      createdLines = inserted || []
    }

    return NextResponse.json({ bom: decorateBom(bom, createdLines) }, { status: 201 })
  } catch (error: any) {
    console.error('BOM POST error:', error)
    const msg = String(error?.message || '')
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return NextResponse.json(
        { error: 'This style already has a BOM with that version number' },
        { status: 409 },
      )
    }
    if (/Could not find the table|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'BOM tables do not exist yet. Run SUPABASE-MIGRATION-BOM.sql in the Supabase SQL Editor first.' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: error?.message || 'Failed to create BOM' }, { status: 500 })
  }
}
