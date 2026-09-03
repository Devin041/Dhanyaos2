import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { postJournal, GL, getGlAccounts } from '@/lib/gl'

/**
 * POST /api/gl-setup — ONE-TIME ledger initialization (idempotent).
 *
 * 1. Ensures the 17 system GL accounts exist (created by PHASE-A-MIGRATION.sql
 *    seed; this is a belt-and-braces insert for re-runs).
 * 2. Creates default bank accounts if none exist (HDFC Current ₹10,00,000 +
 *    Cash in Hand ₹50,000 — founder can edit/add more in Banking).
 * 3. Computes OPENING BALANCES from live business data:
 *      Dr Receivable  — every unpaid invoice, per customer
 *      Dr Inventory   — fabric stock + FG bins value
 *      Dr Bank/Cash   — bank account opening balances
 *      Dr ITC         — if input GST exceeds output
 *      Cr Payable     — unpaid supplier POs, per supplier
 *      Cr Vendor Bill Payable — unpaid vendor bills, per vendor
 *      Cr Broker Payable — cost-sheet broker commissions
 *      Cr GST Output  — net GST liability (output − input)
 *      Cr Owner Capital — the balancing figure
 * 4. Posts a single OPENING journal entry.
 *
 * Re-running without ?force=1 → 400 "already initialized".
 */

const SYSTEM_ACCOUNTS: [string, string, string, string][] = [
  ['1000', 'Bank Accounts', 'ASSET', 'BANK'],
  ['1001', 'Cash in Hand', 'ASSET', 'CASH'],
  ['1100', 'Accounts Receivable', 'ASSET', 'RECEIVABLE'],
  ['1150', 'Cheques in Hand', 'ASSET', 'CHEQUES_IN_HAND'],
  ['1200', 'Inventory — Fabric & FG', 'ASSET', 'INVENTORY'],
  ['1300', 'GST Input Credit (ITC)', 'ASSET', 'GST_IN'],
  ['2000', 'Accounts Payable — Suppliers', 'LIABILITY', 'PAYABLE'],
  ['2100', 'Vendor Bill Payable', 'LIABILITY', 'VENDOR_BILL_PAYABLE'],
  ['2200', 'Broker Commission Payable', 'LIABILITY', 'BROKER_PAYABLE'],
  ['2300', 'GST Output Payable', 'LIABILITY', 'GST_OUT'],
  ['2400', 'TDS Payable', 'LIABILITY', 'TDS_PAYABLE'],
  ['2500', 'Cheques Issued (Outstanding)', 'LIABILITY', 'CHEQUES_ISSUED'],
  ['3000', 'Owner Capital', 'EQUITY', 'CAPITAL'],
  ['4000', 'Sales', 'INCOME', 'SALES'],
  ['5100', 'Direct Expenses (Order-linked)', 'EXPENSE', 'DIRECT_EXPENSE'],
  ['5200', 'Indirect Expenses (Admin & Overhead)', 'EXPENSE', 'INDIRECT_EXPENSE'],
  ['9000', 'Suspense', 'EXPENSE', 'SUSPENSE'],
]

const round2 = (n: number) => Math.round(n * 100) / 100

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === '1'

    // ── 0. Migration guard ──
    try {
      await getGlAccounts(true)
    } catch (e: any) {
      return NextResponse.json(
        { error: `GL tables missing — run PHASE-A-MIGRATION.sql in Supabase SQL Editor first. (${e.message})` },
        { status: 400 }
      )
    }

    // ── 1. Idempotency ──
    const { data: existing } = await supabase
      .from('JournalEntry')
      .select('id, entryNo')
      .eq('sourceType', 'OPENING')
      .limit(1)
    if (existing && existing.length > 0 && !force) {
      return NextResponse.json(
        { error: `Ledger already initialized (${existing[0].entryNo}). Pass ?force=1 to re-run.` },
        { status: 400 }
      )
    }

    // ── 2. Ensure system accounts exist ──
    const { data: currentAccounts } = await supabase.from('GlAccount').select('code')
    const have = new Set((currentAccounts || []).map((a: any) => a.code))
    const missing = SYSTEM_ACCOUNTS.filter(([code]) => !have.has(code))
    if (missing.length > 0) {
      await supabase.from('GlAccount').insert(
        missing.map(([code, name, accountType, subType]) => ({
          code, name, accountType, subType, isSystem: true, isActive: true,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }))
      )
      await getGlAccounts(true)
    }

    // ── 3. Default bank accounts if none ──
    const { data: bankAccounts } = await supabase.from('BankAccount').select('*')
    if (!bankAccounts || bankAccounts.length === 0) {
      const now = new Date().toISOString()
      await supabase.from('BankAccount').insert([
        {
          accountName: 'HDFC Current A/c — Main',
          bankName: 'HDFC Bank', branch: 'Surat',
          accountNumber: '50200012345678', ifscCode: 'HDFC0000123',
          accountType: 'Bank', openingBalance: 1000000, currentBalance: 1000000,
          status: 'Active', createdAt: now, updatedAt: now,
        },
        {
          accountName: 'Cash in Hand',
          bankName: '—', branch: '—',
          accountNumber: '—', ifscCode: '—',
          accountType: 'Cash', openingBalance: 50000, currentBalance: 50000,
          status: 'Active', createdAt: now, updatedAt: now,
        },
      ])
    }
    const { data: finalBanks } = await supabase.from('BankAccount').select('*')
    const banks = finalBanks || []
    const bankTotal = banks.reduce((s: number, b: any) => s + (b.openingBalance || 0), 0)

    // ── 4. Opening balances from live data ──
    // Receivables (unpaid invoices, per customer)
    const { data: invoices } = await supabase
      .from('Invoice')
      .select('id, invoiceNo, customerId, customerName, totalAmount, paidAmount, writeOffAmount, paymentStatus, status')
      .neq('status', 'Cancelled')
    const recvByCustomer = new Map<string, { name: string; amount: number }>()
    for (const inv of (invoices || []) as any[]) {
      const bal = (inv.totalAmount || 0) - (inv.paidAmount || 0) - (inv.writeOffAmount || 0)
      if (bal <= 0.01) continue
      const key = inv.customerId || inv.customerName || 'unknown'
      const cur = recvByCustomer.get(key) || { name: inv.customerName || 'Customer', amount: 0 }
      cur.amount += bal
      recvByCustomer.set(key, cur)
    }

    // Supplier payables (unpaid POs, per supplier)
    const { data: poHeaders } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, supplierId, totalAmount, paidAmount, paymentStatus, status')
      .eq('supplierId', 'not.null')
      .neq('status', 'Cancelled')
    const supplierIds = [...new Set((poHeaders || []).map((p: any) => p.supplierId))]
    const { data: suppliers } = supplierIds.length
      ? await supabase.from('Supplier').select('id, name').in('id', supplierIds)
      : { data: [] as any[] }
    const supplierName = new Map((suppliers || []).map((s: any) => [s.id, s.name]))
    const payBySupplier = new Map<string, { name: string; amount: number }>()
    for (const po of (poHeaders || []) as any[]) {
      const bal = (po.totalAmount || 0) - (po.paidAmount || 0)
      if (bal <= 0.01) continue
      const cur = payBySupplier.get(po.supplierId) || { name: supplierName.get(po.supplierId) || 'Supplier', amount: 0 }
      cur.amount += bal
      payBySupplier.set(po.supplierId, cur)
    }

    // Vendor bill payables (per vendor)
    const { data: vendorBills } = await supabase
      .from('VendorBill')
      .select('id, billNo, vendorId, totalAmount, paidAmount, status')
      .in('status', ['Pending', 'Partial'])
    const vendorIds = [...new Set((vendorBills || []).map((b: any) => b.vendorId).filter(Boolean))]
    const { data: vendors } = vendorIds.length
      ? await supabase.from('Vendor').select('id, vendorName').in('id', vendorIds)
      : { data: [] as any[] }
    const vendorName = new Map((vendors || []).map((v: any) => [v.id, v.vendorName]))
    const payByVendor = new Map<string, { name: string; amount: number }>()
    for (const b of (vendorBills || []) as any[]) {
      const bal = (b.totalAmount || 0) - (b.paidAmount || 0)
      if (bal <= 0.01) continue
      const key = b.vendorId || 'unknown'
      const cur = payByVendor.get(key) || { name: vendorName.get(b.vendorId) || 'Vendor', amount: 0 }
      cur.amount += bal
      payByVendor.set(key, cur)
    }

    // Broker payable (cost-sheet commissions)
    const { data: costSheets } = await supabase
      .from('CostSheet')
      .select('id, sheetNo, brokerCommissionAmount, status')
      .neq('status', 'Cancelled')
    const brokerTotal = (costSheets || []).reduce((s: number, c: any) => s + (c.brokerCommissionAmount || 0), 0)

    // GST: output (invoices) − input (supplier POs), consistent with /api/gst-returns
    const outputGst = (invoices || []).reduce((s: number, i: any) => s + (i.totalGst || 0), 0)
    const inputGst = (poHeaders || []).reduce((s: number, p: any) => s + (p.totalGst || 0), 0)
    const netGst = outputGst - inputGst

    // Inventory: fabric stock + FG bins
    const { data: fabricStock } = await supabase.from('FabricStock').select('totalValue')
    const { data: fgBins } = await supabase.from('FGStockBin').select('availableQty, unitCost')
    const inventoryValue =
      (fabricStock || []).reduce((s: number, f: any) => s + (f.totalValue || 0), 0) +
      ((fgBins || []) as any[]).reduce((s: number, b: any) => s + (b.availableQty || 0) * (b.unitCost || 0), 0)

    // ── 5. Build the opening journal ──
    const lines: any[] = []

    for (const [cid, { name, amount }] of recvByCustomer) {
      lines.push({ glAccountCode: GL.RECEIVABLE, debit: round2(amount), partyType: 'CUSTOMER', partyId: cid, partyName: name, memo: 'Opening — unpaid invoices' })
    }
    if (inventoryValue > 0.01) {
      lines.push({ glAccountCode: GL.INVENTORY, debit: round2(inventoryValue), memo: 'Opening — fabric + FG value' })
    }
    if (bankTotal > 0.01) {
      lines.push({ glAccountCode: GL.BANK, debit: round2(bankTotal), memo: `Opening — bank & cash balances (${banks.length} accounts)` })
    }
    if (netGst < -0.01) {
      lines.push({ glAccountCode: GL.ITC, debit: round2(-netGst), partyType: 'GOVT', partyName: 'GST Department', memo: 'Opening — excess input credit' })
    }

    for (const [sid, { name, amount }] of payBySupplier) {
      lines.push({ glAccountCode: GL.PAYABLE, credit: round2(amount), partyType: 'SUPPLIER', partyId: sid, partyName: name, memo: 'Opening — unpaid POs' })
    }
    for (const [vid, { name, amount }] of payByVendor) {
      lines.push({ glAccountCode: GL.VENDOR_BILL_PAYABLE, credit: round2(amount), partyType: 'VENDOR', partyId: vid, partyName: name, memo: 'Opening — unpaid job-work bills' })
    }
    if (brokerTotal > 0.01) {
      lines.push({ glAccountCode: GL.BROKER_PAYABLE, credit: round2(brokerTotal), partyType: 'BROKER', partyName: 'Brokers (cost-sheet commissions)', memo: 'Opening — broker commissions payable' })
    }
    if (netGst > 0.01) {
      lines.push({ glAccountCode: GL.GST_OUT, credit: round2(netGst), partyType: 'GOVT', partyName: 'GST Department', memo: 'Opening — net GST liability (output − input)' })
    }

    // Balancing figure → Owner Capital
    const totalDr = round2(lines.reduce((s, l) => s + (l.debit || 0), 0))
    const totalCr = round2(lines.reduce((s, l) => s + (l.credit || 0), 0))
    const capital = round2(totalDr - totalCr)
    if (Math.abs(capital) < 0.01) {
      return NextResponse.json({ error: 'Nothing to post — all balances are zero' }, { status: 400 })
    }
    if (capital > 0) {
      lines.push({ glAccountCode: GL.CAPITAL, credit: capital, memo: 'Opening — owner capital (balancing figure)' })
    } else {
      lines.push({ glAccountCode: GL.CAPITAL, debit: -capital, memo: 'Opening — owner capital (balancing figure)' })
    }

    const entry = await postJournal({
      entryDate: new Date(),
      description: 'Opening balances — ledger initialization',
      sourceType: 'OPENING',
      lines,
    })

    return NextResponse.json({
      initialized: true,
      entryNo: entry.entryNo,
      journalEntryId: entry.id,
      summary: {
        receivableCustomers: recvByCustomer.size,
        receivableTotal: round2([...recvByCustomer.values()].reduce((s, v) => s + v.amount, 0)),
        payableSuppliers: payBySupplier.size,
        payableTotal: round2([...payBySupplier.values()].reduce((s, v) => s + v.amount, 0)),
        vendorBillVendors: payByVendor.size,
        vendorBillTotal: round2([...payByVendor.values()].reduce((s, v) => s + v.amount, 0)),
        brokerPayable: round2(brokerTotal),
        gstNet: round2(netGst),
        inventoryValue: round2(inventoryValue),
        bankOpening: round2(bankTotal),
        ownerCapital: capital,
      },
      lines: entry.lines,
    }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/gl-setup error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to initialize ledger' }, { status: 500 })
  }
}
