'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Trash2,
  Eye,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  Package,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  X,
  CreditCard,
  IndianRupee,
  Loader2,
  Link2,
  Shirt,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string
  styleId: string | null
  styleName: string
  styleNo: string | null
  collectionName: string | null
  category: string | null
  quantity: number
  unitPrice: number
  unitCost: number
  totalAmount: number
  totalCost: number
  profit: number
  _image?: string | null
  _fgStockAvailable?: number
}

interface Order {
  id: string
  orderNo: string
  customerId: string
  customer: { id: string; companyName: string; buyerName: string | null; phone: string | null; email: string | null }
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
  quotationId: string | null
  quotationNo: string | null
  items: OrderItem[]
  createdAt: string
  updatedAt: string
}

interface Customer {
  id: string
  companyName: string
  buyerName: string | null
  phone: string | null
  email: string | null
  status: string
}

interface NewLineItem {
  styleId: string
  styleName: string
  quantity: number
  unitPrice: number
  unitCost: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  Pending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <Clock className="h-3 w-3" /> },
  'In Progress': { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: <Package className="h-3 w-3" /> },
  Completed: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  Cancelled: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <XCircle className="h-3 w-3" /> },
  Confirmed: { color: 'bg-sky-500/15 text-sky-400 border-sky-500/30', icon: <FileText className="h-3 w-3" /> },
  'In Production': { color: 'bg-violet-500/15 text-violet-400 border-violet-500/30', icon: <Package className="h-3 w-3" /> },
  Dispatched: { color: 'bg-teal-500/15 text-teal-400 border-teal-500/30', icon: <Package className="h-3 w-3" /> },
}

const PAYMENT_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  Paid: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  Partial: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <CreditCard className="h-3 w-3" /> },
  Unpaid: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <CreditCard className="h-3 w-3" /> },
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SalesOrders() {
  const { toast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [statuses, setStatuses] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [sortField, setSortField] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Create order dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [createLoading, setCreateLoading] = useState(false)
  const [newCustomerId, setNewCustomerId] = useState('')
  const [newItems, setNewItems] = useState<NewLineItem[]>([
    { styleId: '', styleName: '', quantity: 1, unitPrice: 0, unitCost: 0 },
  ])
  const [newDeliveryDate, setNewDeliveryDate] = useState('')
  const [newDiscount, setNewDiscount] = useState('0')
  const [newNotes, setNewNotes] = useState('')

  // Detail panel
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // ─── Fetch Orders ─────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sort', sortField)
      params.set('order', sortOrder)

      const res = await fetch(`/api/orders?${params}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders)
        setTotal(data.total)
        setStatuses(data.statuses || {})
      }
    } catch {
      toast({ title: 'Error loading orders', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page, limit, sortField, sortOrder, toast])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // ─── Fetch Customers for Create Dialog ────────────────────────────────────

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/orders')
      if (res.ok) {
        // We need a customers endpoint; let's extract unique from orders
        // Or create a lightweight fetch. For now, use the customer select from order data
      }
    } catch { /* empty */ }
    // Fetch customers directly from orders we have
    const uniqueCustomers = new Map<string, Customer>()
    orders.forEach((o) => {
      if (!uniqueCustomers.has(o.customer.id)) {
        uniqueCustomers.set(o.customer.id, {
          id: o.customer.id,
          companyName: o.customer.companyName,
          buyerName: o.customer.buyerName,
          phone: o.customer.phone,
          email: o.customer.email,
          status: 'Active',
        })
      }
    })
    if (uniqueCustomers.size > 0) {
      setCustomers(Array.from(uniqueCustomers.values()))
    }
  }, [orders])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // ─── Search Handler ───────────────────────────────────────────────────────

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  // ─── Sort Handler ─────────────────────────────────────────────────────────

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  // ─── Create Order ─────────────────────────────────────────────────────────

  const handleCreateOrder = async () => {
    if (!newCustomerId || newItems.some((i) => !i.styleName || i.quantity <= 0 || i.unitPrice <= 0)) {
      toast({ title: 'Please fill in customer and all required item fields', variant: 'destructive' })
      return
    }
    setCreateLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: newCustomerId,
          items: newItems.map((i) => ({
            styleId: i.styleId || undefined,
            styleName: i.styleName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unitCost: i.unitCost,
          })),
          deliveryDate: newDeliveryDate || undefined,
          discountPercent: parseFloat(newDiscount) || 0,
          notes: newNotes || undefined,
        }),
      })
      if (res.ok) {
        toast({ title: 'Order created successfully' })
        setCreateOpen(false)
        resetCreateForm()
        fetchOrders()
      } else {
        const data = await res.json()
        toast({ title: data.error || 'Failed to create order', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Failed to create order', variant: 'destructive' })
    } finally {
      setCreateLoading(false)
    }
  }

  const resetCreateForm = () => {
    setNewCustomerId('')
    setNewItems([{ styleId: '', styleName: '', quantity: 1, unitPrice: 0, unitCost: 0 }])
    setNewDeliveryDate('')
    setNewDiscount('0')
    setNewNotes('')
  }

  const addItemRow = () => {
    setNewItems([...newItems, { styleId: '', styleName: '', quantity: 1, unitPrice: 0, unitCost: 0 }])
  }

  const removeItemRow = (idx: number) => {
    if (newItems.length <= 1) return
    setNewItems(newItems.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: keyof NewLineItem, value: string | number) => {
    const updated = [...newItems]
    updated[idx] = { ...updated[idx], [field]: value }
    setNewItems(updated)
  }

  const createTotals = newItems.reduce(
    (acc, item) => {
      const lineTotal = item.quantity * item.unitPrice
      const lineCost = item.quantity * item.unitCost
      acc.amount += lineTotal
      acc.cost += lineCost
      return acc
    },
    { amount: 0, cost: 0 },
  )
  const discountAmt = createTotals.amount * (parseFloat(newDiscount) || 0) / 100
  const finalAmount = createTotals.amount - discountAmt
  const profit = finalAmount - createTotals.cost

  // ─── Order Detail Actions ─────────────────────────────────────────────────

  const openDetail = async (order: Order) => {
    setDetailOrder(order)
    setDetailOpen(true)
    setEditNotes(order.notes || '')
    setPayAmount('')
  }

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetailOrder(data.order)
        fetchOrders()
        toast({ title: `Order status updated to ${newStatus}` })
      }
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handlePayment = async (orderId: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) return
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAmount: parseFloat(amount) }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetailOrder(data.order)
        fetchOrders()
        setPayAmount('')
        toast({ title: 'Payment recorded' })
      }
    } catch {
      toast({ title: 'Failed to record payment', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleSaveNotes = async (orderId: string) => {
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetailOrder(data.order)
        fetchOrders()
        toast({ title: 'Notes saved' })
      }
    } catch {
      toast({ title: 'Failed to save notes', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Order cancelled' })
        setDetailOpen(false)
        setDetailOrder(null)
        fetchOrders()
      }
    } catch {
      toast({ title: 'Failed to cancel order', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  // ─── Pagination ───────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / limit)

  // ─── Filter Tabs ──────────────────────────────────────────────────────────

  const filterTabs = [
    { key: '', label: 'All', count: total },
    { key: 'Pending', label: 'Pending', count: statuses['Pending'] || 0 },
    { key: 'In Progress', label: 'In Progress', count: statuses['In Progress'] || 0 },
    { key: 'Completed', label: 'Completed', count: statuses['Completed'] || 0 },
    { key: 'Cancelled', label: 'Cancelled', count: statuses['Cancelled'] || 0 },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Sales Orders</h1>
            <p className="text-xs text-muted-foreground">
              {total} orders · {statuses['Pending'] || 0} pending
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="sales-orders" />
          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* ─── Status Filter Tabs ─────────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-1.5">
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === tab.key
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  statusFilter === tab.key
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Search & Sort ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order no. or customer..."
            className="pl-9 bg-muted/50 border-border/50 h-9 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={`${sortField}-${sortOrder}`}
            onValueChange={(v) => {
              const [f, o] = v.split('-')
              setSortField(f)
              setSortOrder(o as 'asc' | 'desc')
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[160px] h-9 bg-muted/50 border-border/50 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-desc">Newest First</SelectItem>
              <SelectItem value="createdAt-asc">Oldest First</SelectItem>
              <SelectItem value="totalAmount-desc">Highest Amount</SelectItem>
              <SelectItem value="totalAmount-asc">Lowest Amount</SelectItem>
              <SelectItem value="orderNo-asc">Order No (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Orders Table ───────────────────────────────────────────────── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-8 text-xs font-medium text-muted-foreground" />
                <TableHead
                  className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort('orderNo')}
                >
                  <span className="flex items-center gap-1">Order No <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden sm:table-cell">Customer</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden md:table-cell">Date</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden lg:table-cell">Items</TableHead>
                <TableHead
                  className="text-xs font-medium text-muted-foreground text-right cursor-pointer select-none"
                  onClick={() => handleSort('totalAmount')}
                >
                  <span className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden xl:table-cell">Cost</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden xl:table-cell">Margin</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden md:table-cell">Payment</TableHead>
                <TableHead className="w-10 text-xs font-medium text-muted-foreground" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell colSpan={11}>
                      <div className="flex items-center gap-3 py-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-32 hidden sm:block" />
                        <Skeleton className="h-4 w-20 hidden md:block" />
                        <div className="flex-1" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-14" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow className="border-border/30">
                  <TableCell colSpan={11} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No orders found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    expanded={expandedOrder === order.id}
                    onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    onView={() => openDetail(order)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ──────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
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
                    variant={page === pageNum ? 'default' : 'ghost'}
                    size="icon"
                    className={`h-7 w-7 text-xs ${page === pageNum ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE ORDER DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm() }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Sales Order
            </DialogTitle>
            <DialogDescription>Add a new sales order with line items</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Customer Select */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Customer *</Label>
              <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                <SelectTrigger className="bg-muted/50">
                  <SelectValue placeholder="Select a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.companyName}{c.buyerName ? ` — ${c.buyerName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Line Items *</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" onClick={addItemRow}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {newItems.map((item, idx) => (
                  <div key={idx} className="glass-card rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                      {newItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItemRow(idx)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                      <div className="sm:col-span-2 lg:col-span-2">
                        <Input
                          placeholder="Style / Product name *"
                          className="h-8 text-sm bg-muted/50"
                          value={item.styleName}
                          onChange={(e) => updateItem(idx, 'styleName', e.target.value)}
                        />
                      </div>
                      <Input
                        type="number"
                        placeholder="Qty"
                        className="h-8 text-sm bg-muted/50"
                        value={item.quantity || ''}
                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                        min={1}
                      />
                      <Input
                        type="number"
                        placeholder="Unit Price (₹)"
                        className="h-8 text-sm bg-muted/50"
                        value={item.unitPrice || ''}
                        onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                      <Input
                        type="number"
                        placeholder="Unit Cost (₹)"
                        className="h-8 text-sm bg-muted/50"
                        value={item.unitCost || ''}
                        onChange={(e) => updateItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                    </div>
                    {item.quantity > 0 && item.unitPrice > 0 && (
                      <p className="text-[11px] text-muted-foreground text-right">
                        Line: {formatINR(item.quantity * item.unitPrice)}
                        {item.unitCost > 0 && (
                          <> · Cost: {formatINR(item.quantity * item.unitCost)} · Profit: {formatINR(item.quantity * (item.unitPrice - item.unitCost))}</>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery & Discount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Delivery Date</Label>
                <Input
                  type="date"
                  className="h-8 text-sm bg-muted/50"
                  value={newDeliveryDate}
                  onChange={(e) => setNewDeliveryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Discount (%)</Label>
                <Input
                  type="number"
                  className="h-8 text-sm bg-muted/50"
                  value={newDiscount}
                  onChange={(e) => setNewDiscount(e.target.value)}
                  min={0}
                  max={100}
                  step={0.5}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea
                placeholder="Order notes or special instructions..."
                className="min-h-[60px] text-sm bg-muted/50 resize-none"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>

            {/* Order Summary */}
            {createTotals.amount > 0 && (
              <div className="glass-card rounded-lg p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Summary</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({newItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span>{formatINR(createTotals.amount)}</span>
                </div>
                {parseFloat(newDiscount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount ({newDiscount}%)</span>
                    <span className="text-destructive">-{formatINR(discountAmt)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Total Amount</span>
                  <span className="text-primary">{formatINR(finalAmount)}</span>
                </div>
                {createTotals.cost > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Cost</span>
                      <span>{formatINR(createTotals.cost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gross Profit</span>
                      <span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatINR(profit)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gross Margin</span>
                      <span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {finalAmount > 0 ? ((profit / finalAmount) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); resetCreateForm() }}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreateOrder}
              disabled={createLoading || !newCustomerId || newItems.some((i) => !i.styleName || i.quantity <= 0 || i.unitPrice <= 0)}
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          ORDER DETAIL DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setDetailOrder(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          {detailOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-primary flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {detailOrder.orderNo}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {formatDate(detailOrder.orderDate)} · {relativeTime(detailOrder.createdAt)}
                    </DialogDescription>
                    {detailOrder.quotationNo && (
                      <Badge
                        variant="outline"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium border-primary/30 text-primary bg-primary/5"
                      >
                        <Link2 className="h-3 w-3" />
                        From Quotation {detailOrder.quotationNo}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={detailOrder.status} type="order" />
                    <PaymentBadge status={detailOrder.paymentStatus} />
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* ─── Customer Info ──────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Company</span>
                      <p className="font-medium">{detailOrder.customer.companyName}</p>
                    </div>
                    {detailOrder.customer.buyerName && (
                      <div>
                        <span className="text-muted-foreground text-xs">Buyer</span>
                        <p className="font-medium">{detailOrder.customer.buyerName}</p>
                      </div>
                    )}
                    {detailOrder.customer.phone && (
                      <div>
                        <span className="text-muted-foreground text-xs">Phone</span>
                        <p>{detailOrder.customer.phone}</p>
                      </div>
                    )}
                    {detailOrder.customer.email && (
                      <div>
                        <span className="text-muted-foreground text-xs">Email</span>
                        <p>{detailOrder.customer.email}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Actions Row ─────────────────────────────────────── */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground">Change Status</Label>
                    <Select
                      value={detailOrder.status}
                      onValueChange={(v) => handleStatusChange(detailOrder.id, v)}
                      disabled={updateLoading}
                    >
                      <SelectTrigger className="h-8 bg-muted/50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground">Record Payment</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount (₹)"
                        className="h-8 bg-muted/50 text-xs flex-1"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        min={0}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                        disabled={updateLoading || !payAmount || parseFloat(payAmount) <= 0}
                        onClick={() => handlePayment(detailOrder.id, payAmount)}
                      >
                        Record
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={updateLoading || detailOrder.status === 'Cancelled'}
                      onClick={() => handleCancelOrder(detailOrder.id)}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>

                {/* ─── Line Items ──────────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Line Items ({detailOrder.items.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/30 hover:bg-transparent">
                          <TableHead className="text-xs">Style</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right hidden sm:table-cell">Unit Price</TableHead>
                          <TableHead className="text-xs text-right hidden sm:table-cell">Unit Cost</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs text-right hidden md:table-cell">Profit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailOrder.items.map((item) => (
                          <TableRow key={item.id} className="border-border/20">
                            <TableCell className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {item._image ? (
                                  <img src={item._image} alt={item.styleNo || item.styleName} className="h-8 w-8 shrink-0 rounded object-cover" />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
                                    <Shirt className="h-4 w-4 text-muted-foreground/30" />
                                  </div>
                                )}
                                <div>
                                  <p>{item.styleName}</p>
                                  {item.styleNo && (
                                    <p className="text-[10px] text-muted-foreground">{item.styleNo}</p>
                                  )}
                                  {item._fgStockAvailable !== undefined && (
                                    <Badge variant={item._fgStockAvailable > 10 ? 'default' : item._fgStockAvailable > 0 ? 'secondary' : 'destructive'} className="text-[10px] px-1.5 py-0 h-4 mt-0.5">
                                      {item._fgStockAvailable > 10 ? '✅' : item._fgStockAvailable > 0 ? '⚠️' : '❌'} {item._fgStockAvailable} pcs
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{item.quantity}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums hidden sm:table-cell">{formatINR(item.unitPrice)}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums hidden sm:table-cell">{formatINR(item.unitCost)}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums font-medium">{formatINR(item.totalAmount)}</TableCell>
                            <TableCell className={`text-sm text-right tabular-nums hidden md:table-cell ${item.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatINR(item.profit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* ─── Order Totals ────────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order Totals</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Amount</p>
                      <p className="text-lg font-bold text-primary">{formatINR(detailOrder.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Cost</p>
                      <p className="text-lg font-bold">{formatINR(detailOrder.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Profit</p>
                      <p className={`text-lg font-bold ${detailOrder.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatINR(detailOrder.grossProfit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Margin</p>
                      <p className={`text-lg font-bold ${detailOrder.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {detailOrder.grossMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {detailOrder.discountPercent > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Discount: {detailOrder.discountPercent}% applied
                    </p>
                  )}

                  <Separator className="my-3" />

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Paid: <span className="text-emerald-400 font-medium">{formatINR(detailOrder.paidAmount)}</span>
                        {detailOrder.totalAmount - detailOrder.paidAmount > 0 && (
                          <span> of {formatINR(detailOrder.totalAmount)}</span>
                        )}
                      </span>
                    </div>
                    <div className="w-48">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Collection</span>
                        <span>{detailOrder.totalAmount > 0 ? ((detailOrder.paidAmount / detailOrder.totalAmount) * 100).toFixed(0) : 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${detailOrder.totalAmount > 0 ? Math.min(100, (detailOrder.paidAmount / detailOrder.totalAmount) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Delivery & Notes ─────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="glass-card rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Delivery</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {detailOrder.deliveryDate ? (
                        <span>{formatDate(detailOrder.deliveryDate)}</span>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </div>
                  </div>
                  <div className="glass-card rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                      {editNotes !== (detailOrder.notes || '') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-primary"
                          disabled={updateLoading}
                          onClick={() => handleSaveNotes(detailOrder.id)}
                        >
                          {updateLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Save
                        </Button>
                      )}
                    </div>
                    <Textarea
                      className="min-h-[60px] text-sm bg-muted/50 resize-none"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes..."
                    />
                  </div>
                </div>

                {/* ─── Order Timeline ───────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline</h4>
                  <div className="space-y-3">
                    <TimelineItem
                      label="Order Created"
                      time={detailOrder.createdAt}
                      isActive
                    />
                    <TimelineItem
                      label={`Status: ${detailOrder.status}`}
                      time={detailOrder.updatedAt}
                      isActive={detailOrder.status !== 'Pending'}
                    />
                    {detailOrder.paidAmount > 0 && (
                      <TimelineItem
                        label={`Payment: ${detailOrder.paymentStatus} (${formatINR(detailOrder.paidAmount)})`}
                        time={detailOrder.updatedAt}
                        isActive
                      />
                    )}
                    {detailOrder.deliveryDate && (
                      <TimelineItem
                        label={`Delivery: ${formatDate(detailOrder.deliveryDate)}`}
                        time={detailOrder.deliveryDate}
                        isUpcoming={new Date(detailOrder.deliveryDate) > new Date()}
                      />
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function OrderRow({
  order,
  expanded,
  onToggle,
  onView,
}: {
  order: Order
  expanded: boolean
  onToggle: () => void
  onView: () => void
}) {
  return (
    <>
      <TableRow
        className="border-border/20 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <TableCell className="w-8 py-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="py-2">
          <span className="text-sm font-semibold text-primary">{order.orderNo}</span>
          <span className="text-[10px] text-muted-foreground block sm:hidden">{order.customer.companyName}</span>
        </TableCell>
        <TableCell className="py-2 text-sm hidden sm:table-cell">
          <div>
            <p className="font-medium">{order.customer.companyName}</p>
            {order.customer.buyerName && <p className="text-[11px] text-muted-foreground">{order.customer.buyerName}</p>}
          </div>
        </TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground hidden md:table-cell">
          {formatDate(order.orderDate)}
        </TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground text-right hidden lg:table-cell tabular-nums">
          {order.items.length} items
        </TableCell>
        <TableCell className="py-2 text-sm font-semibold text-right tabular-nums">
          {formatINR(order.totalAmount)}
        </TableCell>
        <TableCell className="py-2 text-sm text-right tabular-nums text-muted-foreground hidden xl:table-cell">
          {formatINR(order.totalCost)}
        </TableCell>
        <TableCell className="py-2 text-sm text-right tabular-nums hidden xl:table-cell">
          <span className={order.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {order.grossMargin.toFixed(1)}%
          </span>
        </TableCell>
        <TableCell className="py-2">
          <StatusBadge status={order.status} type="order" />
        </TableCell>
        <TableCell className="py-2 hidden md:table-cell">
          <PaymentBadge status={order.paymentStatus} />
        </TableCell>
        <TableCell className="py-2 w-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView() }}>
                <Eye className="h-3.5 w-3.5 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Cancel Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {/* ─── Expanded Row ─────────────────────────────────────────────── */}
      {expanded && (
        <TableRow className="border-border/10 bg-muted/10">
          <TableCell colSpan={11} className="px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {order.items.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  {item._image ? (
                    <img src={item._image} alt={item.styleNo || item.styleName} className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shirt className="h-4 w-4 text-primary/40" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{item.styleName}</p>
                      {item._fgStockAvailable !== undefined && (
                        <Badge variant={item._fgStockAvailable > 10 ? 'default' : item._fgStockAvailable > 0 ? 'secondary' : 'destructive'} className="text-[10px] px-1.5 py-0 h-4">
                          {item._fgStockAvailable > 10 ? '✅' : item._fgStockAvailable > 0 ? '⚠️' : '❌'} {item._fgStockAvailable}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {item.quantity} × {formatINR(item.unitPrice)} = {formatINR(item.totalAmount)}
                    </p>
                    {item.styleNo && (
                      <p className="text-[10px] text-muted-foreground">{item.styleNo}</p>
                    )}
                  </div>
                </div>
              ))}
              {order.items.length > 4 && (
                <div className="flex items-center">
                  <span className="text-xs text-muted-foreground">+{order.items.length - 4} more items</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-4 text-xs text-muted-foreground">
                {order.deliveryDate && <span>Delivery: {formatDate(order.deliveryDate)}</span>}
                {order.discountPercent > 0 && <span>Discount: {order.discountPercent}%</span>}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" onClick={(e) => { e.stopPropagation(); onView() }}>
                <Eye className="h-3 w-3" /> Full Details
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function StatusBadge({ status, type }: { status: string; type: 'order' | 'payment' }) {
  const config = type === 'order' ? STATUS_CONFIG[status] : PAYMENT_CONFIG[status]
  if (!config) {
    return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${config.color}`}>
      {config.icon}
      {status}
    </Badge>
  )
}

function PaymentBadge({ status }: { status: string }) {
  return <StatusBadge status={status} type="payment" />
}

function TimelineItem({
  label,
  time,
  isActive = false,
  isUpcoming = false,
}: {
  label: string
  time: string
  isActive?: boolean
  isUpcoming?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-primary' : isUpcoming ? 'bg-amber-500/50' : 'bg-muted-foreground/30'}`} />
        <div className="w-px h-6 bg-border/50" />
      </div>
      <div className="-mt-0.5">
        <p className={`text-xs ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</p>
        <p className="text-[10px] text-muted-foreground">{relativeTime(time)}</p>
      </div>
    </div>
  )
}