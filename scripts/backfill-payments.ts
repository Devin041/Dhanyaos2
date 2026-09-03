/**
 * Backfill pre-migration customer payments into the Phase A GL.
 *
 * These payments were recorded before PHASE-A-MIGRATION.sql existed, so they
 * have journalEntryId = null — money that exists in invoice paidAmount but is
 * invisible to the ledger. This script posts, for each such payment:
 *
 *   Journal  : Dr Bank/Cash (net)  /  Cr Receivable (gross)
 *   Cashbook : Credit 'Customer Payment' row linked to the journal
 *   Payment  : journalEntryId set (idempotency guard)
 *
 * Run: bun run scripts/backfill-payments.ts
 */
import { supabase } from '../src/lib/supabase-db'
import { postJournal, postCashbookRow, GL } from '../src/lib/gl'

async function main() {
  // All payments that never hit the ledger
  const { data: payments, error } = await supabase
    .from('Payment')
    .select('id, paymentNo, invoiceId, amount, paymentDate, paymentMode, referenceNo')
    .is('journalEntryId', null)
    .order('paymentDate', { ascending: true })
  if (error) throw new Error(error.message)

  if (!payments || payments.length === 0) {
    console.log('No payments missing journal entries — nothing to backfill.')
    return
  }
  console.log(`Found ${payments.length} payment(s) without GL entries.`)

  // Skip rows that already have a cashbook Transaction (idempotency guard #2)
  const paymentNos = payments.map((p: any) => p.paymentNo)
  const { data: existingTxns } = await supabase
    .from('Transaction')
    .select('sourceId')
    .eq('sourceType', 'PAYMENT_IN')
    .in('sourceId', paymentNos)
  const alreadyCashed = new Set((existingTxns || []).map((t: any) => t.sourceId))

  // Invoice lookup for party info
  const invoiceIds = [...new Set(payments.map((p: any) => p.invoiceId).filter(Boolean))]
  const { data: invoices } = invoiceIds.length
    ? await supabase.from('Invoice').select('id, invoiceNo, customerName, customerId').in('id', invoiceIds)
    : { data: [] as any[] }
  const invMap = new Map((invoices || []).map((i: any) => [i.id, i]))

  for (const p of payments as any[]) {
    if (alreadyCashed.has(p.paymentNo)) {
      console.log(`⏭  ${p.paymentNo} — cashbook row already exists, skipping`)
      continue
    }
    if (p.paymentMode === 'Cheque') {
      console.log(`⏭  ${p.paymentNo} — cheque payment (realises on clearance), skipping`)
      continue
    }

    const inv = invMap.get(p.invoiceId) || ({} as any)
    const amount = Math.round((p.amount || 0) * 100) / 100
    const creditCode = p.paymentMode === 'Cash' ? GL.CASH : GL.BANK
    const partyName = inv.customerName || inv.invoiceNo || 'Customer'

    try {
      const journal = await postJournal({
        entryDate: p.paymentDate, // historical date — lands in the right month
        description: `Customer payment ${p.paymentNo} — ${partyName} (backfill)`,
        sourceType: 'PAYMENT_IN',
        sourceId: p.paymentNo,
        lines: [
          { glAccountCode: creditCode, debit: amount, memo: `${p.paymentMode} ${p.referenceNo || ''}`.trim() },
          { glAccountCode: GL.RECEIVABLE, credit: amount, partyType: 'CUSTOMER', partyId: inv.customerId || null, partyName, memo: `Against ${inv.invoiceNo || p.invoiceNo || 'invoice'}` },
        ],
      })

      const cashbook = await postCashbookRow({
        type: 'Credit',
        category: 'Customer Payment',
        amount,
        description: `${partyName} — ${inv.invoiceNo || ''} — ${p.paymentNo} (backfill)`,
        referenceNo: p.referenceNo || p.paymentNo,
        date: p.paymentDate,
        bankAccountId: p.paymentMode === 'Cash' ? null : null,
        sourceType: 'PAYMENT_IN',
        sourceId: p.paymentNo,
        journalEntryId: journal.id,
      })

      const { error: updErr } = await supabase
        .from('Payment')
        .update({ journalEntryId: journal.id })
        .eq('id', p.id)
      if (updErr) throw new Error(`Payment update failed: ${updErr.message}`)

      console.log(`✅ ${p.paymentNo} ₹${amount} → JE ${journal.entryNo} (${journal.id.slice(0, 8)}), cashbook ${cashbook.id.slice(0, 8)}`)
    } catch (e: any) {
      console.log(`❌ ${p.paymentNo}: ${e.message}`)
    }
  }

  // Verify trial balance after backfill
  const { data: lines } = await supabase
    .from('JournalLine')
    .select('debit, credit')
  const dr = (lines || []).reduce((s: number, l: any) => s + (l.debit || 0), 0)
  const cr = (lines || []).reduce((s: number, l: any) => s + (l.credit || 0), 0)
  console.log(`\nTrial balance after backfill: Dr ${Math.round(dr * 100) / 100} vs Cr ${Math.round(cr * 100) / 100} → ${Math.abs(dr - cr) < 0.01 ? 'BALANCED ✓' : 'OUT OF BALANCE ✗'}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
