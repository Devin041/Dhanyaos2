import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

/**
 * GET /api/party-ledger?partyType=CUSTOMER|SUPPLIER|VENDOR|BROKER&partyId=…
 *
 * Running statement from JournalLine rows tagged with the party:
 *   opening (first line's running balance before window) → entries → closing.
 * Debit increases what the party owes us / we hold; Credit decreases.
 * For CUSTOMER: debit = they owe more (invoice), credit = they paid.
 * For SUPPLIER/VENDOR/BROKER: credit = we owe, debit = we paid.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partyType = searchParams.get('partyType')
    const partyId = searchParams.get('partyId')

    if (!partyType || !partyId) {
      return NextResponse.json({ error: 'partyType and partyId are required' }, { status: 400 })
    }

    const { data: lines, error } = await supabase
      .from('JournalLine')
      .select('*, entry:journalEntryId(id, entryNo, entryDate, description, sourceType, status)')
      .eq('partyType', partyType)
      .eq('partyId', partyId)
      .order('createdAt', { ascending: true })
    if (error) throw error

    const round2 = (n: number) => Math.round(n * 100) / 100
    let running = 0
    const entries = []
    for (const l of (lines || []) as any[]) {
      const net = (l.debit || 0) - (l.credit || 0)
      running = round2(running + net)
      entries.push({
        journalEntryId: l.journalEntryId,
        entryNo: l.entry?.entryNo,
        date: l.entry?.entryDate,
        description: l.entry?.description,
        sourceType: l.entry?.sourceType,
        status: l.entry?.status,
        accountCode: l.glAccountCode,
        accountName: l.glAccountName,
        debit: round2(l.debit || 0),
        credit: round2(l.credit || 0),
        memo: l.memo,
        balance: running,
      })
    }

    const partyName = (lines || [])[0]?.partyName || null
    const totalDebit = round2(entries.reduce((s, e) => s + e.debit, 0))
    const totalCredit = round2(entries.reduce((s, e) => s + e.credit, 0))

    // Cross-check against the business document balance (source of truth check)
    let documentBalance: number | null = null
    if (partyType === 'CUSTOMER') {
      const { data: invoices } = await supabase
        .from('Invoice')
        .select('totalAmount, paidAmount, writeOffAmount')
        .eq('customerId', partyId)
        .neq('status', 'Cancelled')
      documentBalance = round2(
        (invoices || []).reduce((s: number, i: any) => s + (i.totalAmount || 0) - (i.paidAmount || 0) - (i.writeOffAmount || 0), 0)
      )
    } else if (partyType === 'SUPPLIER') {
      const { data: pos } = await supabase
        .from('PurchaseOrder')
        .select('totalAmount, paidAmount')
        .eq('supplierId', partyId)
        .neq('status', 'Cancelled')
      documentBalance = -round2(
        (pos || []).reduce((s: number, p: any) => s + (p.totalAmount || 0) - (p.paidAmount || 0), 0)
      )
    } else if (partyType === 'VENDOR') {
      const { data: bills } = await supabase
        .from('VendorBill')
        .select('totalAmount, paidAmount')
        .eq('vendorId', partyId)
        .in('status', ['Pending', 'Partial'])
      documentBalance = -round2(
        (bills || []).reduce((s: number, b: any) => s + (b.totalAmount || 0) - (b.paidAmount || 0), 0)
      )
    }

    return NextResponse.json({
      partyType, partyId, partyName,
      entries,
      totals: { debit: totalDebit, credit: totalCredit, balance: round2(running) },
      documentBalance,
      match: documentBalance === null ? null : Math.abs(documentBalance - running) <= 1,
    })
  } catch (error: any) {
    console.error('GET /api/party-ledger error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load party ledger' }, { status: 500 })
  }
}
