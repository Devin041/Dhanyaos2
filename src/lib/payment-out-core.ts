import { supabase } from './supabase-db'
import { postJournal, postCashbookRow, nextPaymentOutNo, GL } from './gl'

/**
 * Shared PaymentOut engine — used by /api/payment-out (universal) and
 * /api/vendor-payments (legacy-compatible wrapper for vendor bill payments).
 *
 * Creates: PaymentOut row + balanced journal (+ TDS line) + cash-book row
 * (non-cheque) + optional Cheque register row, and updates the linked
 * PurchaseOrder / VendorBill paidAmount + status.
 *
 * Throws Error with a user-friendly message on validation failures.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

const PAYABLE_CODE: Record<string, string> = {
  SUPPLIER: GL.PAYABLE,
  VENDOR_BILL: GL.VENDOR_BILL_PAYABLE,
  BROKER: GL.BROKER_PAYABLE,
  GOVT_GST: GL.GST_OUT,
  OTHER: GL.SUSPENSE,
}

export interface PaymentOutBody {
  payeeType: string
  payeeId?: string | null
  payeeName?: string | null
  poId?: string | null
  vendorBillId?: string | null
  costSheetId?: string | null
  amount: number
  tdsAmount?: number
  tdsSection?: string | null
  paymentDate?: string
  paymentMode?: string
  bankAccountId?: string | null
  referenceNo?: string | null
  notes?: string | null
  cheque?: { chequeNo: string; bankName?: string; issueDate?: string } | null
}

export async function createPaymentOutRecord(body: PaymentOutBody) {
  const {
    payeeType, payeeId, payeeName,
    poId, vendorBillId, costSheetId,
    amount, tdsAmount, tdsSection,
    paymentDate, paymentMode, bankAccountId,
    referenceNo, notes, cheque,
  } = body

  // ── Validation ──
  if (!payeeType || !PAYABLE_CODE[payeeType]) {
    throw new Error('payeeType must be SUPPLIER | VENDOR_BILL | BROKER | GOVT_GST | OTHER')
  }
  const gross = Number(amount)
  if (!gross || gross <= 0) throw new Error('amount must be > 0')
  const tds = Number(tdsAmount) || 0
  if (tds < 0 || tds >= gross) throw new Error('TDS must be ≥ 0 and less than the gross amount')
  const net = round2(gross - tds)
  const mode = paymentMode || 'NEFT'
  if (mode !== 'Cash' && !bankAccountId && mode !== 'Cheque') {
    throw new Error('bankAccountId is required for non-cash payments')
  }
  if (mode === 'Cheque' && (!cheque || !cheque.chequeNo)) {
    throw new Error('cheque.chequeNo is required for Cheque mode')
  }

  // Payee resolution + due validation
  let partyType: string = 'OTHER'
  let resolvedName = payeeName || ''
  const payableCode = PAYABLE_CODE[payeeType]
  let po: any = null
  let bill: any = null

  if (payeeType === 'SUPPLIER') {
    if (!poId) throw new Error('poId is required for SUPPLIER payments')
    const { data, error } = await supabase.from('PurchaseOrder').select('*').eq('id', poId).single()
    if (error || !data) throw new Error('Purchase order not found')
    po = data
    const remaining = (po.totalAmount || 0) - (po.paidAmount || 0)
    if (gross > remaining + 0.01) {
      throw new Error(`Payment ₹${gross.toLocaleString('en-IN')} exceeds PO balance ₹${remaining.toLocaleString('en-IN')}`)
    }
    partyType = 'SUPPLIER'
    resolvedName = resolvedName || po.poNumber
    if (po.supplierId) {
      const { data: sup } = await supabase.from('Supplier').select('id, name').eq('id', po.supplierId).single()
      if (sup) resolvedName = resolvedName === po.poNumber ? sup.name : (resolvedName || sup.name)
    }
  }

  if (payeeType === 'VENDOR_BILL') {
    if (!vendorBillId) throw new Error('vendorBillId is required for VENDOR_BILL payments')
    const { data, error } = await supabase.from('VendorBill').select('*').eq('id', vendorBillId).single()
    if (error || !data) throw new Error('Vendor bill not found')
    bill = data
    if (bill.status === 'Cancelled') throw new Error('Cannot pay a cancelled bill')
    const remaining = (bill.totalAmount || 0) - (bill.paidAmount || 0)
    if (gross > remaining + 0.01) {
      throw new Error(`Payment ₹${gross.toLocaleString('en-IN')} exceeds bill balance ₹${remaining.toLocaleString('en-IN')}`)
    }
    partyType = 'VENDOR'
    resolvedName = resolvedName || bill.billNo
    if (bill.vendorId) {
      const { data: v } = await supabase.from('Vendor').select('id, vendorName').eq('id', bill.vendorId).single()
      if (v) resolvedName = resolvedName === bill.billNo ? v.vendorName : (resolvedName || v.vendorName)
    }
  }

  if (payeeType === 'BROKER') {
    partyType = 'BROKER'
    resolvedName = resolvedName || 'Broker'
    if (costSheetId) {
      const { data: cs } = await supabase.from('CostSheet').select('id, sheetNo, brokerCommissionAmount').eq('id', costSheetId).single()
      if (cs) resolvedName = resolvedName === 'Broker' ? `Broker (${cs.sheetNo})` : resolvedName
    }
  }

  const when = paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()
  const paymentNo = await nextPaymentOutNo(new Date(when))
  const now = new Date().toISOString()

  // ── 1. Double-entry journal ──
  const creditCode = mode === 'Cheque' ? GL.CHEQUES_ISSUED : (mode === 'Cash' ? GL.CASH : GL.BANK)
  const journal = await postJournal({
    entryDate: when,
    description: `${payeeType.replace('_', ' ')} payment ${paymentNo} — ${resolvedName}${tds > 0 ? ` (TDS ${tdsSection || ''} ₹${tds})` : ''}`,
    sourceType: 'PAYMENT_OUT',
    sourceId: paymentNo,
    lines: [
      {
        glAccountCode: payableCode, debit: round2(gross), partyType,
        partyId: payeeId || (po ? po.supplierId : null) || (bill ? bill.vendorId : null),
        partyName: resolvedName,
        memo: `${payeeType === 'SUPPLIER' ? po?.poNumber : payeeType === 'VENDOR_BILL' ? bill?.billNo : payeeType} payment`,
      },
      { glAccountCode: creditCode, credit: net, memo: mode === 'Cheque' ? `Cheque ${cheque!.chequeNo} issued` : `${mode} ${referenceNo || ''}`.trim() },
      ...(tds > 0 ? [{ glAccountCode: GL.TDS_PAYABLE, credit: round2(tds), partyType: 'GOVT', partyName: 'TDS — Govt', memo: `TDS ${tdsSection || ''} deducted at source` }] : []),
    ],
  })

  // ── 2. Cash-book row (Transaction) — non-cheque modes only ──
  let cashbook: any = null
  if (mode !== 'Cheque') {
    cashbook = await postCashbookRow({
      type: 'Debit',
      category: payeeType === 'SUPPLIER' ? 'Supplier Payment'
        : payeeType === 'VENDOR_BILL' ? 'Vendor Bill Payment'
        : payeeType === 'BROKER' ? 'Broker Commission'
        : payeeType === 'GOVT_GST' ? 'GST Payment'
        : 'Payment Out',
      amount: net,
      description: `${resolvedName} — ${paymentNo}`,
      referenceNo: referenceNo || paymentNo,
      date: when,
      bankAccountId: mode === 'Cash' ? null : bankAccountId,
      sourceType: 'PAYMENT_OUT',
      sourceId: paymentNo,
      journalEntryId: journal.id,
    })
  }

  // ── 3. Cheque register row ──
  let chequeRow: any = null
  if (mode === 'Cheque') {
    const { data: cq, error: cqErr } = await supabase
      .from('Cheque')
      .insert({
        chequeNo: cheque!.chequeNo,
        direction: 'ISSUED',
        partyType, partyId: payeeId || null, partyName: resolvedName,
        amount: net,
        issueDate: cheque!.issueDate || when,
        bankName: cheque!.bankName || null,
        status: 'In Hand',
        bankAccountId: bankAccountId || null,
        journalEntryId: journal.id,
        notes: `Payment out ${paymentNo}`,
        createdAt: now, updatedAt: now,
      })
      .select()
      .single()
    if (cqErr) throw new Error(`Cheque insert failed: ${cqErr.message}`)
    chequeRow = cq
  }

  // ── 4. PaymentOut row ──
  const { data: payment, error: payErr } = await supabase
    .from('PaymentOut')
    .insert({
      paymentNo,
      paymentDate: when,
      payeeType, payeeId: payeeId || null, payeeName: resolvedName,
      poId: po ? po.id : null,
      vendorBillId: bill ? bill.id : null,
      costSheetId: costSheetId || null,
      amount: round2(gross),
      tdsAmount: round2(tds),
      tdsSection: tdsSection || null,
      netPaidAmount: net,
      paymentMode: mode,
      bankAccountId: mode === 'Cash' ? null : (bankAccountId || null),
      chequeId: chequeRow ? chequeRow.id : null,
      referenceNo: referenceNo || null,
      notes: notes || null,
      journalEntryId: journal.id,
      status: 'Completed',
      createdAt: now, updatedAt: now,
    })
    .select()
    .single()
  if (payErr) throw new Error(`PaymentOut insert failed: ${payErr.message}`)

  if (chequeRow) {
    await supabase.from('Cheque').update({ paymentOutId: payment.id }).eq('id', chequeRow.id)
  }

  // ── 5. Update PO / VendorBill paidAmount ──
  let updatedPo: any = null
  if (po) {
    const newPaid = (po.paidAmount || 0) + gross
    const newStatus = newPaid >= (po.totalAmount || 0) - 0.01 ? 'Paid' : (newPaid > 0 ? 'Partial' : po.paymentStatus)
    const { data: up } = await supabase
      .from('PurchaseOrder')
      .update({ paidAmount: round2(newPaid), paymentStatus: newStatus, updatedAt: now })
      .eq('id', po.id)
      .select('id, poNumber, paidAmount, paymentStatus')
      .single()
    updatedPo = up
  }

  let updatedBill: any = null
  if (bill) {
    const newPaid = (bill.paidAmount || 0) + gross
    const newStatus = newPaid >= (bill.totalAmount || 0) - 0.01 ? 'Paid' : 'Partial'
    const { data: up } = await supabase
      .from('VendorBill')
      .update({ paidAmount: round2(newPaid), status: newStatus, updatedAt: now })
      .eq('id', bill.id)
      .select('id, billNo, paidAmount, status')
      .single()
    updatedBill = up
  }

  return {
    payment,
    journal: { id: journal.id, entryNo: journal.entryNo, amount: journal.amount },
    cheque: chequeRow,
    cashbookPosted: !!cashbook,
    updatedPo,
    updatedBill,
  }
}
