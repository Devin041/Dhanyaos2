import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { getGlAccounts } from '@/lib/gl'

// ─── GET: Trial balance — every account's net position, must balance ───────
export async function GET() {
  try {
    const accounts = await getGlAccounts(true)
    const { data: meta } = await supabase.from('GlAccount').select('code, name, accountType, subType')
    const metaMap = new Map((meta || []).map((m: any) => [m.code, m]))

    const { data: lines, error } = await supabase
      .from('JournalLine')
      .select('glAccountCode, debit, credit')
    if (error) throw error

    const totals = new Map<string, { debit: number; credit: number }>()
    for (const l of (lines || []) as any[]) {
      const cur = totals.get(l.glAccountCode) || { debit: 0, credit: 0 }
      cur.debit += l.debit || 0
      cur.credit += l.credit || 0
      totals.set(l.glAccountCode, cur)
    }

    const round2 = (n: number) => Math.round(n * 100) / 100
    const rows = accounts.map((a) => {
      const t = totals.get(a.code) || { debit: 0, credit: 0 }
      const net = round2(t.debit - t.credit)
      const m = metaMap.get(a.code) as any
      return {
        code: a.code,
        name: a.name,
        accountType: m?.accountType || 'ASSET',
        subType: m?.subType || null,
        totalDebit: round2(t.debit),
        totalCredit: round2(t.credit),
        // Trial-balance presentation: net debit → debit column, net credit → credit column
        debit: net > 0 ? net : 0,
        credit: net < 0 ? -net : 0,
      }
    })

    const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0))
    const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0))
    const balanced = Math.abs(totalDebit - totalCredit) <= 0.01

    return NextResponse.json({
      rows,
      totals: { debit: totalDebit, credit: totalCredit, balanced },
      asOf: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('GET /api/trial-balance error:', error)
    return NextResponse.json({ error: error?.message || 'Trial balance unavailable', rows: [], totals: null }, { status: 500 })
  }
}
