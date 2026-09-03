import { supabase } from './supabase-db'

/**
 * DOUBLE-ENTRY GENERAL LEDGER ENGINE — Phase A core.
 *
 * Every money event in Dhanya OS posts through postJournal():
 *   JournalEntry (header) + JournalLine[] (debits & credits, MUST balance)
 * plus a cash-book row in Transaction (Credit = money in, Debit = money out)
 * so the existing Accounts / Cash Flow views reflect REAL events (F1 fix).
 *
 * System chart of accounts lives in GlAccount (seeded by PHASE-A-MIGRATION.sql
 * or gl-setup). Codes: see PHASE-A-MIGRATION.sql section 8.
 */

export interface JournalLineInput {
  glAccountCode: string                 // e.g. '1000' Bank, '1100' Receivable
  debit?: number
  credit?: number
  partyType?: 'CUSTOMER' | 'SUPPLIER' | 'VENDOR' | 'BROKER' | 'GOVT' | 'OTHER'
  partyId?: string | null
  partyName?: string | null
  memo?: string
}

export interface PostJournalInput {
  entryDate: string | Date
  description: string
  sourceType: string                    // OPENING | PAYMENT_IN | PAYMENT_OUT | EXPENSE | TRANSFER | GST_PAYMENT | CHEQUE_CLEAR | CHEQUE_BOUNCE | WRITE_OFF | INVOICE | MANUAL
  sourceId?: string | null
  lines: JournalLineInput[]
}

export interface CashbookRowInput {
  type: 'Credit' | 'Debit'
  category: string                      // 'Customer Payment', 'Supplier Payment', ...
  amount: number
  description: string
  referenceNo?: string | null
  date: string | Date
  bankAccountId?: string | null
  sourceType?: string | null
  sourceId?: string | null
  journalEntryId?: string | null
}

// ─── GL account cache (per server instance) ───────────────────────────────
let accountCache: { code: string; id: string; name: string }[] | null = null
let accountCacheTs = 0
const ACCOUNT_CACHE_TTL = 60_000

export async function getGlAccounts(force = false) {
  if (!force && accountCache && Date.now() - accountCacheTs < ACCOUNT_CACHE_TTL) {
    return accountCache
  }
  const { data, error } = await supabase
    .from('GlAccount')
    .select('id, code, name')
    .eq('isActive', true)
    .order('code')
  if (error) throw new Error(`GlAccount unavailable (run PHASE-A-MIGRATION.sql): ${error.message}`)
  accountCache = data || []
  accountCacheTs = Date.now()
  return accountCache
}

export async function getAccountId(code: string): Promise<string> {
  const accounts = await getGlAccounts()
  const acc = accounts.find((a) => a.code === code)
  if (!acc) throw new Error(`GL account ${code} not found — run PHASE-A-MIGRATION.sql then /api/gl-setup`)
  return acc.id
}

// ─── Document number generators (per-day sequence) ────────────────────────
async function nextSeq(table: string, column: string, prefix: string, date: Date): Promise<number> {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  const { data, error } = await supabase
    .from(table)
    .select(column, { count: 'exact', head: false })
  if (error) return 1
  const rows = (data || []) as any[]
  const pat = new RegExp(`^${prefix}-${day}-(\\d{3})$`)
  let max = 0
  for (const r of rows) {
    const m = pat.exec(String(r[column] || ''))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

export async function nextJournalNo(date: Date = new Date()): Promise<string> {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  const n = await nextSeq('JournalEntry', 'entryNo', 'JE', date)
  return `JE-${day}-${String(n).padStart(3, '0')}`
}

export async function nextPaymentOutNo(date: Date = new Date()): Promise<string> {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  const n = await nextSeq('PaymentOut', 'paymentNo', 'PAYOUT', date)
  return `PAYOUT-${day}-${String(n).padStart(3, '0')}`
}

export async function nextVoucherNo(date: Date = new Date()): Promise<string> {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  const n = await nextSeq('ExpenseVoucher', 'voucherNo', 'EXP', date)
  return `EXP-${day}-${String(n).padStart(3, '0')}`
}

export async function nextChequeNo(date: Date = new Date()): Promise<string> {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  const n = await nextSeq('Cheque', 'id', 'CHQ', date)
  return `CHQ-${day}-${String(n).padStart(3, '0')}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ─── THE core: post a balanced double entry ───────────────────────────────
export async function postJournal(input: PostJournalInput) {
  const entryDate = new Date(input.entryDate).toISOString()

  // Resolve accounts + validate
  const accounts = await getGlAccounts()
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  let totalDebit = 0
  let totalCredit = 0
  for (const line of input.lines) {
    if (!line.debit && !line.credit) continue
    if (line.debit && line.credit) throw new Error('Journal line cannot have BOTH debit and credit')
    totalDebit += line.debit || 0
    totalCredit += line.credit || 0
  }
  totalDebit = round2(totalDebit)
  totalCredit = round2(totalCredit)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal does not balance: debit ${totalDebit} vs credit ${totalCredit}`)
  }
  if (totalDebit === 0) throw new Error('Journal entry has zero amount')

  const entryNo = await nextJournalNo(new Date(input.entryDate))
  const { data: entry, error: entryErr } = await supabase
    .from('JournalEntry')
    .insert({
      entryNo,
      entryDate,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      amount: totalDebit,
      status: 'Posted',
    })
    .select()
    .single()
  if (entryErr || !entry) throw new Error(`JournalEntry insert failed: ${entryErr?.message}`)

  const rows = input.lines
    .filter((l) => l.debit || l.credit)
    .map((l) => {
      const acc = byCode.get(l.glAccountCode)
      if (!acc) throw new Error(`GL account code ${l.glAccountCode} not found`)
      return {
        journalEntryId: entry.id,
        glAccountId: acc.id,
        glAccountCode: acc.code,
        glAccountName: acc.name,
        debit: round2(l.debit || 0),
        credit: round2(l.credit || 0),
        partyType: l.partyType || null,
        partyId: l.partyId || null,
        partyName: l.partyName || null,
        memo: l.memo || null,
      }
    })
  const { error: linesErr } = await supabase.from('JournalLine').insert(rows)
  if (linesErr) throw new Error(`JournalLine insert failed: ${linesErr.message}`)

  return { ...entry, lines: rows }
}

// ─── Reverse an entry (swapped lines, linked both ways) ───────────────────
export async function reverseJournal(
  entryId: string,
  opts: { date?: string | Date; description?: string; sourceType?: string; sourceId?: string }
) {
  const { data: orig, error } = await supabase
    .from('JournalEntry')
    .select('*, lines:JournalLine(*)')
    .eq('id', entryId)
    .single()
  if (error || !orig) throw new Error('Original journal entry not found')
  if (orig.status === 'Reversed') throw new Error('Entry is already reversed')

  const reversal = await postJournal({
    entryDate: opts.date || new Date(),
    description: opts.description || `Reversal: ${orig.description}`,
    sourceType: opts.sourceType || `${orig.sourceType}_REVERSAL`,
    sourceId: opts.sourceId || orig.sourceId,
    lines: (orig.lines || []).map((l: any) => ({
      glAccountCode: l.glAccountCode,
      debit: l.credit || 0,
      credit: l.debit || 0,
      partyType: l.partyType,
      partyId: l.partyId,
      partyName: l.partyName,
      memo: `Reversal: ${l.memo || ''}`.trim(),
    })),
  })

  // Link both ways + mark original reversed
  await supabase
    .from('JournalEntry')
    .update({ status: 'Reversed', reversedById: reversal.id, updatedAt: new Date().toISOString() })
    .eq('id', entryId)
  await supabase
    .from('JournalEntry')
    .update({ reversalOfId: entryId, updatedAt: new Date().toISOString() })
    .eq('id', reversal.id)

  return reversal
}

// ─── Cash book row (Transaction) — feeds existing Accounts/Cashflow views ──
export async function postCashbookRow(row: CashbookRowInput) {
  const { data, error } = await supabase
    .from('Transaction')
    .insert({
      type: row.type,
      category: row.category,
      amount: round2(row.amount),
      description: row.description,
      referenceNo: row.referenceNo || null,
      date: new Date(row.date).toISOString(),
      journalEntryId: row.journalEntryId || null,
      bankAccountId: row.bankAccountId || null,
      sourceType: row.sourceType || null,
      sourceId: row.sourceId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw new Error(`Cashbook (Transaction) insert failed: ${error.message}`)
  return data
}

// ─── GL account codes used across Phase A ─────────────────────────────────
export const GL = {
  BANK: '1000',
  CASH: '1001',
  RECEIVABLE: '1100',
  CHEQUES_IN_HAND: '1150',
  INVENTORY: '1200',
  ITC: '1300',
  PAYABLE: '2000',
  VENDOR_BILL_PAYABLE: '2100',
  BROKER_PAYABLE: '2200',
  GST_OUT: '2300',
  TDS_PAYABLE: '2400',
  CHEQUES_ISSUED: '2500',
  CAPITAL: '3000',
  SALES: '4000',
  DIRECT_EXPENSE: '5100',
  INDIRECT_EXPENSE: '5200',
  SUSPENSE: '9000',
} as const
