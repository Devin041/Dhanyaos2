import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { postJournal } from '@/lib/gl'

// ─── GET: Journal entries (with lines) + filters ───────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceType = searchParams.get('sourceType')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = Math.min(200, Number(searchParams.get('limit') || '100'))

    let query = supabase
      .from('JournalEntry')
      .select('*, lines:JournalLine(*)')
      .order('entryDate', { ascending: false })
      .limit(limit)
    if (sourceType) query = query.eq('sourceType', sourceType)
    if (from) query = query.gte('entryDate', new Date(from).toISOString())
    if (to) query = query.lte('entryDate', new Date(`${to}T23:59:59`).toISOString())

    const { data: entries, error } = await query
    if (error) throw error

    // Sort lines: debits first
    const list = (entries || []).map((e: any) => ({
      ...e,
      lines: [...(e.lines || [])].sort((a: any, b: any) => (b.debit || 0) - (a.debit || 0)),
    }))

    const totalDr = list.reduce((s: number, e: any) => s + (e.amount || 0), 0)
    return NextResponse.json({ entries: list, count: list.length, totalValue: Math.round(totalDr) })
  } catch (error: any) {
    console.error('GET /api/journal error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load journal' }, { status: 500 })
  }
}

// ─── POST: Manual journal entry (accountant use) ──────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { entryDate, description, lines } = body
    if (!Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json({ error: 'lines[] with at least 2 entries required' }, { status: 400 })
    }
    const entry = await postJournal({
      entryDate: entryDate || new Date(),
      description: description || 'Manual journal',
      sourceType: 'MANUAL',
      lines,
    })
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/journal error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to post journal' }, { status: 500 })
  }
}
