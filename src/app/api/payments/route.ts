import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { format } from 'date-fns'
import { postJournal, postCashbookRow, GL } from '@/lib/gl'

// ─── GET: List payments ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('invoiceId')

    let query = supabase
      .from('Payment')
      .select('*, invoice:invoiceId(id, invoiceNo, totalAmount, paidAmount, paymentStatus)')
      .order('paymentDate', { ascending: false })

    if (invoiceId) query = query.eq('invoiceId', invoiceId)

    const { data: payments, error } = await query
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ payments: [], summary: { totalPayments: 0, totalCollected: 0 } })
      }
      throw error
    }

    const all = payments || []
    const totalCollected = all.reduce((s: number, p: any) => s + (p.amount || 0), 0)

    return NextResponse.json({
      payments: all,
      summary: {
        totalPayments: all.length,
        totalCollected: Math.round(totalCollected),
      },
    })
  } catch (error) {
    console.error('GET /api/payments error:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

// ─── POST: Record a payment against an invoice ──────────────────────────────
// Phase A: every payment now AUTO-POSTS to the double-entry GL + cash book,
// supports cheque receipts (in-hand → clear/bounce lifecycle), TDS deducted by
// the customer, and short-payment adjustment (write-off with reason).
//
// Body: { invoiceId, amount, paymentMode, referenceNo, notes,
//         bankAccountId?, tdsAmount?, tdsSection?,
//         adjustmentAmount?, adjustmentNote?   // short-payment write-off
//         cheque?: { chequeNo, bankName, issueDate }  // when paymentMode=Cheque }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      invoiceId, amount, paymentMode, referenceNo, notes,
      bankAccountId, tdsAmount, tdsSection,
      adjustmentAmount, adjustmentNote, cheque,
    } = body

    if (!invoiceId || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'invoiceId and amount (> 0) are required' }, { status: 400 })
    }
    const amt = Number(amount)
    const tds = Number(tdsAmount) || 0
    const adj = Number(adjustmentAmount) || 0
    const mode = paymentMode || 'Cash'
    if (mode === 'Cheque' && (!cheque || !cheque.chequeNo)) {
      return NextResponse.json({ error: 'cheque.chequeNo is required for Cheque mode' }, { status: 400 })
    }
    if (mode !== 'Cash' && mode !== 'Cheque' && !bankAccountId) {
      return NextResponse.json({ error: 'bankAccountId is required for bank payment modes' }, { status: 400 })
    }
    if (tds < 0 || tds >= amt) {
      return NextResponse.json({ error: 'TDS must be ≥ 0 and less than the payment amount' }, { status: 400 })
    }
    if (adj < 0) {
      return NextResponse.json({ error: 'adjustmentAmount cannot be negative' }, { status: 400 })
    }

    // Fetch invoice to verify and update
    const { data: invoice, error: invErr } = await supabase
      .from('Invoice')
      .select('id, invoiceNo, customerId, customerName, totalAmount, paidAmount, writeOffAmount, paymentStatus')
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    const inv = invoice as any

    const newPaidAmount = (inv.paidAmount || 0) + amt
    const newWriteOff = (inv.writeOffAmount || 0) + adj
    const settled = newPaidAmount + newWriteOff >= inv.totalAmount - 0.01
    const newStatus = settled ? 'Paid' : 'Partial'

    // Auto-generate payment number: PAY-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const prefix = `PAY-${today}-`
    const { data: lastPayments } = await supabase
      .from('Payment')
      .select('paymentNo')
      .ilike('paymentNo', `${prefix}%`)
      .order('paymentNo', { ascending: false })
      .limit(1)
    let seq = 1
    if (lastPayments && lastPayments.length > 0) {
      const lastSeq = parseInt(lastPayments[0].paymentNo.slice(prefix.length), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const paymentNo = `${prefix}${String(seq).padStart(3, '0')}`

    const now = new Date().toISOString()
    const netReceived = Math.round((amt - tds) * 100) / 100

    // ── 1. Double-entry journal (F1 fix — money event hits the GL) ──
    // Non-cheque: Dr Bank/Cash (net) / Cr Receivable (gross)
    //   (+ Dr TDS Receivable→Suspense if customer deducted TDS)
    //   (+ Dr Sales Discount for short-payment write-off)
    // Cheque: Dr Cheques in Hand (net) instead of Bank; realises on clearance.
    let journal: any = null
    let glPosted = false
    try {
      const creditCode = mode === 'Cheque' ? GL.CHEQUES_IN_HAND : (mode === 'Cash' ? GL.CASH : GL.BANK)
      journal = await postJournal({
        entryDate: now,
        description: `Customer payment ${paymentNo} — ${inv.customerName || inv.invoiceNo}${tds > 0 ? ` (TDS ${tdsSection || ''} ₹${tds})` : ''}`,
        sourceType: 'PAYMENT_IN',
        sourceId: paymentNo,
        lines: [
          { glAccountCode: creditCode, debit: netReceived, memo: `${mode} ${referenceNo || ''}`.trim() },
          ...(tds > 0 ? [{ glAccountCode: GL.SUSPENSE, debit: Math.round(tds * 100) / 100, partyType: 'GOVT', partyName: `TDS deducted by ${inv.customerName || 'customer'}`, memo: `TDS ${tdsSection || ''} — to claim in return` }] : []),
          ...(adj > 0 ? [{ glAccountCode: GL.SALES, debit: Math.round(adj * 100) / 100, memo: adjustmentNote || 'Short-payment write-off' }] : []),
          { glAccountCode: GL.RECEIVABLE, credit: Math.round(amt * 100) / 100, partyType: 'CUSTOMER', partyId: inv.customerId, partyName: inv.customerName, memo: `Against ${inv.invoiceNo}` },
        ],
      })
      glPosted = true
    } catch (e: any) {
      console.warn('GL posting skipped (pre-migration?):', e?.message)
    }

    // ── 2. Cash-book row (Transaction) — only non-cheque (cheque hits on clear) ──
    let cashbook: any = null
    if (glPosted && mode !== 'Cheque') {
      try {
        cashbook = await postCashbookRow({
          type: 'Credit',
          category: 'Customer Payment',
          amount: netReceived,
          description: `${inv.customerName || 'Customer'} — ${inv.invoiceNo} — ${paymentNo}`,
          referenceNo: referenceNo || paymentNo,
          date: now,
          bankAccountId: mode === 'Cash' ? null : bankAccountId,
          sourceType: 'PAYMENT_IN',
          sourceId: paymentNo,
          journalEntryId: journal?.id,
        })
      } catch (e: any) {
        console.warn('Cashbook posting skipped:', e?.message)
      }
    }

    // ── 3. Payment row (GL linkage columns are nullable pre-migration) ──
    const insertPayload: Record<string, any> = {
      paymentNo,
      invoiceId,
      amount: amt,
      paymentDate: now,
      paymentMode: mode,
      referenceNo: referenceNo || null,
      notes: notes || null,
    }
    // Optional columns (exist after PHASE-A-MIGRATION.sql — pre-migration the
    // insert retries without them, incl. status)
    const optional: Record<string, any> = {
      status: 'Completed',
      bankAccountId: mode === 'Cash' ? null : (bankAccountId || null),
      journalEntryId: journal?.id || null,
      tdsAmount: tds,
      tdsSection: tdsSection || null,
      adjustmentAmount: adj,
      adjustmentNote: adjustmentNote || null,
    }
    for (const [k, v] of Object.entries(optional)) {
      insertPayload[k] = v
    }
    // Progressive column stripping (PGRST204-aware): Supabase tells us the
    // EXACT missing column ("Could not find the 'tdsSection' column of ...") —
    // strip just that key and retry, so all existing optional columns
    // (status/journalEntryId/tdsAmount/…) still persist. Falls back to
    // legacy all-strip if the column name can't be parsed.
    const colFromMsg = (msg: string): string | null => {
      const m1 = msg.match(/find the ['"](\w+)['"] column/i)          // PGRST204
      if (m1) return m1[1]
      const m2 = msg.match(/column ["']?\w+\.(\w+)["']?/i)          // PG native
      if (m2) return m2[1]
      const m3 = msg.match(/column ["'](\w+)["'] (?:of|does not exist)/i) // legacy
      return m3 ? m3[1] : null
    }
    let paymentRow: any
    let strippedColumns: string[] = []
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data: p, error: e } = await supabase.from('Payment').insert(insertPayload).select().single()
      if (!e) { paymentRow = p; break }
      const msg = String(e.message || '')
      if (/does not exist|Could not find the|PGRST204/i.test(msg)) {
        const bad = colFromMsg(msg)
        if (bad && bad in insertPayload) {
          strippedColumns.push(bad)
          delete insertPayload[bad]
          continue
        }
        // Unparseable → strip all optional columns (legacy behaviour)
        strippedColumns.push(...Object.keys(optional).filter(k => k in insertPayload))
        for (const k of Object.keys(optional)) delete insertPayload[k]
        const { data: p2, error: e2 } = await supabase.from('Payment').insert(insertPayload).select().single()
        if (e2) throw e2
        paymentRow = p2
        break
      }
      throw e
    }
    if (!paymentRow) throw new Error('Payment insert failed after retries')
    if (strippedColumns.length > 0) {
      console.warn('Payment saved without columns (DB migration pending):', strippedColumns.join(', '))
    }

    // ── 4. Cheque register row ──
    let chequeRow: any = null
    if (mode === 'Cheque') {
      try {
        const { data: cq, error: cqErr } = await supabase
          .from('Cheque')
          .insert({
            chequeNo: cheque.chequeNo,
            direction: 'RECEIVED',
            partyType: 'CUSTOMER', partyId: inv.customerId, partyName: inv.customerName,
            amount: netReceived,
            issueDate: cheque.issueDate || now,
            bankName: cheque.bankName || null,
            status: 'In Hand',
            bankAccountId: bankAccountId || null,
            paymentId: paymentRow.id,
            journalEntryId: journal?.id || null,
            notes: `Payment ${paymentNo} — ${inv.invoiceNo}`,
            createdAt: now, updatedAt: now,
          })
          .select()
          .single()
        if (cqErr) console.warn('Cheque row skipped (pre-migration):', cqErr.message)
        else {
          chequeRow = cq
          await supabase.from('Payment').update({ chequeId: cq.id }).eq('id', paymentRow.id)
        }
      } catch (e: any) {
        console.warn('Cheque insert skipped:', e?.message)
      }
    }

    // ── 5. Invoice update (paidAmount + writeOff + status) ──
    const invUpdate: Record<string, any> = {
      paidAmount: Math.round(newPaidAmount * 100) / 100,
      paymentStatus: newStatus,
    }
    if (adj > 0) {
      invUpdate.writeOffAmount = Math.round(newWriteOff * 100) / 100
      invUpdate.writeOffReason = adjustmentNote || 'Short-payment adjustment'
    }
    await supabase.from('Invoice').update(invUpdate).eq('id', invoiceId)

    return NextResponse.json({
      ...paymentRow,
      cheque: chequeRow,
      glPosted,
      cashbookPosted: !!cashbook,
      journal: journal ? { id: journal.id, entryNo: journal.entryNo } : null,
      invoiceUpdated: {
        paidAmount: invUpdate.paidAmount,
        writeOffAmount: invUpdate.writeOffAmount ?? inv.writeOffAmount,
        paymentStatus: newStatus,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/payments error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
