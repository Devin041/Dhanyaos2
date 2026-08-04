'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import {
  Search,
  Plus,
  FileText,
  TrendingUp,
  PackageCheck,
  IndianRupee,
  Eye,
  CheckCircle2,
  Truck,
  Package,
  Ban,
  ChevronLeft,
  ChevronRight,
  Star,
  CalendarDays,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: string
  name: string
  supplierType: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  paymentTerms: number
  rating: number
  status: string
}

interface PurchaseOrder {
  id: string
  poNumber: string
  supplierId: string
  supplier: { name: string; supplierType: string; rating: number; paymentTerms: number }
  fabricName: string
  quantity: number
  unit: string
  ratePerUnit: number
  totalAmount: number
  expectedDelivery: string | null
  status: string
  paymentStatus: string
  paidAmount: number
  receivedQty: number
  createdAt: string
  updatedAt: string
}

interface PODetail extends PurchaseOrder {
  supplier: Supplier
}

interface Summary {
  totalPOValue: number
  pendingAmount: number
  receivedThisMonth: number
  unpaidAmount: number
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
  if (!dateStr) return 'TBD'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  Pending: {
    label: 'Pending',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25',
    icon: <FileText className="h-3 w-3" />,
  },
  Approved: {
    label: 'Approved',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/25 hover:bg-blue-500/25',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  Ordered: {
    label: 'Ordered',
    className: 'bg-purple-500/15 text-purple-400 border-purple-500/25 hover:bg-purple-500/25',
    icon: <Truck className="h-3 w-3" />,
  },
  Received: {
    label: 'Received',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25',
    icon: <PackageCheck className="h-3 w-3" />,
  },
  Cancelled: {
    label: 'Cancelled',
    className: 'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25',
    icon: <Ban className="h-3 w-3" />,
  },
}

const PAYMENT_CONFIG: Record<string, { label: string; className: string }> = {
  Paid: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  Partial: { label: 'Partial', className: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  Unpaid: { label: 'Unpaid', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
}

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Ordered', 'Received', 'Cancelled']

const UNITS = ['meters', 'kg', 'pieces', 'rolls']

const STATUS_FLOW = ['Pending', 'Approved', 'Ordered', 'Received']

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchaseOrders() {
  // Data state
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [summary, setSummary] = useState<Summary>({ totalPOValue: 0, pendingAmount: 0, receivedThisMonth: 0, unpaidAmount: 0 })
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Filter state
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PODetail | null>(null)

  // Create form state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [form, setForm] = useState({
    supplierId: '',
    fabricName: '',
    quantity: '',
    unit: 'meters',
    ratePerUnit: '',
    expectedDelivery: '',
    notes: '',
  })
  const [creating, setCreating] = useState(false)

  // Action state
  const [actionLoading, setActionLoading] = useState(false)
  const [receiptQty, setReceiptQty] = useState('')
  const [paymentAmt, setPaymentAmt] = useState('')

  // ─── Fetch POs ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== 'All') params.set('status', activeTab)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/purchase-orders?${params}`)
      const data = await res.json()
      if (res.ok) {
        setOrders(data.orders)
        setTotalCount(data.total)
        setStatusCounts(data.statusCounts)
        if (data.summary) setSummary(data.summary)
      }
    } catch {
      toast.error('Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, page])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [activeTab, search])

  // Load suppliers for create form
  useEffect(() => {
    // Fetch suppliers for the create form dropdown
    async function loadSuppliers() {
      try {
        const res = await fetch('/api/purchase-orders?limit=100')
        const data = await res.json()
        if (res.ok && data.orders) {
          const supplierMap = new Map<string, Supplier>()
          for (const po of data.orders) {
            if (!supplierMap.has(po.supplierId)) {
              supplierMap.set(po.supplierId, {
                id: po.supplierId,
                name: po.supplier.name,
                supplierType: po.supplier.supplierType,
                contactPerson: null,
                phone: null,
                email: null,
                paymentTerms: po.supplier.paymentTerms,
                rating: po.supplier.rating,
                status: 'Active',
              })
            }
          }
          setSuppliers(Array.from(supplierMap.values()))
        }
      } catch {
        // ignore
      }
    }
    loadSuppliers()
  }, [])

  // ─── Create PO ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.supplierId || !form.fabricName || !form.quantity || !form.ratePerUnit) {
      toast.error('Please fill in all required fields')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: form.supplierId,
          fabricName: form.fabricName,
          quantity: parseFloat(form.quantity),
          unit: form.unit,
          ratePerUnit: parseFloat(form.ratePerUnit),
          expectedDelivery: form.expectedDelivery || undefined,
          notes: form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Purchase Order ${data.poNumber} created successfully`)
        setCreateOpen(false)
        setForm({ supplierId: '', fabricName: '', quantity: '', unit: 'meters', ratePerUnit: '', expectedDelivery: '', notes: '' })
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to create purchase order')
      }
    } catch {
      toast.error('Failed to create purchase order')
    } finally {
      setCreating(false)
    }
  }

  // ─── View PO Detail ─────────────────────────────────────────────────────

  const openDetail = async (po: PurchaseOrder) => {
    setSelectedPO(null)
    setDetailOpen(true)
    setReceiptQty('')
    setPaymentAmt('')
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`)
      const data = await res.json()
      if (res.ok) {
        setSelectedPO(data)
      } else {
        toast.error('Failed to load PO details')
      }
    } catch {
      toast.error('Failed to load PO details')
    }
  }

  // ─── Status Actions ─────────────────────────────────────────────────────

  const handleStatusUpdate = async (poId: string, newStatus: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`PO status updated to ${newStatus}`)
        // Refresh detail and list
        if (selectedPO?.id === poId) {
          setSelectedPO(data)
        }
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to update status')
      }
    } catch {
      toast.error('Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const handleGoodsReceipt = async () => {
    if (!selectedPO || !receiptQty) return
    const qty = parseFloat(receiptQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedQty: qty, status: 'Received' }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Goods receipt recorded: ${qty} ${selectedPO.unit}`)
        setSelectedPO(data)
        setReceiptQty('')
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to record receipt')
      }
    } catch {
      toast.error('Failed to record receipt')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!selectedPO || !paymentAmt) return
    const amt = parseFloat(paymentAmt)
    if (isNaN(amt) || amt < 0) {
      toast.error('Please enter a valid amount')
      return
    }

    const pending = selectedPO.totalAmount - selectedPO.paidAmount
    let payStatus: string
    if (amt >= pending) {
      payStatus = 'Paid'
    } else {
      payStatus = 'Partial'
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidAmount: selectedPO.paidAmount + amt,
          paymentStatus: payStatus,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Payment of ${formatINR(amt)} recorded`)
        setSelectedPO(data)
        setPaymentAmt('')
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to record payment')
      }
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Computed ───────────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / limit)
  const autoTotal = form.quantity && form.ratePerUnit ? parseFloat(form.quantity) * parseFloat(form.ratePerUnit) : 0

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total PO Value"
          value={formatINR(summary.totalPOValue)}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          accent="border-l-primary/60"
        />
        <SummaryCard
          title="Pending POs"
          value={formatINR(summary.pendingAmount)}
          subtitle={`${statusCounts.Pending || 0} orders`}
          icon={<FileText className="h-4 w-4 text-amber-400" />}
          accent="border-l-amber-500/60"
        />
        <SummaryCard
          title="Received This Month"
          value={formatINR(summary.receivedThisMonth)}
          icon={<PackageCheck className="h-4 w-4 text-emerald-400" />}
          accent="border-l-emerald-500/60"
        />
        <SummaryCard
          title="Unpaid Amount"
          value={formatINR(summary.unpaidAmount)}
          icon={<IndianRupee className="h-4 w-4 text-red-400" />}
          accent="border-l-red-500/60"
        />
      </div>

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">
            Purchase Orders
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totalCount})
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search PO, fabric, supplier..."
              className="h-9 pl-9 bg-muted/50 border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton module="purchase-orders" />
            <Button
              className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New PO</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Status Filter Tabs ───────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === tab
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
            }`}
          >
            {tab}
            {(statusCounts[tab] ?? 0) > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  activeTab === tab ? 'bg-primary/25 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {statusCounts[tab] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── PO Table ─────────────────────────────────────────────────── */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">PO No</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Supplier</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Fabric</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Unit</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right hidden lg:table-cell">Rate</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden xl:table-cell">Delivery</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Payment</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j} className="py-3">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-10 w-10 opacity-30" />
                      <p className="text-sm">No purchase orders found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((po) => {
                  const statusCfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.Pending
                  const payCfg = PAYMENT_CONFIG[po.paymentStatus] || PAYMENT_CONFIG.Unpaid
                  return (
                    <TableRow
                      key={po.id}
                      className="border-border/30 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDetail(po)}
                    >
                      <TableCell className="py-3">
                        <span className="text-xs font-semibold text-primary">{po.poNumber}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-foreground">{po.supplier.name}</span>
                          <div className="flex items-center gap-1">
                            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                            <span className="text-[10px] text-muted-foreground">{po.supplier.rating}/5</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-foreground/80">{po.fabricName}</TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-foreground/80">
                        {po.quantity}
                        <span className="text-muted-foreground md:hidden"> {po.unit}</span>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground hidden md:table-cell">{po.unit}</TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-foreground/80 hidden lg:table-cell">
                        {formatINR(po.ratePerUnit)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums font-semibold text-foreground">
                        {formatINR(po.totalAmount)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground hidden xl:table-cell">
                        {formatDate(po.expectedDelivery)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.className}`}>
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 hidden sm:table-cell">
                        <Badge variant="outline" className={`text-[10px] ${payCfg.className}`}>
                          {payCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-primary/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            openDetail(po)
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ──────────────────────────────────────────────── */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/50"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className={`h-7 w-7 text-xs ${page === pageNum ? 'bg-primary/20 text-primary border-primary/30' : 'border-border/50'}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Create PO Dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Purchase Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Add a new purchase order to track fabric procurement
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Supplier */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Supplier *</Label>
              <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        {s.name}
                        <span className="text-muted-foreground text-[10px]">({s.supplierType})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fabric Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Fabric Name *</Label>
              <Input
                placeholder="e.g., Banarasi Silk, Chanderi Cotton"
                className="h-9 bg-muted/50 border-border"
                value={form.fabricName}
                onChange={(e) => setForm({ ...form, fabricName: e.target.value })}
              />
            </div>

            {/* Quantity + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  className="h-9 bg-muted/50 border-border"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger className="h-9 bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rate per unit */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Rate per Unit (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="0.00"
                className="h-9 bg-muted/50 border-border"
                value={form.ratePerUnit}
                onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })}
              />
            </div>

            {/* Auto-calculated total */}
            {autoTotal > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-lg font-bold text-primary">{formatINR(autoTotal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {form.quantity} × {formatINR(parseFloat(form.ratePerUnit) || 0)} per {form.unit}
                </p>
              </div>
            )}

            {/* Expected Delivery */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Expected Delivery</Label>
              <Input
                type="date"
                className="h-9 bg-muted/50 border-border"
                value={form.expectedDelivery}
                onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Notes</Label>
              <Textarea
                placeholder="Any additional notes..."
                className="bg-muted/50 border-border resize-none"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PO Detail Sheet ──────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="glass-card border-border/50 w-full sm:max-w-lg overflow-y-auto">
          {selectedPO ? (
            <div className="space-y-6 pt-6">
              <SheetHeader>
                <SheetTitle className="text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {selectedPO.poNumber}
                </SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  Created {formatDate(selectedPO.createdAt)}
                </SheetDescription>
              </SheetHeader>

              {/* Status + Payment badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`gap-1 ${STATUS_CONFIG[selectedPO.status]?.className || ''}`}>
                  {STATUS_CONFIG[selectedPO.status]?.icon}
                  {selectedPO.status}
                </Badge>
                <Badge variant="outline" className={PAYMENT_CONFIG[selectedPO.paymentStatus]?.className || ''}>
                  {selectedPO.paymentStatus}
                </Badge>
              </div>

              {/* PO Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoBlock label="PO Number" value={selectedPO.poNumber} />
                <InfoBlock label="Created" value={formatDate(selectedPO.createdAt)} />
                <InfoBlock label="Fabric" value={selectedPO.fabricName} />
                <InfoBlock label="Unit" value={selectedPO.unit} />
              </div>

              {/* Supplier Details */}
              <Card className="glass-card border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package className="h-3 w-3" /> Supplier
                </p>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{selectedPO.supplier.name}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>Type: {selectedPO.supplier.supplierType}</span>
                    <span className="flex items-center gap-1">
                      Rating: <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {selectedPO.supplier.rating}/5
                    </span>
                    <span>Terms: {selectedPO.supplier.paymentTerms} days</span>
                    {selectedPO.supplier.contactPerson && <span>Contact: {selectedPO.supplier.contactPerson}</span>}
                    {selectedPO.supplier.phone && <span>Phone: {selectedPO.supplier.phone}</span>}
                    {selectedPO.supplier.email && <span className="col-span-2">Email: {selectedPO.supplier.email}</span>}
                  </div>
                </div>
              </Card>

              {/* Quantity Progress */}
              <Card className="glass-card border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <PackageCheck className="h-3 w-3" /> Quantity
                </p>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{selectedPO.receivedQty}</p>
                    <p className="text-xs text-muted-foreground">of {selectedPO.quantity} {selectedPO.unit} ordered</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPO.quantity > 0
                      ? Math.round((selectedPO.receivedQty / selectedPO.quantity) * 100)
                      : 0}
                    % received
                  </p>
                </div>
                <Progress
                  value={selectedPO.quantity > 0 ? (selectedPO.receivedQty / selectedPO.quantity) * 100 : 0}
                  className="h-2 bg-muted/50"
                />
                {selectedPO.expectedDelivery && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    Expected: {formatDate(selectedPO.expectedDelivery)}
                  </div>
                )}
              </Card>

              {/* Amount Breakdown */}
              <Card className="glass-card border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" /> Payment
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-semibold text-foreground">{formatINR(selectedPO.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-medium text-emerald-400">{formatINR(selectedPO.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-border/40 pt-2">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-semibold text-red-400">
                      {formatINR(selectedPO.totalAmount - selectedPO.paidAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Rate per {selectedPO.unit}</span>
                    <span>{formatINR(selectedPO.ratePerUnit)}</span>
                  </div>
                </div>
              </Card>

              {/* Status Timeline */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Status Timeline</p>
                <div className="space-y-0">
                  {STATUS_FLOW.map((step, idx) => {
                    const currentIdx = STATUS_FLOW.indexOf(selectedPO.status)
                    const isCompleted = idx < currentIdx
                    const isCurrent = step === selectedPO.status
                    const isCancelled = selectedPO.status === 'Cancelled' && !isCompleted

                    return (
                      <div key={step} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : isCurrent
                                ? 'bg-primary/20 text-primary border border-primary/40'
                                : 'bg-muted/50 text-muted-foreground border border-border/50'
                            }`}
                          >
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          {idx < STATUS_FLOW.length - 1 && (
                            <div
                              className={`w-0.5 h-6 ${
                                isCompleted ? 'bg-emerald-500/30' : 'bg-border/50'
                              }`}
                            />
                          )}
                        </div>
                        <div className="pt-0.5">
                          <p
                            className={`text-xs font-medium ${
                              isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {step}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {selectedPO.status === 'Cancelled' && (
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center text-[10px] shrink-0">
                        ✕
                      </div>
                      <p className="text-xs font-medium text-red-400 pt-0.5">Cancelled</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Actions ────────────────────────────────────────────── */}
              <div className="space-y-3 pt-2 border-t border-border/30">
                <p className="text-xs font-semibold text-muted-foreground">Actions</p>

                {/* Approve */}
                {selectedPO.status === 'Pending' && (
                  <ActionRow
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Approve this purchase order"
                    btnLabel="Approve"
                    btnClass="bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25"
                    loading={actionLoading}
                    onClick={() => handleStatusUpdate(selectedPO.id, 'Approved')}
                  />
                )}

                {/* Mark as Ordered */}
                {selectedPO.status === 'Approved' && (
                  <ActionRow
                    icon={<Truck className="h-4 w-4" />}
                    label="Confirm order has been placed with supplier"
                    btnLabel="Mark Ordered"
                    btnClass="bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25"
                    loading={actionLoading}
                    onClick={() => handleStatusUpdate(selectedPO.id, 'Ordered')}
                  />
                )}

                {/* Record Goods Receipt */}
                {selectedPO.status === 'Ordered' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <PackageCheck className="h-4 w-4" />
                      <span>Record goods receipt</span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Received qty"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={receiptQty}
                        onChange={(e) => setReceiptQty(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                        disabled={actionLoading || !receiptQty}
                        onClick={handleGoodsReceipt}
                      >
                        {actionLoading ? 'Saving...' : 'Receive'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cancel */}
                {(selectedPO.status === 'Pending' || selectedPO.status === 'Approved') && (
                  <ActionRow
                    icon={<Ban className="h-4 w-4 text-red-400" />}
                    label="Cancel this purchase order"
                    btnLabel="Cancel PO"
                    btnClass="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
                    loading={actionLoading}
                    onClick={() => handleStatusUpdate(selectedPO.id, 'Cancelled')}
                  />
                )}

                {/* Record Payment (any non-cancelled PO) */}
                {selectedPO.status !== 'Cancelled' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                      <span>Record payment</span>
                      <span className="text-[10px]">
                        (Pending: {formatINR(selectedPO.totalAmount - selectedPO.paidAmount)})
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount (₹)"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={paymentAmt}
                        onChange={(e) => setPaymentAmt(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                        disabled={actionLoading || !paymentAmt || selectedPO.paidAmount >= selectedPO.totalAmount}
                        onClick={handlePayment}
                      >
                        {actionLoading ? 'Saving...' : 'Pay'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Card className={`glass-card border-l-2 ${accent} transition-all hover:border-l-primary/80`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  )
}

function ActionRow({
  icon,
  label,
  btnLabel,
  btnClass,
  loading,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  btnLabel: string
  btnClass: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <Button
        size="sm"
        variant="outline"
        className={`h-7 text-xs ${btnClass}`}
        disabled={loading}
        onClick={onClick}
      >
        {loading ? 'Processing...' : btnLabel}
      </Button>
    </div>
  )
}