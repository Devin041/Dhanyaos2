import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'

// ─── GET: List bank accounts with balances ──────────────────────────────────
export async function GET() {
  try {
    const { data: accounts, error } = await supabase
      .from('BankAccount')
      .select('*')
      .order('createdAt', { ascending: true })

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ accounts: [], summary: { totalBalance: 0, accountCount: 0, bankAccounts: 0, cashAccounts: 0 } })
      }
      throw error
    }

    const all = accounts || []
    const totalBalance = all.reduce((s: number, a: any) => s + (a.currentBalance || 0), 0)

    return NextResponse.json({
      accounts: all,
      summary: {
        totalBalance: Math.round(totalBalance),
        accountCount: all.length,
        bankAccounts: all.filter((a: any) => a.accountType !== 'Cash' && a.accountType !== 'Petty Cash').length,
        cashAccounts: all.filter((a: any) => a.accountType === 'Cash' || a.accountType === 'Petty Cash').length,
      },
    })
  } catch (error) {
    console.error('GET /api/bank-accounts error:', error)
    return NextResponse.json({ error: 'Failed to load bank accounts' }, { status: 500 })
  }
}

// ─── POST: Create bank account ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { accountName, accountNumber, bankName, branch, ifscCode, accountType, openingBalance } = body

    if (!accountName) {
      return NextResponse.json({ error: 'accountName is required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const ob = Number(openingBalance) || 0

    const { data: account, error } = await supabase
      .from('BankAccount')
      .insert({
        accountName,
        accountNumber: accountNumber || null,
        bankName: bankName || null,
        branch: branch || null,
        ifscCode: ifscCode || null,
        accountType: accountType || 'Current',
        openingBalance: ob,
        currentBalance: ob,
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    console.error('POST /api/bank-accounts error:', error)
    return NextResponse.json({ error: 'Failed to create bank account' }, { status: 500 })
  }
}

// ─── PATCH: Update bank account ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, accountName, accountNumber, bankName, branch, ifscCode, accountType, status } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const updateData: any = { updatedAt: new Date().toISOString() }
    if (accountName !== undefined) updateData.accountName = accountName
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber || null
    if (bankName !== undefined) updateData.bankName = bankName || null
    if (branch !== undefined) updateData.branch = branch || null
    if (ifscCode !== undefined) updateData.ifscCode = ifscCode || null
    if (accountType !== undefined) updateData.accountType = accountType
    if (status !== undefined) updateData.status = status

    const { data: account, error } = await supabase
      .from('BankAccount')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(account)
  } catch (error) {
    console.error('PATCH /api/bank-accounts error:', error)
    return NextResponse.json({ error: 'Failed to update bank account' }, { status: 500 })
  }
}
