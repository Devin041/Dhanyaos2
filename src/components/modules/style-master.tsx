'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
  Shirt,
  IndianRupee,
  CheckCircle,
  TrendingUp,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  ShoppingCart,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────
interface StyleItem {
  id: string
  styleNo: string
  collectionName: string | null
  season: string | null
  category: string | null
  fit: string | null
  fabricType: string | null
  embroideryType: string | null
  neckDesign: string | null
  sleeveType: string | null
  brand: string
  status: string
  costPrice: number
  sellPrice: number
  createdAt: string
  updatedAt: string
  orderCount: number
  totalQtyOrdered: number
  totalRevenue: number
  totalProfit: number
}

interface StyleDetail extends StyleItem {
  metrics: {
    orderCount: number
    totalQtyOrdered: number
    totalRevenue: number
    totalProfit: number
  }
  orderHistory: {
    id: string
    orderNo: string
    orderDate: string
    customer: string
    buyerName: string | null
    quantity: number
    unitPrice: number
    totalAmount: number
    profit: number
    orderStatus: string
  }[]
}

interface Summary {
  totalStyles: number
  activeStyles: number
  avgMargin: number
  topCategory: string
  totalRevenue: number
  collectionsCount: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)

const calcMargin = (cost: number, sell: number) =>
  sell > 0 ? Math.round(((sell - cost) / sell) * 1000) / 10 : 0

const marginColor = (m: number) =>
  m >= 50 ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' :
  m >= 30 ? 'text-amber-600 bg-amber-500/10 border-amber-500/20' :
  'text-red-600 bg-red-500/10 border-red-500/20'

const marginTextColor = (m: number) =>
  m >= 50 ? 'text-emerald-600' :
  m >= 30 ? 'text-amber-600' :
  'text-red-600'

const categoryColors: Record<string, string> = {
  'Anarkali Kurti': 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  'Straight Kurti': 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  'A-Line Kurti': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'Floor Length Kurti': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'Shirt Kurti': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'Maxi Dress': 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  'Kurta Set': 'bg-teal-500/10 text-teal-600 border-teal-500/20',
}

const seasonColors: Record<string, string> = {
  Winter: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  Festive: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  Summer: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'All Season': 'bg-muted text-muted-foreground border-border',
}

const getCategoryColor = (cat: string | null) =>
  cat ? (categoryColors[cat] || 'bg-muted text-muted-foreground border-border') : ''

const getSeasonColor = (season: string | null) =>
  season ? (seasonColors[season] || 'bg-muted text-muted-foreground border-border') : ''

const SEASONS = ['Winter 2024', 'Festive 2024', 'Summer 2025', 'All Season']
const CATEGORIES = [
  'Anarkali Kurti',
  'Straight Kurti',
  'A-Line Kurti',
  'Floor Length Kurti',
  'Shirt Kurti',
  'Maxi Dress',
  'Kurta Set',
  'Dupatta',
  'Other',
]
const FITS = ['Regular', 'Slim', 'A-Line', 'Loose', 'Flared']
const FABRICS = [
  'Rayon',
  'Cotton',
  'Silk Blend',
  'Georgette',
  'Cotton Silk',
  'Chanderi',
  'Linen',
  'Other',
]
const EMBROIDERIES = [
  'None',
  'Chikankari',
  'Zardozi',
  'Thread Work',
  'Block Print',
  'Mirror Work',
  'Aari Work',
  'Machine',
  'Other',
]
const NECKS = [
  'Round',
  'Mandarin',
  'V-Neck',
  'Boat',
  'Square',
  'Sweetheart',
  'Keyhole',
]
const SLEEVES = [
  'Full',
  '3-4',
  'Short',
  'Flared',
  'Bell',
  'Puff',
  'Cap Sleeve',
  'Sleeveless',
]

const emptyForm = {
  styleNo: '',
  collectionName: '',
  season: '',
  category: '',
  fit: '',
  fabricType: '',
  embroideryType: '',
  neckDesign: '',
  sleeveType: '',
  costPrice: '',
  sellPrice: '',
}

// ─── Component ─────────────────────────────────────────────────────────────
export function StyleMaster() {
  const [styles, setStyles] = useState<StyleItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [seasonCounts, setSeasonCounts] = useState<Record<string, number>>({})
  const [collectionCounts, setCollectionCounts] = useState<Record<string, number>>({})
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [seasonFilter, setSeasonFilter] = useState('All')
  const [collectionFilter, setCollectionFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [page, setPage] = useState(1)
  const [limit] = useState(50)

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState<StyleDetail | null>(null)

  // Forms
  const [form, setForm] = useState({ ...emptyForm })
  const [editForm, setEditForm] = useState({ ...emptyForm })
  const [editId, setEditId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ─── Fetch list ─────────────────────────────────────────────────────
  const fetchStyles = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (categoryFilter !== 'All') params.set('category', categoryFilter)
      if (seasonFilter !== 'All') params.set('season', seasonFilter)
      if (collectionFilter !== 'All') params.set('collection', collectionFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/styles?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setStyles(data.styles || [])
        setTotal(data.total || 0)
        setSummary(data.summary || null)
        setCategoryCounts(data.categoryCounts || {})
        setSeasonCounts(data.seasonCounts || {})
        setCollectionCounts(data.collectionCounts || {})
        setStatusCounts(data.statusCounts || {})
      }
    } catch {
      toast.error('Failed to load styles')
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, seasonFilter, collectionFilter, statusFilter, page, limit])

  useEffect(() => {
    fetchStyles()
  }, [fetchStyles])

  // ─── Fetch detail ───────────────────────────────────────────────────
  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetailOpen(true)
    setDetailData(null)
    try {
      const res = await fetch(`/api/styles/${id}`)
      if (res.ok) {
        setDetailData(await res.json())
      } else {
        toast.error('Failed to load style details')
        setDetailOpen(false)
      }
    } catch {
      toast.error('Failed to load style details')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── Create style ───────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.styleNo || !form.costPrice || !form.sellPrice) {
      toast.error('Style No, Cost Price, and Sell Price are required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleNo: form.styleNo,
          collectionName: form.collectionName || null,
          season: form.season || null,
          category: form.category || null,
          fit: form.fit || null,
          fabricType: form.fabricType || null,
          embroideryType: form.embroideryType || null,
          neckDesign: form.neckDesign || null,
          sleeveType: form.sleeveType || null,
          costPrice: parseFloat(form.costPrice),
          sellPrice: parseFloat(form.sellPrice),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create style')
      }
      toast.success(`Style ${form.styleNo} created successfully`)
      setCreateOpen(false)
      setForm({ ...emptyForm })
      fetchStyles()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create style')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Edit style ─────────────────────────────────────────────────────
  const openEdit = (style: StyleItem) => {
    setEditId(style.id)
    setEditForm({
      styleNo: style.styleNo,
      collectionName: style.collectionName || '',
      season: style.season || '',
      category: style.category || '',
      fit: style.fit || '',
      fabricType: style.fabricType || '',
      embroideryType: style.embroideryType || '',
      neckDesign: style.neckDesign || '',
      sleeveType: style.sleeveType || '',
      costPrice: String(style.costPrice),
      sellPrice: String(style.sellPrice),
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/styles/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName: editForm.collectionName || null,
          season: editForm.season || null,
          category: editForm.category || null,
          fit: editForm.fit || null,
          fabricType: editForm.fabricType || null,
          embroideryType: editForm.embroideryType || null,
          neckDesign: editForm.neckDesign || null,
          sleeveType: editForm.sleeveType || null,
          costPrice: parseFloat(editForm.costPrice),
          sellPrice: parseFloat(editForm.sellPrice),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update style')
      }
      toast.success('Style updated successfully')
      setEditOpen(false)
      setEditId(null)
      fetchStyles()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update style')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete style (soft) ────────────────────────────────────────────
  const handleDelete = async (style: StyleItem) => {
    if (!confirm(`Deactivate style "${style.styleNo}"? This is a soft delete.`)) return
    try {
      const res = await fetch(`/api/styles/${style.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete style')
      }
      toast.success(`Style ${style.styleNo} deactivated`)
      fetchStyles()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete style')
    }
  }

  // ─── Toggle status from detail ──────────────────────────────────────
  const handleToggleStatus = async () => {
    if (!detailData) return
    const newStatus = detailData.status === 'Active' ? 'Inactive' : 'Active'
    try {
      const res = await fetch(`/api/styles/${detailData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        toast.success(`Style marked as ${newStatus}`)
        setDetailData({ ...detailData, status: newStatus })
        fetchStyles()
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ─── Auto-calculated margin for forms ───────────────────────────────
  const createMargin = calcMargin(
    parseFloat(form.costPrice) || 0,
    parseFloat(form.sellPrice) || 0
  )
  const editMargin = calcMargin(
    parseFloat(editForm.costPrice) || 0,
    parseFloat(editForm.sellPrice) || 0
  )

  // ─── Pagination ─────────────────────────────────────────────────────
  const totalPages = Math.ceil(total / limit)
  const canPrev = page > 1
  const canNext = page < totalPages

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shirt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Style Master</h1>
            <p className="text-xs text-muted-foreground">Product Catalog — Elysé by Dhanya</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="styles" />
          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New Style
          </Button>
        </div>
      </div>

      {/* ─── Summary KPI Cards ──────────────────────────────────────── */}
      {summary && !loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="glass-card border-l-4 border-l-primary">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Shirt className="h-3.5 w-3.5" />
                Total Styles
              </div>
              <p className="text-lg font-bold text-primary tabular-nums">{summary.totalStyles}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <CheckCircle className="h-3.5 w-3.5" />
                Active Styles
              </div>
              <p className="text-lg font-bold text-emerald-600 tabular-nums">{summary.activeStyles}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Avg Margin
              </div>
              <p className={`text-lg font-bold tabular-nums ${marginTextColor(summary.avgMargin)}`}>
                {summary.avgMargin}%
              </p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-sky-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <IndianRupee className="h-3.5 w-3.5" />
                Total Revenue
              </div>
              <p className="text-lg font-bold text-sky-600 tabular-nums">{formatINR(summary.totalRevenue)}</p>
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

      {/* ─── Category Quick Stats ───────────────────────────────────── */}
      {!loading && Object.keys(categoryCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <Badge
                key={cat}
                variant="outline"
                className={`${getCategoryColor(cat)} text-[11px] cursor-pointer transition-all hover:scale-105`}
                onClick={() =>
                  setCategoryFilter((prev) => (prev === cat ? 'All' : cat))
                }
              >
                {cat} ×{count}
              </Badge>
            ))}
        </div>
      )}

      {/* ─── Filter Bar ─────────────────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search style, collection, category, fabric..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-background/50"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Category Dropdown */}
              <Select
                value={categoryFilter}
                onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-background/50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Categories</SelectItem>
                  {Object.keys(categoryCounts).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Season Dropdown */}
              <Select
                value={seasonFilter}
                onValueChange={(v) => { setSeasonFilter(v); setPage(1) }}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs bg-background/50">
                  <SelectValue placeholder="Season" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Seasons</SelectItem>
                  {Object.keys(seasonCounts).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Collection Dropdown */}
              <Select
                value={collectionFilter}
                onValueChange={(v) => { setCollectionFilter(v); setPage(1) }}
              >
                <SelectTrigger className="w-[150px] h-8 text-xs bg-background/50">
                  <SelectValue placeholder="Collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Collections</SelectItem>
                  {Object.keys(collectionCounts).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Status Tabs */}
              <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
                {(['All', 'Active', 'Inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setPage(1) }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s}
                    {s !== 'All' && statusCounts[s] !== undefined && (
                      <span className="ml-1 text-[10px] text-muted-foreground">({statusCounts[s]})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Style Cards Grid ───────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-32 mb-2" />
                <Skeleton className="h-3 w-20 mb-4" />
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[...Array(4)].map((_, j) => (
                    <Skeleton key={j} className="h-3 w-full" />
                  ))}
                </div>
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-4 w-20 mb-4" />
                <div className="flex gap-4">
                  {[...Array(3)].map((_, j) => (
                    <Skeleton key={j} className="h-3 w-12" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : styles.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Shirt className="h-10 w-10" />
            <p className="text-sm font-medium">No styles found</p>
            <p className="text-xs">Create your first style to build the product catalog</p>
            <Button
              variant="outline"
              className="mt-2 gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New Style
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {styles.map((style) => {
            const margin = calcMargin(style.costPrice, style.sellPrice)
            return (
              <Card
                key={style.id}
                className="glass-card relative group cursor-pointer transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => openDetail(style.id)}
              >
                <CardContent className="p-5">
                  {/* Top: Style No + Status */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-base font-bold text-primary tracking-tight">
                      {style.styleNo}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold px-2 py-0.5 ${
                        style.status === 'Active'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      {style.status}
                    </Badge>
                  </div>

                  {/* Collection + Season */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {style.collectionName && (
                      <span className="text-xs font-medium text-foreground/80">
                        {style.collectionName}
                      </span>
                    )}
                    {style.season && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${getSeasonColor(style.season)}`}
                      >
                        {style.season}
                      </Badge>
                    )}
                  </div>

                  {/* Category Badge */}
                  {style.category && (
                    <div className="mb-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 ${getCategoryColor(style.category)}`}
                      >
                        {style.category}
                      </Badge>
                    </div>
                  )}

                  {/* Spec Grid */}
                  {(style.fit || style.fabricType || style.embroideryType || style.neckDesign) && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
                      {style.fit && (
                        <div className="text-[11px]">
                          <span className="text-muted-foreground">Fit: </span>
                          <span className="text-foreground/80 font-medium">{style.fit}</span>
                        </div>
                      )}
                      {style.fabricType && (
                        <div className="text-[11px]">
                          <span className="text-muted-foreground">Fabric: </span>
                          <span className="text-foreground/80 font-medium">{style.fabricType}</span>
                        </div>
                      )}
                      {style.embroideryType && style.embroideryType !== 'None' && (
                        <div className="text-[11px]">
                          <span className="text-muted-foreground">Embroidery: </span>
                          <span className="text-foreground/80 font-medium">{style.embroideryType}</span>
                        </div>
                      )}
                      {style.neckDesign && (
                        <div className="text-[11px]">
                          <span className="text-muted-foreground">Neck: </span>
                          <span className="text-foreground/80 font-medium">{style.neckDesign}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sleeve */}
                  {style.sleeveType && (
                    <p className="text-[11px] text-muted-foreground mb-3">
                      Sleeve: <span className="text-foreground/80 font-medium">{style.sleeveType}</span>
                    </p>
                  )}

                  {/* Pricing */}
                  <div className="flex items-end justify-between mb-3 border-t border-border/40 pt-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Cost</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{formatINR(style.costPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Sell</p>
                      <p className="text-base font-bold text-primary tabular-nums">{formatINR(style.sellPrice)}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-semibold px-2 py-0.5 ${marginColor(margin)}`}
                    >
                      {margin}%
                    </Badge>
                  </div>

                  {/* Bottom Metrics */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/30 pt-2">
                    <div className="flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      <span className="tabular-nums">{style.orderCount}</span>
                      <span>orders</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      <span className="tabular-nums">{style.totalQtyOrdered}</span>
                      <span>pcs</span>
                    </div>
                    <div className="flex items-center gap-1 font-medium text-foreground/70">
                      <IndianRupee className="h-3 w-3" />
                      <span className="tabular-nums">{formatINR(style.totalRevenue)}</span>
                    </div>
                  </div>


                </CardContent>

                {/* Hover action button overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(style.id) }}>
                        <Eye className="mr-2 h-4 w-4 text-primary" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(style) }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); handleDelete(style) }}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Deactivate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Pagination ─────────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} styles
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!canPrev}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              if (pageNum > totalPages) return null
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? 'default' : 'outline'}
                  size="icon"
                  className="h-8 w-8 text-xs"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE STYLE DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg glass-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">New Style</DialogTitle>
            <DialogDescription>Add a new style to the product catalog.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Style No */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Style No *</Label>
              <div className="relative">
                <Input
                  placeholder="e.g. ELY-001"
                  value={form.styleNo}
                  onChange={(e) => setForm({ ...form, styleNo: e.target.value })}
                  className="bg-background/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  Hint: ELY- prefix
                </span>
              </div>
            </div>

            {/* Collection + Season */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Collection Name</Label>
                <Input
                  placeholder="e.g. Royal Heritage"
                  value={form.collectionName}
                  onChange={(e) => setForm({ ...form, collectionName: e.target.value })}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Season</Label>
                <Select
                  value={form.season}
                  onValueChange={(v) => setForm({ ...form, season: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select season" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEASONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category + Fit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Fit</Label>
                <Select
                  value={form.fit}
                  onValueChange={(v) => setForm({ ...form, fit: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select fit" />
                  </SelectTrigger>
                  <SelectContent>
                    {FITS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fabric + Embroidery */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Fabric Type</Label>
                <Select
                  value={form.fabricType}
                  onValueChange={(v) => setForm({ ...form, fabricType: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select fabric" />
                  </SelectTrigger>
                  <SelectContent>
                    {FABRICS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Embroidery Type</Label>
                <Select
                  value={form.embroideryType}
                  onValueChange={(v) => setForm({ ...form, embroideryType: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMBROIDERIES.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Neck + Sleeve */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Neck Design</Label>
                <Select
                  value={form.neckDesign}
                  onValueChange={(v) => setForm({ ...form, neckDesign: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select neck" />
                  </SelectTrigger>
                  <SelectContent>
                    {NECKS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Sleeve Type</Label>
                <Select
                  value={form.sleeveType}
                  onValueChange={(v) => setForm({ ...form, sleeveType: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select sleeve" />
                  </SelectTrigger>
                  <SelectContent>
                    {SLEEVES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Cost Price (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  className="bg-background/50 tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Sell Price (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.sellPrice}
                  onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
                  className="bg-background/50 tabular-nums"
                />
              </div>
            </div>

            {/* Auto-calculated margin */}
            {(parseFloat(form.costPrice) > 0 || parseFloat(form.sellPrice) > 0) && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Margin</span>
                <Badge
                  variant="outline"
                  className={`text-sm font-bold px-3 py-1 ${marginColor(createMargin)}`}
                >
                  {createMargin}%
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Style'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          EDIT STYLE DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg glass-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">Edit Style — {editForm.styleNo}</DialogTitle>
            <DialogDescription>Update style specifications and pricing.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Collection + Season */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Collection Name</Label>
                <Input
                  value={editForm.collectionName}
                  onChange={(e) => setEditForm({ ...editForm, collectionName: e.target.value })}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Season</Label>
                <Select
                  value={editForm.season}
                  onValueChange={(v) => setEditForm({ ...editForm, season: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select season" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {SEASONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category + Fit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Category</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(v) => setEditForm({ ...editForm, category: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Fit</Label>
                <Select
                  value={editForm.fit}
                  onValueChange={(v) => setEditForm({ ...editForm, fit: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select fit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {FITS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fabric + Embroidery */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Fabric Type</Label>
                <Select
                  value={editForm.fabricType}
                  onValueChange={(v) => setEditForm({ ...editForm, fabricType: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select fabric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {FABRICS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Embroidery Type</Label>
                <Select
                  value={editForm.embroideryType}
                  onValueChange={(v) => setEditForm({ ...editForm, embroideryType: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {EMBROIDERIES.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Neck + Sleeve */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Neck Design</Label>
                <Select
                  value={editForm.neckDesign}
                  onValueChange={(v) => setEditForm({ ...editForm, neckDesign: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select neck" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {NECKS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Sleeve Type</Label>
                <Select
                  value={editForm.sleeveType}
                  onValueChange={(v) => setEditForm({ ...editForm, sleeveType: v })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select sleeve" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {SLEEVES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Cost Price (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.costPrice}
                  onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })}
                  className="bg-background/50 tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Sell Price (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.sellPrice}
                  onChange={(e) => setEditForm({ ...editForm, sellPrice: e.target.value })}
                  className="bg-background/50 tabular-nums"
                />
              </div>
            </div>

            {/* Margin */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Margin</span>
              <Badge
                variant="outline"
                className={`text-sm font-bold px-3 py-1 ${marginColor(editMargin)}`}
              >
                {editMargin}%
              </Badge>
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

      {/* ═══════════════════════════════════════════════════════════════════
          STYLE DETAIL DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl glass-card border-border/50 max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="py-8 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            </div>
          ) : detailData ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-primary text-lg">{detailData.styleNo}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {detailData.collectionName || 'No collection'}{' '}
                      {detailData.season && `· ${detailData.season}`}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs font-semibold px-2.5 py-1 ${
                        detailData.status === 'Active'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      {detailData.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); openEdit(detailData as StyleItem) }}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Category', value: detailData.category },
                    { label: 'Fit', value: detailData.fit },
                    { label: 'Fabric', value: detailData.fabricType },
                    { label: 'Embroidery', value: detailData.embroideryType },
                    { label: 'Neck', value: detailData.neckDesign },
                    { label: 'Sleeve', value: detailData.sleeveType },
                  ].map((spec) => (
                    <div key={spec.label} className="rounded-lg bg-muted/50 border border-border/40 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{spec.label}</p>
                      <p className="text-xs font-medium text-foreground mt-0.5">{spec.value || '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Pricing Card */}
                <div className="rounded-lg border border-border/50 p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pricing</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Cost Price</p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">{formatINR(detailData.costPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Sell Price</p>
                      <p className="text-sm font-bold text-primary tabular-nums">{formatINR(detailData.sellPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Margin %</p>
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold mt-0.5 ${marginColor(calcMargin(detailData.costPrice, detailData.sellPrice))}`}
                      >
                        {calcMargin(detailData.costPrice, detailData.sellPrice)}%
                      </Badge>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Profit/Piece</p>
                      <p className={`text-sm font-semibold tabular-nums ${marginTextColor(calcMargin(detailData.costPrice, detailData.sellPrice))}`}>
                        {formatINR(detailData.sellPrice - detailData.costPrice)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Card className="glass-card">
                    <CardContent className="p-3 text-center">
                      <ShoppingCart className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                      <p className="text-lg font-bold tabular-nums">{detailData.metrics.orderCount}</p>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardContent className="p-3 text-center">
                      <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                      <p className="text-lg font-bold tabular-nums">{detailData.metrics.totalQtyOrdered}</p>
                      <p className="text-[10px] text-muted-foreground">Total Pcs</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardContent className="p-3 text-center">
                      <IndianRupee className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                      <p className="text-lg font-bold text-primary tabular-nums">{formatINR(detailData.metrics.totalRevenue)}</p>
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardContent className="p-3 text-center">
                      <TrendingUp className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                      <p className={`text-lg font-bold tabular-nums ${detailData.metrics.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatINR(detailData.metrics.totalProfit)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Profit</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Order History Table */}
                {detailData.orderHistory.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Order History ({detailData.orderHistory.length})
                    </h4>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border/50">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/50">
                            <TableHead className="text-[11px] font-semibold">Order No</TableHead>
                            <TableHead className="text-[11px] font-semibold hidden sm:table-cell">Customer</TableHead>
                            <TableHead className="text-[11px] font-semibold hidden md:table-cell">Date</TableHead>
                            <TableHead className="text-[11px] font-semibold text-right">Qty</TableHead>
                            <TableHead className="text-[11px] font-semibold text-right">Amount</TableHead>
                            <TableHead className="text-[11px] font-semibold text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailData.orderHistory.map((order) => (
                            <TableRow key={order.id} className="border-border/30">
                              <TableCell className="text-xs font-medium font-mono">{order.orderNo}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                                {order.customer}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden md:table-cell tabular-nums">
                                {new Date(order.orderDate).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{order.quantity}</TableCell>
                              <TableCell className="text-xs text-right font-medium tabular-nums text-primary">
                                {formatINR(order.totalAmount)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${
                                    order.orderStatus === 'Delivered'
                                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                      : order.orderStatus === 'Cancelled'
                                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                      : order.orderStatus === 'Shipped'
                                      ? 'bg-sky-500/10 text-sky-600 border-sky-500/20'
                                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                  }`}
                                >
                                  {order.orderStatus}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {detailData.orderHistory.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <ShoppingCart className="h-6 w-6 mx-auto mb-2" />
                    <p className="text-xs">No orders yet for this style</p>
                  </div>
                )}

                {/* Toggle Status Button */}
                <DialogFooter className="pt-2 border-t border-border/30">
                  <Button
                    variant={detailData.status === 'Active' ? 'destructive' : 'default'}
                    size="sm"
                    className="gap-1.5"
                    onClick={handleToggleStatus}
                  >
                    {detailData.status === 'Active' ? (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        Deactivate Style
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Activate Style
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}