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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FileText, IndianRupee, Clock, CheckCircle2, AlertTriangle, Plus, RefreshCw,
  Trash2, X, Percent, Building2,
} from 'lucide-react'
import { toast } from 'sonner'

interface InvoiceItem {
  styleNo: string
  styleName: string
  hsnCode: string
  quantity: number
  unit: string
  ratePerUnit: number
  discountPercent: number
  taxableAmount: number
  gstPercent: number
  gstAmount: number
  totalAmount: number
}

interface Invoice {
  id: string
  invoiceNo: string
  customerId: string | null
  customerName: string | null
  customerGstNumber: string | null
  customerAddress: string | null
  placeOfSupply: string | null
  gstType: string
  gstPercent: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalGst: number
  totalAmount: number
  paidAmount: number
  paymentStatus: string
  paymentTerms: number
  dueDate: string | null
  invoiceDate: string
  status: string
  items: any[]
  payments: any[]
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
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  // Create form
  const [form, setForm] = useState({
    customerId: '',
    paymentTerms: '30',
    gstType: '',
    gstPercent: '5',
    notes: '',
  })
  const [items, setItems] = useState<InvoiceItem[]>([
    { styleNo: '', styleName: '', hsnCode: '6104', quantity: 0, unit: 'pcs', ratePerUnit: 0, discountPercent: 0, taxableAmount: 0, gstAmount: 0, totalAmount: 0 },
  ])

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

  useEffect(() => {
    async function loadData() {
      try {
        const [custRes, ordRes] = await Promise.all([
          fetch('/api/customers?limit=100'),
          fetch('/api/orders?limit=50'),
        ])
        if (custRes.ok) {
          const d = await custRes.json()
          setCustomers((d.customers || d || []).map((c: any) => ({ id: c.id, companyName: c.companyName, gstNumber: c.gstNumber, billingAddress: c.billingAddress, phone: c.phone, creditLimit: c.creditLimit })))
        }
        if (ordRes.ok) {
          const d = await ordRes.json()
          setOrders((d.orders || []).map((o: any) => ({ id: o.id, orderNo: o.orderNo, customer: o.customer, totalAmount: o.totalAmount, items: o.items })))
        }
      } catch { /* ignore */ }
    }
    loadData()
  }, [])

  // Calculate totals
  const taxableAmount = items.reduce((s, it) => s + it.taxableAmount, 0)
  const totalGst = items.reduce((s, it) => s + it.gstAmount, 0)
  const grandTotal = taxableAmount + totalGst
  const gstType = form.gstType || 'IntraState'
  const cgst = gstType === 'IntraState' ? totalGst / 2 : 0
  const sgst = gstType === 'IntraState' ? totalGst / 2 : 0
  const igst = gstType === 'InterState' ? totalGst : 0

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: value }
      // Recalculate
      const amount = updated.quantity * updated.ratePerUnit
      updated.taxableAmount = Math.round(amount * (1 - updated.discountPercent / 100) * 100) / 100
      updated.gstAmount = Math.round(updated.taxableAmount * updated.gstPercent / 100 * 100) / 100
      updated.totalAmount = Math.round((updated.taxableAmount + updated.gstAmount) * 100) / 100
      return updated
    }))
  }

  const addItem = () => {
    setItems([...items, { styleNo: '', styleName: '', hsnCode: '6104', quantity: 0, unit: 'pcs', ratePerUnit: 0, discountPercent: 0, taxableAmount: 0, gstAmount: 0, totalAmount: 0 }])
  }
  const removeItem = (idx: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== idx))
  }

  const handleCustomerSelect = (custId: string) => {
    setForm({ ...form, customerId: custId })
    const cust = customers.find(c => c.id === custId)
    if (cust) {
      // Auto-determine GST type based on customer state
      const custState = (cust.billingAddress || '').match(/Gujarat/i) ? 'IntraState' : 'InterState'
      setForm(prev => ({ ...prev, customerId: custId, gstType: custState }))
    }
  }

  const handleCreate = async () => {
    if (!form.customerId || items.every(it => it.quantity === 0)) {
      toast.error('Select customer and add at least one item')
      return
    }
    setSaving(true)
    try {
      const cust = customers.find(c => c.id === form.customerId)
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: form.customerId,
          customerName: cust?.companyName,
          customerGstNumber: cust?.gstNumber,
          customerAddress: cust?.billingAddress,
          customerPhone: cust?.phone,
          billingAddress: cust?.billingAddress,
          placeOfSupply: '24', // Gujarat — will be dynamic later
          paymentTerms: parseInt(form.paymentTerms) || 0,
          gstType: form.gstType || undefined,
          gstPercent: parseFloat(form.gstPercent) || 5,
          notes: form.notes || undefined,
          items: items.filter(it => it.quantity > 0).map(it => ({
            styleNo: it.styleNo || undefined,
            styleName: it.styleName,
            hsnCode: it.hsnCode,
            quantity: it.quantity,
            unit: it.unit,
            ratePerUnit: it.ratePerUnit,
            discountPercent: it.discountPercent,
            gstPercent: it.gstPercent,
          })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Invoice ${data.invoiceNo} created — ${formatINR(data.totalAmount)}`)
        setCreateOpen(false)
        setForm({ customerId: '', paymentTerms: '30', gstType: '', gstPercent: '5', notes: '' })
        setItems([{ styleNo: '', styleName: '', hsnCode: '6104', quantity: 0, unit: 'pcs', ratePerUnit: 0, discountPercent: 0, taxableAmount: 0, gstAmount: 0, totalAmount: 0 }])
        fetchInvoices()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create invoice')
      }
    } catch { toast.error('Failed to create invoice') }
    finally { setSaving(false) }
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
        toast.success(`Payment of ${formatINR(parseFloat(payForm.amount))} recorded — Status: ${data.invoiceUpdated?.paymentStatus}`)
        setPayOpen(false)
        setPayForm({ amount: '', paymentMode: 'Cash', referenceNo: '', notes: '' })
        setSelectedInvoice(null)
        fetchInvoices()
      }
    } catch { toast.error('Failed to record payment') }
  }

  const openPayment = (inv: Invoice) => {
    setSelectedInvoice(inv)
    setPayForm({ amount: String(inv.totalAmount - inv.paidAmount), paymentMode: 'Cash', referenceNo: '', notes: '' })
    setPayOpen(true)
  }

  const openDetail = (inv: Invoice) => {
    setSelectedInvoice(inv)
    setDetailOpen(true)
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
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Invoices & Payments</h1>
            <p className="text-xs text-muted-foreground">GST-compliant invoicing · Itemized billing · Payment tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchInvoices}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Create GST Invoice</Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="glass-card"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><FileText className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Invoices</span></div>
            <p className="text-xl font-bold tabular-nums">{summary.totalInvoices}</p>
            <p className="text-[10px] text-muted-foreground">{formatINR(summary.totalAmount)} billed</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-emerald-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Collected</span></div>
            <p className="text-xl font-bold tabular-nums text-emerald-400">{formatINR(summary.totalPaid)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.paidCount} paid</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-amber-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="h-3.5 w-3.5 text-amber-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Outstanding</span></div>
            <p className="text-xl font-bold tabular-nums text-amber-400">{formatINR(summary.totalOutstanding)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.unpaidCount + summary.partialCount} pending</p>
          </CardContent></Card>
          <Card className={`glass-card ${summary.overdueCount > 0 ? 'border-l-2 border-l-red-500/40' : ''}`}><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className={`h-3.5 w-3.5 ${summary.overdueCount > 0 ? 'text-red-400' : 'text-muted-foreground'}`} /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overdue</span></div>
            <p className={`text-xl font-bold tabular-nums ${summary.overdueCount > 0 ? 'text-red-400' : ''}`}>{summary.overdueCount}</p>
            <p className="text-[10px] text-muted-foreground">{summary.overdueCount > 0 ? 'Action needed!' : 'All on time'}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Invoice List */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">All Invoices</CardTitle></CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No invoices yet. Create a GST invoice to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => {
                const outstanding = inv.totalAmount - inv.paidAmount
                const isOverdue = inv.dueDate && inv.paymentStatus !== 'Paid' && new Date(inv.dueDate) < new Date()
                return (
                  <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 hover:border-primary/30 transition-all cursor-pointer" onClick={() => openDetail(inv)}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-4 w-4 text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{inv.invoiceNo}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadge(inv.paymentStatus)}`}>{inv.paymentStatus}</Badge>
                        {isOverdue && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-500/15 text-red-400 border-red-500/20">OVERDUE</Badge>}
                        {inv.gstType === 'InterState' && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-sky-500/15 text-sky-400 border-sky-500/20">IGST</Badge>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{inv.customerName || '—'}</span>
                        {inv.placeOfSupply && <span>· State: {inv.placeOfSupply}</span>}
                        {inv.dueDate && <span>· Due: {new Date(inv.dueDate).toLocaleDateString('en-IN')}</span>}
                        {inv.paymentTerms > 0 && <span>· Credit: {inv.paymentTerms}d</span>}
                        <span>· GST: {inv.gstPercent}%</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{formatINR(inv.totalAmount)}</p>
                      {outstanding > 0 ? <p className="text-[10px] text-amber-400 tabular-nums">Outstanding: {formatINR(outstanding)}</p> : <p className="text-[10px] text-emerald-400">Fully paid</p>}
                    </div>
                    {inv.paymentStatus !== 'Paid' && (
                      <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={(e) => { e.stopPropagation(); openPayment(inv) }}>
                        <IndianRupee className="h-3 w-3" /> Pay
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create GST Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create GST Invoice</DialogTitle>
            <DialogDescription>GST-compliant invoice with itemized billing</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Customer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Customer *</Label>
                <Select value={form.customerId} onValueChange={handleCustomerSelect}>
                  <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}{c.gstNumber ? ` (GST: ${c.gstNumber})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-xs">GST Type</Label>
                  <Select value={form.gstType || 'IntraState'} onValueChange={(v) => setForm({ ...form, gstType: v })}>
                    <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IntraState">Intra-State (CGST+SGST)</SelectItem>
                      <SelectItem value="InterState">Inter-State (IGST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">GST %</Label>
                  <Select value={form.gstPercent} onValueChange={(v) => { setForm({ ...form, gstPercent: v }); setItems(items.map(it => ({ ...it, gstPercent: parseFloat(v) }))) }}>
                    <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5% (Garments up to ₹1000)</SelectItem>
                      <SelectItem value="12">12% (Garments above ₹1000)</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="0">0% (Exempt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Line Items *</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}><Plus className="h-3 w-3" /> Add Item</Button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">Item {idx + 1}</span>
                    {items.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input placeholder="Style No" className="h-8 text-xs bg-muted/50" value={item.styleNo} onChange={(e) => updateItem(idx, 'styleNo', e.target.value)} />
                    <Input placeholder="Style Name *" className="h-8 text-xs bg-muted/50" value={item.styleName} onChange={(e) => updateItem(idx, 'styleName', e.target.value)} />
                    <Input type="number" placeholder="Qty *" className="h-8 text-xs bg-muted/50" value={item.quantity || ''} onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} min={0} />
                    <Input type="number" placeholder="Rate ₹" className="h-8 text-xs bg-muted/50" value={item.ratePerUnit || ''} onChange={(e) => updateItem(idx, 'ratePerUnit', parseFloat(e.target.value) || 0)} min={0} step={0.01} />
                  </div>
                  {item.quantity > 0 && item.ratePerUnit > 0 && (
                    <p className="text-[10px] text-muted-foreground text-right">
                      Taxable: {formatINR(item.taxableAmount)} · GST: {formatINR(item.gstAmount)} · Total: {formatINR(item.totalAmount)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            {taxableAmount > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Taxable Amount</span><span className="tabular-nums font-medium">{formatINR(taxableAmount)}</span></div>
                {gstType === 'IntraState' ? (
                  <>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">CGST ({form.gstPercent / 2}%)</span><span className="tabular-nums">{formatINR(cgst)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">SGST ({form.gstPercent / 2}%)</span><span className="tabular-nums">{formatINR(sgst)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">IGST ({form.gstPercent}%)</span><span className="tabular-nums">{formatINR(igst)}</span></div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/30"><span>Grand Total</span><span className="tabular-nums text-primary">{formatINR(grandTotal)}</span></div>
              </div>
            )}

            {/* Credit Terms */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Credit Terms (days)</Label>
                <Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Input placeholder="Invoice notes..." className="h-9 bg-muted/50 border-border" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>{selectedInvoice && <>Invoice {selectedInvoice.invoiceNo} · Outstanding: {formatINR(selectedInvoice.totalAmount - selectedInvoice.paidAmount)}</>}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">Amount (₹) *</Label><Input type="number" placeholder="0" className="h-9 bg-muted/50 border-border" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label className="text-xs">Payment Mode</Label>
              <Select value={payForm.paymentMode} onValueChange={(v) => setPayForm({ ...payForm, paymentMode: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Bank Transfer">Bank Transfer</SelectItem><SelectItem value="Cheque">Cheque</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs">Reference No</Label><Input placeholder="UPI ref, cheque no..." className="h-9 bg-muted/50 border-border" value={payForm.referenceNo} onChange={(e) => setPayForm({ ...payForm, referenceNo: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handlePayment}><IndianRupee className="h-4 w-4 mr-1" /> Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Invoice Details</DialogTitle></DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div><span className="text-muted-foreground">Invoice No:</span> <span className="font-medium">{selectedInvoice.invoiceNo}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{new Date(selectedInvoice.invoiceDate).toLocaleDateString('en-IN')}</span></div>
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{selectedInvoice.customerName || '—'}</span></div>
                <div><span className="text-muted-foreground">GST No:</span> <span className="font-medium">{selectedInvoice.customerGstNumber || '—'}</span></div>
                <div><span className="text-muted-foreground">GST Type:</span> <span className="font-medium">{selectedInvoice.gstType} ({selectedInvoice.gstPercent}%)</span></div>
                <div><span className="text-muted-foreground">Due Date:</span> <span className="font-medium">{selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN') : '—'}</span></div>
              </div>
              {selectedInvoice.items && selectedInvoice.items.length > 0 && (
                <Table>
                  <TableHeader><TableRow className="border-border/30">
                    <TableHead className="text-xs">Style</TableHead><TableHead className="text-xs text-right">Qty</TableHead><TableHead className="text-xs text-right">Rate</TableHead><TableHead className="text-xs text-right">Taxable</TableHead><TableHead className="text-xs text-right">GST</TableHead><TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {selectedInvoice.items.map((it: any, i: number) => (
                      <TableRow key={i} className="border-border/20">
                        <TableCell className="text-xs py-2">{it.styleName || it.styleNo || '—'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-2">{it.quantity}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-2">{formatINR(it.ratePerUnit)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-2">{formatINR(it.taxableAmount)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-2">{formatINR(it.gstAmount)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-bold py-2">{formatINR(it.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Taxable Amount</span><span className="tabular-nums">{formatINR(selectedInvoice.taxableAmount)}</span></div>
                {selectedInvoice.gstType === 'IntraState' ? (
                  <>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">CGST</span><span className="tabular-nums">{formatINR(selectedInvoice.cgstAmount)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">SGST</span><span className="tabular-nums">{formatINR(selectedInvoice.sgstAmount)}</span></div>
                  </>
                ) : <div className="flex justify-between text-xs"><span className="text-muted-foreground">IGST</span><span className="tabular-nums">{formatINR(selectedInvoice.igstAmount)}</span></div>}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/30"><span>Grand Total</span><span className="tabular-nums text-primary">{formatINR(selectedInvoice.totalAmount)}</span></div>
                <div className="flex justify-between text-xs pt-1"><span className="text-muted-foreground">Paid</span><span className="tabular-nums text-emerald-400">{formatINR(selectedInvoice.paidAmount)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Outstanding</span><span className="tabular-nums text-amber-400">{formatINR(selectedInvoice.totalAmount - selectedInvoice.paidAmount)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedInvoice && selectedInvoice.paymentStatus !== 'Paid' && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setDetailOpen(false); openPayment(selectedInvoice) }}><IndianRupee className="h-4 w-4 mr-1" /> Record Payment</Button>
            )}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
