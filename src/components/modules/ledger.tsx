'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookOpen, Scale, Users, ChevronDown, CheckCircle2, AlertTriangle, Search, FileText,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────

interface JournalLine {
  id: string
  glAccountCode: string
  glAccountName: string
  debit: number
  credit: number
  partyName: string | null
  memo: string | null
}

interface JournalEntry {
  id: string
  entryNo: string
  entryDate: string
  description: string
  amount: number
  status: string
  sourceType: string
  lines: JournalLine[]
}

interface TrialRow {
  code: string
  name: string
  accountType: string
  debit: number
  credit: number
}

interface PartyLedgerEntry {
  journalEntryId: string
  entryNo: string
  date: string
  description: string
  sourceType: string
  debit: number
  credit: number
  memo: string | null
  balance: number
}

interface PartyLedger {
  partyType: string
  partyId: string
  partyName: string | null
  entries: PartyLedgerEntry[]
  totals: { debit: number; credit: number; balance: number }
  documentBalance: number | null
  match: boolean | null
}

interface PartyOption {
  id: string
  label: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtINR = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

const fmtINR2 = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0)

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`)
  return data as T
}

function ErrorBanner({ message }: { message: string }) {
  const migration = /PHASE-A|does not exist|schema|relation/i.test(message)
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Ledger data unavailable</p>
        <p className="text-xs text-muted-foreground break-words">
          {migration
            ? 'Ledger not initialized yet — ask admin to run PHASE-A-MIGRATION.sql in Supabase'
            : message}
        </p>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="mb-2 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  )
}

function EntryStatusBadge({ status }: { status: string }) {
  const reversed = status === 'Reversed'
  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0 text-[9px] ${
        reversed
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      }`}
    >
      {status}
    </Badge>
  )
}

const SOURCE_TYPES = [
  'OPENING', 'PAYMENT_IN', 'PAYMENT_OUT', 'EXPENSE', 'TRANSFER',
  'GST_PAYMENT', 'CHEQUE_CLEAR', 'CHEQUE_BOUNCE', 'WRITE_OFF', 'MANUAL',
]

// ─── TAB: Journal Entries ──────────────────────────────────────────────────

function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [meta, setMeta] = useState<{ count: number; totalValue: number } | null>(null)
  const [sourceType, setSourceType] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchEntries = useCallback(async (st: string) => {
    try {
      setLoading(true)
      setError(null)
      const url = `/api/journal?limit=100${st && st !== 'All' ? `&sourceType=${st}` : ''}`
      const d = await getJson<{ entries: JournalEntry[]; count: number; totalValue: number }>(url)
      setEntries(d.entries || [])
      setMeta({ count: d.count || 0, totalValue: d.totalValue || 0 })
    } catch (e: any) {
      setError(e?.message || 'Failed to load journal entries')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEntries(sourceType) }, [fetchEntries, sourceType])

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Card className="glass-card border-border/40 border-l-2 border-l-amber-500/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Debit Value</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtINR(meta?.totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Entries</span>
              </div>
              <p className="text-xl font-bold tabular-nums">{meta?.count ?? 0}</p>
            </CardContent>
          </Card>
        </div>
        <div className="w-full sm:w-56">
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger className="h-full w-full border-border bg-muted/50">
              <SelectValue placeholder="Filter source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All sources</SelectItem>
              {SOURCE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <SkeletonRows />
      ) : entries.length === 0 ? (
        <Card className="glass-card border-border/40">
          <CardContent className="p-4">
            <EmptyState icon={FileText} label="No journal entries yet" />
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[600px] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {entries.map((e) => {
            const dr = (e.lines || []).reduce((s, l) => s + (l.debit || 0), 0)
            const cr = (e.lines || []).reduce((s, l) => s + (l.credit || 0), 0)
            const isOpen = expanded === e.id
            return (
              <Card key={e.id} className="glass-card border-border/40 overflow-hidden">
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    onClick={() => setExpanded(isOpen ? null : e.id)}
                    aria-expanded={isOpen}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{e.entryNo}</span>
                    <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{fmtDate(e.entryDate)}</span>
                    <span className="flex-1 truncate text-xs">{e.description}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">{fmtINR(e.amount)}</span>
                    <EntryStatusBadge status={e.status} />
                    <Badge variant="outline" className="hidden shrink-0 border-border/40 bg-muted px-1.5 py-0 text-[9px] text-muted-foreground md:inline-flex">
                      {e.sourceType}
                    </Badge>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/30 bg-muted/20 px-4 py-3">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border/30 hover:bg-transparent">
                              <TableHead className="h-8 text-[10px]">Account</TableHead>
                              <TableHead className="h-8 text-right text-[10px]">Debit</TableHead>
                              <TableHead className="h-8 text-right text-[10px]">Credit</TableHead>
                              <TableHead className="h-8 text-[10px]">Party</TableHead>
                              <TableHead className="h-8 text-[10px]">Memo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(e.lines || []).map((l) => (
                              <TableRow key={l.id} className="border-border/20">
                                <TableCell className="py-2 text-xs">
                                  {l.glAccountName || '—'}
                                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{l.glAccountCode}</span>
                                </TableCell>
                                <TableCell className="py-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                                  {l.debit ? fmtINR(l.debit) : '—'}
                                </TableCell>
                                <TableCell className="py-2 text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">
                                  {l.credit ? fmtINR(l.credit) : '—'}
                                </TableCell>
                                <TableCell className="py-2 text-xs text-muted-foreground">{l.partyName || '—'}</TableCell>
                                <TableCell className="max-w-[200px] truncate py-2 text-[10px] text-muted-foreground" title={l.memo || ''}>
                                  {l.memo || '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Σ Dr {fmtINR2(dr)} = Cr {fmtINR2(cr)} {Math.abs(dr - cr) <= 0.01 ? '✓' : '⚠'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TAB: Trial Balance ────────────────────────────────────────────────────

function TrialBalanceTab() {
  const [rows, setRows] = useState<TrialRow[]>([])
  const [totals, setTotals] = useState<{ debit: number; credit: number; balanced: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const d = await getJson<{
        rows: TrialRow[]
        totals: { debit: number; credit: number; balanced: boolean } | null
      }>('/api/trial-balance')
      setRows(d.rows || [])
      setTotals(d.totals || null)
    } catch (e: any) {
      setError(e?.message || 'Failed to load trial balance')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBalance() }, [fetchBalance])

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {totals && (
        totals.balanced ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Trial Balance BALANCED ✓ (Dr {fmtINR(totals.debit)} = Cr {fmtINR(totals.credit)})
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
              OUT OF BALANCE by {fmtINR(Math.abs(totals.debit - totals.credit))}
            </p>
          </div>
        )
      )}

      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          {loading ? (
            <SkeletonRows />
          ) : rows.length === 0 ? (
            <EmptyState icon={Scale} label="No ledger rows yet" />
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Account</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Debit</TableHead>
                    <TableHead className="text-xs text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.code} className="border-border/20">
                      <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                      <TableCell className="py-2.5 text-xs">{r.name}</TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="border-border/40 bg-muted px-1.5 py-0 text-[9px] text-muted-foreground">
                          {r.accountType}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                        {r.debit > 0 ? fmtINR(r.debit) : '—'}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">
                        {r.credit > 0 ? fmtINR(r.credit) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-border/40 bg-muted/30 font-semibold">
                    <TableCell colSpan={3} className="py-2.5 text-right text-xs">TOTAL</TableCell>
                    <TableCell className="py-2.5 text-right text-xs font-bold tabular-nums">{fmtINR(totals?.debit)}</TableCell>
                    <TableCell className="py-2.5 text-right text-xs font-bold tabular-nums">{fmtINR(totals?.credit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── TAB: Party Ledger ─────────────────────────────────────────────────────

const PARTY_TYPES = ['CUSTOMER', 'SUPPLIER', 'VENDOR', 'BROKER']

function PartyLedgerTab() {
  const [partyType, setPartyType] = useState('CUSTOMER')
  const [partyId, setPartyId] = useState('')
  const [parties, setParties] = useState<PartyOption[]>([])
  const [partiesLoading, setPartiesLoading] = useState(false)
  const [ledger, setLedger] = useState<PartyLedger | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchParties = useCallback(async (type: string) => {
    setPartiesLoading(true)
    setPartyId('')
    setLedger(null)
    setError(null)
    try {
      let list: PartyOption[] = []
      if (type === 'CUSTOMER') {
        const d = await getJson<{ customers: { id: string; companyName: string }[] }>('/api/customers')
        list = (d.customers || []).map((c) => ({ id: c.id, label: c.companyName }))
      } else if (type === 'SUPPLIER') {
        const d = await getJson<{ suppliers: { id: string; name: string }[] }>('/api/suppliers')
        list = (d.suppliers || []).map((s) => ({ id: s.id, label: s.name }))
      } else if (type === 'VENDOR') {
        const d = await getJson<{ vendors: { id: string; vendorName: string }[] }>('/api/vendors')
        list = (d.vendors || []).map((v) => ({ id: v.id, label: v.vendorName }))
      } else {
        const d = await getJson<{ id: string; name: string }[]>('/api/brokers')
        list = (Array.isArray(d) ? d : []).map((b) => ({ id: b.id, label: b.name }))
      }
      setParties(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load party list')
    } finally {
      setPartiesLoading(false)
    }
  }, [])

  useEffect(() => { fetchParties(partyType) }, [fetchParties, partyType])

  const loadLedger = async () => {
    if (!partyId) { toast.error('Select a party first'); return }
    try {
      setLoading(true)
      setError(null)
      const d = await getJson<PartyLedger>(`/api/party-ledger?partyType=${partyType}&partyId=${partyId}`)
      setLedger(d)
    } catch (e: any) {
      setError(e?.message || 'Failed to load party ledger')
    } finally {
      setLoading(false)
    }
  }

  const diff = ledger
    ? Math.abs((ledger.documentBalance || 0) - (ledger.totals?.balance || 0))
    : 0

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr_auto]">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Party Type</Label>
              <Select value={partyType} onValueChange={setPartyType}>
                <SelectTrigger className="h-9 border-border bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Party</Label>
              <Select value={partyId} onValueChange={setPartyId} disabled={partiesLoading}>
                <SelectTrigger className="h-9 border-border bg-muted/50">
                  <SelectValue placeholder={partiesLoading ? 'Loading…' : 'Select party'} />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full gap-1.5 bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
                onClick={loadLedger}
                disabled={loading}
              >
                <Search className="h-3.5 w-3.5" /> {loading ? 'Loading…' : 'Load'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorBanner message={error} />}

      {/* Statement */}
      {ledger && (
        <Card className="glass-card border-border/40">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {ledger.partyType} statement
                </p>
                <p className="text-sm font-bold">{ledger.partyName || 'Party'}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Closing balance</p>
                <p className="text-2xl font-bold tabular-nums">{fmtINR(ledger.totals?.balance || 0)}</p>
                <p className="text-[10px] text-muted-foreground">
                  Dr {fmtINR(ledger.totals?.debit)} · Cr {fmtINR(ledger.totals?.credit)}
                </p>
              </div>
            </div>
            <Separator className="my-3 opacity-50" />
            {ledger.match === true && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> ✓ matches source documents
              </p>
            )}
            {ledger.match === false && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" /> ⚠ differs from documents by {fmtINR(diff)}
              </p>
            )}
            {ledger.match === null && (
              <p className="text-xs text-muted-foreground">No cross-check available for this party type</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entries */}
      {ledger && (
        <Card className="glass-card border-border/40">
          <CardContent className="p-4">
            {ledger.entries.length === 0 ? (
              <EmptyState icon={Users} label="No entries yet for this party" />
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30 hover:bg-transparent">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Entry No</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Debit</TableHead>
                      <TableHead className="text-xs text-right">Credit</TableHead>
                      <TableHead className="text-xs text-right">Running Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.entries.map((e, i) => (
                      <TableRow key={`${e.journalEntryId}-${i}`} className="border-border/20">
                        <TableCell className="py-2.5 text-xs text-muted-foreground">{fmtDate(e.date)}</TableCell>
                        <TableCell className="py-2.5 font-mono text-xs">{e.entryNo || '—'}</TableCell>
                        <TableCell className="max-w-[220px] truncate py-2.5 text-xs" title={e.description || ''}>
                          {e.description || '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                          {e.debit ? fmtINR(e.debit) : '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">
                          {e.credit ? fmtINR(e.credit) : '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-xs font-bold tabular-nums">{fmtINR(e.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-[10px] text-muted-foreground">
              CUSTOMER: debit = owes more · credit = paid&nbsp;&nbsp;|&nbsp;&nbsp;SUPPLIER/VENDOR/BROKER: credit = we owe, debit = we paid
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── MAIN MODULE ───────────────────────────────────────────────────────────

export function LedgerModule() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Ledger & Trial Balance</h1>
          <p className="text-xs text-muted-foreground">Double-entry journal, account balances & party statements</p>
        </div>
      </div>

      <Tabs defaultValue="journal" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="journal" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Journal Entries
          </TabsTrigger>
          <TabsTrigger value="trial-balance" className="gap-1.5 text-xs">
            <Scale className="h-3.5 w-3.5" /> Trial Balance
          </TabsTrigger>
          <TabsTrigger value="party" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Party Ledger
          </TabsTrigger>
        </TabsList>
        <TabsContent value="journal"><JournalTab /></TabsContent>
        <TabsContent value="trial-balance"><TrialBalanceTab /></TabsContent>
        <TabsContent value="party"><PartyLedgerTab /></TabsContent>
      </Tabs>
    </div>
  )
}
