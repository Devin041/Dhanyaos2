import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { format } from 'date-fns'

// ─── GET: List bank transactions ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'))

    let query = supabase
      .from('BankTransaction')
      .select('*, bankAccount:bankAccountId(id, accountName, accountType)')
      .order('date', { ascending: false })
      .limit(limit)

    if (accountId) query = query.eq('bankAccountId', accountId)

    const { data: transactions, error } = await query

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ transactions: [], summary: { totalIn: 0, totalOut: 0, netFlow: 0 } })
      }
      throw error
    }

    const all = transactions || []
    const totalIn = all.filter((t: any) => t.type === 'Credit').reduce((s: number, t: any) => s + (t.amount || 0), 0)
    const totalOut = all.filter((t: any) => t.type === 'Debit').reduce((s: number, t: any) => s + (t.amount || 0), 0)

    return NextResponse.json({
      transactions: all,
      summary: {
        totalIn: Math.round(totalIn),
        totalOut: Math.round(totalOut),
        netFlow: Math.round(totalIn - totalOut),
        count: all.length,
      },
    })
  } catch (error) {
    console.error('GET /api/bank-accounts/transactions error:', error)
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
  }
}

// ─── POST: Record bank transaction (deposit/withdrawal/transfer) ─────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bankAccountId, type, amount, date, description, referenceType, referenceId, paymentMode, chequeNo, chequeDate } = body

    if (!bankAccountId || !type || !amount || amount <= 0) {
      return NextResponse.json({ error: 'bankAccountId, type, and amount (> 0) are required' }, { status: 400 })
    }

    if (type !== 'Credit' && type !== 'Debit') {
      return NextResponse.json({ error: 'type must be Credit or Debit' }, { status: 400 })
    }

    const now = (date ? new Date(date) : new Date()).toISOString()

    // Insert transaction
    const { data: txn, error } = await supabase
      .from('BankTransaction')
      .insert({
        bankAccountId,
        type,
        amount: Number(amount),
        date: now,
        description: description || '',
        referenceType: referenceType || null,
        referenceId: referenceId || null,
        paymentMode: paymentMode || 'Cash',
        chequeNo: chequeNo || null,
        chequeDate: chequeDate || null,
        reconciled: false,
      })
      .select()
      .single()

    if (error) throw error

    // Update bank account balance
    const { data: account } = await supabase
      .from('BankAccount')
      .select('currentBalance')
      .eq('id', bankAccountId)
      .single()

    if (account) {
      const currentBalance = (account as any).currentBalance || 0
      const newBalance = type === 'Credit' ? currentBalance + Number(amount) : currentBalance - Number(amount)
      await supabase
        .from('BankAccount')
        .update({ currentBalance: newBalance, updatedAt: new Date().toISOString() })
        .eq('id', bankAccountId)
    }

    return NextResponse.json(txn, { status: 201 })
  } catch (error) {
    console.error('POST /api/bank-accounts/transactions error:', error)
    return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 })
  }
}
