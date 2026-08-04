'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Users,
  Phone,
  Mail,
  Building2,
  User,
  FileText,
  IndianRupee,
  TrendingUp,
  Clock,
  CreditCard,
  ArrowLeft,
  X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CustomerOrder {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  status: string
  totalAmount: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  paymentStatus: string
  paidAmount: number
  discountPercent: number
  notes: string | null
}

interface Customer {
  id: string
  companyName: string
  buyerName: string | null
  gstNumber: string | null
  billingAddress: string | null
  shippingAddress: string | null
  paymentTerms: number
  creditLimit: number
  status: string
  phone: string | null
  email: string | null
  createdAt: string
  updatedAt: string
  orderCount: number
  totalOrderValue: number
  totalPaid: number
  pendingAmount: number
  avgMargin: number
  lastOrderDate: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Detail panel
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailOrders, setDetailOrders] = useState<CustomerOrder[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    companyName: '',
    buyerName: '',
    gstNumber: '',
    phone: '',
    email: '',
    billingAddress: '',
    shippingAddress: '',
    paymentTerms: '30',
    creditLimit: '0',
  })

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'All') params.set('status', statusFilter)

      const res = await fetch(`/api/customers?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setCustomers(data.customers)
      setTotal(data.total)
    } catch {
      setCustomers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), 200)
    return () => clearTimeout(timer)
  }, [fetchCustomers])

  const openDetail = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailOrders(data.orders)
      }
    } catch {
      setDetailOrders([])
    } finally {
      setDetailLoading(false)
    }
  }

  const openAddDialog = () => {
    setEditingCustomer(null)
    setForm({
      companyName: '',
      buyerName: '',
      gstNumber: '',
      phone: '',
      email: '',
      billingAddress: '',
      shippingAddress: '',
      paymentTerms: '30',
      creditLimit: '0',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      companyName: customer.companyName,
      buyerName: customer.buyerName || '',
      gstNumber: customer.gstNumber || '',
      phone: customer.phone || '',
      email: customer.email || '',
      billingAddress: customer.billingAddress || '',
      shippingAddress: customer.shippingAddress || '',
      paymentTerms: String(customer.paymentTerms),
      creditLimit: String(customer.creditLimit),
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.companyName.trim()) return
    setSaving(true)
    try {
      if (editingCustomer) {
        const res = await fetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: form.companyName,
            buyerName: form.buyerName || null,
            gstNumber: form.gstNumber || null,
            phone: form.phone || null,
            email: form.email || null,
            billingAddress: form.billingAddress || null,
            shippingAddress: form.shippingAddress || null,
            paymentTerms: Number(form.paymentTerms),
            creditLimit: Number(form.creditLimit),
          }),
        })
        if (res.ok) {
          toast.success('Customer updated successfully')
          setDialogOpen(false)
          fetchCustomers()
        }
      } else {
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: form.companyName,
            buyerName: form.buyerName || null,
            gstNumber: form.gstNumber || null,
            phone: form.phone || null,
            email: form.email || null,
            billingAddress: form.billingAddress || null,
            shippingAddress: form.shippingAddress || null,
            paymentTerms: Number(form.paymentTerms),
            creditLimit: Number(form.creditLimit),
          }),
        })
        if (res.ok) {
          toast.success('Customer created successfully')
          setDialogOpen(false)
          fetchCustomers()
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Customer deactivated successfully')
        setDetailOpen(false)
        setSelectedCustomer(null)
        fetchCustomers()
      }
    } catch {
      toast.error('Failed to deactivate customer')
    }
  }

  const activeCount = customers.filter((c) => c.status === 'Active').length
  const inactiveCount = customers.filter((c) => c.status === 'Inactive').length

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">
            <span className="text-primary">Customers</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {total} total · {activeCount} active · {inactiveCount} inactive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="customers" />
          <Button
            onClick={openAddDialog}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* ─── Search & Filter ──────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by company, buyer, GST, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-border"
          />
        </div>
        <div className="flex gap-1.5">
          {['All', 'Active', 'Inactive'].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={
                statusFilter === s
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* ─── Loading State ────────────────────────────────────── */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card rounded-xl p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-4 pt-1">
                <Skeleton className="h-16 w-1/3" />
                <Skeleton className="h-16 w-1/3" />
                <Skeleton className="h-16 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="hidden lg:block glass-card rounded-xl p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty State ──────────────────────────────────────── */}
      {!loading && customers.length === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No customers found</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {search || statusFilter !== 'All'
              ? 'Try adjusting your search or filter criteria.'
              : 'Add your first customer to get started.'}
          </p>
          {!search && statusFilter === 'All' && (
            <Button
              onClick={openAddDialog}
              className="mt-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </Button>
          )}
        </div>
      )}

      {/* ─── Mobile: Card Grid ────────────────────────────────── */}
      {!loading && customers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {customers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => openDetail(customer)}
              className="glass-card rounded-xl p-4 text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {customer.companyName}
                  </h3>
                  {customer.buyerName && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {customer.buyerName}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={
                    customer.status === 'Active'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0'
                      : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0'
                  }
                >
                  {customer.status}
                </Badge>
              </div>

              {(customer.phone || customer.email) && (
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  {customer.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </span>
                  )}
                  {customer.email && (
                    <span className="flex items-center gap-1 truncate max-w-[160px]">
                      <Mail className="h-3 w-3" />
                      {customer.email}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Orders</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {customer.orderCount}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Value</p>
                  <p className="text-sm font-semibold tabular-nums text-primary">
                    {formatINR(customer.totalOrderValue)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Pending</p>
                  <p className="text-sm font-semibold tabular-nums text-warning">
                    {formatINR(customer.pendingAmount)}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  Margin:{' '}
                  <span className="font-medium text-foreground">
                    {customer.avgMargin.toFixed(1)}%
                  </span>
                </span>
                <span>
                  Last:{' '}
                  <span className="font-medium text-foreground">
                    {formatShortDate(customer.lastOrderDate)}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ─── Desktop: Table View ──────────────────────────────── */}
      {!loading && customers.length > 0 && (
        <div className="hidden lg:block glass-card rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Company
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Buyer
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  GST
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Contact
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Orders
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Total Value
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Pending
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Avg Margin
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Last Order
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="border-border cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => openDetail(customer)}
                >
                  <TableCell className="font-medium text-sm">
                    {customer.companyName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.buyerName || '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {customer.gstNumber || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-0.5">
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center gap-1 text-muted-foreground truncate max-w-[180px]">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium">
                    {customer.orderCount}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-primary">
                    {formatINR(customer.totalOrderValue)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-warning">
                    {formatINR(customer.pendingAmount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {customer.avgMargin.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatShortDate(customer.lastOrderDate)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        customer.status === 'Active'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0'
                          : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-2 py-0'
                      }
                    >
                      {customer.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Customer Detail Sheet ────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg border-border bg-background p-0 overflow-y-auto">
          {selectedCustomer && (
            <>
              <SheetHeader className="p-4 pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                      {selectedCustomer.companyName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <SheetTitle className="text-base font-bold">
                        {selectedCustomer.companyName}
                      </SheetTitle>
                      {selectedCustomer.buyerName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedCustomer.buyerName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      selectedCustomer.status === 'Active'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0'
                        : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-2 py-0'
                    }
                  >
                    {selectedCustomer.status}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="p-4 space-y-4">
                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => {
                      openEditDialog(selectedCustomer)
                      setDetailOpen(false)
                    }}
                  >
                    Edit
                  </Button>
                  {selectedCustomer.status === 'Active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeactivate(selectedCustomer.id)}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Contact Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Contact Information
                  </h4>
                  <div className="grid gap-2 text-sm">
                    {selectedCustomer.phone && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedCustomer.phone}</span>
                      </div>
                    )}
                    {selectedCustomer.email && (
                      <div className="flex items-center gap-2.5">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{selectedCustomer.email}</span>
                      </div>
                    )}
                    {selectedCustomer.gstNumber && (
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-xs">{selectedCustomer.gstNumber}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Addresses */}
                {(selectedCustomer.billingAddress || selectedCustomer.shippingAddress) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Addresses
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedCustomer.billingAddress && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                            Billing
                          </p>
                          <p className="text-xs leading-relaxed whitespace-pre-line">
                            {selectedCustomer.billingAddress}
                          </p>
                        </div>
                      )}
                      {selectedCustomer.shippingAddress && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                            Shipping
                          </p>
                          <p className="text-xs leading-relaxed whitespace-pre-line">
                            {selectedCustomer.shippingAddress}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Separator className="bg-border" />

                {/* Key Metrics */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Business Metrics
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="glass-card rounded-lg p-3 text-center">
                      <FileText className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                      <p className="text-lg font-bold tabular-nums">
                        {selectedCustomer.orderCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Total Orders
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <IndianRupee className="mx-auto h-4 w-4 text-primary mb-1" />
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {formatINR(selectedCustomer.totalOrderValue)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Total Value
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <CreditCard className="mx-auto h-4 w-4 text-warning mb-1" />
                      <p className="text-lg font-bold tabular-nums text-warning">
                        {formatINR(selectedCustomer.pendingAmount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Pending
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="glass-card rounded-lg p-3 text-center">
                      <TrendingUp className="mx-auto h-4 w-4 text-emerald-400 mb-1" />
                      <p className="text-lg font-bold tabular-nums text-emerald-400">
                        {selectedCustomer.avgMargin.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Avg Margin
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <CreditCard className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                      <p className="text-lg font-bold tabular-nums">
                        {formatINR(selectedCustomer.creditLimit)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Credit Limit
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <Clock className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                      <p className="text-lg font-bold tabular-nums">
                        {selectedCustomer.paymentTerms}d
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Payment Terms
                      </p>
                    </div>
                  </div>

                  {/* Profitability summary */}
                  {selectedCustomer.orderCount > 0 && (
                    <div className="glass-card rounded-lg p-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
                        Profitability Summary
                      </p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Total Paid</span>
                          <span className="font-medium text-emerald-400">
                            {formatINR(selectedCustomer.totalPaid)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Total Outstanding</span>
                          <span className="font-medium text-warning">
                            {formatINR(selectedCustomer.pendingAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Collection Rate</span>
                          <span className="font-medium">
                            {selectedCustomer.totalOrderValue > 0
                              ? (
                                  (selectedCustomer.totalPaid /
                                    selectedCustomer.totalOrderValue) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Order History */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Order History
                  </h4>

                  {detailLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : detailOrders.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No orders found for this customer.
                    </p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto space-y-1.5 rounded-lg border border-border">
                      {detailOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors border-b border-border last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold font-mono">
                                {order.orderNo}
                              </p>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0"
                              >
                                {order.status}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDate(order.orderDate)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold tabular-nums text-primary">
                              {formatINR(order.totalAmount)}
                            </p>
                            <div className="flex items-center gap-1 justify-end">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  order.paymentStatus === 'Paid'
                                    ? 'bg-emerald-400'
                                    : order.paymentStatus === 'Partial'
                                    ? 'bg-warning'
                                    : 'bg-red-400'
                                }`}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                {order.paymentStatus}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Add/Edit Dialog ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-border bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Raghav Textiles Pvt. Ltd."
                value={form.companyName}
                onChange={(e) =>
                  setForm({ ...form, companyName: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Buyer Name</Label>
                <Input
                  placeholder="Contact person"
                  value={form.buyerName}
                  onChange={(e) =>
                    setForm({ ...form, buyerName: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">GST Number</Label>
                <Input
                  placeholder="24AABCR1234F1Z5"
                  value={form.gstNumber}
                  onChange={(e) =>
                    setForm({ ...form, gstNumber: e.target.value })
                  }
                  className="bg-muted/50 border-border font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Phone</Label>
                <Input
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="buyer@company.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Billing Address</Label>
              <Textarea
                placeholder="Full billing address..."
                value={form.billingAddress}
                onChange={(e) =>
                  setForm({ ...form, billingAddress: e.target.value })
                }
                className="bg-muted/50 border-border min-h-[60px] resize-none"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Shipping Address</Label>
              <Textarea
                placeholder="Full shipping address (leave same as billing if identical)..."
                value={form.shippingAddress}
                onChange={(e) =>
                  setForm({ ...form, shippingAddress: e.target.value })
                }
                className="bg-muted/50 border-border min-h-[60px] resize-none"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Payment Terms</Label>
                <Select
                  value={form.paymentTerms}
                  onValueChange={(v) =>
                    setForm({ ...form, paymentTerms: v })
                  }
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="45">45 Days</SelectItem>
                    <SelectItem value="60">60 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Credit Limit (₹)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.creditLimit}
                  onChange={(e) =>
                    setForm({ ...form, creditLimit: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.companyName.trim() || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? 'Saving...' : editingCustomer ? 'Update' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}