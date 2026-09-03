import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { postJournal, postCashbookRow, nextVoucherNo, GL } from '@/lib/gl'

/**
 * EXPENSE VOUCHERS — Phase A.
 *
 * POST body:
 *   expenseDate, category (Rent/Salary/Freight Outward/Packing/Petty/…),
 *   description, amount (total), gstAmount?,
 *   directType: 'DIRECT' (order-linked: freight-out, packing…) | 'INDIRECT',
 *   salesOrderId?, styleNo?, styleName?  (for DIRECT),
 *   paidFromType: 'BANK' | 'CASH', bankAccountId?, referenceNo?, notes?,
 *   isRecurring?, recurrence? ('MONTHLY' | 'QUARTERLY')
 *
 * Auto-effects: ExpenseVoucher row + journal
 *   Dr Direct/Indirect Expenses (amount)  [+ Dr ITC if gstAmount]
 *   Cr Bank/Cash (total paid)
 * + cash-book Transaction row.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const directType = searchParams.get('directType')

    let query = supabase
      .from('ExpenseVoucher')
      .select('*')
      .order('expenseDate', { ascending: false })
      .limit(200)
    if (directType) query = query.eq('directType', directType)

    const { data: vouchers, error } = await query
    if (error) throw error
    const list = vouchers || []

    const total = list.reduce((s: number, v: any) => s + (v.amount || 0), 0)
    const direct = list.filter((v: any) => v.directType === 'DIRECT').reduce((s: number, v: any) => s + (v.amount || 0), 0)
    const indirect = total - direct
    const byCategory: Record<string, number> = {}
    for (const v of list) byCategory[v.category] = (byCategory[v.category] || 0) + (v.amount || 0)

    // Order-linked (DIRECT) totals per salesOrderId — feeds product P&L later
    const byOrder: Record<string, { styleNo?: string; total: number }> = {}
    for (const v of list) {
      if (v.directType === 'DIRECT' && v.salesOrderId) {
        const cur = byOrder[v.salesOrderId] || { styleNo: v.styleNo || undefined, total: 0 }
        cur.total += v.amount || 0
        byOrder[v.salesOrderId] = cur
      }
    }

    // Recurring suggestions: last 3 months' recurring vouchers not yet entered this month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const recurringAll = list.filter((v: any) => v.isRecurring)
    const thisMonthKeys = new Set(
      recurringAll
        .filter((v: any) => new Date(v.expenseDate) >= new Date(monthStart))
        .map((v: any) => `${v.category}|${v.amount}`)
    )
    const suggestions = recurringAll
      .filter((v: any) => {
        const d = new Date(v.expenseDate)
        return d < new Date(monthStart) && !thisMonthKeys.has(`${v.category}|${v.amount}`)
      })
      .slice(0, 10)

    return NextResponse.json({
      vouchers: list,
      summary: {
        count: list.length,
        total: round2(total),
        direct: round2(direct),
        indirect: round2(indirect),
        byCategory,
        byOrder,
      },
      recurringSuggestions: suggestions.map((v: any) => ({
        id: v.id, voucherNo: v.voucherNo, category: v.category, description: v.description,
        amount: v.amount, recurrence: v.recurrence, paidFromType: v.paidFromType,
      })),
    })
  } catch (error: any) {
    console.error('GET /api/expenses error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load expenses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      expenseDate, category, description, amount, gstAmount,
      directType, salesOrderId, styleNo, styleName,
      paidFromType, bankAccountId, referenceNo, notes,
      isRecurring, recurrence,
    } = body

    if (!category || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'category and amount (> 0) are required' }, { status: 400 })
    }
    const amt = Number(amount)
    const gst = Number(gstAmount) || 0
    const fromType = paidFromType === 'CASH' ? 'CASH' : 'BANK'
    const dt = directType === 'DIRECT' ? 'DIRECT' : 'INDIRECT'
    if (fromType === 'BANK' && !bankAccountId) {
      return NextResponse.json({ error: 'bankAccountId is required for BANK expenses' }, { status: 400 })
    }

    const when = expenseDate ? new Date(expenseDate).toISOString() : new Date().toISOString()
    const voucherNo = await nextVoucherNo(new Date(when))
    const now = new Date().toISOString()

    // Journal: Dr expense (+ Dr ITC if GST) / Cr Bank|Cash
    const journal = await postJournal({
      entryDate: when,
      description: `${category} expense ${voucherNo}${styleNo ? ` (${styleNo})` : ''}`,
      sourceType: 'EXPENSE',
      sourceId: voucherNo,
      lines: [
        { glAccountCode: dt === 'DIRECT' ? GL.DIRECT_EXPENSE : GL.INDIRECT_EXPENSE, debit: round2(amt - gst), memo: `${category}${description ? ' — ' + description : ''}` },
        ...(gst > 0 ? [{ glAccountCode: GL.ITC, debit: round2(gst), partyType: 'GOVT', partyName: 'GST Department', memo: 'GST on expense (ITC)' }] : []),
        { glAccountCode: fromType === 'CASH' ? GL.CASH : GL.BANK, credit: round2(amt), memo: `${fromType} ${referenceNo || ''}`.trim() },
      ],
    })

    const cashbook = await postCashbookRow({
      type: 'Debit',
      category: `${category}${dt === 'DIRECT' ? ' (Direct)' : ''}`,
      amount: amt,
      description: `${description || category}${styleNo ? ` — ${styleNo}` : ''} — ${voucherNo}`,
      referenceNo: referenceNo || voucherNo,
      date: when,
      bankAccountId: fromType === 'BANK' ? bankAccountId : null,
      sourceType: 'EXPENSE',
      sourceId: voucherNo,
      journalEntryId: journal.id,
    })

    const { data: voucher, error } = await supabase
      .from('ExpenseVoucher')
      .insert({
        voucherNo,
        expenseDate: when,
        category,
        description: description || null,
        amount: round2(amt),
        gstAmount: round2(gst),
        directType: dt,
        salesOrderId: salesOrderId || null,
        styleNo: styleNo || null,
        styleName: styleName || null,
        paidFromType: fromType,
        bankAccountId: fromType === 'BANK' ? bankAccountId : null,
        referenceNo: referenceNo || null,
        isRecurring: !!isRecurring,
        recurrence: isRecurring ? (recurrence || 'MONTHLY') : null,
        journalEntryId: journal.id,
        notes: notes || null,
        createdAt: now, updatedAt: now,
      })
      .select()
      .single()
    if (error) throw new Error(`ExpenseVoucher insert failed: ${error.message}`)

    return NextResponse.json({
      voucher,
      journal: { id: journal.id, entryNo: journal.entryNo },
      cashbookPosted: true,
    }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/expenses error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to record expense' }, { status: 500 })
  }
}
