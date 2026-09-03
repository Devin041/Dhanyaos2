import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { getGlAccounts } from '@/lib/gl'

// ─── GET: Chart of accounts with LIVE balances (sum of JournalLine) ────────
export async function GET() {
  try {
    const accounts = await getGlAccounts(true)

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
    const enriched = accounts.map((a) => {
      const t = totals.get(a.code) || { debit: 0, credit: 0 }
      return { ...a, debit: round2(t.debit), credit: round2(t.credit), balance: round2(t.debit - t.credit) }
    })

    // Migration guard for the account metadata
    const { data: meta, error: metaErr } = await supabase
      .from('GlAccount')
      .select('code, name, accountType, subType, isSystem')
    const byCode = new Map((meta || []).map((m: any) => [m.code, m]))
    const merged = enriched.map((a) => {
      const m = byCode.get(a.code) as any
      return { ...a, accountType: m?.accountType || 'ASSET', subType: m?.subType || null, isSystem: m?.isSystem ?? false }
    })

    const totalDr = round2(merged.reduce((s, a) => s + a.debit, 0))
    const totalCr = round2(merged.reduce((s, a) => s + a.credit, 0))

    return NextResponse.json({
      accounts: merged,
      totals: { debit: totalDr, credit: totalCr, balanced: Math.abs(totalDr - totalCr) <= 0.01 },
    })
  } catch (error: any) {
    console.error('GET /api/gl-accounts error:', error)
    return NextResponse.json(
      { error: error?.message || 'GL accounts unavailable — run PHASE-A-MIGRATION.sql', accounts: [], totals: null },
      { status: 500 }
    )
  }
}
