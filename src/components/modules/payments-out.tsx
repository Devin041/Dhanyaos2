'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowUpRight, Banknote, Landmark, AlertTriangle, Truck, FileText, HandCoins, Receipt,
  Plus, RefreshCw, Repeat,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string
  accountName: string
  bankName: string | null
  accountType: string
  currentBalance: number
}

interface SupplierPO {
  id: string
  poNumber: string
  supplierId: string | null
  supplier: { id: string; name: string } | null
  styleNo: string | null
  styleName?: string | null
  totalAmount: number
  paidAmount: number
  status: string
  paymentStatus: string
}

interface VendorBillRow {
  id: string
  billNo: string
  vendorId: string | null
  vendor: { id: string; vendorName: string } | null
  description: string | null
  totalAmount: number
  paidAmount: number
  status: string
}

interface CostSheetRow {
  id: string
  sheetNo: string
  styleNo: string
  styleName?: string | null
  brokerCommissionAmount: number
  status: string
}

interface PaymentOutRow {
  id: string
  paymentNo: string
  paymentDate: string
  payeeType: string
  payeeName: string | null
  amount: number
  tdsAmount: number
  netPaidAmount: number
  paymentMode: string
  costSheetId: string | null
  status: string
}

interface PaymentOutSummary {
  count: number
  totalOut: number
  totalTds: number
  dues: { supplier: number; vendorBills: number; broker: number; total: number }
}

interface SalesOrderRow {
  id: string
  orderNo: string
  items: { styleNo: string | null; styleName: string | null }[]
}

interface ExpenseVoucherRow {
  id: string
  voucherNo: string
  expenseDate: string
  category: string
  description: string | null
  amount: number
  directType: string
  styleNo: string | null
  paidFromType: string
}

interface RecurringSuggestion {
  id: string
  voucherNo: string
  category: string
  description: string | null
  amount: number
  recurrence: string | null
  paidFromType: string
}

interface ExpenseSummary {
  count: number
  total: number
  direct: number
  indirect: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtINR = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const round2 = (n: number) => Math.round((n || 0) * 100) / 100

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

function PaymentStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Paid'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'Partial' || status === 'Partially Paid'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : status === 'Overdue'
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          : status === 'Unpaid' || status === 'Pending'
            ? 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'
            : 'border-border/40 bg-muted text-muted-foreground'
  return <Badge variant="outline" className={`px-1.5 py-0 text-[9px] ${cls}`}>{status}</Badge>
}

// ─── Shared Pay-Out dialog (Supplier / Vendor Bill / Broker) ───────────────

interface PayForm {
  amount: string
  paymentMode: string
  bankAccountId: string
  referenceNo: string
  notes: string
  chequeNo: string
  chequeBankName: string
  tdsAmount: string
  tdsSection: string
}

interface PayOutDialogProps {
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  balance?: number
  defaultAmount: number
  accounts: BankAccount[]
  showTds?: boolean
  autoTds?: boolean
  buildBody: (form: PayForm) => Record<string, unknown>
  onPosted: () => void
}

function PayOutDialog({
  onOpenChange, title, subtitle, balance, defaultAmount, accounts, showTds, autoTds, buildBody, onPosted,
}: PayOutDialogProps) {
  const [form, setForm] = useState<PayForm>({
    amount: String(defaultAmount || 0),
    paymentMode: 'NEFT',
    bankAccountId: '',
    referenceNo: '',
    notes: '',
    chequeNo: '',
    chequeBankName: '',
    tdsAmount: String(Math.round((defaultAmount || 0) * 0.05)),
    tdsSection: '194H',
  })
  const [saving, setSaving] = useState(false)

  const bankAccounts = accounts.filter((a) => a.accountType !== 'Cash' && a.accountType !== 'Petty Cash')
  const amount = parseFloat(form.amount) || 0
  const tds = parseFloat(form.tdsAmount) || 0
  const net = amount - tds

  const set = (patch: Partial<PayForm>) => setForm((f) => ({ ...f, ...patch }))

  const onAmountChange = (v: string) => {
    const parsed = parseFloat(v) || 0
    setForm((f) => ({
      ...f,
      amount: v,
      tdsAmount: autoTds ? String(Math.round(parsed * 0.05)) : f.tdsAmount,
    }))
  }

  const submit = async () => {
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (showTds && (tds < 0 || tds >= amount)) { toast.error('TDS must be ≥ 0 and less than the amount'); return }
    if (form.paymentMode !== 'Cash' && !form.bankAccountId) {
      toast.error('Select a bank account (or switch mode to Cash)')
      return
    }
    if (form.paymentMode === 'Cheque' && !form.chequeNo.trim()) {
      toast.error('Cheque number is required for cheque mode')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/payment-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(form)),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r?.error || 'Failed to record payment')
      toast.success(`Payment ${r?.payment?.paymentNo || ''} recorded — Ledger posted ✓ (JE ${r?.journal?.entryNo || '—'})`)
      onPosted()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/50 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 py-2">
          {typeof balance === 'number' && balance > 0 && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">Outstanding balance</span>
                <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">{fmtINR(balance)}</span>
              </div>
              <Separator className="opacity-50" />
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Amount (₹) *</Label>
              <Input
                type="number"
                className="h-9 border-border bg-muted/50"
                value={form.amount}
                onChange={(e) => onAmountChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Payment Mode</Label>
              <Select value={form.paymentMode} onValueChange={(v) => set({ paymentMode: v })}>
                <SelectTrigger className="h-9 border-border bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['NEFT', 'RTGS', 'UPI', 'Cash', 'Cheque'].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showTds && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">TDS 194H (5%)</Label>
                  <Input
                    type="number"
                    className="h-9 border-border bg-muted/50"
                    value={form.tdsAmount}
                    onChange={(e) => set({ tdsAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">TDS Section</Label>
                  <Input
                    className="h-9 border-border bg-muted/50"
                    value={form.tdsSection}
                    onChange={(e) => set({ tdsSection: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Net paid: <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtINR(net)}</span> (amount − TDS)
              </p>
            </>
          )}

          <div className="space-y-2">
            <Label className="text-xs">
              Bank Account {form.paymentMode !== 'Cash' ? '*' : '(not needed for cash)'}
            </Label>
            <Select
              value={form.bankAccountId}
              onValueChange={(v) => set({ bankAccountId: v })}
              disabled={form.paymentMode === 'Cash'}
            >
              <SelectTrigger className="h-9 border-border bg-muted/50">
                <SelectValue placeholder={form.paymentMode === 'Cash' ? 'Cash payment' : 'Select account'} />
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

          {form.paymentMode === 'Cheque' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Cheque No *</Label>
                <Input
                  placeholder="e.g. 004512"
                  className="h-9 border-border bg-muted/50"
                  value={form.chequeNo}
                  onChange={(e) => set({ chequeNo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Cheque Bank Name</Label>
                <Input
                  placeholder="e.g. HDFC Bank"
                  className="h-9 border-border bg-muted/50"
                  value={form.chequeBankName}
                  onChange={(e) => set({ chequeBankName: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Reference No (UTR / txn id)</Label>
            <Input
              placeholder="Optional"
              className="h-9 border-border bg-muted/50"
              value={form.referenceNo}
              onChange={(e) => set({ referenceNo: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional"
              className="border-border bg-muted/50"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-amber-600 text-white hover:bg-amber-700" onClick={submit} disabled={saving}>
            {saving ? 'Posting…' : `Pay ${fmtINR(amount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TAB: Suppliers ────────────────────────────────────────────────────────

interface TabShared {
  accounts: BankAccount[]
  refresh: () => void
}

function SuppliersTab({ accounts, refresh }: TabShared) {
  const [orders, setOrders] = useState<SupplierPO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payRow, setPayRow] = useState<SupplierPO | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const d = await getJson<{ orders: SupplierPO[] }>('/api/purchase-orders?limit=100')
      setOrders((d.orders || []).filter((o) => o.supplierId && o.status !== 'Cancelled'))
    } catch (e: any) {
      setError(e?.message || 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  return (
    <Card className="glass-card border-border/40">
      <CardContent className="p-4">
        {error ? (
          <ErrorBanner message={error} />
        ) : loading ? (
          <SkeletonRows />
        ) : orders.length === 0 ? (
          <EmptyState icon={Truck} label="No supplier purchase orders yet" />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs">PO No</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Balance</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const bal = round2((o.totalAmount || 0) - (o.paidAmount || 0))
                  return (
                    <TableRow key={o.id} className="border-border/20">
                      <TableCell className="py-2.5 font-mono text-xs">{o.poNumber}</TableCell>
                      <TableCell className="py-2.5 text-xs">{o.supplier?.name || '—'}</TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">{o.styleNo || o.styleName || '—'}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums">{fmtINR(o.totalAmount)}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{fmtINR(o.paidAmount)}</TableCell>
                      <TableCell className={`py-2.5 text-right text-xs font-semibold tabular-nums ${bal > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                        {fmtINR(bal)}
                      </TableCell>
                      <TableCell className="py-2.5"><PaymentStatusBadge status={o.paymentStatus || o.status} /></TableCell>
                      <TableCell className="py-2.5 text-right">
                        {bal > 0.01 ? (
                          <Button
                            size="sm"
                            className="h-7 gap-1 bg-amber-600 text-[10px] text-white hover:bg-amber-700"
                            onClick={() => setPayRow(o)}
                          >
                            <Banknote className="h-3 w-3" /> Pay
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Settled</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {payRow && (
        <PayOutDialog
          title="Pay Supplier"
          subtitle={`${payRow.poNumber} · ${payRow.supplier?.name || 'Supplier'}`}
          balance={round2(payRow.totalAmount - payRow.paidAmount)}
          defaultAmount={Math.max(0, round2(payRow.totalAmount - payRow.paidAmount))}
          accounts={accounts}
          buildBody={(f) => ({
            payeeType: 'SUPPLIER',
            poId: payRow.id,
            payeeId: payRow.supplierId,
            payeeName: payRow.supplier?.name || null,
            amount: parseFloat(f.amount),
            paymentMode: f.paymentMode,
            bankAccountId: f.paymentMode === 'Cash' ? null : f.bankAccountId,
            referenceNo: f.referenceNo || null,
            notes: f.notes || null,
            cheque: f.paymentMode === 'Cheque' ? { chequeNo: f.chequeNo, bankName: f.chequeBankName } : null,
          })}
          onPosted={() => { fetchOrders(); refresh() }}
          onOpenChange={(v) => { if (!v) setPayRow(null) }}
        />
      )}
    </Card>
  )
}

// ─── TAB: Vendor Bills ─────────────────────────────────────────────────────

const UNPAID_STATUSES = ['Pending', 'Partial', 'Partially Paid', 'Overdue']

function VendorBillsTab({ accounts, refresh }: TabShared) {
  const [bills, setBills] = useState<VendorBillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payRow, setPayRow] = useState<VendorBillRow | null>(null)

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const d = await getJson<{ bills: VendorBillRow[] }>('/api/vendor-bills?limit=100')
      setBills((d.bills || []).filter((b) => UNPAID_STATUSES.includes(b.status)))
    } catch (e: any) {
      setError(e?.message || 'Failed to load vendor bills')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBills() }, [fetchBills])

  return (
    <Card className="glass-card border-border/40">
      <CardContent className="p-4">
        {error ? (
          <ErrorBanner message={error} />
        ) : loading ? (
          <SkeletonRows />
        ) : bills.length === 0 ? (
          <EmptyState icon={FileText} label="No unpaid vendor bills yet" />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs">Bill No</TableHead>
                  <TableHead className="text-xs">Vendor</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Balance</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((b) => {
                  const bal = round2((b.totalAmount || 0) - (b.paidAmount || 0))
                  return (
                    <TableRow key={b.id} className="border-border/20">
                      <TableCell className="py-2.5 font-mono text-xs">{b.billNo}</TableCell>
                      <TableCell className="py-2.5 text-xs">{b.vendor?.vendorName || '—'}</TableCell>
                      <TableCell className="max-w-[160px] truncate py-2.5 text-xs text-muted-foreground" title={b.description || ''}>
                        {b.description || '—'}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums">{fmtINR(b.totalAmount)}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{fmtINR(b.paidAmount)}</TableCell>
                      <TableCell className={`py-2.5 text-right text-xs font-semibold tabular-nums ${bal > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                        {fmtINR(bal)}
                      </TableCell>
                      <TableCell className="py-2.5"><PaymentStatusBadge status={b.status} /></TableCell>
                      <TableCell className="py-2.5 text-right">
                        {bal > 0.01 ? (
                          <Button
                            size="sm"
                            className="h-7 gap-1 bg-amber-600 text-[10px] text-white hover:bg-amber-700"
                            onClick={() => setPayRow(b)}
                          >
                            <Banknote className="h-3 w-3" /> Pay
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Settled</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {payRow && (
        <PayOutDialog
          title="Pay Vendor Bill"
          subtitle={`${payRow.billNo} · ${payRow.vendor?.vendorName || 'Vendor'}`}
          balance={round2(payRow.totalAmount - payRow.paidAmount)}
          defaultAmount={Math.max(0, round2(payRow.totalAmount - payRow.paidAmount))}
          accounts={accounts}
          buildBody={(f) => ({
            payeeType: 'VENDOR_BILL',
            vendorBillId: payRow.id,
            payeeId: payRow.vendorId,
            payeeName: payRow.vendor?.vendorName || null,
            amount: parseFloat(f.amount),
            paymentMode: f.paymentMode,
            bankAccountId: f.paymentMode === 'Cash' ? null : f.bankAccountId,
            referenceNo: f.referenceNo || null,
            notes: f.notes || null,
            cheque: f.paymentMode === 'Cheque' ? { chequeNo: f.chequeNo, bankName: f.chequeBankName } : null,
          })}
          onPosted={() => { fetchBills(); refresh() }}
          onOpenChange={(v) => { if (!v) setPayRow(null) }}
        />
      )}
    </Card>
  )
}

// ─── TAB: Broker Commission ────────────────────────────────────────────────

interface BrokerTabProps extends TabShared {
  payments: PaymentOutRow[]
  brokerDue: number
}

function BrokerTab({ accounts, payments, brokerDue, refresh }: BrokerTabProps) {
  const [sheets, setSheets] = useState<CostSheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paySheet, setPaySheet] = useState<CostSheetRow | null>(null)

  const fetchSheets = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const d = await getJson<{ costSheets: CostSheetRow[] }>('/api/cost-sheets?limit=100')
      setSheets((d.costSheets || []).filter((c) => (c.brokerCommissionAmount || 0) > 0 && c.status !== 'Cancelled'))
    } catch (e: any) {
      setError(e?.message || 'Failed to load cost sheets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSheets() }, [fetchSheets])

  const paidBySheet = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of payments) {
      if (p.payeeType === 'BROKER' && p.costSheetId) {
        m.set(p.costSheetId, round2((m.get(p.costSheetId) || 0) + (p.amount || 0)))
      }
    }
    return m
  }, [payments])

  const brokerPayments = useMemo(() => payments.filter((p) => p.payeeType === 'BROKER'), [payments])

  return (
    <div className="space-y-4">
      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Broker commission (per cost sheet)</p>
            <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 px-1.5 py-0 text-[9px] text-violet-600 dark:text-violet-400">
              Dues: {fmtINR(brokerDue)}
            </Badge>
          </div>
          {error ? (
            <ErrorBanner message={error} />
          ) : loading ? (
            <SkeletonRows />
          ) : sheets.length === 0 ? (
            <EmptyState icon={HandCoins} label="No cost sheets with broker commission yet" />
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs">Sheet No</TableHead>
                    <TableHead className="text-xs">Style</TableHead>
                    <TableHead className="text-xs">Broker</TableHead>
                    <TableHead className="text-xs text-right">Commission</TableHead>
                    <TableHead className="text-xs text-right">Paid</TableHead>
                    <TableHead className="text-xs text-right">Balance</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheets.map((c) => {
                    const paid = paidBySheet.get(c.id) || 0
                    const bal = round2((c.brokerCommissionAmount || 0) - paid)
                    return (
                      <TableRow key={c.id} className="border-border/20">
                        <TableCell className="py-2.5 font-mono text-xs">{c.sheetNo}</TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">{c.styleNo || '—'}</TableCell>
                        <TableCell className="py-2.5 text-xs text-violet-600 dark:text-violet-400">Broker (per cost sheet)</TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums">{fmtINR(c.brokerCommissionAmount)}</TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{fmtINR(paid)}</TableCell>
                        <TableCell className={`py-2.5 text-right text-xs font-semibold tabular-nums ${bal > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                          {fmtINR(bal)}
                        </TableCell>
                        <TableCell className="py-2.5"><PaymentStatusBadge status={c.status} /></TableCell>
                        <TableCell className="py-2.5 text-right">
                          {bal > 0.01 ? (
                            <Button
                              size="sm"
                              className="h-7 gap-1 bg-violet-600 text-[10px] text-white hover:bg-violet-700"
                              onClick={() => setPaySheet(c)}
                            >
                              <HandCoins className="h-3 w-3" /> Pay
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Settled</span>
                          )}
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

      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-semibold">Broker payments made</p>
          {brokerPayments.length === 0 ? (
            <EmptyState icon={HandCoins} label="No broker payments yet" />
          ) : (
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs">Payment No</TableHead>
                    <TableHead className="text-xs">Payee</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Gross</TableHead>
                    <TableHead className="text-xs text-right">TDS</TableHead>
                    <TableHead className="text-xs text-right">Net Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brokerPayments.map((p) => (
                    <TableRow key={p.id} className="border-border/20">
                      <TableCell className="py-2.5 font-mono text-xs">{p.paymentNo}</TableCell>
                      <TableCell className="py-2.5 text-xs">{p.payeeName || '—'}</TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">{fmtDate(p.paymentDate)}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums">{fmtINR(p.amount)}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums text-violet-600 dark:text-violet-400">{fmtINR(p.tdsAmount)}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{fmtINR(p.netPaidAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {paySheet && (
        <PayOutDialog
          title="Pay Broker Commission"
          subtitle={`${paySheet.sheetNo} · ${paySheet.styleNo} — commission ${fmtINR(paySheet.brokerCommissionAmount)}`}
          balance={round2(paySheet.brokerCommissionAmount - (paidBySheet.get(paySheet.id) || 0))}
          defaultAmount={Math.max(0, round2(paySheet.brokerCommissionAmount - (paidBySheet.get(paySheet.id) || 0)))}
          accounts={accounts}
          showTds
          autoTds
          buildBody={(f) => ({
            payeeType: 'BROKER',
            costSheetId: paySheet.id,
            payeeName: `Broker (${paySheet.sheetNo})`,
            amount: parseFloat(f.amount),
            tdsAmount: parseFloat(f.tdsAmount) || 0,
            tdsSection: f.tdsSection || '194H',
            paymentMode: f.paymentMode,
            bankAccountId: f.paymentMode === 'Cash' ? null : f.bankAccountId,
            referenceNo: f.referenceNo || null,
            notes: f.notes || null,
            cheque: f.paymentMode === 'Cheque' ? { chequeNo: f.chequeNo, bankName: f.chequeBankName } : null,
          })}
          onPosted={() => { fetchSheets(); refresh() }}
          onOpenChange={(v) => { if (!v) setPaySheet(null) }}
        />
      )}
    </div>
  )
}

// ─── TAB: Expenses ─────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'Rent', 'Salary', 'Freight Outward', 'Packing', 'Petty Cash',
  'Electricity', 'Phone/Internet', 'Loading', 'Transport', 'Other',
]

interface ExpenseForm {
  expenseDate: string
  category: string
  otherCategory: string
  description: string
  amount: string
  gstAmount: string
  directType: 'DIRECT' | 'INDIRECT'
  salesOrderId: string
  styleNo: string
  paidFromType: 'BANK' | 'CASH'
  bankAccountId: string
  referenceNo: string
  notes: string
  isRecurring: boolean
  recurrence: 'MONTHLY' | 'QUARTERLY'
}

const emptyExpenseForm = (): ExpenseForm => ({
  expenseDate: new Date().toISOString().slice(0, 10),
  category: 'Rent',
  otherCategory: '',
  description: '',
  amount: '',
  gstAmount: '0',
  directType: 'INDIRECT',
  salesOrderId: '',
  styleNo: '',
  paidFromType: 'BANK',
  bankAccountId: '',
  referenceNo: '',
  notes: '',
  isRecurring: false,
  recurrence: 'MONTHLY',
})

interface AddExpenseDialogProps {
  accounts: BankAccount[]
  orders: SalesOrderRow[]
  initial?: Partial<ExpenseForm>
  onClose: () => void
  onSaved: () => void
}

function AddExpenseDialog({ accounts, orders, initial, onClose, onSaved }: AddExpenseDialogProps) {
  const [form, setForm] = useState<ExpenseForm>({ ...emptyExpenseForm(), ...initial })
  const [saving, setSaving] = useState(false)

  const bankAccounts = accounts.filter((a) => a.accountType !== 'Cash' && a.accountType !== 'Petty Cash')
  const set = (patch: Partial<ExpenseForm>) => setForm((f) => ({ ...f, ...patch }))

  const onOrderPick = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId)
    const firstStyle = order?.items?.find((it) => it.styleNo)?.styleNo || ''
    set({ salesOrderId: orderId, styleNo: firstStyle || form.styleNo })
  }

  const submit = async () => {
    const category = form.category === 'Other' ? (form.otherCategory.trim() || 'Other') : form.category
    const amount = parseFloat(form.amount)
    if (!category) { toast.error('Category is required'); return }
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (form.directType === 'DIRECT' && !form.salesOrderId) {
      toast.error('Select a sales order for direct (order-linked) expenses')
      return
    }
    if (form.paidFromType === 'BANK' && !form.bankAccountId) {
      toast.error('Select a bank account for bank-paid expenses')
      return
    }
    setSaving(true)
    try {
      const order = orders.find((o) => o.id === form.salesOrderId)
      const firstItem = order?.items?.find((it) => it.styleNo || it.styleName)
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseDate: form.expenseDate,
          category,
          description: form.description || null,
          amount,
          gstAmount: parseFloat(form.gstAmount) || 0,
          directType: form.directType,
          salesOrderId: form.directType === 'DIRECT' ? form.salesOrderId : null,
          styleNo: form.directType === 'DIRECT' ? (form.styleNo || null) : null,
          styleName: form.directType === 'DIRECT' ? (firstItem?.styleName || null) : null,
          paidFromType: form.paidFromType,
          bankAccountId: form.paidFromType === 'BANK' ? form.bankAccountId : null,
          referenceNo: form.referenceNo || null,
          notes: form.notes || null,
          isRecurring: form.isRecurring,
          recurrence: form.isRecurring ? form.recurrence : null,
        }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r?.error || 'Failed to record expense')
      toast.success(`Expense ${r?.voucher?.voucherNo || ''} recorded — Ledger posted ✓ (JE ${r?.journal?.entryNo || '—'})`)
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="glass-card max-h-[90vh] overflow-y-auto border-border/50 sm:max-w-lg scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Add Expense Voucher</DialogTitle>
          <DialogDescription>Auto-posts a journal entry + cash-book row</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                className="h-9 border-border bg-muted/50"
                value={form.expenseDate}
                onChange={(e) => set({ expenseDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Category *</Label>
              <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger className="h-9 border-border bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c === 'Other' ? 'Other…' : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.category === 'Other' && (
            <div className="space-y-2">
              <Label className="text-xs">Specify Category *</Label>
              <Input
                placeholder="e.g. Insurance, Repairs…"
                className="h-9 border-border bg-muted/50"
                value={form.otherCategory}
                onChange={(e) => set({ otherCategory: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Description</Label>
            <Input
              placeholder="e.g. Office rent — November"
              className="h-9 border-border bg-muted/50"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Amount (₹) *</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9 border-border bg-muted/50"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">GST Amount (₹, ITC)</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9 border-border bg-muted/50"
                value={form.gstAmount}
                onChange={(e) => set({ gstAmount: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Expense Type</Label>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-1">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${form.directType === 'DIRECT' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => set({ directType: 'DIRECT' })}
              >
                DIRECT · order-linked
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${form.directType === 'INDIRECT' ? 'bg-muted-foreground text-white shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => set({ directType: 'INDIRECT' })}
              >
                INDIRECT
              </button>
            </div>
          </div>

          {form.directType === 'DIRECT' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Sales Order *</Label>
                <Select value={form.salesOrderId} onValueChange={onOrderPick}>
                  <SelectTrigger className="h-9 border-border bg-muted/50">
                    <SelectValue placeholder="Select order" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.orderNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Style No</Label>
                <Input
                  placeholder="Auto-filled from order"
                  className="h-9 border-border bg-muted/50"
                  value={form.styleNo}
                  onChange={(e) => set({ styleNo: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Paid From</Label>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-1">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${form.paidFromType === 'BANK' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => set({ paidFromType: 'BANK' })}
              >
                BANK
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${form.paidFromType === 'CASH' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => set({ paidFromType: 'CASH' })}
              >
                CASH
              </button>
            </div>
          </div>

          {form.paidFromType === 'BANK' && (
            <div className="space-y-2">
              <Label className="text-xs">Bank Account *</Label>
              <Select value={form.bankAccountId} onValueChange={(v) => set({ bankAccountId: v })}>
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Reference No</Label>
              <Input
                placeholder="Optional"
                className="h-9 border-border bg-muted/50"
                value={form.referenceNo}
                onChange={(e) => set({ referenceNo: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional"
              className="border-border bg-muted/50"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="exp-recurring"
              checked={form.isRecurring}
              onCheckedChange={(v) => set({ isRecurring: v === true })}
            />
            <Label htmlFor="exp-recurring" className="text-xs">Recurring expense</Label>
          </div>

          {form.isRecurring && (
            <div className="space-y-2">
              <Label className="text-xs">Recurrence</Label>
              <Select value={form.recurrence} onValueChange={(v) => set({ recurrence: v as 'MONTHLY' | 'QUARTERLY' })}>
                <SelectTrigger className="h-9 border-border bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">MONTHLY</SelectItem>
                  <SelectItem value="QUARTERLY">QUARTERLY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-amber-600 text-white hover:bg-amber-700" onClick={submit} disabled={saving}>
            {saving ? 'Posting…' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExpensesTab({ accounts, refresh }: TabShared) {
  const [vouchers, setVouchers] = useState<ExpenseVoucherRow[]>([])
  const [expSummary, setExpSummary] = useState<ExpenseSummary | null>(null)
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([])
  const [orders, setOrders] = useState<SalesOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [preset, setPreset] = useState<Partial<ExpenseForm>>({})

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const d = await getJson<{
        vouchers: ExpenseVoucherRow[]
        summary: ExpenseSummary
        recurringSuggestions: RecurringSuggestion[]
      }>('/api/expenses')
      setVouchers(d.vouchers || [])
      setExpSummary(d.summary || null)
      setSuggestions(d.recurringSuggestions || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      const d = await getJson<{ orders: SalesOrderRow[] }>('/api/orders?limit=50')
      setOrders(d.orders || [])
    } catch { /* order list is optional here — dialog shows whatever loaded */ }
  }, [])

  useEffect(() => {
    fetchExpenses()
    fetchOrders()
  }, [fetchExpenses, fetchOrders])

  const quickAdd = (s: RecurringSuggestion) => {
    const known = EXPENSE_CATEGORIES.includes(s.category)
    setPreset({
      category: known ? s.category : 'Other',
      otherCategory: known ? '' : s.category,
      description: s.description || '',
      amount: String(s.amount || ''),
      isRecurring: true,
      recurrence: (s.recurrence === 'QUARTERLY' ? 'QUARTERLY' : 'MONTHLY'),
      paidFromType: s.paidFromType === 'CASH' ? 'CASH' : 'BANK',
    })
    setAddOpen(true)
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Card className="glass-card border-border/40 border-l-2 border-l-amber-500/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Direct (order-linked)</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtINR(expSummary?.direct)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Indirect</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-muted-foreground">{fmtINR(expSummary?.indirect)}</p>
            </CardContent>
          </Card>
        </div>
        <Button
          className="h-auto gap-1.5 self-start bg-amber-600 text-white hover:bg-amber-700 sm:self-stretch"
          onClick={() => { setPreset({}); setAddOpen(true) }}
        >
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2.5">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Recurring this month</p>
              <div className="mt-1.5 space-y-1.5">
                {suggestions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {s.category} · <span className="tabular-nums">{fmtINR(s.amount)}</span>
                      {s.recurrence ? ` · ${s.recurrence.toLowerCase()}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 border-amber-500/40 px-2 text-[10px] text-amber-700 dark:text-amber-400"
                      onClick={() => quickAdd(s)}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          {loading ? (
            <SkeletonRows />
          ) : vouchers.length === 0 ? (
            <EmptyState icon={Receipt} label="No expenses yet" />
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs">Voucher No</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Order/Style</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Paid From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id} className="border-border/20">
                      <TableCell className="py-2.5 font-mono text-xs">{v.voucherNo}</TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">{fmtDate(v.expenseDate)}</TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="border-border/40 bg-muted px-1.5 py-0 text-[9px] text-muted-foreground">
                          {v.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate py-2.5 text-xs text-muted-foreground" title={v.description || ''}>
                        {v.description || '—'}
                      </TableCell>
                      <TableCell className="py-2.5">
                        {v.directType === 'DIRECT' ? (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-600 dark:text-amber-400">
                            DIRECT
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-border/40 bg-muted px-1.5 py-0 text-[9px] text-muted-foreground">
                            INDIRECT
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">{v.styleNo || '—'}</TableCell>
                      <TableCell className="py-2.5 text-right text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {fmtINR(v.amount)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="border-border/40 bg-muted px-1.5 py-0 text-[9px] text-muted-foreground">
                          {v.paidFromType}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddExpenseDialog
          accounts={accounts}
          orders={orders}
          initial={preset}
          onClose={() => setAddOpen(false)}
          onSaved={() => { fetchExpenses(); refresh() }}
        />
      )}
    </div>
  )
}

// ─── MAIN MODULE ───────────────────────────────────────────────────────────

export function PaymentsOutModule() {
  const [summary, setSummary] = useState<PaymentOutSummary | null>(null)
  const [payments, setPayments] = useState<PaymentOutRow[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCore = useCallback(async () => {
    try {
      setError(null)
      const [payRes, acctRes] = await Promise.all([
        fetch('/api/payment-out'),
        fetch('/api/bank-accounts'),
      ])
      if (payRes.ok) {
        const d = await payRes.json()
        setPayments(d.payments || [])
        setSummary(d.summary || null)
      } else {
        const d = await payRes.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to load payments-out summary')
      }
      if (acctRes.ok) {
        const d = await acctRes.json()
        setAccounts(d.accounts || [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load payments out')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCore() }, [fetchCore])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
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
            <ArrowUpRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Payments Out</h1>
            <p className="text-xs text-muted-foreground">Supplier, Vendor, Broker & GST</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={fetchCore}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="glass-card border-border/40 border-l-2 border-l-amber-500/40">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Banknote className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Paid Out</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtINR(summary?.totalOut)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/40 border-l-2 border-l-violet-500/40">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Landmark className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">TDS Deducted</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-violet-600 dark:text-violet-400">{fmtINR(summary?.totalTds)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/40 border-l-2 border-l-rose-500/40">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Still To Pay</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{fmtINR(summary?.dues?.total)}</p>
            {summary?.dues && (
              <p className="text-[10px] text-muted-foreground">
                supplier {fmtINR(summary.dues.supplier)} · vendor {fmtINR(summary.dues.vendorBills)} · broker {fmtINR(summary.dues.broker)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="suppliers" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="suppliers" className="gap-1.5 text-xs">
            <Truck className="h-3.5 w-3.5" /> Suppliers
          </TabsTrigger>
          <TabsTrigger value="vendor-bills" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Vendor Bills
          </TabsTrigger>
          <TabsTrigger value="broker" className="gap-1.5 text-xs">
            <HandCoins className="h-3.5 w-3.5" /> Broker Commission
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1.5 text-xs">
            <Receipt className="h-3.5 w-3.5" /> Expenses
          </TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers">
          <SuppliersTab accounts={accounts} refresh={fetchCore} />
        </TabsContent>
        <TabsContent value="vendor-bills">
          <VendorBillsTab accounts={accounts} refresh={fetchCore} />
        </TabsContent>
        <TabsContent value="broker">
          <BrokerTab accounts={accounts} payments={payments} brokerDue={summary?.dues?.broker || 0} refresh={fetchCore} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab accounts={accounts} refresh={fetchCore} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
