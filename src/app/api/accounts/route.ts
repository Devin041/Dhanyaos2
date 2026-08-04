import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List transactions with filtering, search, pagination, and summary ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')?.trim()
    const category = searchParams.get('category')?.trim()
    const search = searchParams.get('search')?.trim()
    const from = searchParams.get('from')?.trim()
    const to = searchParams.get('to')?.trim()
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Build query
    let query = supabase.from('Transaction').select('*', { count: 'exact' })
    let countQ = supabase.from('Transaction').select('*', { count: 'exact', head: true })

    if (type && (type === 'Credit' || type === 'Debit')) {
      query = query.eq('type', type)
      countQ = countQ.eq('type', type)
    }
    if (category) {
      query = query.eq('category', category)
      countQ = countQ.eq('category', category)
    }
    if (search) {
      query = query.or(`description.ilike.%${search}%,referenceNo.ilike.%${search}%`)
      countQ = countQ.or(`description.ilike.%${search}%,referenceNo.ilike.%${search}%`)
    }
    if (from) {
      const fromDate = new Date(from).toISOString()
      query = query.gte('date', fromDate)
      countQ = countQ.gte('date', fromDate)
    }
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      const toDateStr = toDate.toISOString()
      query = query.lte('date', toDateStr)
      countQ = countQ.lte('date', toDateStr)
    }

    const skip = (page - 1) * limit
    query = query.order('date', { ascending: false }).range(skip, skip + limit - 1)

    const [transactionsRes, totalRes, creditRes, debitRes, monthCreditRes, monthDebitRes, categoryRes] = await Promise.all([
      query,
      countQ,
      supabase.from('Transaction').select('amount').eq('type', 'Credit'),
      supabase.from('Transaction').select('amount').eq('type', 'Debit'),
      supabase.from('Transaction').select('amount').eq('type', 'Credit').gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).lte('date', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999).toISOString()),
      supabase.from('Transaction').select('amount').eq('type', 'Debit').gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).lte('date', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999).toISOString()),
      supabase.from('Transaction').select('category'),
    ])

    if (transactionsRes.error) throw transactionsRes.error
    if (totalRes.error) throw totalRes.error

    const transactions = transactionsRes.data || []
    const total = totalRes.count ?? 0

    // Summary calculations in JS
    const creditRows = creditRes.data || []
    const debitRows = debitRes.data || []
    const monthCreditRows = monthCreditRes.data || []
    const monthDebitRows = monthDebitRes.data || []
    const allRows = categoryRes.data || []

    const totalCredits = Math.round(creditRows.reduce((s: number, t: any) => s + (t.amount || 0), 0))
    const totalDebits = Math.round(debitRows.reduce((s: number, t: any) => s + (t.amount || 0), 0))
    const thisMonthCredits = Math.round(monthCreditRows.reduce((s: number, t: any) => s + (t.amount || 0), 0))
    const thisMonthDebits = Math.round(monthDebitRows.reduce((s: number, t: any) => s + (t.amount || 0), 0))

    const uniqueCategories = [...new Set(allRows.map((t: any) => t.category).filter(Boolean))].sort()

    return NextResponse.json({
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description,
        referenceNo: t.referenceNo,
        date: t.date,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      summary: {
        totalCredits,
        totalDebits,
        netCashFlow: totalCredits - totalDebits,
        thisMonthCredits,
        thisMonthDebits,
        uniqueCategories,
      },
    })
  } catch (error) {
    console.error('Accounts API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load transactions' },
      { status: 500 }
    )
  }
}

// ─── POST: Create a new transaction ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, category, amount, description, referenceNo, date } = body

    if (!type || (type !== 'Credit' && type !== 'Debit')) {
      return NextResponse.json(
        { error: 'type must be Credit or Debit' },
        { status: 400 }
      )
    }

    if (!category || !category.trim()) {
      return NextResponse.json(
        { error: 'category is required' },
        { status: 400 }
      )
    }

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive number' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const { data: transaction, error } = await supabase
      .from('Transaction')
      .insert({
        type,
        category: category.trim(),
        amount: parseFloat(amount),
        description: description?.trim() || '',
        referenceNo: referenceNo?.trim() || null,
        date: date ? new Date(date).toISOString() : now,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      {
        id: transaction.id,
        type: transaction.type,
        category: transaction.category,
        amount: transaction.amount,
        description: transaction.description,
        referenceNo: transaction.referenceNo,
        date: transaction.date,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Accounts API POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    )
  }
}
