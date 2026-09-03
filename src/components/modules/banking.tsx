'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Wallet, Plus, RefreshCw, Building2, Banknote, ArrowDownLeft, ArrowUpRight,
  TrendingUp, TrendingDown, CreditCard, ArrowLeftRight, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

interface BankAccount {
  id: string
  accountName: string
  accountNumber: string | null
  bankName: string | null
  branch: string | null
  ifscCode: string | null
  accountType: string
  openingBalance: number
  currentBalance: number
  status: string
}

interface Transaction {
  id: string
  bankAccountId: string
  type: string
  amount: number
  date: string
  description: string
  referenceType: string | null
  paymentMode: string
  chequeNo: string | null
  reconciled: boolean
  bankAccount: { id: string; accountName: string; accountType: string } | null
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export function BankingModule() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txnSummary, setTxnSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [createAcctOpen, setCreateAcctOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [ledgerReady, setLedgerReady] = useState<boolean | null>(null)

  const [acctForm, setAcctForm] = useState({ accountName: '', accountNumber: '', bankName: '', ifscCode: '', accountType: 'Current', openingBalance: '0' })
  const [txnForm, setTxnForm] = useState({ bankAccountId: '', type: 'Credit', amount: '', description: '', paymentMode: 'Cash', chequeNo: '' })
  const [transferForm, setTransferForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', notes: '' })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [acctRes, txnRes, glRes] = await Promise.all([
        fetch('/api/bank-accounts'),
        fetch('/api/bank-accounts/transactions?limit=50'),
        fetch('/api/gl-accounts'),
      ])
      if (acctRes.ok) {
        const d = await acctRes.json()
        setAccounts(d.accounts || [])
        setSummary(d.summary || null)
      }
      if (txnRes.ok) {
        const d = await txnRes.json()
        setTransactions(d.transactions || [])
        setTxnSummary(d.summary || null)
      }
      if (glRes.ok) {
        const d = await glRes.json()
        setLedgerReady(!!(d.totals && d.totals.debit > 0))
      } else {
        setLedgerReady(false)
      }
    } catch { toast.error('Failed to load banking data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleInitializeLedger = async () => {
    setInitializing(true)
    try {
      const res = await fetch('/api/gl-setup', { method: 'POST' })
      const d = await res.json()
      if (res.ok) {
        toast.success(`Ledger initialized — opening entry ${d.entryNo} posted ✓`, {
          description: `Receivable ${formatINR(d.summary?.receivableTotal || 0)} · Payable ${formatINR((d.summary?.payableTotal || 0) + (d.summary?.vendorBillTotal || 0))} · Capital ${formatINR(d.summary?.ownerCapital || 0)}`,
        })
        setLedgerReady(true)
        fetchData()
      } else {
        toast.error(d.error || 'Failed to initialize ledger')
      }
    } catch { toast.error('Failed to initialize ledger') }
    finally { setInitializing(false) }
  }

  const handleTransfer = async () => {
    const amt = parseFloat(transferForm.amount)
    if (!transferForm.fromAccountId || !transferForm.toAccountId || !amt || amt <= 0) {
      toast.error('Both accounts and amount required')
      return
    }
    if (transferForm.fromAccountId === transferForm.toAccountId) {
      toast.error('From and To accounts must differ')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/bank-accounts/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          amount: amt,
          notes: transferForm.notes || undefined,
        }),
      })
      const d = await res.json()
      if (res.ok) {
        toast.success(`Transfer of ${formatINR(amt)} posted ✓ (${d.journal?.entryNo})`)
        setTransferOpen(false)
        setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', notes: '' })
        fetchData()
      } else { toast.error(d.error || 'Transfer failed') }
    } catch { toast.error('Transfer failed') }
    finally { setSaving(false) }
  }

  const handleCreateAccount = async () => {
    if (!acctForm.accountName) { toast.error('Account name required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acctForm),
      })
      if (res.ok) {
        toast.success('Bank account created')
        setCreateAcctOpen(false)
        setAcctForm({ accountName: '', accountNumber: '', bankName: '', ifscCode: '', accountType: 'Current', openingBalance: '0' })
        fetchData()
      } else { toast.error('Failed to create account') }
    } catch { toast.error('Failed to create account') }
    finally { setSaving(false) }
  }

  const handleTxn = async () => {
    if (!txnForm.bankAccountId || !txnForm.amount || parseFloat(txnForm.amount) <= 0) {
      toast.error('Account and amount required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/bank-accounts/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: txnForm.bankAccountId,
          type: txnForm.type,
          amount: parseFloat(txnForm.amount),
          description: txnForm.description,
          paymentMode: txnForm.paymentMode,
          chequeNo: txnForm.chequeNo || undefined,
        }),
      })
      if (res.ok) {
        toast.success(`${txnForm.type === 'Credit' ? 'Deposit' : 'Withdrawal'} of ${formatINR(parseFloat(txnForm.amount))} recorded`)
        setTxnOpen(false)
        setTxnForm({ bankAccountId: '', type: 'Credit', amount: '', description: '', paymentMode: 'Cash', chequeNo: '' })
        fetchData()
      } else { toast.error('Failed to record transaction') }
    } catch { toast.error('Failed to record transaction') }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Banking & Cash Management</h1>
            <p className="text-xs text-muted-foreground">Multiple accounts, transactions, balance tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ledgerReady === false && (
            <Button variant="outline" size="sm" className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" onClick={handleInitializeLedger} disabled={initializing}>
              <Sparkles className="h-3.5 w-3.5" />
              {initializing ? 'Initializing…' : 'Initialize Ledger'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTransferOpen(true)} disabled={accounts.length < 2}><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTxnOpen(true)}><Plus className="h-3.5 w-3.5" /> Transaction</Button>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateAcctOpen(true)}><Building2 className="h-3.5 w-3.5" /> Add Account</Button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="glass-card border-l-2 border-l-primary/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Wallet className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Balance</span></div>
            <p className="text-xl font-bold tabular-nums text-primary">{formatINR(summary.totalBalance || 0)}</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bank Accounts</span></div>
            <p className="text-xl font-bold tabular-nums">{summary.bankAccounts || 0}</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Banknote className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cash Accounts</span></div>
            <p className="text-xl font-bold tabular-nums">{summary.cashAccounts || 0}</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><CreditCard className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Accounts</span></div>
            <p className="text-xl font-bold tabular-nums">{summary.accountCount || 0}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Account Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.length === 0 ? (
          <Card className="glass-card col-span-full"><CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No bank accounts yet. Create one to start tracking.</p>
          </CardContent></Card>
        ) : (
          accounts.map((acct) => (
            <Card key={acct.id} className="glass-card hover:border-primary/30 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {acct.accountType === 'Cash' || acct.accountType === 'Petty Cash' ? (
                      <Banknote className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Building2 className="h-4 w-4 text-primary" />
                    )}
                    <span className="text-sm font-medium">{acct.accountName}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{acct.accountType}</Badge>
                </div>
                {acct.bankName && <p className="text-[10px] text-muted-foreground">{acct.bankName}{acct.branch ? `, ${acct.branch}` : ''}</p>}
                {acct.accountNumber && <p className="text-[10px] text-muted-foreground">A/C: {acct.accountNumber}</p>}
                {acct.ifscCode && <p className="text-[10px] text-muted-foreground">IFSC: {acct.ifscCode}</p>}
                <div className="mt-3 pt-2 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Balance</p>
                  <p className={`text-lg font-bold tabular-nums ${acct.currentBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(acct.currentBalance)}</p>
                  {acct.openingBalance !== acct.currentBalance && (
                    <p className="text-[10px] text-muted-foreground">Opening: {formatINR(acct.openingBalance)}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Transactions Table */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
            {txnSummary && (
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-emerald-400">In: {formatINR(txnSummary.totalIn || 0)}</span>
                <span className="text-red-400">Out: {formatINR(txnSummary.totalOut || 0)}</span>
                <span className="text-muted-foreground">Net: {formatINR(txnSummary.netFlow || 0)}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader><TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Account</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-center">Type</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs text-center">Mode</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {transactions.slice(0, 20).map((t) => (
                  <TableRow key={t.id} className="border-border/20">
                    <TableCell className="text-xs py-2.5">{new Date(t.date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell className="text-xs py-2.5">{t.bankAccount?.accountName || '—'}</TableCell>
                    <TableCell className="text-xs py-2.5">{t.description || '—'}</TableCell>
                    <TableCell className="text-xs text-center py-2.5">
                      {t.type === 'Credit' ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 inline" /> : <ArrowUpRight className="h-3.5 w-3.5 text-red-400 inline" />}
                    </TableCell>
                    <TableCell className={`text-xs text-right tabular-nums font-medium py-2.5 ${t.type === 'Credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type === 'Credit' ? '+' : '-'}{formatINR(t.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-center py-2.5">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{t.paymentMode}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader><DialogTitle>Transfer Between Accounts</DialogTitle><DialogDescription>Bank ↔ Cash movements post a double-entry journal</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">From Account *</Label>
              <Select value={transferForm.fromAccountId} onValueChange={(v) => setTransferForm({ ...transferForm, fromAccountId: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.accountName} ({formatINR(a.currentBalance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs">To Account *</Label>
              <Select value={transferForm.toAccountId} onValueChange={(v) => setTransferForm({ ...transferForm, toAccountId: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.filter((a) => a.id !== transferForm.fromAccountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.accountName} ({formatINR(a.currentBalance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs">Amount (₹) *</Label><Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label className="text-xs">Notes</Label><Input placeholder="e.g. Cash deposit to bank" className="h-9 bg-muted/50 border-border" value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleTransfer} disabled={saving}>{saving ? 'Transferring...' : 'Transfer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Account Dialog */}
      <Dialog open={createAcctOpen} onOpenChange={setCreateAcctOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader><DialogTitle>Add Bank / Cash Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">Account Name *</Label><Input placeholder="e.g. HDFC Current, Cash Counter" className="h-9 bg-muted/50 border-border" value={acctForm.accountName} onChange={(e) => setAcctForm({ ...acctForm, accountName: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label className="text-xs">Account Number</Label><Input placeholder="1234567890" className="h-9 bg-muted/50 border-border" value={acctForm.accountNumber} onChange={(e) => setAcctForm({ ...acctForm, accountNumber: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">Account Type</Label>
                <Select value={acctForm.accountType} onValueChange={(v) => setAcctForm({ ...acctForm, accountType: v })}>
                  <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Current">Current</SelectItem><SelectItem value="Savings">Savings</SelectItem><SelectItem value="Cash">Cash Counter</SelectItem><SelectItem value="Petty Cash">Petty Cash</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label className="text-xs">Bank Name</Label><Input placeholder="HDFC Bank" className="h-9 bg-muted/50 border-border" value={acctForm.bankName} onChange={(e) => setAcctForm({ ...acctForm, bankName: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">IFSC Code</Label><Input placeholder="HDFC0001234" className="h-9 bg-muted/50 border-border" value={acctForm.ifscCode} onChange={(e) => setAcctForm({ ...acctForm, ifscCode: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label className="text-xs">Opening Balance (₹)</Label><Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={acctForm.openingBalance} onChange={(e) => setAcctForm({ ...acctForm, openingBalance: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateAcctOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreateAccount} disabled={saving}>{saving ? 'Creating...' : 'Create Account'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader><DialogTitle>Record Transaction</DialogTitle><DialogDescription>Deposit (Credit) or Withdrawal (Debit)</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">Account *</Label>
              <Select value={txnForm.bankAccountId} onValueChange={(v) => setTxnForm({ ...txnForm, bankAccountId: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.accountName} ({formatINR(a.currentBalance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-1">
              <button className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${txnForm.type === 'Credit' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground'}`} onClick={() => setTxnForm({ ...txnForm, type: 'Credit' })}><ArrowDownLeft className="h-3 w-3 inline mr-1" /> Deposit</button>
              <button className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${txnForm.type === 'Debit' ? 'bg-red-500 text-white shadow-sm' : 'text-muted-foreground'}`} onClick={() => setTxnForm({ ...txnForm, type: 'Debit' })}><ArrowUpRight className="h-3 w-3 inline mr-1" /> Withdrawal</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label className="text-xs">Amount (₹) *</Label><Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">Payment Mode</Label>
                <Select value={txnForm.paymentMode} onValueChange={(v) => setTxnForm({ ...txnForm, paymentMode: v })}>
                  <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Bank Transfer">Bank Transfer</SelectItem><SelectItem value="Cheque">Cheque</SelectItem><SelectItem value="RTGS">RTGS</SelectItem><SelectItem value="NEFT">NEFT</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label className="text-xs">Description</Label><Input placeholder="e.g. Salary payment, Fabric purchase, Customer payment" className="h-9 bg-muted/50 border-border" value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} /></div>
            {txnForm.paymentMode === 'Cheque' && <div className="space-y-2"><Label className="text-xs">Cheque No</Label><Input placeholder="Cheque number" className="h-9 bg-muted/50 border-border" value={txnForm.chequeNo} onChange={(e) => setTxnForm({ ...txnForm, chequeNo: e.target.value })} /></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnOpen(false)}>Cancel</Button>
            <Button className={`text-white ${txnForm.type === 'Credit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`} onClick={handleTxn} disabled={saving}>{saving ? 'Recording...' : 'Record Transaction'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
