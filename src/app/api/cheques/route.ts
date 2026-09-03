import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

// ─── GET: Cheque register ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const direction = searchParams.get('direction')

    let query = supabase
      .from('Cheque')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(200)
    if (status) query = query.eq('status', status)
    if (direction) query = query.eq('direction', direction)

    const { data: cheques, error } = await query
    if (error) throw error
    const list = cheques || []

    const summary = {
      count: list.length,
      inHand: list.filter((c: any) => c.status === 'In Hand').length,
      inHandValue: list.filter((c: any) => c.status === 'In Hand').reduce((s: number, c: any) => s + (c.amount || 0), 0),
      deposited: list.filter((c: any) => c.status === 'Deposited').length,
      depositedValue: list.filter((c: any) => c.status === 'Deposited').reduce((s: number, c: any) => s + (c.amount || 0), 0),
      cleared: list.filter((c: any) => c.status === 'Cleared').length,
      clearedValue: list.filter((c: any) => c.status === 'Cleared').reduce((s: number, c: any) => s + (c.amount || 0), 0),
      bounced: list.filter((c: any) => c.status === 'Bounced').length,
      bouncedValue: list.filter((c: any) => c.status === 'Bounced').reduce((s: number, c: any) => s + (c.amount || 0), 0),
      receivedValue: list.filter((c: any) => c.direction === 'RECEIVED').reduce((s: number, c: any) => s + (c.amount || 0), 0),
      issuedValue: list.filter((c: any) => c.direction === 'ISSUED').reduce((s: number, c: any) => s + (c.amount || 0), 0),
    }

    return NextResponse.json({ cheques: list, summary })
  } catch (error: any) {
    console.error('GET /api/cheques error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load cheques' }, { status: 500 })
  }
}
