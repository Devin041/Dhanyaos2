import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { postJournal, postCashbookRow, GL } from '@/lib/gl'

/**
 * POST /api/bank-accounts/transfer — move money between accounts.
 * Body: { fromAccountId, toAccountId, amount, date?, notes? }
 * JE: Dr Bank (to) / Cr Bank (from) + two cashbook rows.
 */
export async function POST(request: NextRequest) {
  try {
    const { fromAccountId, toAccountId, amount, date, notes } = await request.json()

    if (!fromAccountId || !toAccountId) {
      return NextResponse.json({ error: 'fromAccountId and toAccountId are required' }, { status: 400 })
    }
    if (fromAccountId === toAccountId) {
      return NextResponse.json({ error: 'Cannot transfer to the same account' }, { status: 400 })
    }
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
    }

    const { data: from } = await supabase.from('BankAccount').select('*').eq('id', fromAccountId).single()
    const { data: to } = await supabase.from('BankAccount').select('*').eq('id', toAccountId).single()
    if (!from || !to) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    // Derived available balance (opening + movements) — currentBalance column
    // is not maintained directly anymore
    const derivedBalance = async (accId: string, opening: number) => {
      const { data: txns } = await supabase
        .from('Transaction')
        .select('type, amount')
        .eq('bankAccountId', accId)
      return (txns || []).reduce((s: number, t: any) => s + (t.type === 'Credit' ? (t.amount || 0) : -(t.amount || 0)), opening)
    }
    const fromBalance = await derivedBalance(fromAccountId, from.openingBalance || 0)
    if (fromBalance < amt) {
      return NextResponse.json(
        { error: `Insufficient balance in ${from.accountName}: ₹${Math.round(fromBalance).toLocaleString('en-IN')}` },
        { status: 400 }
      )
    }

    const when = date ? new Date(date).toISOString() : new Date().toISOString()

    const journal = await postJournal({
      entryDate: when,
      description: `Transfer: ${from.accountName} → ${to.accountName}${notes ? ` — ${notes}` : ''}`,
      sourceType: 'TRANSFER',
      sourceId: null,
      lines: [
        { glAccountCode: GL.BANK, debit: amt, memo: `To ${to.accountName}` },
        { glAccountCode: GL.BANK, credit: amt, memo: `From ${from.accountName}` },
      ],
    })

    const cashbook1 = await postCashbookRow({
      type: 'Debit', category: 'Bank Transfer Out', amount: amt,
      description: `Transfer to ${to.accountName}`, date: when,
      bankAccountId: fromAccountId, sourceType: 'TRANSFER', journalEntryId: journal.id,
    })
    const cashbook2 = await postCashbookRow({
      type: 'Credit', category: 'Bank Transfer In', amount: amt,
      description: `Transfer from ${from.accountName}`, date: when,
      bankAccountId: toAccountId, sourceType: 'TRANSFER', journalEntryId: journal.id,
    })
    // NOTE: BankAccount.currentBalance is NOT updated directly — the balance is
    // DERIVED in GET /api/bank-accounts from Transaction rows (single source of
    // truth: opening + Σcredit − Σdebit per account).

    return NextResponse.json({
      transfer: { from: from.accountName, to: to.accountName, amount: amt, date: when },
      journal: { id: journal.id, entryNo: journal.entryNo },
    }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/bank-accounts/transfer error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to record transfer' }, { status: 500 })
  }
}
