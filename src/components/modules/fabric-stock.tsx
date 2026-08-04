'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Plus,
  Layers,
  Package,
  IndianRupee,
  AlertTriangle,
  MoreVertical,
  ArrowDownToLine,
  ArrowUpFromLine,
  Unlock,
  Pencil,
  SortAsc,
  SortDesc,
  Lock,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useDashboardStore } from '@/store/dashboard-store'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Supplier {
  id: string
  name: string
  supplierType: string
}

interface FabricStockItem {
  id: string
  supplierId: string | null
  supplier: { id: string; name: string; supplierType: string; contactPerson: string | null; phone: string | null } | null
  fabricName: string
  gsm: number | null
  width: number | null
  lotNumber: string | null
  availableMeters: number
  reservedMeters: number
  averageCost: number
  totalValue: number
  createdAt: string
  updatedAt: string
}

interface Stats {
  totalFabricValue: number
  totalAvailableMeters: number
  totalReservedMeters: number
  uniqueFabricTypes: number
  lowStockCount: number
}

interface Reservation {
  id: string
  reservationNo: string
  fabricStockId: string
  referenceType: string
  referenceId: string
  referenceNo: string
  reservedQty: number
  consumedQty: number
  releasedQty: number
  status: string
  reservedDate: string
  releasedDate: string | null
  expiryDate: string | null
  notes: string | null
  fabricStock: { id: string; fabricName: string; availableMeters: number; reservedMeters: number }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)

const fmtMeters = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K m`
  return `${n.toFixed(1)} m`
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 })

const statusColor = (s: string) => {
  switch (s) {
    case 'Active': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'Partially Consumed': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'Fully Consumed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'Released': return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400'
    case 'Expired': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

type SortKey = 'name' | 'value' | 'available'
type SortDir = 'asc' | 'desc'

// ─── Component ─────────────────────────────────────────────────────────────
export function FabricStock() {
  const setActiveView = useDashboardStore((s) => s.setActiveView)

  const [stocks, setStocks] = useState<FabricStockItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Reservation tab state
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [resLoading, setResLoading] = useState(true)
  const [resSearch, setResSearch] = useState('')
  const [resStatusFilter, setResStatusFilter] = useState('All')

  // Dialogs
  const [addOpen, setAddOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustType, setAdjustType] = useState<'add' | 'reserve' | 'release'>('add')
  const [editOpen, setEditOpen] = useState(false)
  const [selected, setSelected] = useState<FabricStockItem | null>(null)

  // Form states
  const [form, setForm] = useState({
    fabricName: '',
    supplierId: '',
    gsm: '',
    width: '',
    lotNumber: '',
    availableMeters: '',
    averageCost: '',
  })
  const [adjustMeters, setAdjustMeters] = useState('')
  const [editForm, setEditForm] = useState({
    fabricName: '',
    supplierId: '',
    gsm: '',
    width: '',
    lotNumber: '',
    averageCost: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // ─── Fetch data ────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (lowStockOnly) params.set('lowStock', 'true')

      const [stockRes, supplierRes] = await Promise.all([
        fetch(`/api/fabric-stock?${params.toString()}`),
        fetch('/api/suppliers'),
      ])

      if (stockRes.ok) {
        const data = await stockRes.json()
        setStocks(data.stocks || [])
        setStats(data.stats || null)
      }

      if (supplierRes.ok) {
        const supplierData = await supplierRes.json()
        const supMap = new Map<string, Supplier>()
        for (const s of supplierData.suppliers || supplierData || []) {
          const id = s.id || s.supplierId
          if (id && !supMap.has(id)) {
            supMap.set(id, { id, name: s.name || s.supplierName, supplierType: s.supplierType || 'Fabric' })
          }
        }
        setSuppliers(Array.from(supMap.values()))
      }
    } catch {
      toast.error('Failed to load fabric stock data')
    } finally {
      setLoading(false)
    }
  }, [search, lowStockOnly])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Fetch reservations ────────────────────────────────────────────
  const fetchReservations = useCallback(async () => {
    try {
      setResLoading(true)
      const params = new URLSearchParams()
      params.set('limit', '50')
      if (resStatusFilter !== 'All') params.set('status', resStatusFilter)
      if (resSearch) params.set('search', resSearch)

      const res = await fetch(`/api/stock-reservations?${params}`)
      const data = await res.json()
      setReservations(data.reservations || [])
    } catch {
      toast.error('Failed to load reservations')
    } finally {
      setResLoading(false)
    }
  }, [resStatusFilter, resSearch])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  // ─── Sorting ───────────────────────────────────────────────────────
  const sortedStocks = [...stocks].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') cmp = a.fabricName.localeCompare(b.fabricName)
    else if (sortKey === 'value') cmp = a.totalValue - b.totalValue
    else if (sortKey === 'available') cmp = a.availableMeters - b.availableMeters
    return sortDir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ─── Add stock ─────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.fabricName || !form.availableMeters || !form.averageCost) {
      toast.error('Fabric name, available meters, and average cost are required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/fabric-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fabricName: form.fabricName,
          supplierId: form.supplierId || null,
          gsm: form.gsm || null,
          width: form.width || null,
          lotNumber: form.lotNumber || null,
          availableMeters: parseFloat(form.availableMeters),
          averageCost: parseFloat(form.averageCost),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add stock')
      }
      toast.success('Fabric stock added successfully')
      setAddOpen(false)
      setForm({ fabricName: '', supplierId: '', gsm: '', width: '', lotNumber: '', availableMeters: '', averageCost: '' })
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add stock')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Adjust stock ──────────────────────────────────────────────────
  const handleAdjust = async () => {
    if (!selected || !adjustMeters) return
    const meters = parseFloat(adjustMeters)
    if (isNaN(meters) || meters <= 0) {
      toast.error('Enter a valid positive number')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, number> = {}
      if (adjustType === 'add') body.addMeters = meters
      else if (adjustType === 'reserve') body.reserveMeters = meters
      else body.releaseMeters = meters

      const res = await fetch(`/api/fabric-stock/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to adjust stock')
      }
      const label = adjustType === 'add' ? 'added' : adjustType === 'reserve' ? 'reserved' : 'released'
      toast.success(`${meters.toFixed(1)}m ${label} successfully`)
      setAdjustOpen(false)
      setAdjustMeters('')
      setSelected(null)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to adjust stock')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Edit stock ────────────────────────────────────────────────────
  const openEdit = (item: FabricStockItem) => {
    setSelected(item)
    setEditForm({
      fabricName: item.fabricName,
      supplierId: item.supplierId || '',
      gsm: item.gsm ? String(item.gsm) : '',
      width: item.width ? String(item.width) : '',
      lotNumber: item.lotNumber || '',
      averageCost: String(item.averageCost),
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!selected) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/fabric-stock/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fabricName: editForm.fabricName,
          supplierId: editForm.supplierId || null,
          gsm: editForm.gsm || null,
          width: editForm.width || null,
          lotNumber: editForm.lotNumber || null,
          averageCost: editForm.averageCost,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update stock')
      }
      toast.success('Fabric stock updated')
      setEditOpen(false)
      setSelected(null)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Auto-calculated total for add form ────────────────────────────
  const addTotalValue = (parseFloat(form.availableMeters) || 0) * (parseFloat(form.averageCost) || 0)

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Fabric Stock</h1>
            <p className="text-xs text-muted-foreground">Inventory management &amp; tracking</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList>
          <TabsTrigger value="stock" className="gap-1.5">
            <Package className="h-4 w-4" />
            Fabric Stock
          </TabsTrigger>
          <TabsTrigger value="reservations" className="gap-1.5">
            <Lock className="h-4 w-4" />
            Reservations
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Fabric Stock ──────────────────────────────────── */}
        <TabsContent value="stock" className="space-y-6">
          {/* Add Fabric button at tab level */}
          <div className="flex justify-end gap-2">
            <ExportButton module="fabric-stock" />
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Fabric
            </Button>
          </div>

      {/* Summary Cards */}
      {stats && !loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="glass-card border-l-4 border-l-primary">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <IndianRupee className="h-3.5 w-3.5" />
                Total Value
              </div>
              <p className="text-lg font-bold text-primary">{inr(stats.totalFabricValue)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Package className="h-3.5 w-3.5" />
                Available
              </div>
              <p className="text-lg font-bold text-foreground">{fmtMeters(stats.totalAvailableMeters)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Reserved
              </div>
              <p className="text-lg font-bold text-foreground">{fmtMeters(stats.totalReservedMeters)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-destructive">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Low Stock
              </div>
              <p className="text-lg font-bold text-destructive">
                {stats.lowStockCount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {stats.uniqueFabricTypes} types
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4">
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-6 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search fabric, lot no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            <div className="flex items-center gap-4">
              {/* Low Stock Toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={lowStockOnly}
                  onCheckedChange={setLowStockOnly}
                  id="low-stock-toggle"
                />
                <Label htmlFor="low-stock-toggle" className="text-xs cursor-pointer flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Low Stock Only
                </Label>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1">
                <Button
                  variant={sortKey === 'name' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => toggleSort('name')}
                >
                  Name
                  {sortKey === 'name' && (sortDir === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                </Button>
                <Button
                  variant={sortKey === 'value' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => toggleSort('value')}
                >
                  Value
                  {sortKey === 'value' && (sortDir === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                </Button>
                <Button
                  variant={sortKey === 'available' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => toggleSort('available')}
                >
                  Qty
                  {sortKey === 'available' && (sortDir === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fabric Stock Table */}
      <Card className="glass-card overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-xs font-semibold">Fabric Name</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Supplier</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">Lot No</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">GSM</TableHead>
                <TableHead className="text-xs font-semibold hidden xl:table-cell">Width</TableHead>
                <TableHead className="text-xs font-semibold text-right">Available (m)</TableHead>
                <TableHead className="text-xs font-semibold text-right hidden sm:table-cell">Reserved (m)</TableHead>
                <TableHead className="text-xs font-semibold text-right hidden md:table-cell">Avg Cost/m</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total Value</TableHead>
                <TableHead className="text-xs font-semibold text-right w-12">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {[...Array(10)].map((_, j) => (
                      <TableCell key={j} className={j >= 7 ? 'text-right' : ''}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sortedStocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Layers className="h-8 w-8" />
                      <p className="text-sm">No fabric stock found</p>
                      <p className="text-xs">Add your first fabric entry to get started</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedStocks.map((item) => {
                  const isLow = item.availableMeters < 50
                  const totalMeters = item.availableMeters + item.reservedMeters
                  const availPercent = totalMeters > 0 ? (item.availableMeters / totalMeters) * 100 : 100

                  return (
                    <TableRow
                      key={item.id}
                      className={`border-border/30 transition-colors ${
                        isLow ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1]' : 'hover:bg-muted/50'
                      }`}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-sm">{item.fabricName}</span>
                          {isLow && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Low Stock
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {item.supplier?.name || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                        {item.lotNumber || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {item.gsm ? `${item.gsm} g` : '—'}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {item.width ? `${item.width}"` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-sm font-semibold tabular-nums ${isLow ? 'text-amber-500' : 'text-foreground'}`}>
                            {item.availableMeters.toFixed(1)}
                          </span>
                          {/* Mini progress bar: available vs reserved */}
                          {totalMeters > 0 && (
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden flex">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${availPercent}%` }}
                              />
                              <div
                                className="h-full rounded-full bg-amber-500 transition-all"
                                style={{ width: `${100 - availPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell text-sm tabular-nums text-muted-foreground">
                        {item.reservedMeters.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                        {inr(item.averageCost)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-primary">
                        {inr(item.totalValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelected(item)
                                setAdjustType('add')
                                setAdjustMeters('')
                                setAdjustOpen(true)
                              }}
                            >
                              <ArrowDownToLine className="mr-2 h-4 w-4 text-emerald-500" />
                              Add Stock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelected(item)
                                setAdjustType('reserve')
                                setAdjustMeters('')
                                setAdjustOpen(true)
                              }}
                            >
                              <ArrowUpFromLine className="mr-2 h-4 w-4 text-amber-500" />
                              Reserve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelected(item)
                                setAdjustType('release')
                                setAdjustMeters('')
                                setAdjustOpen(true)
                              }}
                              disabled={item.reservedMeters <= 0}
                            >
                              <Unlock className="mr-2 h-4 w-4 text-sky-500" />
                              Release
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(item)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

        </TabsContent>

        {/* ─── Tab 2: Reservations ──────────────────────────────────── */}
        <TabsContent value="reservations" className="space-y-4">
          {/* Reservations Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reservations..."
                className="pl-9 bg-background/50"
                value={resSearch}
                onChange={(e) => setResSearch(e.target.value)}
              />
            </div>
            <Select value={resStatusFilter} onValueChange={setResStatusFilter}>
              <SelectTrigger className="w-[170px] bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['All', 'Active', 'Partially Consumed', 'Fully Consumed', 'Released', 'Expired'].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setActiveView('reservations')}
            >
              <Plus className="h-4 w-4" />
              New Reservation
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setActiveView('reservations')}
            >
              <ExternalLink className="h-4 w-4" />
              Open Reservations Module
            </Button>
          </div>

          {/* Reservations Table */}
          <Card className="glass-card overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-xs font-semibold">Reservation #</TableHead>
                    <TableHead className="text-xs font-semibold">Fabric</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Reserved Qty (m)</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">Reference</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Created Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resLoading ? (
                    [...Array(6)].map((_, i) => (
                      <TableRow key={i} className="border-border/30">
                        {[...Array(6)].map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-16" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : reservations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Lock className="h-8 w-8" />
                          <p className="text-sm">No reservations found</p>
                          <p className="text-xs">Create a reservation from the Reservations module</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reservations.map((r) => (
                      <TableRow
                        key={r.id}
                        className="border-border/30 hover:bg-muted/50"
                        onClick={() => setActiveView('reservations')}
                      >
                        <TableCell className="font-mono text-xs font-medium">{r.reservationNo}</TableCell>
                        <TableCell className="font-medium text-sm">{r.fabricStock?.fabricName || '—'}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-sm">{fmt(r.reservedQty)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${statusColor(r.status)}`}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">
                              {r.referenceType === 'SalesOrder' ? 'SO' : 'PJ'}
                            </span>
                            <span className="font-mono text-xs">{r.referenceNo}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {format(new Date(r.reservedDate), 'dd-MMM-yyyy')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

      </Tabs>

      {/* ─── Add Fabric Dialog ───────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="text-primary">Add Fabric Stock</DialogTitle>
            <DialogDescription>Enter the fabric details and initial stock quantity.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Fabric Name *</Label>
              <Input
                placeholder="e.g. Silk Chiffon, Cotton Satin"
                value={form.fabricName}
                onChange={(e) => setForm({ ...form, fabricName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Supplier</Label>
              <Select
                value={form.supplierId}
                onValueChange={(v) => setForm({ ...form, supplierId: v })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select supplier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.supplierType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">GSM</Label>
                <Input
                  type="number"
                  placeholder="e.g. 120"
                  value={form.gsm}
                  onChange={(e) => setForm({ ...form, gsm: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Width (inches)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 58"
                  value={form.width}
                  onChange={(e) => setForm({ ...form, width: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Lot Number</Label>
              <Input
                placeholder="e.g. LOT-2025-001"
                value={form.lotNumber}
                onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Available Meters *</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="0"
                  value={form.availableMeters}
                  onChange={(e) => setForm({ ...form, availableMeters: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Avg Cost/m (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.averageCost}
                  onChange={(e) => setForm({ ...form, averageCost: e.target.value })}
                />
              </div>
            </div>
            {/* Auto-calculated total */}
            {addTotalValue > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Value</span>
                <span className="text-sm font-bold text-primary">{inr(Math.round(addTotalValue))}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAdd}
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Stock Adjustment Dialog ─────────────────────────────────── */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {adjustType === 'add' && 'Add Stock'}
              {adjustType === 'reserve' && 'Reserve Fabric'}
              {adjustType === 'release' && 'Release Reserved Fabric'}
            </DialogTitle>
            <DialogDescription>
              {adjustType === 'add' && `Add meters to "${selected?.fabricName}". Total value will be recalculated.`}
              {adjustType === 'reserve' && `Reserve fabric from "${selected?.fabricName}" available stock.`}
              {adjustType === 'release' && `Release reserved fabric back to available stock.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {/* Current stock info */}
            {selected && (
              <div className="mb-4 rounded-lg bg-muted/50 p-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Available:</span>{' '}
                  <span className="font-semibold text-foreground">{selected.availableMeters.toFixed(1)} m</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Reserved:</span>{' '}
                  <span className="font-semibold text-foreground">{selected.reservedMeters.toFixed(1)} m</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                {adjustType === 'add' && 'Meters to Add'}
                {adjustType === 'reserve' && 'Meters to Reserve'}
                {adjustType === 'release' && 'Meters to Release'}
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                max={adjustType === 'release' && selected ? selected.reservedMeters : undefined}
                placeholder="0"
                value={adjustMeters}
                onChange={(e) => setAdjustMeters(e.target.value)}
              />
              {adjustType === 'reserve' && selected && (
                <p className="text-[11px] text-muted-foreground">
                  Max available: {selected.availableMeters.toFixed(1)} m
                </p>
              )}
              {adjustType === 'release' && selected && (
                <p className="text-[11px] text-muted-foreground">
                  Max reserved: {selected.reservedMeters.toFixed(1)} m
                </p>
              )}
              {adjustType === 'add' && selected && adjustMeters && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 flex items-center justify-between mt-2">
                  <span className="text-[11px] text-muted-foreground">New Total Value</span>
                  <span className="text-xs font-bold text-primary">
                    {inr(Math.round((selected.availableMeters + (parseFloat(adjustMeters) || 0)) * selected.averageCost))}
                  </span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              className={
                adjustType === 'add'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : adjustType === 'reserve'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }
              onClick={handleAdjust}
              disabled={submitting}
            >
              {submitting
                ? 'Processing...'
                : adjustType === 'add'
                ? 'Add Meters'
                : adjustType === 'reserve'
                ? 'Reserve'
                : 'Release'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="text-primary">Edit Fabric Stock</DialogTitle>
            <DialogDescription>Update fabric details. Values will be recalculated.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Fabric Name *</Label>
              <Input
                value={editForm.fabricName}
                onChange={(e) => setEditForm({ ...editForm, fabricName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Supplier</Label>
              <Select
                value={editForm.supplierId}
                onValueChange={(v) => setEditForm({ ...editForm, supplierId: v })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select supplier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.supplierType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">GSM</Label>
                <Input
                  type="number"
                  value={editForm.gsm}
                  onChange={(e) => setEditForm({ ...editForm, gsm: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Width (inches)</Label>
                <Input
                  type="number"
                  value={editForm.width}
                  onChange={(e) => setEditForm({ ...editForm, width: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Lot Number</Label>
              <Input
                value={editForm.lotNumber}
                onChange={(e) => setEditForm({ ...editForm, lotNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Average Cost/m (₹)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.averageCost}
                onChange={(e) => setEditForm({ ...editForm, averageCost: e.target.value })}
              />
              {selected && (
                <p className="text-[11px] text-muted-foreground">
                  Current available: {selected.availableMeters.toFixed(1)} m — total value will be recalculated
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleEdit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}