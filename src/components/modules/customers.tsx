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
  Crown,
  Heart,
  UserCheck,
  UserPlus,
  AlertCircle,
  Sparkles,
  Target,
  Repeat,
  Award,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell as RCell,
  Line,
} from 'recharts'
import { format as fmt, parseISO, isValid, differenceInDays } from 'date-fns'

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

// ─── Customer Insights Types (NEW) ───────────────────────────────────────────

interface InsightCustomer {
  id: string
  companyName: string
  buyerName: string | null
  email: string | null
  phone: string | null
  paymentTerms: number
  creditLimit: number
  status: string
  orderCount: number
  totalRevenue: number
  totalProfit: number
  avgMargin: number
  totalPaid: number
  outstanding: number
  paymentRate: number
  avgOrderValue: number
  firstOrderDate: string | null
  lastOrderDate: string | null
  daysAsCustomer: number
  orderFrequency: number
  ltv: number
  segment: 'VIP' | 'Loyal' | 'Regular' | 'New' | 'At-Risk'
  paymentScore: number
  creditUtilization: number
}

interface InsightSummary {
  totalCustomers: number
  activeCustomers: number
  totalRevenue: number
  totalProfit: number
  totalOutstanding: number
  avgMargin: number
  avgPaymentRate: number
  avgOrderValue: number
  repeatCustomerRate: number
  segmentCounts: { VIP: number; Loyal: number; Regular: number; New: number; 'At-Risk': number }
  topCustomerName: string
  topCustomerRevenue: number
}

interface RevenueTrendItem {
  month: string
  revenue: number
  profit: number
  orders: number
}

interface PaymentDistItem {
  status: string
  count: number
}

interface InsightsData {
  summary: InsightSummary
  customers: InsightCustomer[]
  revenueTrend: RevenueTrendItem[]
  paymentDist: PaymentDistItem[]
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
  const [insights, setInsights] = useState<InsightsData | null>(null)

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

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch('/api/customers/insights')
      if (!res.ok) return
      const json = await res.json()
      if (!json.error) setInsights(json)
    } catch {
      // Insights are optional — fail silently
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), 200)
    fetchInsights()
    return () => clearTimeout(timer)
  }, [fetchCustomers, fetchInsights])

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

      {/* ─── Customer Insights Dashboard (NEW FEATURE) ────────────────── */}
      {insights && insights.summary.totalCustomers > 0 && (
        <CustomerInsightsWidget data={insights} />
      )}
    </div>
  )
}

// ─── Customer Insights Widget (NEW FEATURE) ──────────────────────────────────
// Aggregates customer behavior metrics into segments (VIP/Loyal/Regular/New/
// At-Risk), shows revenue trend, payment distribution, and ranked customer
// table with LTV, payment score, and credit utilization.

function InsightsChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-muted-foreground">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-medium tabular-nums">{formatINR(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function getSegmentConfig(segment: string): { color: string; bg: string; border: string; text: string; icon: React.ElementType } {
  switch (segment) {
    case 'VIP':
      return { color: 'oklch(0.78 0.14 85)', bg: 'bg-primary/10', border: 'border-primary/40', text: 'text-primary', icon: Crown }
    case 'Loyal':
      return { color: 'oklch(0.72 0.18 145)', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: Heart }
    case 'Regular':
      return { color: 'oklch(0.7 0.15 250)', bg: 'bg-sky-500/10', border: 'border-sky-500/40', text: 'text-sky-400', icon: UserCheck }
    case 'New':
      return { color: 'oklch(0.75 0.15 65)', bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', icon: UserPlus }
    case 'At-Risk':
      return { color: 'oklch(0.65 0.22 25)', bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', icon: AlertCircle }
    default:
      return { color: 'oklch(0.6 0.01 260)', bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', icon: User }
  }
}

function CustomerInsightsWidget({ data }: { data: InsightsData }) {
  const { summary, customers, revenueTrend, paymentDist } = data
  const top5 = customers.slice(0, 5)
  const hasAtRisk = summary.segmentCounts['At-Risk'] > 0

  // Payment distribution pie data with colors
  const PAYMENT_COLORS: Record<string, string> = {
    Paid: 'oklch(0.72 0.18 145)',
    Partial: 'oklch(0.8 0.15 75)',
    Unpaid: 'oklch(0.65 0.22 25)',
    Unknown: 'oklch(0.6 0.01 260)',
  }

  return (
    <div className="premium-card rounded-xl p-5">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 glow-ring">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Customer Insights</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Target className="h-2.5 w-2.5" />
                AI Segmented
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.totalCustomers} customers · {formatINR(summary.totalRevenue)} revenue · {summary.avgMargin}% avg margin · Top: {summary.topCustomerName}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <IndianRupee className="h-3 w-3" />
            Total Revenue
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatINR(summary.totalRevenue)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">Profit: {formatINR(summary.totalProfit)}</p>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
            <TrendingUp className="h-3 w-3" />
            Avg Margin
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-400">{summary.avgMargin}%</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">AOV: {formatINR(summary.avgOrderValue)}</p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
            <CreditCard className="h-3 w-3" />
            Outstanding
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-amber-400">{formatINR(summary.totalOutstanding)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">Paid: {summary.avgPaymentRate}%</p>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Repeat className="h-3 w-3" />
            Repeat Rate
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{summary.repeatCustomerRate}%</p>
          <p className="text-[10px] text-muted-foreground">{summary.activeCustomers} active</p>
        </div>
      </div>

      {/* Segment distribution badges */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Segments:</span>
        {(['VIP', 'Loyal', 'Regular', 'New', 'At-Risk'] as const).map(seg => {
          const cfg = getSegmentConfig(seg)
          const count = summary.segmentCounts[seg]
          const Icon = cfg.icon
          return (
            <div key={seg} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cfg.text} ${cfg.bg} ${cfg.border}`}>
              <Icon className="h-3 w-3" />
              {seg}
              <span className="tabular-nums">{count}</span>
            </div>
          )
        })}
      </div>

      {/* Revenue trend + payment distribution */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Revenue trend area chart */}
        <div className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue & Profit Trend (6 Months)
          </h4>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradInsightRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradInsightProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <RTooltip content={<InsightsChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="oklch(0.78 0.14 85)"
                  fill="url(#gradInsightRev)"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="oklch(0.72 0.18 145)"
                  fill="url(#gradInsightProfit)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment distribution pie */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment Status
          </h4>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  dataKey="count"
                  nameKey="status"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {paymentDist.map((entry, i) => (
                    <RCell key={`pay-${i}`} fill={PAYMENT_COLORS[entry.status] || 'oklch(0.6 0.01 260)'} />
                  ))}
                </Pie>
                <RTooltip
                  content={({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-border/50 bg-background/95 px-3 py-2 text-xs shadow-xl">
                        <p className="font-medium">{payload[0].name}</p>
                        <p className="tabular-nums text-muted-foreground">{payload[0].value} order{payload[0].value !== 1 ? 's' : ''}</p>
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {paymentDist.map(p => (
              <div key={p.status} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: PAYMENT_COLORS[p.status] || 'oklch(0.6 0.01 260)' }} />
                  <span className="text-muted-foreground">{p.status}</span>
                </span>
                <span className="tabular-nums font-medium">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 customers ranking */}
      <div className="mb-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top 5 Customers by Revenue
        </h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {top5.map((c, i) => {
            const cfg = getSegmentConfig(c.segment)
            const Icon = cfg.icon
            return (
              <div
                key={c.id}
                className="animate-slide-in rounded-lg border border-border/50 bg-muted/20 p-3 transition-all hover:border-primary/30 hover:shadow-md"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    #{i + 1}
                  </span>
                  <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
                </div>
                <p className="text-xs font-semibold truncate" title={c.companyName}>
                  {c.companyName}
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-primary">{formatINR(c.totalRevenue)}</p>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="tabular-nums">{c.orderCount} orders</span>
                  <span className="tabular-nums">{c.avgMargin}%</span>
                </div>
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">Payment</span>
                    <span className={`tabular-nums font-medium ${c.paymentRate >= 60 ? 'text-emerald-400' : c.paymentRate >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                      {c.paymentRate}%
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${c.paymentRate >= 60 ? 'bg-emerald-500' : c.paymentRate >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${c.paymentRate}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Complete customer rankings table */}
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Customer Intelligence Report
        </h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-xs w-8">#</TableHead>
                <TableHead className="text-xs">Customer</TableHead>
                <TableHead className="text-xs">Segment</TableHead>
                <TableHead className="text-xs text-right">Orders</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Profit</TableHead>
                <TableHead className="text-xs text-right">Margin</TableHead>
                <TableHead className="text-xs text-right">AOV</TableHead>
                <TableHead className="text-xs text-right">Paid</TableHead>
                <TableHead className="text-xs text-right">Outstanding</TableHead>
                <TableHead className="text-xs text-right">Payment Score</TableHead>
                <TableHead className="text-xs text-right">LTV</TableHead>
                <TableHead className="text-xs text-right">Credit Util</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c, i) => {
                const cfg = getSegmentConfig(c.segment)
                const Icon = cfg.icon
                return (
                  <TableRow key={c.id} className="border-border/20 animate-slide-in" style={{ animationDelay: `${i * 30}ms` }}>
                    <TableCell className="text-xs font-bold tabular-nums py-2.5 text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{c.companyName}</span>
                        {c.buyerName && (
                          <span className="text-[10px] text-muted-foreground">{c.buyerName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.text} ${cfg.bg} ${cfg.border}`}>
                        <Icon className="h-2.5 w-2.5" />
                        {c.segment}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">{c.orderCount}</TableCell>
                    <TableCell className="text-xs text-right font-medium tabular-nums py-2.5">{formatINR(c.totalRevenue)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5 text-emerald-400">{formatINR(c.totalProfit)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">
                      <span className={c.avgMargin >= 40 ? 'text-emerald-400' : c.avgMargin >= 20 ? 'text-amber-400' : 'text-red-400'}>
                        {c.avgMargin}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5 text-muted-foreground">{formatINR(c.avgOrderValue)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">
                      <span className={c.paymentRate >= 60 ? 'text-emerald-400' : c.paymentRate >= 30 ? 'text-amber-400' : 'text-red-400'}>
                        {formatINR(c.totalPaid)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5 text-amber-400">{formatINR(c.outstanding)}</TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/60">
                          <div
                            className={`h-full rounded-full ${c.paymentScore >= 70 ? 'bg-emerald-500' : c.paymentScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${c.paymentScore}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums font-medium w-6 text-right">{c.paymentScore}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5 font-semibold text-primary">{formatINR(c.ltv)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">
                      {c.creditUtilization > 0 ? (
                        <span className={c.creditUtilization >= 80 ? 'text-red-400 font-medium' : c.creditUtilization >= 50 ? 'text-amber-400' : 'text-muted-foreground'}>
                          {c.creditUtilization}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* At-Risk alert banner */}
      {hasAtRisk && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/5 p-3 animate-slide-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-red-400">At-Risk Customers Detected</p>
            <p className="text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{summary.segmentCounts['At-Risk']} customer{summary.segmentCounts['At-Risk'] !== 1 ? 's' : ''}</span>{' '}
              classified as At-Risk (high revenue but low payment rate &lt; 30%). These represent significant outstanding receivables.
              Prioritize collection efforts, negotiate payment plans, or adjust credit terms to mitigate risk.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}