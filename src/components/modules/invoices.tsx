'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  FileText, IndianRupee, Clock, CheckCircle2, AlertTriangle, Plus, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface Invoice {
  id: string
  invoiceNo: string
  salesOrderId: string | null
  dispatchId: string | null
  customerId: string | null
  customer: { id: string; companyName: string } | null
  dispatch: { id: string; dispatchNo: string } | null
  totalAmount: number
  paidAmount: number
  paymentStatus: string
  paymentTerms: number
  dueDate: string | null
  invoiceDate: string
  notes: string | null
  payments: Array<{ id: string; amount: number; paymentDate: string; paymentMode: string }>
}

interface Summary {
  totalInvoices: number
  totalAmount: number
  totalPaid: number
  totalOutstanding: number
  paidCount: number
  unpaidCount: number
  partialCount: number
  overdueCount: number
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

function statusBadge(status: string) {
  switch (status) {
    case 'Paid': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
    case 'Partial': return 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    case 'Unpaid': return 'bg-red-500/15 text-red-400 border-red-500/20'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

export function InvoiceModule() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [dispatches, setDispatches] = useState<Array<{ id: string; dispatchNo: string; salesOrderId: string; totalDispatchedQty: number }>>([])
  const [orders, setOrders] = useState<Array<{ id: string; orderNo: string; customer: { companyName: string } | null; totalAmount: number }>>([])

  // Create form
  const [createForm, setCreateForm] = useState({ dispatchId: '', salesOrderId: '', customerId: '', totalAmount: '', paymentTerms: '0', notes: '' })
  // Payment form
  const [payForm, setPayForm] = useState({ amount: '', paymentMode: 'Cash', referenceNo: '', notes: '' })

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/invoices')
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
        setSummary(data.summary || null)
      }
    } catch { toast.error('Failed to load invoices') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  // Load dispatches and orders for create form
  useEffect(() => {
    async function loadData() {
      try {
        const [dispRes, ordRes] = await Promise.all([
          fetch('/api/dispatch?limit=50'),
          fetch('/api/orders?limit=50'),
        ])
        if (dispRes.ok) {
          const d = await dispRes.json()
          setDispatches((d.dispatches || d.data || []).map((x: any) => ({ id: x.id, dispatchNo: x.dispatchNo, salesOrderId: x.salesOrderId, totalDispatchedQty: x.totalDispatchedQty })))
        }
        if (ordRes.ok) {
          const d = await ordRes.json()
          setOrders((d.orders || []).map((x: any) => ({ id: x.id, orderNo: x.orderNo, customer: x.customer, totalAmount: x.totalAmount })))
        }
      } catch { /* ignore */ }
    }
    loadData()
  }, [])

  const handleCreate = async () => {
    if (!createForm.totalAmount || parseFloat(createForm.totalAmount) <= 0) {
      toast.error('Total amount is required')
      return
    }
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispatchId: createForm.dispatchId || undefined,
          salesOrderId: createForm.salesOrderId || undefined,
          customerId: createForm.customerId || undefined,
          totalAmount: parseFloat(createForm.totalAmount),
          paymentTerms: parseInt(createForm.paymentTerms) || 0,
          notes: createForm.notes || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Invoice created successfully')
        setCreateOpen(false)
        setCreateForm({ dispatchId: '', salesOrderId: '', customerId: '', totalAmount: '', paymentTerms: '0', notes: '' })
        fetchInvoices()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create invoice')
      }
    } catch { toast.error('Failed to create invoice') }
  }

  const handlePayment = async () => {
    if (!selectedInvoice || !payForm.amount || parseFloat(payForm.amount) <= 0) {
      toast.error('Valid amount is required')
      return
    }
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          amount: parseFloat(payForm.amount),
          paymentMode: payForm.paymentMode,
          referenceNo: payForm.referenceNo || undefined,
          notes: payForm.notes || undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Payment of ${formatINR(parseFloat(payForm.amount))} recorded. Status: ${data.invoiceUpdated?.paymentStatus}`)
        setPayOpen(false)
        setPayForm({ amount: '', paymentMode: 'Cash', referenceNo: '', notes: '' })
        setSelectedInvoice(null)
        fetchInvoices()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to record payment')
      }
    } catch { toast.error('Failed to record payment') }
  }

  const openPayment = (inv: Invoice) => {
    setSelectedInvoice(inv)
    setPayForm({ amount: String(inv.totalAmount - inv.paidAmount), paymentMode: 'Cash', referenceNo: '', notes: '' })
    setPayOpen(true)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Invoices & Payments</h1>
            <p className="text-xs text-muted-foreground">Track billing, payments, and outstanding receivables</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchInvoices}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create Invoice
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Invoices</span>
              </div>
              <p className="text-xl font-bold tabular-nums">{summary.totalInvoices}</p>
              <p className="text-[10px] text-muted-foreground">{formatINR(summary.totalAmount)} billed</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-2 border-l-emerald-500/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Collected</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-400">{formatINR(summary.totalPaid)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.paidCount} paid</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-2 border-l-amber-500/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Outstanding</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-400">{formatINR(summary.totalOutstanding)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.unpaidCount + summary.partialCount} pending</p>
            </CardContent>
          </Card>
          <Card className={`glass-card ${summary.overdueCount > 0 ? 'border-l-2 border-l-red-500/40' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={`h-3.5 w-3.5 ${summary.overdueCount > 0 ? 'text-red-400' : 'text-muted-foreground'}`} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overdue</span>
              </div>
              <p className={`text-xl font-bold tabular-nums ${summary.overdueCount > 0 ? 'text-red-400' : ''}`}>{summary.overdueCount}</p>
              <p className="text-[10px] text-muted-foreground">{summary.overdueCount > 0 ? 'Action needed!' : 'All on time'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invoice List */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No invoices yet. Create one from a dispatch.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => {
                const outstanding = inv.totalAmount - inv.paidAmount
                const isOverdue = inv.dueDate && inv.paymentStatus !== 'Paid' && new Date(inv.dueDate) < new Date()
                return (
                  <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 hover:border-primary/30 transition-all">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{inv.invoiceNo}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadge(inv.paymentStatus)}`}>
                          {inv.paymentStatus}
                        </Badge>
                        {isOverdue && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-500/15 text-red-400 border-red-500/20">
                            OVERDUE
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{inv.customer?.companyName || '—'}</span>
                        {inv.dispatch?.dispatchNo && <span>· DC: {inv.dispatch.dispatchNo}</span>}
                        {inv.dueDate && <span>· Due: {new Date(inv.dueDate).toLocaleDateString('en-IN')}</span>}
                        {inv.paymentTerms > 0 && <span>· Credit: {inv.paymentTerms}d</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{formatINR(inv.totalAmount)}</p>
                      {outstanding > 0 ? (
                        <p className="text-[10px] text-amber-400 tabular-nums">Outstanding: {formatINR(outstanding)}</p>
                      ) : (
                        <p className="text-[10px] text-emerald-400">Fully paid</p>
                      )}
                    </div>
                    {inv.paymentStatus !== 'Paid' && (
                      <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => openPayment(inv)}>
                        <IndianRupee className="h-3 w-3" />
                        Record Payment
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>Generate an invoice from a dispatch or manually</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Link to Dispatch (optional)</Label>
              <Select value={createForm.dispatchId} onValueChange={(v) => {
                const disp = dispatches.find(d => d.id === v)
                setCreateForm({ ...createForm, dispatchId: v, salesOrderId: disp?.salesOrderId || '' })
              }}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue placeholder="Select dispatch" /></SelectTrigger>
                <SelectContent>
                  {dispatches.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.dispatchNo} ({d.totalDispatchedQty} pcs)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Link to Sales Order (optional)</Label>
              <Select value={createForm.salesOrderId} onValueChange={(v) => {
                const ord = orders.find(o => o.id === v)
                setCreateForm({ ...createForm, salesOrderId: v, customerId: ord?.customer?.id || '', totalAmount: ord ? String(ord.totalAmount) : '' })
              }}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.orderNo} - {o.customer?.companyName || '?'} ({formatINR(o.totalAmount)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Total Amount (₹) *</Label>
                <Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={createForm.totalAmount} onChange={(e) => setCreateForm({ ...createForm, totalAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Credit Terms (days)</Label>
                <Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={createForm.paymentTerms} onChange={(e) => setCreateForm({ ...createForm, paymentTerms: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Invoice notes..." className="bg-muted/50 border-border resize-none" rows={2} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreate}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedInvoice && (
                <>Invoice {selectedInvoice.invoiceNo} · Outstanding: {formatINR(selectedInvoice.totalAmount - selectedInvoice.paidAmount)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Amount (₹) *</Label>
              <Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Payment Mode</Label>
              <Select value={payForm.paymentMode} onValueChange={(v) => setPayForm({ ...payForm, paymentMode: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Reference No (optional)</Label>
              <Input placeholder="UPI ref, cheque no..." className="h-9 bg-muted/50 border-border" value={payForm.referenceNo} onChange={(e) => setPayForm({ ...payForm, referenceNo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Payment notes..." className="bg-muted/50 border-border resize-none" rows={2} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handlePayment}>
              <IndianRupee className="h-4 w-4 mr-1" /> Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
