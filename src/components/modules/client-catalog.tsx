'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search,
  Grid3X3,
  List,
  Camera,
  Calculator,
  Eye,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  PackageOpen,
  FileText,
  IndianRupee,
  X,
  LayoutGrid,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDashboardStore } from '@/store/dashboard-store'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function statusColor(status: string): string {
  switch (status) {
    case 'Approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'Submitted':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    case 'In Progress':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
    case 'Rejected':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
    case 'Revised':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function costingStatusColor(status: string): string {
  switch (status) {
    case 'Approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'Active':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'Draft':
      return 'bg-muted text-muted-foreground'
    case 'Archived':
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SampleWithCosting {
  id: string
  sampleNo: string
  styleNo: string
  styleName: string
  status: string
  stage: string
  customer: { id: string; companyName: string } | null
  photoCount: number
  firstPhotoUrl: string | null
  costSheet: {
    id: string
    sheetNo: string
    totalCost: number
    sellingPrice: number
    status: string
  } | null
}

interface SamplePhoto {
  id: string
  imageUrl: string
  caption: string
  sortOrder: number
}

interface Customer {
  id: string
  companyName: string
}

interface CostSheetItem {
  id: string
  sheetNo: string
  styleNo: string
  styleName: string
  customerId: string | null
  customer: { id: string; companyName: string } | null
  totalCost: number
  sellingPrice: number
  profitPercent: number
  status: string
  createdAt: string
}

// ─── Main Module ──────────────────────────────────────────────────────────────

export function ClientCatalogModule() {
  // ── Design Library State ──
  const [samples, setSamples] = useState<SampleWithCosting[]>([])
  const [samplesLoading, setSamplesLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // ── Costing History State ──
  const [costSheets, setCostSheets] = useState<CostSheetItem[]>([])
  const [costSheetsLoading, setCostSheetsLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<CostSheetItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Navigation to Costing Module ──
  const { navigateToCosting } = useDashboardStore()

  const [customers, setCustomers] = useState<Customer[]>([])

  // ── Photo Viewer State ──
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [viewingPhotos, setViewingPhotos] = useState<SamplePhoto[]>([])
  const [viewingIndex, setViewingIndex] = useState(0)
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photoSampleName, setPhotoSampleName] = useState('')

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState('library')

  // ── Data Fetching ──

  const fetchSamplesWithCosting = useCallback(async () => {
    setSamplesLoading(true)
    try {
      const res = await fetch('/api/samples-with-costing')
      if (res.ok) {
        const data = await res.json()
        setSamples(Array.isArray(data) ? data : data.samples || [])
      } else {
        toast.error('Failed to load design library')
      }
    } catch {
      toast.error('Failed to load design library')
    } finally {
      setSamplesLoading(false)
    }
  }, [])

  const fetchCostSheets = useCallback(async () => {
    setCostSheetsLoading(true)
    try {
      const res = await fetch('/api/cost-sheets')
      if (res.ok) {
        const data = await res.json()
        const sheets = Array.isArray(data) ? data : data.costSheets || []
        setCostSheets(sheets.map((cs: Record<string, unknown>) => ({
          id: cs.id,
          sheetNo: cs.sheetNo,
          styleNo: cs.styleNo,
          styleName: cs.styleName,
          customerId: cs.customerId,
          customer: cs.customer || null,
          totalCost: cs.totalCost ?? 0,
          sellingPrice: cs.sellingPrice ?? 0,
          profitPercent: cs.profitPercent ?? 30,
          status: cs.status ?? 'Draft',
          createdAt: cs.createdAt,
        })))
      }
    } catch {
      toast.error('Failed to load costing history')
    } finally {
      setCostSheetsLoading(false)
    }
  }, [])

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(Array.isArray(data) ? data : [])
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchSamplesWithCosting()
    fetchCostSheets()
    fetchCustomers()
  }, [fetchSamplesWithCosting, fetchCostSheets, fetchCustomers])

  // ── Filtered Samples ──

  const filteredSamples = useMemo(() => {
    if (!searchQuery.trim()) return samples
    const q = searchQuery.toLowerCase()
    return samples.filter(
      (s) =>
        s.styleNo.toLowerCase().includes(q) ||
        s.styleName.toLowerCase().includes(q)
    )
  }, [samples, searchQuery])

  // ── Navigate to Costing Module with pre-fill data ──
  const openCreateCosting = (sample: SampleWithCosting) => {
    navigateToCosting({
      styleNo: sample.styleNo,
      styleName: sample.styleName,
      image: sample.firstPhotoUrl || null,
    })
  }

  // ── Delete Cost Sheet ──

  const handleDeleteCostSheet = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/cost-sheets/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Cost sheet deleted')
        setDeleteTarget(null)
        fetchCostSheets()
        fetchSamplesWithCosting()
      } else {
        toast.error('Failed to delete cost sheet')
      }
    } catch {
      toast.error('Failed to delete cost sheet')
    } finally {
      setDeleting(false)
    }
  }

  // ── Photo Viewer ──

  const openPhotoViewer = async (sample: SampleWithCosting) => {
    setPhotoSampleName(`${sample.styleNo} — ${sample.styleName}`)
    setPhotosLoading(true)
    setShowPhotoViewer(true)
    setViewingIndex(0)
    try {
      const res = await fetch(`/api/samples/${sample.id}/photos`)
      if (res.ok) {
        const photos = await res.json()
        setViewingPhotos(Array.isArray(photos) ? photos : [])
      } else {
        // Fallback: fetch full sample which includes photos
        const sampleRes = await fetch(`/api/samples/${sample.id}`)
        if (sampleRes.ok) {
          const sampleData = await sampleRes.json()
          setViewingPhotos(sampleData.photos || [])
        }
      }
    } catch {
      toast.error('Failed to load photos')
    } finally {
      setPhotosLoading(false)
    }
  }

  const navigatePhoto = (direction: 'prev' | 'next') => {
    if (viewingPhotos.length === 0) return
    if (direction === 'prev') {
      setViewingIndex((prev) => (prev === 0 ? viewingPhotos.length - 1 : prev - 1))
    } else {
      setViewingIndex((prev) => (prev === viewingPhotos.length - 1 ? 0 : prev + 1))
    }
  }

  // ── Sample Photo Grid (first photo preview) ──

  const renderSamplePhoto = (sample: SampleWithCosting, className: string) => {
    if (sample.firstPhotoUrl) {
      return (
        <div className={className}>
          <img
            src={sample.firstPhotoUrl}
            alt={sample.styleName}
            className="h-full w-full object-cover"
          />
        </div>
      )
    }
    return (
      <div className={`${className} flex items-center justify-center bg-muted/50`}>
        <ImageOff className="h-8 w-8 text-muted-foreground/40" />
      </div>
    )
  }

  // ── Design Library Grid Card ──

  const renderGridCard = (sample: SampleWithCosting) => (
    <Card key={sample.id} className="glass-card overflow-hidden group transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden">
        {renderSamplePhoto(sample, 'h-full w-full')}
        {/* Photo count badge */}
        {sample.photoCount > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            <Camera className="h-3 w-3" />
            {sample.photoCount}
          </div>
        )}
        {/* Costing badge */}
        {sample.costSheet && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Calculator className="h-3 w-3" />
            Costing Done
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className="shrink-0 border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs font-semibold"
              >
                {sample.styleNo}
              </Badge>
              <Badge variant="outline" className={`shrink-0 text-xs ${statusColor(sample.status)}`}>
                {sample.status}
              </Badge>
            </div>
            <h3 className="truncate text-sm font-semibold text-foreground">
              {sample.styleName}
            </h3>
            {sample.customer && (
              <p className="truncate text-xs text-muted-foreground mt-0.5">{sample.customer.companyName}</p>
            )}
          </div>
        </div>

        {/* Costing info */}
        {sample.costSheet && (
          <div className="mt-3 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Sheet: {sample.costSheet.sheetNo}</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatINR(sample.costSheet.totalCost)}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!sample.costSheet && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => openCreateCosting(sample)}
            >
              <Calculator className="h-3.5 w-3.5" />
              Create Costing
            </Button>
          )}
          {sample.costSheet && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setActiveTab('history')
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              View Costing
            </Button>
          )}
          {sample.photoCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              onClick={() => openPhotoViewer(sample)}
            >
              <Camera className="h-3.5 w-3.5" />
              Photos
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )

  // ── Design Library List Row ──

  const renderListRow = (sample: SampleWithCosting) => (
    <Card key={sample.id} className="glass-card overflow-hidden mb-2">
      <div className="flex items-center gap-4 p-3">
        {/* Thumbnail */}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
          {renderSamplePhoto(sample, 'h-full w-full')}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs font-semibold"
            >
              {sample.styleNo}
            </Badge>
            <h3 className="truncate text-sm font-semibold text-foreground">
              {sample.styleName}
            </h3>
            <Badge variant="outline" className={`text-xs ${statusColor(sample.status)}`}>
              {sample.status}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {sample.customer && <span>{sample.customer.companyName}</span>}
            <span className="flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {sample.photoCount} photo{sample.photoCount !== 1 ? 's' : ''}
            </span>
            {sample.costSheet && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Calculator className="h-3 w-3" />
                {sample.costSheet.sheetNo} — {formatINR(sample.costSheet.totalCost)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1.5">
          {!sample.costSheet && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => openCreateCosting(sample)}
            >
              <Calculator className="h-3.5 w-3.5" />
              Create Costing
            </Button>
          )}
          {sample.costSheet && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setActiveTab('history')}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>
          )}
          {sample.photoCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              onClick={() => openPhotoViewer(sample)}
            >
              <Camera className="h-3.5 w-3.5" />
              Photos
            </Button>
          )}
        </div>
      </div>
    </Card>
  )

  // ── Skeleton Loaders ──

  const renderGridSkeleton = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="glass-card overflow-hidden">
          <Skeleton className="aspect-[4/3] w-full" />
          <CardContent className="p-4">
            <div className="flex gap-2 mb-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-3/4 mb-1" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  )

  const renderListSkeleton = () =>
    Array.from({ length: 5 }).map((_, i) => (
      <Card key={i} className="glass-card overflow-hidden mb-2">
        <div className="flex items-center gap-4 p-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2 mb-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
      </Card>
    ))

  const renderCostingTableSkeleton = () =>
    Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      </TableRow>
    ))

  // ── Empty States ──

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-muted/60 p-6">
        <PackageOpen className="h-12 w-12 text-muted-foreground/40" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No samples yet</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Add samples in Sample Catalog to see them here. All your designs will
        appear automatically in this Design Library.
      </p>
    </div>
  )

  // ── Render ──

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* ─── Tab 1: Design Library ─── */}
        <TabsContent value="library" className="space-y-4">
          {/* Header bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Design Library
              </h2>
              {!samplesLoading && (
                <Badge variant="secondary" className="text-xs font-medium">
                  {filteredSamples.length} design{filteredSamples.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search styles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-48 pl-8 sm:w-64"
                />
              </div>

              {/* View toggle */}
              <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          {samplesLoading ? (
            viewMode === 'grid' ? renderGridSkeleton() : renderListSkeleton()
          ) : filteredSamples.length === 0 ? (
            searchQuery ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 rounded-full bg-muted/60 p-6">
                  <Search className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  No results found
                </h3>
                <p className="text-sm text-muted-foreground">
                  No designs match &quot;{searchQuery}&quot;. Try a different search.
                </p>
              </div>
            ) : (
              renderEmptyState()
            )
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSamples.map(renderGridCard)}
            </div>
          ) : (
            <div>{filteredSamples.map(renderListRow)}</div>
          )}
        </TabsContent>

        {/* ─── Tab 2: Costing History ─── */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Costing History
            </h2>
            {!costSheetsLoading && costSheets.length > 0 && (
              <Badge variant="secondary" className="text-xs font-medium">
                {costSheets.length} sheet{costSheets.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {costSheetsLoading ? (
            <Card className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Sheet No</TableHead>
                    <TableHead className="w-28">Style No</TableHead>
                    <TableHead>Style Name</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Selling</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{renderCostingTableSkeleton()}</TableBody>
              </Table>
            </Card>
          ) : costSheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-muted/60 p-6">
                <FileText className="h-12 w-12 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                No cost sheets yet
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create costings from the Design Library tab. They will appear here
                for reference and management.
              </p>
            </div>
          ) : (
            <Card className="glass-card overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">Sheet No</TableHead>
                      <TableHead className="w-28">Style No</TableHead>
                      <TableHead>Style Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Selling</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costSheets.map((cs) => (
                      <TableRow key={cs.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          {cs.sheetNo}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs font-semibold"
                          >
                            {cs.styleNo}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {cs.styleName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cs.customer?.companyName || '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatINR(cs.totalCost)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatINR(cs.sellingPrice)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${costingStatusColor(cs.status)}`}
                          >
                            {cs.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="View details"
                              onClick={() => setActiveTab('library')}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              title="Delete"
                              onClick={() => setDeleteTarget(cs)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab Navigation ─── */}
        <div className="flex justify-center">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="library" className="gap-2 text-sm">
              <LayoutGrid className="h-4 w-4" />
              Design Library
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 text-sm">
              <FileText className="h-4 w-4" />
              Costing History
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Photo Viewer Dialog                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={showPhotoViewer} onOpenChange={setShowPhotoViewer}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo Viewer — {photoSampleName}</DialogTitle>
          </DialogHeader>

          {photosLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewingPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageOff className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No photos available</p>
            </div>
          ) : (
            <>
              {/* Photo container */}
              <div className="relative bg-black/5 dark:bg-black/20 flex items-center justify-center min-h-[300px] max-h-[65vh]">
                {/* Close button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                  onClick={() => setShowPhotoViewer(false)}
                >
                  <X className="h-4 w-4" />
                </Button>

                {/* Prev button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute left-3 z-10 h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                  onClick={() => navigatePhoto('prev')}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                {/* Photo */}
                <img
                  src={viewingPhotos[viewingIndex]?.imageUrl}
                  alt={viewingPhotos[viewingIndex]?.caption || `Photo ${viewingIndex + 1}`}
                  className="max-h-[65vh] max-w-full object-contain"
                />

                {/* Next button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-3 z-10 h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                  onClick={() => navigatePhoto('next')}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {/* Photo footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground truncate flex-1">
                  {viewingPhotos[viewingIndex]?.caption || `Photo ${viewingIndex + 1}`}
                </p>
                <p className="text-xs text-muted-foreground shrink-0 ml-3">
                  {viewingIndex + 1} / {viewingPhotos.length}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation Dialog                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Sheet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete cost sheet{' '}
              <span className="font-semibold">{deleteTarget?.sheetNo}</span> for{' '}
              <span className="font-semibold">{deleteTarget?.styleName}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeleteCostSheet}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
