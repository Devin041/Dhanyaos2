import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { postJournal, postCashbookRow, reverseJournal, GL } from '@/lib/gl'

/**
 * PATCH /api/cheques/[id] — cheque lifecycle:
 *   { action: 'deposit', bankAccountId? }        In Hand → Deposited
 *   { action: 'clear' }                          Deposited|In Hand → Cleared (+ JE + cashbook)
 *   { action: 'bounce', reason? }                Deposited|In Hand → Bounced (+ reversal JE
 *                                                + invoice/PO/bill paidAmount rollback)
 *
 * Accounting model:
 *   RECEIVED cheque: payment booked Dr Cheques-in-Hand / Cr Receivable at receipt;
 *   on clear → Dr Bank / Cr Cheques-in-Hand (+ cashbook Credit).
 *   On bounce → reverse BOTH entries (receivable restored).
 *   ISSUED cheque: payment booked Dr Payable / Cr Cheques-Issued at issue;
 *   on clear → Dr Cheques-Issued / Cr Bank (+ cashbook Debit).
 *   On bounce → reverse BOTH (payable restored).
 */

const round2 = (n: number) => Math.round(n * 100) / 100

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, reason, bankAccountId } = body

    const { data: cheque, error } = await supabase.from('Cheque').select('*').eq('id', id).single()
    if (error || !cheque) return NextResponse.json({ error: 'Cheque not found' }, { status: 404 })
    const now = new Date().toISOString()

    // ─── DEPOSIT ───
    if (action === 'deposit') {
      if (cheque.status !== 'In Hand') {
        return NextResponse.json({ error: `Cannot deposit a cheque in status '${cheque.status}'` }, { status: 400 })
      }
      const { data: updated } = await supabase
        .from('Cheque')
        .update({ status: 'Deposited', depositDate: now, bankAccountId: bankAccountId || cheque.bankAccountId, updatedAt: now })
        .eq('id', id)
        .select()
        .single()
      return NextResponse.json({ cheque: updated })
    }

    // ─── CLEAR ───
    if (action === 'clear') {
      if (cheque.status !== 'Deposited' && cheque.status !== 'In Hand') {
        return NextResponse.json({ error: `Cannot clear a cheque in status '${cheque.status}'` }, { status: 400 })
      }
      const bankCode = GL.BANK
      const journal = await postJournal({
        entryDate: now,
        description: `Cheque ${cheque.chequeNo} cleared — ${cheque.partyName || ''}`,
        sourceType: 'CHEQUE_CLEAR',
        sourceId: cheque.id,
        lines: cheque.direction === 'RECEIVED'
          ? [
              { glAccountCode: bankCode, debit: round2(cheque.amount), memo: `Cheque ${cheque.chequeNo} realised` },
              { glAccountCode: GL.CHEQUES_IN_HAND, credit: round2(cheque.amount), partyType: cheque.partyType, partyId: cheque.partyId, partyName: cheque.partyName, memo: 'Cheque in hand converted to bank' },
            ]
          : [
              { glAccountCode: GL.CHEQUES_ISSUED, debit: round2(cheque.amount), partyType: cheque.partyType, partyId: cheque.partyId, partyName: cheque.partyName, memo: 'Issued cheque presented' },
              { glAccountCode: bankCode, credit: round2(cheque.amount), memo: `Cheque ${cheque.chequeNo} debited from bank` },
            ],
      })

      await postCashbookRow({
        type: cheque.direction === 'RECEIVED' ? 'Credit' : 'Debit',
        category: cheque.direction === 'RECEIVED' ? 'Cheque Cleared (In)' : 'Cheque Cleared (Out)',
        amount: cheque.amount,
        description: `Cheque ${cheque.chequeNo} — ${cheque.partyName || ''}`,
        referenceNo: cheque.chequeNo,
        date: now,
        bankAccountId: cheque.bankAccountId,
        sourceType: 'CHEQUE_CLEAR',
        sourceId: cheque.id,
        journalEntryId: journal.id,
      })

      const { data: updated } = await supabase
        .from('Cheque')
        .update({ status: 'Cleared', clearanceDate: now, clearJournalEntryId: journal.id, updatedAt: now })
        .eq('id', id)
        .select()
        .single()
      return NextResponse.json({ cheque: updated, journal: { id: journal.id, entryNo: journal.entryNo } })
    }

    // ─── BOUNCE ───
    if (action === 'bounce') {
      if (cheque.status === 'Bounced') {
        return NextResponse.json({ error: 'Cheque is already marked bounced' }, { status: 400 })
      }
      if (cheque.status === 'Cleared') {
        return NextResponse.json({ error: 'Cannot bounce an already-cleared cheque (requires a manual contra entry)' }, { status: 400 })
      }

      // 1. Reverse the ORIGINAL payment journal (restores receivable/payable)
      let reversal: any = null
      if (cheque.journalEntryId) {
        reversal = await reverseJournal(cheque.journalEntryId, {
          date: now,
          description: `Cheque ${cheque.chequeNo} BOUNCED — ${reason || 'payment dishonoured'}`,
          sourceType: 'CHEQUE_BOUNCE',
          sourceId: cheque.id,
        })
      }

      // 2. Roll back the business document
      const warnings: string[] = []

      // RECEIVED cheque → Payment row + Invoice paidAmount rollback
      if (cheque.direction === 'RECEIVED' && cheque.paymentId) {
        const { data: payment } = await supabase.from('Payment').select('*').eq('id', cheque.paymentId).single()
        if (payment) {
          await supabase.from('Payment').update({ status: 'Bounced' }).eq('id', payment.id)
          const { data: invoice } = await supabase
            .from('Invoice')
            .select('id, invoiceNo, totalAmount, paidAmount, writeOffAmount, paymentStatus')
            .eq('id', payment.invoiceId)
            .single()
          if (invoice) {
            const newPaid = Math.max(0, (invoice.paidAmount || 0) - (payment.amount || 0))
            const newStatus = newPaid + (invoice.writeOffAmount || 0) >= (invoice.totalAmount || 0) - 0.01
              ? 'Paid'
              : newPaid > 0 ? 'Partial' : 'Unpaid'
            await supabase
              .from('Invoice')
              .update({ paidAmount: round2(newPaid), paymentStatus: newStatus })
              .eq('id', invoice.id)
            warnings.push(`Invoice ${invoice.invoiceNo} paidAmount rolled back to ₹${round2(newPaid).toLocaleString('en-IN')} (${newStatus})`)
          }
        }
      }

      // ISSUED cheque → PaymentOut row + PO/VendorBill paidAmount rollback
      if (cheque.direction === 'ISSUED' && cheque.paymentOutId) {
        const { data: payout } = await supabase.from('PaymentOut').select('*').eq('id', cheque.paymentOutId).single()
        if (payout) {
          await supabase.from('PaymentOut').update({ status: 'Bounced', updatedAt: now }).eq('id', payout.id)
          if (payout.poId) {
            const { data: po } = await supabase
              .from('PurchaseOrder')
              .select('id, poNumber, totalAmount, paidAmount, paymentStatus')
              .eq('id', payout.poId)
              .single()
            if (po) {
              const newPaid = Math.max(0, (po.paidAmount || 0) - (payout.amount || 0))
              const newStatus = newPaid <= 0.01 ? 'Unpaid' : 'Partial'
              await supabase.from('PurchaseOrder').update({ paidAmount: round2(newPaid), paymentStatus: newStatus, updatedAt: now }).eq('id', po.id)
              warnings.push(`PO ${po.poNumber} paidAmount rolled back to ₹${round2(newPaid).toLocaleString('en-IN')} (${newStatus})`)
            }
          }
          if (payout.vendorBillId) {
            const { data: bill } = await supabase
              .from('VendorBill')
              .select('id, billNo, totalAmount, paidAmount, status')
              .eq('id', payout.vendorBillId)
              .single()
            if (bill) {
              const newPaid = Math.max(0, (bill.paidAmount || 0) - (payout.amount || 0))
              const newStatus = newPaid <= 0.01 ? 'Pending' : 'Partial'
              await supabase.from('VendorBill').update({ paidAmount: round2(newPaid), status: newStatus, updatedAt: now }).eq('id', bill.id)
              warnings.push(`Bill ${bill.billNo} paidAmount rolled back to ₹${round2(newPaid).toLocaleString('en-IN')} (${newStatus})`)
            }
          }
        }
      }

      const { data: updated } = await supabase
        .from('Cheque')
        .update({
          status: 'Bounced',
          bounceDate: now,
          bounceReason: reason || 'Payment dishonoured by bank',
          bounceJournalEntryId: reversal ? reversal.id : null,
          updatedAt: now,
        })
        .eq('id', id)
        .select()
        .single()

      return NextResponse.json({
        cheque: updated,
        reversal: reversal ? { id: reversal.id, entryNo: reversal.entryNo } : null,
        warnings: warnings.length ? warnings : undefined,
      })
    }

    return NextResponse.json({ error: 'action must be deposit | clear | bounce' }, { status: 400 })
  } catch (error: any) {
    console.error('PATCH /api/cheques/[id] error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update cheque' }, { status: 500 })
  }
}
