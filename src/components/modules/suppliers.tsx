'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Truck,
  Phone,
  Mail,
  FileText,
  IndianRupee,
  Star,
  UserCheck,
  MoreHorizontal,
  Pencil,
  UserX,
  Eye,
  Package,
  Layers,
  Clock,
  Trophy,
  Award,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell as RCell,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupplierPO {
  id: string
  poNumber: string
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
}

interface SupplierFabric {
  id: string
  fabricName: string
  gsm: number | null
  width: number | null
  lotNumber: string | null
  availableMeters: number
  reservedMeters: number
  averageCost: number
  totalValue: number
  createdAt: string
}

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
  createdAt: string
  updatedAt: string
  totalPOValue: number
  poCount: number
  pendingPOCount: number
  fabricStockValue: number
  fabricItems: number
}

interface SupplierSummary {
  totalSuppliers: number
  activeCount: number
  totalPOValue: number
  avgRating: number
  uniqueTypes: number
  pendingPayments: number
}

// ─── Supplier Performance Types (NEW) ────────────────────────────────────────

interface PerfSupplier {
  id: string
  name: string
  supplierType: string
  contactPerson: string | null
  phone: string | null
  rating: number
  paymentTerms: number
  poCount: number
  totalPOValue: number
  paidAmount: number
  outstandingPayables: number
  deliveredCount: number
  pendingCount: number
  onTimeCount: number
  lateCount: number
  onTimeRate: number
  avgLeadTimeDays: number
  totalOrderedQty: number
  totalReceivedQty: number
  fillRate: number
  compositeScore: number
  scoreGrade: 'A' | 'B' | 'C' | 'D'
  tier: 'Strategic' | 'Preferred' | 'Approved' | 'Conditional'
}

interface PerfSummary {
  totalSuppliers: number
  avgScore: number
  avgOnTimeRate: number
  avgFillRate: number
  avgRating: number
  totalPOValue: number
  totalOutstanding: number
  strategicCount: number
  preferredCount: number
  approvedCount: number
  conditionalCount: number
  gradeDist: { A: number; B: number; C: number; D: number }
}

interface PerfData {
  summary: PerfSummary
  suppliers: PerfSupplier[]
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

const SUPPLIER_TYPES = [
  'Fabric',
  'Print',
  'Embroidery',
  'Accessories',
  'Thread',
  'Buttons',
  'Labels',
]

const TYPE_COLORS: Record<string, string> = {
  Fabric: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  Print: 'border-sky-500/50 bg-sky-500/10 text-sky-400',
  Embroidery: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  Accessories: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
  Thread: 'border-teal-500/50 bg-teal-500/10 text-teal-400',
  Buttons: 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  Labels: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400',
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || 'border-muted-foreground/50 bg-muted-foreground/10 text-muted-foreground'
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'xs' | 'sm' | 'md' }) {
  const iconClass =
    size === 'xs'
      ? 'h-3 w-3'
      : size === 'md'
        ? 'h-5 w-5'
        : 'h-3.5 w-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${iconClass} ${
            i <= rating
              ? 'fill-primary text-primary'
              : 'fill-muted text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={
        status === 'Active'
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0'
          : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-2 py-0'
      }
    >
      {status}
    </Badge>
  )
}

function POStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Pending: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
    Approved: 'border-sky-500/50 bg-sky-500/10 text-sky-400',
    Ordered: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
    PartiallyReceived: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
    Received: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
    Cancelled: 'border-red-500/50 bg-red-500/10 text-red-400',
  }
  return (
    <Badge
      variant="outline"
      className={`text-[9px] px-1.5 py-0 ${colors[status] || 'border-muted-foreground/50 bg-muted-foreground/10 text-muted-foreground'}`}
    >
      {status}
    </Badge>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [summary, setSummary] = useState<SupplierSummary | null>(null)
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
    Active: 0,
    Inactive: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [perf, setPerf] = useState<PerfData | null>(null)

  // Detail panel
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [detailPOs, setDetailPOs] = useState<SupplierPO[]>([])
  const [detailFabrics, setDetailFabrics] = useState<SupplierFabric[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: '',
    supplierType: 'Fabric',
    contactPerson: '',
    phone: '',
    email: '',
    paymentTerms: '15',
    rating: 3,
  })

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter !== 'All') params.set('type', typeFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)

      const res = await fetch(`/api/suppliers?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSuppliers(data.suppliers)
      setTypeCounts(data.typeCounts || {})
      setStatusCounts(data.statusCounts || { Active: 0, Inactive: 0 })
      if (data.summary) setSummary(data.summary)
    } catch {
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter, statusFilter])

  const fetchPerf = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers/performance')
      if (!res.ok) return
      const json = await res.json()
      if (!json.error) setPerf(json)
    } catch {
      // Performance is optional — fail silently
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchSuppliers(), 200)
    fetchPerf()
    return () => clearTimeout(timer)
  }, [fetchSuppliers, fetchPerf])

  const openDetail = async (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailPOs(data.purchaseOrders || [])
        setDetailFabrics(data.fabricStock || [])
      }
    } catch {
      setDetailPOs([])
      setDetailFabrics([])
    } finally {
      setDetailLoading(false)
    }
  }

  const openAddDialog = () => {
    setEditingSupplier(null)
    setForm({
      name: '',
      supplierType: 'Fabric',
      contactPerson: '',
      phone: '',
      email: '',
      paymentTerms: '15',
      rating: 3,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm({
      name: supplier.name,
      supplierType: supplier.supplierType,
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      paymentTerms: String(supplier.paymentTerms),
      rating: supplier.rating,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingSupplier) {
        const res = await fetch(`/api/suppliers/${editingSupplier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            supplierType: form.supplierType,
            contactPerson: form.contactPerson || null,
            phone: form.phone || null,
            email: form.email || null,
            paymentTerms: Number(form.paymentTerms),
            rating: form.rating,
          }),
        })
        if (res.ok) {
          toast.success('Supplier updated successfully')
          setDialogOpen(false)
          fetchSuppliers()
        }
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            supplierType: form.supplierType,
            contactPerson: form.contactPerson || null,
            phone: form.phone || null,
            email: form.email || null,
            paymentTerms: Number(form.paymentTerms),
            rating: form.rating,
          }),
        })
        if (res.ok) {
          toast.success('Supplier created successfully')
          setDialogOpen(false)
          fetchSuppliers()
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Supplier deactivated successfully')
        setDetailOpen(false)
        setSelectedSupplier(null)
        fetchSuppliers()
      }
    } catch {
      toast.error('Failed to deactivate supplier')
    }
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-primary">Suppliers</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Supply Chain Partners
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="suppliers" />
          <Button
            onClick={openAddDialog}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </Button>
        </div>
      </div>

      {/* ─── Summary KPI Cards ────────────────────────────────── */}
      {summary && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass-card rounded-xl p-4 border-l-4 border-l-primary">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Suppliers
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{summary.totalSuppliers}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {summary.uniqueTypes} types
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 border-l-4 border-l-emerald-500">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-400">
              {summary.activeCount}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              of {summary.totalSuppliers} total
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-2">
              <IndianRupee className="h-4 w-4 text-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total PO Value
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {formatINR(summary.totalPOValue)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Pending: {formatINR(summary.pendingPayments)}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 border-l-4 border-l-sky-500">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-sky-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Avg Rating
              </span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold tabular-nums">
                {summary.avgRating}
              </p>
              <span className="text-sm text-muted-foreground">/5</span>
            </div>
            <div className="mt-0.5">
              <StarRating rating={Math.round(summary.avgRating)} size="xs" />
            </div>
          </div>
        </div>
      )}

      {/* KPI Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card rounded-xl p-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20 mt-2" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Filter Bar ───────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, contact, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-border"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[150px] bg-muted/50 border-border">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Types</SelectItem>
            {SUPPLIER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t} {typeCounts[t] ? `(${typeCounts[t]})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {s !== 'All' && statusCounts[s] !== undefined && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 min-w-4 px-1 text-[9px]"
                >
                  {statusCounts[s]}
                </Badge>
              )}
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
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty State ──────────────────────────────────────── */}
      {!loading && suppliers.length === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Truck className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No suppliers found</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {search || typeFilter !== 'All' || statusFilter !== 'All'
              ? 'Try adjusting your search or filter criteria.'
              : 'Add your first supplier to get started.'}
          </p>
          {!search && typeFilter === 'All' && statusFilter === 'All' && (
            <Button
              onClick={openAddDialog}
              className="mt-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Supplier
            </Button>
          )}
        </div>
      )}

      {/* ─── Mobile: Card Grid ────────────────────────────────── */}
      {!loading && suppliers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {suppliers.map((supplier) => (
            <button
              key={supplier.id}
              onClick={() => openDetail(supplier)}
              className="glass-card rounded-xl p-4 text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {supplier.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${getTypeColor(supplier.supplierType)}`}
                    >
                      {supplier.supplierType}
                    </Badge>
                  </div>
                </div>
                <StatusBadge status={supplier.status} />
              </div>

              {supplier.contactPerson && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {supplier.contactPerson}
                </p>
              )}

              <div className="mt-2">
                <StarRating rating={supplier.rating} size="xs" />
              </div>

              {(supplier.phone || supplier.email) && (
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  {supplier.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {supplier.phone}
                    </span>
                  )}
                  {supplier.email && (
                    <span className="flex items-center gap-1 truncate max-w-[160px]">
                      <Mail className="h-3 w-3" />
                      {supplier.email}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">PO Value</p>
                  <p className="text-sm font-semibold tabular-nums text-primary">
                    {formatINR(supplier.totalPOValue)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">POs</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {supplier.poCount}
                    {supplier.pendingPOCount > 0 && (
                      <span className="text-amber-400 ml-0.5">
                        ({supplier.pendingPOCount})
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Terms</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {supplier.paymentTerms}d
                  </p>
                </div>
              </div>

              {/* Mobile actions */}
              <div className="mt-3 flex gap-2 border-t border-border pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[11px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditDialog(supplier)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                {supplier.status === 'Active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-[11px] gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeactivate(supplier.id)
                    }}
                  >
                    <UserX className="h-3 w-3" />
                    Deactivate
                  </Button>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ─── Desktop: Table View ──────────────────────────────── */}
      {!loading && suppliers.length > 0 && (
        <div className="hidden lg:block glass-card rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Contact
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Phone
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Terms
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                  Rating
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  PO Value
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  POs
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  className="border-border cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => openDetail(supplier)}
                >
                  <TableCell className="font-medium text-sm text-primary">
                    {supplier.name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${getTypeColor(supplier.supplierType)}`}
                    >
                      {supplier.supplierType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {supplier.contactPerson || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {supplier.phone || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">
                    {supplier.email || '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {supplier.paymentTerms} days
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <StarRating rating={supplier.rating} size="xs" />
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {supplier.rating}/5
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-primary">
                    {formatINR(supplier.totalPOValue)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {supplier.poCount}
                    {supplier.pendingPOCount > 0 && (
                      <span className="text-amber-400 ml-1 text-xs">
                        ({supplier.pendingPOCount} pend.)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={supplier.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(supplier) }}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(supplier) }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {supplier.status === 'Active' && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeactivate(supplier.id) }}
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Deactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Supplier Detail Sheet ────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg border-border bg-background p-0 overflow-y-auto">
          {selectedSupplier && (
            <>
              <SheetHeader className="p-4 pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                      {selectedSupplier.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <SheetTitle className="text-base font-bold">
                        {selectedSupplier.name}
                      </SheetTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${getTypeColor(selectedSupplier.supplierType)}`}
                        >
                          {selectedSupplier.supplierType}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <StarRating rating={selectedSupplier.rating} size="xs" />
                          <span className="text-[10px] text-muted-foreground">
                            {selectedSupplier.rating}/5
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={selectedSupplier.status} />
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
                      openEditDialog(selectedSupplier)
                      setDetailOpen(false)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {selectedSupplier.status === 'Active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeactivate(selectedSupplier.id)}
                    >
                      <UserX className="h-3.5 w-3.5" />
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
                    {selectedSupplier.contactPerson && (
                      <div className="flex items-center gap-2.5">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedSupplier.contactPerson}</span>
                      </div>
                    )}
                    {selectedSupplier.phone && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedSupplier.phone}</span>
                      </div>
                    )}
                    {selectedSupplier.email && (
                      <div className="flex items-center gap-2.5">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{selectedSupplier.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>Payment Terms: {selectedSupplier.paymentTerms} days</span>
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Key Metrics */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Business Metrics
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="glass-card rounded-lg p-3 text-center">
                      <IndianRupee className="mx-auto h-4 w-4 text-primary mb-1" />
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {formatINR(selectedSupplier.totalPOValue)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Total PO Value
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <FileText className="mx-auto h-4 w-4 text-amber-400 mb-1" />
                      <p className="text-lg font-bold tabular-nums">
                        {selectedSupplier.poCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Total POs
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <Package className="mx-auto h-4 w-4 text-sky-400 mb-1" />
                      <p className="text-lg font-bold tabular-nums text-sky-400">
                        {selectedSupplier.pendingPOCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Pending POs
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <Layers className="mx-auto h-4 w-4 text-emerald-400 mb-1" />
                      <p className="text-lg font-bold tabular-nums text-emerald-400">
                        {formatINR(selectedSupplier.fabricStockValue)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Fabric Stock ({selectedSupplier.fabricItems})
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Purchase Orders */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Purchase Orders
                  </h4>

                  {detailLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : detailPOs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No purchase orders for this supplier.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border border-border">
                      {detailPOs.map((po) => (
                        <div
                          key={po.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors border-b border-border last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold font-mono">
                                {po.poNumber}
                              </p>
                              <POStatusBadge status={po.status} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {po.fabricName} · {po.quantity} {po.unit}
                            </p>
                            {po.expectedDelivery && (
                              <p className="text-[10px] text-muted-foreground">
                                Delivery: {formatDate(po.expectedDelivery)}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold tabular-nums text-primary">
                              {formatINR(po.totalAmount)}
                            </p>
                            <div className="flex items-center gap-1 justify-end">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  po.paymentStatus === 'Paid'
                                    ? 'bg-emerald-400'
                                    : po.paymentStatus === 'Partial'
                                      ? 'bg-amber-400'
                                      : 'bg-red-400'
                                }`}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                {po.paymentStatus}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fabric Stock */}
                {detailFabrics.length > 0 && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Fabric Stock Items
                      </h4>
                      <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border border-border">
                        {detailFabrics.map((fabric) => (
                          <div
                            key={fabric.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors border-b border-border last:border-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold">
                                  {fabric.fabricName}
                                </p>
                                {fabric.lotNumber && (
                                  <span className="text-[9px] font-mono text-muted-foreground">
                                    Lot: {fabric.lotNumber}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {fabric.availableMeters}m available
                                {fabric.reservedMeters > 0 && ` · ${fabric.reservedMeters}m reserved`}
                                {fabric.gsm && ` · ${fabric.gsm} GSM`}
                                {fabric.width && ` · ${fabric.width}"`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-semibold tabular-nums text-emerald-400">
                                {formatINR(fabric.totalValue)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatINR(fabric.averageCost)}/m
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">
                Supplier Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Surat Silk Mills"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Type</Label>
                <Select
                  value={form.supplierType}
                  onValueChange={(v) =>
                    setForm({ ...form, supplierType: v })
                  }
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="15">15 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="45">45 Days</SelectItem>
                    <SelectItem value="60">60 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Contact Person</Label>
              <Input
                placeholder="e.g. Rajesh Patel"
                value={form.contactPerson}
                onChange={(e) =>
                  setForm({ ...form, contactPerson: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
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
                  placeholder="contact@supplier.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>

            {/* Rating Selector */}
            <div className="space-y-2">
              <Label className="text-xs">Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setForm({ ...form, rating: i })}
                    className="p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-6 w-6 transition-colors ${
                        i <= form.rating
                          ? 'fill-primary text-primary'
                          : 'fill-muted text-muted-foreground/30'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-2 text-sm text-muted-foreground">
                  {form.rating}/5
                </span>
              </div>
            </div>

            {/* Live Preview */}
            {form.name.trim() && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
                  Preview
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    {form.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{form.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${getTypeColor(form.supplierType)}`}
                      >
                        {form.supplierType}
                      </Badge>
                      <StarRating rating={form.rating} size="xs" />
                      <span className="text-[10px] text-muted-foreground">
                        {form.paymentTerms}d terms
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
              disabled={!form.name.trim() || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? 'Saving...' : editingSupplier ? 'Update' : 'Add Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Supplier Performance Scorecard (NEW FEATURE) ─────────────── */}
      {perf && perf.summary.totalSuppliers > 0 && (
        <SupplierPerformanceWidget data={perf} />
      )}
    </div>
  )
}

// ─── Supplier Performance Scorecard Widget (NEW FEATURE) ─────────────────────
// Aggregates supplier metrics into a composite score (0-100) with tier
// classification (Strategic/Preferred/Approved/Conditional).  Shows ranking,
// grade distribution, and per-supplier radar breakdown.

function PerfChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { tier: string; scoreGrade: string } }>; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      <p className="font-semibold tabular-nums text-primary">{payload[0].value}/100</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        Grade {p.scoreGrade} · {p.tier}
      </p>
    </div>
  )
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'oklch(0.72 0.18 145)' // green
    case 'B': return 'oklch(0.8 0.15 75)'   // gold
    case 'C': return 'oklch(0.75 0.15 65)'  // orange
    case 'D': return 'oklch(0.65 0.22 25)'  // red
    default: return 'oklch(0.6 0.01 260)'
  }
}

function getTierColor(tier: string): { text: string; bg: string; border: string } {
  switch (tier) {
    case 'Strategic':
      return { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' }
    case 'Preferred':
      return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40' }
    case 'Approved':
      return { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/40' }
    case 'Conditional':
      return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/40' }
    default:
      return { text: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border' }
  }
}

function SupplierPerformanceWidget({ data }: { data: PerfData }) {
  const { summary, suppliers } = data
  const top5 = suppliers.slice(0, 5)

  // Radar data for top supplier (highest score)
  const topSupplier = suppliers[0]
  const radarData = topSupplier ? [
    { metric: 'On-Time', value: topSupplier.onTimeRate, fullMark: 100 },
    { metric: 'Fill Rate', value: topSupplier.fillRate, fullMark: 100 },
    { metric: 'Quality', value: (topSupplier.rating / 5) * 100, fullMark: 100 },
    { metric: 'Volume', value: Math.min(100, (topSupplier.poCount / 10) * 100), fullMark: 100 },
    { metric: 'Payment', value: topSupplier.totalPOValue > 0 ? (topSupplier.paidAmount / topSupplier.totalPOValue) * 100 : 100, fullMark: 100 },
  ] : []

  return (
    <div className="premium-card rounded-xl p-5">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 glow-ring">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Supplier Performance Scorecard</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                AI Ranked
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.totalSuppliers} suppliers · Avg score {summary.avgScore}/100 · {summary.strategicCount} Strategic, {summary.preferredCount} Preferred
            </p>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Award className="h-3 w-3" />
            Avg Score
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{summary.avgScore}<span className="text-xs text-muted-foreground">/100</span></p>
          <p className="text-[10px] text-muted-foreground">Across {summary.totalSuppliers} suppliers</p>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
            <Clock className="h-3 w-3" />
            On-Time Rate
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-400">{summary.avgOnTimeRate}%</p>
          <p className="text-[10px] text-muted-foreground">Avg fill: {summary.avgFillRate}%</p>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <IndianRupee className="h-3 w-3" />
            Total PO Value
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatINR(summary.totalPOValue)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">★ {summary.avgRating}/5 avg rating</p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
            <ShieldCheck className="h-3 w-3" />
            Outstanding
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-amber-400">{formatINR(summary.totalOutstanding)}</p>
          <p className="text-[10px] text-muted-foreground">Unpaid payables</p>
        </div>
      </div>

      {/* Tier distribution */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Tiers:</span>
        {[
          { label: 'Strategic', count: summary.strategicCount, icon: Trophy, color: 'text-primary border-primary/40 bg-primary/10' },
          { label: 'Preferred', count: summary.preferredCount, icon: Award, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
          { label: 'Approved', count: summary.approvedCount, icon: ShieldCheck, color: 'text-sky-400 border-sky-500/40 bg-sky-500/10' },
          { label: 'Conditional', count: summary.conditionalCount, icon: Zap, color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
        ].map(t => (
          <div key={t.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${t.color}`}>
            <t.icon className="h-3 w-3" />
            {t.label}
            <span className="tabular-nums">{t.count}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Grades:</span>
          {['A', 'B', 'C', 'D'].map(g => (
            <span key={g} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: getGradeColor(g) }} />
              {g}: <span className="tabular-nums font-medium">{summary.gradeDist[g as 'A' | 'B' | 'C' | 'D']}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top 5 ranking + radar */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Ranking bars */}
        <div className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top 5 Suppliers by Composite Score
          </h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                  tickFormatter={(v) => v.length > 16 ? v.substring(0, 16) + '…' : v}
                />
                <RTooltip content={<PerfChartTooltip />} cursor={{ fill: 'oklch(0.5 0.01 260 / 10%)' }} />
                <Bar dataKey="compositeScore" name="Score" radius={[0, 6, 6, 0]}>
                  {top5.map((s, i) => (
                    <RCell key={`cell-${i}`} fill={getGradeColor(s.scoreGrade)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar for top supplier */}
        {topSupplier && (
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              #1 Profile: <span className="text-foreground font-medium">{topSupplier.name.length > 20 ? topSupplier.name.substring(0, 20) + '…' : topSupplier.name}</span>
            </h4>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <PolarGrid stroke="oklch(0.3 0.005 260)" opacity={0.4} />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 9 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 8 }} angle={90} />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke="oklch(0.78 0.14 85)"
                    fill="oklch(0.78 0.14 85)"
                    fillOpacity={0.35}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Full ranking table */}
      <div className="mt-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Complete Supplier Rankings
        </h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-xs w-8">#</TableHead>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Tier</TableHead>
                <TableHead className="text-xs text-right">Score</TableHead>
                <TableHead className="text-xs text-right">POs</TableHead>
                <TableHead className="text-xs text-right">PO Value</TableHead>
                <TableHead className="text-xs text-right">On-Time</TableHead>
                <TableHead className="text-xs text-right">Fill Rate</TableHead>
                <TableHead className="text-xs text-right">Lead Time</TableHead>
                <TableHead className="text-xs text-center">Rating</TableHead>
                <TableHead className="text-xs text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s, i) => {
                const tierColors = getTierColor(s.tier)
                return (
                  <TableRow key={s.id} className="border-border/20 animate-slide-in" style={{ animationDelay: `${i * 40}ms` }}>
                    <TableCell className="text-xs font-bold tabular-nums py-2.5 text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">{s.supplierType}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tierColors.text} ${tierColors.bg} ${tierColors.border}`}>
                        {s.tier}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: getGradeColor(s.scoreGrade) }}
                        >
                          {s.compositeScore}
                        </span>
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
                          style={{ backgroundColor: getGradeColor(s.scoreGrade) }}
                        >
                          {s.scoreGrade}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">{s.poCount}</TableCell>
                    <TableCell className="text-xs text-right font-medium tabular-nums py-2.5">{formatINR(s.totalPOValue)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">
                      <span className={s.onTimeRate >= 90 ? 'text-emerald-400' : s.onTimeRate >= 70 ? 'text-amber-400' : 'text-red-400'}>
                        {s.onTimeRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">
                      <span className={s.fillRate >= 80 ? 'text-emerald-400' : s.fillRate >= 50 ? 'text-amber-400' : 'text-red-400'}>
                        {s.fillRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5 text-muted-foreground">
                      {s.avgLeadTimeDays > 0 ? `${s.avgLeadTimeDays}d` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-center py-2.5">
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        <span className="tabular-nums">{s.rating}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2.5">
                      {s.outstandingPayables > 0 ? (
                        <span className="text-amber-400">{formatINR(s.outstandingPayables)}</span>
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

      {/* Insight banner */}
      {summary.conditionalCount > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 animate-slide-in">
          <Zap className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-400">Performance Review Needed</p>
            <p className="text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{summary.conditionalCount} supplier{summary.conditionalCount !== 1 ? 's' : ''}</span>{' '}
              classified as Conditional (score &lt; 50). Review delivery performance, negotiate better terms,
              or consider alternative suppliers to improve supply chain resilience.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}