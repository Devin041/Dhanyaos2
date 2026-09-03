'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BookOpen, Inbox, Landmark, CheckCircle2, XCircle, RefreshCw, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ChequeRow {
  id: string
  chequeNo: string
  direction: 'RECEIVED' | 'ISSUED' | string
  partyName: string | null
  amount: number
  bankName: string | null
  issueDate: string | null
  status: string
  bounceReason: string | null
  bankAccountId?: string | null
}

interface ChequeSummary {
  count: number
  inHand: number
  inHandValue: number
  deposited: number
  depositedValue: number
  cleared: number
  clearedValue: number
  bounced: number
  bouncedValue: number
  receivedValue: number
  issuedValue: number
}

interface BankAccount {
  id: string
  accountName: string
  accountType: string
  currentBalance: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtINR = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

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
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cheque register unavailable</p>
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

function DirectionChip({ direction }: { direction: string }) {
  const received = direction === 'RECEIVED'
  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0 text-[9px] ${
        received
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400'
      }`}
    >
      {direction}
    </Badge>
  )
}

function StatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  const cls =
    status === 'Cleared'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'Deposited'
        ? 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'
        : status === 'Bounced'
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant="outline" className={`px-1.5 py-0 text-[9px] ${cls}`}>{status}</Badge>
      {status === 'Bounced' && reason && (
        <span className="max-w-[140px] truncate text-[10px] text-muted-foreground" title={reason}>{reason}</span>
      )}
    </div>
  )
}

// ─── MAIN MODULE ───────────────────────────────────────────────────────────

export function ChequebookModule() {
  const [cheques, setCheques] = useState<ChequeRow[]>([])
  const [summary, setSummary] = useState<ChequeSummary | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [depositTarget, setDepositTarget] = useState<{ cheque: ChequeRow; bankAccountId: string } | null>(null)
  const [depositSaving, setDepositSaving] = useState(false)
  const [bounceTarget, setBounceTarget] = useState<{ cheque: ChequeRow; reason: string } | null>(null)
  const [bounceSaving, setBounceSaving] = useState(false)

  const fetchCheques = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [cqRes, acctRes] = await Promise.all([
        fetch('/api/cheques'),
        fetch('/api/bank-accounts'),
      ])
      if (cqRes.ok) {
        const d = await cqRes.json()
        setCheques(d.cheques || [])
        setSummary(d.summary || null)
      } else {
        const d = await cqRes.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to load cheques')
      }
      if (acctRes.ok) {
        const d = await acctRes.json()
        setAccounts(d.accounts || [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load cheque register')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCheques() }, [fetchCheques])

  const bankAccounts = accounts.filter((a) => a.accountType !== 'Cash' && a.accountType !== 'Petty Cash')

  const patchCheque = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/cheques/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const r = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(r?.error || 'Action failed')
    return r
  }

  const handleClear = async (c: ChequeRow) => {
    setBusyId(c.id)
    try {
      const r = await patchCheque(c.id, { action: 'clear' })
      toast.success(`Cheque cleared — bank ledger posted ✓${r?.journal?.entryNo ? ` (JE ${r.journal.entryNo})` : ''}`)
      fetchCheques()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to clear cheque')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeposit = async () => {
    if (!depositTarget) return
    if (!depositTarget.bankAccountId) { toast.error('Select the bank account to deposit into'); return }
    setDepositSaving(true)
    try {
      await patchCheque(depositTarget.cheque.id, {
        action: 'deposit',
        bankAccountId: depositTarget.bankAccountId,
      })
      toast.success(`Cheque ${depositTarget.cheque.chequeNo} deposited — awaiting clearance`)
      setDepositTarget(null)
      fetchCheques()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to deposit cheque')
    } finally {
      setDepositSaving(false)
    }
  }

  const handleBounce = async () => {
    if (!bounceTarget) return
    setBounceSaving(true)
    try {
      const r = await patchCheque(bounceTarget.cheque.id, {
        action: 'bounce',
        reason: bounceTarget.reason || null,
      })
      toast.success(
        `Cheque marked BOUNCED${r?.reversal?.entryNo ? ` — reversal JE ${r.reversal.entryNo}` : ''}`
      )
      if (Array.isArray(r?.warnings) && r.warnings.length) {
        toast.warning(r.warnings.join(' · '))
      }
      setBounceTarget(null)
      fetchCheques()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mark cheque bounced')
    } finally {
      setBounceSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Cheque Book</h1>
            <p className="text-xs text-muted-foreground">In-hand, deposited, cleared & bounced register</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={fetchCheques}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Stat cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="glass-card border-border/40 border-l-2 border-l-amber-500/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Inbox className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">In Hand</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtINR(summary.inHandValue)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.inHand} cheque(s)</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/40 border-l-2 border-l-orange-500/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Landmark className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Deposited</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{fmtINR(summary.depositedValue)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.deposited} awaiting clearance</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/40 border-l-2 border-l-emerald-500/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cleared</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtINR(summary.clearedValue)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.cleared} realised</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-rose-500/30 border-l-2 border-l-rose-500/40 bg-rose-500/5">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bounced</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{fmtINR(summary.bouncedValue)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.bounced} dishonoured</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Register */}
      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          {cheques.length === 0 ? (
            <EmptyState icon={Receipt} label="No cheques yet" />
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs">Cheque No</TableHead>
                    <TableHead className="text-xs">Direction</TableHead>
                    <TableHead className="text-xs">Party</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Bank</TableHead>
                    <TableHead className="text-xs">Issue Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cheques.map((c) => {
                    const active = c.status === 'In Hand' || c.status === 'Deposited'
                    return (
                      <TableRow key={c.id} className="border-border/20">
                        <TableCell className="py-2.5 font-mono text-xs">{c.chequeNo}</TableCell>
                        <TableCell className="py-2.5"><DirectionChip direction={c.direction} /></TableCell>
                        <TableCell className="py-2.5 text-xs">{c.partyName || '—'}</TableCell>
                        <TableCell className="py-2.5 text-right text-xs font-semibold tabular-nums">{fmtINR(c.amount)}</TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">{c.bankName || '—'}</TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">{fmtDate(c.issueDate)}</TableCell>
                        <TableCell className="py-2.5"><StatusBadge status={c.status} reason={c.bounceReason} /></TableCell>
                        <TableCell className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {c.status === 'In Hand' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === c.id}
                                className="h-7 gap-1 border-amber-500/40 px-2 text-[10px] text-amber-700 dark:text-amber-400"
                                onClick={() => setDepositTarget({ cheque: c, bankAccountId: c.bankAccountId || '' })}
                              >
                                <Landmark className="h-3 w-3" /> Deposit
                              </Button>
                            )}
                            {active && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busyId === c.id}
                                  className="h-7 gap-1 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700"
                                  onClick={() => handleClear(c)}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Mark Cleared
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyId === c.id}
                                  className="h-7 gap-1 px-2 text-[10px] text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                                  onClick={() => setBounceTarget({ cheque: c, reason: '' })}
                                >
                                  <XCircle className="h-3 w-3" /> Bounce
                                </Button>
                              </>
                            )}
                            {!active && <span className="text-[10px] text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposit dialog */}
      {depositTarget && (
        <Dialog open onOpenChange={(v) => { if (!v) setDepositTarget(null) }}>
          <DialogContent className="glass-card border-border/50 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Deposit Cheque {depositTarget.cheque.chequeNo}</DialogTitle>
              <DialogDescription>
                {depositTarget.cheque.direction === 'RECEIVED' ? 'Received from' : 'Issued to'}{' '}
                {depositTarget.cheque.partyName || '—'} · {fmtINR(depositTarget.cheque.amount)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">Cheque amount</span>
                <span className="text-sm font-bold tabular-nums">{fmtINR(depositTarget.cheque.amount)}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Deposit Into Bank Account *</Label>
                <Select
                  value={depositTarget.bankAccountId}
                  onValueChange={(v) => setDepositTarget((t) => (t ? { ...t, bankAccountId: v } : t))}
                >
                  <SelectTrigger className="h-9 border-border bg-muted/50">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.accountName} · {fmtINR(a.currentBalance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDepositTarget(null)}>Cancel</Button>
              <Button className="bg-amber-600 text-white hover:bg-amber-700" onClick={handleDeposit} disabled={depositSaving}>
                {depositSaving ? 'Depositing…' : 'Deposit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Bounce dialog */}
      {bounceTarget && (
        <Dialog open onOpenChange={(v) => { if (!v) setBounceTarget(null) }}>
          <DialogContent className="glass-card border-border/50 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-rose-600 dark:text-rose-400">Mark Cheque BOUNCED</DialogTitle>
              <DialogDescription>
                Cheque {bounceTarget.cheque.chequeNo} · {fmtINR(bounceTarget.cheque.amount)} — posts a reversal
                journal entry and rolls back the linked document.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">Bounce Reason</Label>
                <Textarea
                  rows={3}
                  placeholder="e.g. Insufficient funds, signature mismatch…"
                  className="border-border bg-muted/50"
                  value={bounceTarget.reason}
                  onChange={(e) => setBounceTarget((t) => (t ? { ...t, reason: e.target.value } : t))}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Reverses the original payment journal, restores receivable/payable, and rolls back invoice /
                PO / vendor-bill paidAmount.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBounceTarget(null)}>Cancel</Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={handleBounce} disabled={bounceSaving}>
                {bounceSaving ? 'Posting reversal…' : 'Mark Bounced'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
