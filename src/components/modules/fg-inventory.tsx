'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  PackageSearch,
  Package,
  Layers,
  IndianRupee,
  TrendingUp,
  CheckCircle2,
  AlertOctagon,
  Unplug,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  FileText,
  Shirt,
  Eye,
  Trash2,
  X,
  MoveRight,
  Warehouse,
  BarChart3,
  Store,
  Gift,
  Truck,
} from 'lucide-react'
import { FGStyleDetail } from './fg-style-detail'
import { FGReports } from './fg-reports'
import { FGExhibitionModule } from './fg-exhibition'
import { FGPromotionalModule } from './fg-promotional'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────

interface FGStockBin {
  id: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  image: string | null
  availableQty: number
  reservedQty: number
  qcPendingQty: number
  underRepairQty: number
  defectiveQty: number
  scrappedQty: number
  exhibitionQty: number
  totalPieces: number
  unitCost: number
  unitSellPrice: number
  stockValue: number
  sellValue: number
  firstInDate: string | null
  lastMovementDate: string | null
  // Phase 6 — dispatched visibility: bin column + movement-derived info
  lastDispatchDate: string | null
  lastDispatch?: {
    partyName: string | null
    dispatchNo: string | null
    date: string | null
    qty: number
  } | null
  location: string
  notes: string | null
  health: string
  createdAt: string
  updatedAt: string
}

interface FGStats {
  totalStyles: number
  totalPieces: number
  fullSets: number
  orphanPieces: number
  availablePieces: number
  reservedPieces: number
  qcPendingPieces: number
  deadStockPieces: number
  totalStockValue: number
  totalSellValue: number
  potentialProfit: number
}

interface HealthDist {
  healthy: number
  lowStock: number
  critical: number
  empty: number
}

interface FGGrnNote {
  id: string
  grnNo: string
  sourceType: string
  sourceName: string
  styleNo: string
  styleName: string
  image: string | null
  receivedDate: string
  status: string
  totalReceivedQty: number
  totalAcceptedQty: number
  totalRejectedQty: number
  unitCost: number
  unitSellPrice: number
  notes: string | null
  items: FGGrnItem[]
}

interface FGGrnItem {
  id: string
  color: string
  size: string
  colorCode: string
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  defectNotes: string | null
  unitCost: number
  totalValue: number
}

interface FGMovement {
  id: string
  movementNo: string
  movementType: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  quantity: number
  previousQty: number
  newQty: number
  referenceType: string | null
  referenceId: string | null
  referenceNo: string | null
  fromStatus: string | null
  toStatus: string | null
  fromLocation: string | null
  toLocation: string | null
  partyName: string | null
  reason: string | null
  movedBy: string | null
  movedAt: string
}

interface MatrixColorRow {
  color: string
  colorCode: string
  sizes: Record<string, { binId: string; colorCode: string; availableQty: number; reservedQty: number; totalPieces: number }>
  rowTotal: { availableQty: number; reservedQty: number; totalPieces: number }
}

interface MatrixStyle {
  styleNo: string
  styleName: string
  image: string | null
  colors: string[]
  sizes: string[]
  matrix: Record<string, MatrixColorRow>
  totals: { availableQty: number; reservedQty: number; totalPieces: number; stockValue: number; sellValue: number }
  fullSets: number
  orphanPieces: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Phase 6 — best lastDispatch across a set of bins (latest date wins)
function latestDispatch(bins: FGStockBin[]): FGStockBin['lastDispatch'] {
  let best: FGStockBin['lastDispatch'] = null
  for (const b of bins) {
    const d = b.lastDispatch || (b.lastDispatchDate ? { partyName: null, dispatchNo: null, date: b.lastDispatchDate, qty: 0 } : null)
    if (d && (!best || (d.date || '') > (best.date || ''))) best = d
  }
  return best
}

function formatDispatchDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'dd MMM yy')
  } catch {
    return '—'
  }
}

function formatINR(num: number): string {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`
  if (num >= 1000) return `₹${new Intl.NumberFormat('en-IN').format(num)}`
  return `₹${num}`
}

function formatQty(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

const healthConfig: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  Healthy:   { label: 'Healthy',   icon: '🟢', color: 'text-emerald-600',  bg: 'bg-emerald-50',   border: 'border-l-emerald-500' },
  LowStock:  { label: 'Low Stock', icon: '🟡', color: 'text-amber-600',    bg: 'bg-amber-50',     border: 'border-l-amber-500'  },
  Critical:  { label: 'Critical',  icon: '🔴', color: 'text-red-600',      bg: 'bg-red-50',       border: 'border-l-red-500'    },
  Empty:     { label: 'Empty',     icon: '⬜', color: 'text-slate-400',    bg: 'bg-slate-50',     border: 'border-l-slate-400'  },
  DeadStock: { label: 'Dead Stock', icon: '💀', color: 'text-red-800',      bg: 'bg-red-100',      border: 'border-l-red-700'    },
}

function HealthBadge({ health }: { health: string }) {
  const cfg = healthConfig[health] || healthConfig.Empty
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function getMatrixCellColor(qty: number): string {
  if (qty >= 50) return 'bg-emerald-100 text-emerald-800'
  if (qty >= 10) return 'bg-amber-100 text-amber-800'
  if (qty >= 1) return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-400'
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'Approved': return 'bg-emerald-100 text-emerald-700'
    case 'Draft': return 'bg-slate-100 text-slate-600'
    case 'Pending QC': return 'bg-amber-100 text-amber-700'
    case 'Rejected': return 'bg-red-100 text-red-700'
    case 'Active': return 'bg-emerald-100 text-emerald-700'
    case 'PartiallyDispatched': return 'bg-amber-100 text-amber-700'
    case 'FullyDispatched': return 'bg-slate-100 text-slate-600'
    case 'Released': return 'bg-blue-100 text-blue-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function getMovementBadgeColor(type: string): string {
  switch (type) {
    case 'Inward': return 'bg-emerald-100 text-emerald-700'
    case 'Outward': return 'bg-red-100 text-red-700'
    case 'Return': return 'bg-amber-100 text-amber-700'
    case 'Exchange': return 'bg-purple-100 text-purple-700'
    case 'Reservation': return 'bg-blue-100 text-blue-700'
    case 'Unreservation': return 'bg-sky-100 text-sky-700'
    case 'Adjustment': return 'bg-slate-100 text-slate-700'
    case 'QCStatusChange': return 'bg-orange-100 text-orange-700'
    case 'Scrapping': return 'bg-red-200 text-red-800'
    case 'PromotionalIssue': return 'bg-pink-100 text-pink-700'
    case 'ExhibitionMove': return 'bg-teal-100 text-teal-700'
    case 'ExhibitionReturn': return 'bg-cyan-100 text-cyan-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FGInventoryModule() {
  // ── Data State ──
  const [bins, setBins] = useState<FGStockBin[]>([])
  const [stats, setStats] = useState<FGStats | null>(null)
  const [healthDist, setHealthDist] = useState<HealthDist | null>(null)
  const [matrixData, setMatrixData] = useState<MatrixStyle[]>([])
  const [grnNotes, setGrnNotes] = useState<FGGrnNote[]>([])
  const [movements, setMovements] = useState<FGMovement[]>([])
  const [styleOptions, setStyleOptions] = useState<string[]>([])

  // ── UI State ──
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [healthFilter, setHealthFilter] = useState('All')
  const [sortBy, setSortBy] = useState('styleNo')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set())
  const [selectedStyleForMatrix, setSelectedStyleForMatrix] = useState<string>('all')

  // ── Dialog States ──
  const [addStockOpen, setAddStockOpen] = useState(false)
  const [movementOpen, setMovementOpen] = useState(false)
  const [grnCreateOpen, setGrnCreateOpen] = useState(false)
  const [binDetailOpen, setBinDetailOpen] = useState(false)
  const [selectedBin, setSelectedBin] = useState<FGStockBin | null>(null)
  const [styleDetailOpen, setStyleDetailOpen] = useState(false)
  const [selectedStyleNo, setSelectedStyleNo] = useState('')

  // ── Form States ──
  const [submitting, setSubmitting] = useState(false)

  // ── Add Stock Form ──
  const [addForm, setAddForm] = useState({
    styleNo: '', styleName: '', color: '', size: '',
    availableQty: 0, unitCost: 0, unitSellPrice: 0,
    location: 'Warehouse', notes: '',
  })
  const [previewColorCode, setPreviewColorCode] = useState('')

  // ── Movement Form ──
  const [moveForm, setMoveForm] = useState({
    movementType: 'Inward',
    fgStockBinId: '',
    quantity: 0,
    referenceType: '', referenceNo: '', reason: '',
  })
  const [moveSearchBins, setMoveSearchBins] = useState<FGStockBin[]>([])
  const [moveSearch, setMoveSearch] = useState('')

  // ── GRN Form ──
  const [grnForm, setGrnForm] = useState({
    sourceType: 'Vendor', sourceName: '', styleNo: '', styleName: '',
    unitCost: 0, unitSellPrice: 0, image: '', notes: '',
  })
  const [grnItems, setGrnItems] = useState<{
    color: string; size: string; receivedQty: number; acceptedQty: number; rejectedQty: number; defectNotes: string; colorCode: string
  }[]>([])

  // ── Movement filters ──
  const [moveTypeFilter, setMoveTypeFilter] = useState('All')
  const [moveSearchFilter, setMoveSearchFilter] = useState('')

  // ── Fetch Data ──
  const fetchBins = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (healthFilter !== 'All') params.set('health', healthFilter)
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
      params.set('limit', '200')

      const res = await fetch(`/api/fg-stock?${params}`)
      if (!res.ok) throw new Error('Failed to fetch stock')
      const data = await res.json()
      setBins(data.bins || [])
      setStats(data.stats || null)
      setHealthDist(data.healthDist || null)
    } catch (err) {
      console.error('Fetch bins error:', err)
      toast.error('Failed to load stock data')
    }
  }, [search, healthFilter, sortBy, sortDir])

  const fetchMatrix = useCallback(async (styleNo: string) => {
    try {
      const params = new URLSearchParams()
      if (styleNo && styleNo !== 'all') params.set('styleNo', styleNo)
      const res = await fetch(`/api/fg-stock/matrix?${params}`)
      if (!res.ok) throw new Error('Failed to fetch matrix')
      const data = await res.json()
      setMatrixData(data.styles || [])
      const styles = (data.styles || []).map((s: MatrixStyle) => s.styleNo)
      setStyleOptions(styles)
    } catch (err) {
      console.error('Fetch matrix error:', err)
      toast.error('Failed to load matrix')
    }
  }, [])

  const fetchGrnNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/fg-grn?limit=50')
      if (!res.ok) throw new Error('Failed to fetch GRN')
      const data = await res.json()
      setGrnNotes(data.grns || data.grnNotes || [])
    } catch (err) {
      console.error('Fetch GRN error:', err)
    }
  }, [])

  const fetchMovements = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (moveTypeFilter !== 'All') params.set('movementType', moveTypeFilter)
      if (moveSearchFilter) params.set('search', moveSearchFilter)
      params.set('limit', '100')
      const res = await fetch(`/api/fg-stock/movements?${params}`)
      if (!res.ok) throw new Error('Failed to fetch movements')
      const data = await res.json()
      setMovements(data.movements || [])
    } catch (err) {
      console.error('Fetch movements error:', err)
    }
  }, [moveTypeFilter, moveSearchFilter])

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true)
      await Promise.all([fetchBins(), fetchMatrix('all'), fetchGrnNotes(), fetchMovements()])
      setLoading(false)
    }
    loadInitial()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchBins() }, [fetchBins])
  useEffect(() => { fetchMovements() }, [fetchMovements])

  // ── Group bins by style ──
  const groupedBins = useMemo(() => {
    const groups: Record<string, FGStockBin[]> = {}
    for (const bin of bins) {
      if (!groups[bin.styleNo]) groups[bin.styleNo] = []
      groups[bin.styleNo].push(bin)
    }
    return groups
  }, [bins])

  const toggleStyleExpand = (styleNo: string) => {
    setExpandedStyles(prev => {
      const next = new Set(prev)
      if (next.has(styleNo)) next.delete(styleNo)
      else next.add(styleNo)
      return next
    })
  }

  // ── Movement type options ──
  const movementTypes = [
    'Inward', 'Outward', 'Return', 'Exchange', 'Reservation', 'Unreservation',
    'PromotionalIssue', 'ExhibitionMove', 'ExhibitionReturn', 'Adjustment',
    'QCStatusChange', 'Scrapping',
  ]

  // ── Color code preview for Add Stock ──
  useEffect(() => {
    if (addForm.color && addForm.styleNo) {
      const prefixes: Record<string, string> = {
        pink: 'PK', red: 'RD', blue: 'BL', green: 'GR', navy: 'NV',
        maroon: 'MR', yellow: 'YL', orange: 'OR', purple: 'PU', white: 'WH',
        black: 'BK', beige: 'BE', cream: 'CR', grey: 'GY', gray: 'GY',
        gold: 'GO', brown: 'BR', teal: 'TE', olive: 'OL', peach: 'PE', silver: 'SI',
      }
      const key = addForm.color.trim().toLowerCase()
      const prefix = prefixes[key] || addForm.color.substring(0, 2).toUpperCase()
      setPreviewColorCode(`${addForm.styleNo}-${prefix}__`)
    } else {
      setPreviewColorCode('')
    }
  }, [addForm.color, addForm.styleNo])

  // ── Add GRN Item ──
  const addGrnItem = () => {
    const color = ''
    const prefixes: Record<string, string> = {
      pink: 'PK', red: 'RD', blue: 'BL', green: 'GR', navy: 'NV',
      maroon: 'MR', yellow: 'YL', orange: 'OR', purple: 'PU', white: 'WH',
      black: 'BK', beige: 'BE', cream: 'CR', grey: 'GY', gray: 'GY',
      gold: 'GO', brown: 'BR', teal: 'TE', olive: 'OL', peach: 'PE', silver: 'SI',
    }
    const prefix = color ? (prefixes[color.trim().toLowerCase()] || color.substring(0, 2).toUpperCase()) : '__'
    setGrnItems(prev => [...prev, {
      color, size: '', receivedQty: 0, acceptedQty: 0, rejectedQty: 0, defectNotes: '',
      colorCode: grnForm.styleNo ? `${grnForm.styleNo}-${prefix}__` : '__',
    }])
  }

  // ── Handlers ──
  const handleAddStock = async () => {
    if (!addForm.styleNo || !addForm.styleName || !addForm.color || !addForm.size || addForm.availableQty <= 0) {
      toast.error('Please fill all required fields')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/fg-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add stock')
      }
      toast.success(`Stock added successfully! Color code will be auto-generated.`)
      setAddStockOpen(false)
      setAddForm({ styleNo: '', styleName: '', color: '', size: '', availableQty: 0, unitCost: 0, unitSellPrice: 0, location: 'Warehouse', notes: '' })
      fetchBins()
      fetchMatrix(selectedStyleForMatrix)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleMovement = async () => {
    if (!moveForm.fgStockBinId || moveForm.quantity <= 0) {
      toast.error('Please select a stock bin and enter quantity')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/fg-stock/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moveForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to record movement')
      }
      toast.success(`Movement recorded: ${moveForm.movementType}`)
      setMovementOpen(false)
      setMoveForm({ movementType: 'Inward', fgStockBinId: '', quantity: 0, referenceType: '', referenceNo: '', reason: '' })
      fetchBins()
      fetchMovements()
      fetchMatrix(selectedStyleForMatrix)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateGrn = async () => {
    if (!grnForm.styleNo || !grnForm.styleName || grnItems.length === 0) {
      toast.error('Please fill GRN header and add at least one item')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/fg-grn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...grnForm,
          status: 'Approved',
          items: grnItems.map(item => ({
            color: item.color,
            size: item.size,
            receivedQty: item.receivedQty,
            acceptedQty: item.acceptedQty,
            rejectedQty: item.rejectedQty,
            defectNotes: item.defectNotes || undefined,
            unitCost: grnForm.unitCost,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create GRN')
      }
      toast.success('FG GRN created and stock updated!')
      setGrnCreateOpen(false)
      setGrnForm({ sourceType: 'Vendor', sourceName: '', styleNo: '', styleName: '', unitCost: 0, unitSellPrice: 0, image: '', notes: '' })
      setGrnItems([])
      fetchBins()
      fetchGrnNotes()
      fetchMatrix(selectedStyleForMatrix)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleApproveGrn = async (grnId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/fg-grn/${grnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) throw new Error('Failed to approve GRN')
      toast.success('GRN approved! Stock updated.')
      fetchBins()
      fetchGrnNotes()
      fetchMatrix(selectedStyleForMatrix)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Search bins for movement dialog
  useEffect(() => {
    if (moveSearch.length >= 1) {
      const filtered = bins.filter(b =>
        b.styleNo.toLowerCase().includes(moveSearch.toLowerCase()) ||
        b.styleName.toLowerCase().includes(moveSearch.toLowerCase()) ||
        b.colorCode.toLowerCase().includes(moveSearch.toLowerCase()) ||
        b.color.toLowerCase().includes(moveSearch.toLowerCase())
      ).slice(0, 10)
      setMoveSearchBins(filtered)
    } else {
      setMoveSearchBins([])
    }
  }, [moveSearch, bins])

  // ── Render ──
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <PackageSearch className="h-7 w-7 text-primary" />
            Finished Goods Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Style × Color × Size stock tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMovementOpen(true)}>
            <ArrowRightLeft className="mr-1.5 h-4 w-4" />
            Record Movement
          </Button>
          <Button variant="outline" size="sm" onClick={() => setGrnCreateOpen(true)}>
            <FileText className="mr-1.5 h-4 w-4" />
            New FG GRN
          </Button>
          <Button size="sm" onClick={() => setAddStockOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Stock
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
          <TabsTrigger value="grn">GRN</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="reports" className="hidden lg:flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Reports</TabsTrigger>
          <TabsTrigger value="exhibition" className="hidden lg:flex items-center gap-1"><Store className="h-3.5 w-3.5" />Exhibition</TabsTrigger>
          <TabsTrigger value="promotional" className="hidden lg:flex items-center gap-1"><Gift className="h-3.5 w-3.5" />Promo</TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: Overview                                                  */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-6">
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shirt className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Styles</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{stats?.totalStyles ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Pieces</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatQty(stats?.totalPieces ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  <span className="text-xs font-medium">Full Sets</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatQty(stats?.fullSets ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Unplug className="h-4 w-4" />
                  <span className="text-xs font-medium">Orphan Pieces</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatQty(stats?.orphanPieces ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-teal-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Available</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatQty(stats?.availablePieces ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertOctagon className="h-4 w-4" />
                  <span className="text-xs font-medium">Dead Stock</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatQty(stats?.deadStockPieces ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <IndianRupee className="h-4 w-4" />
                  <span className="text-xs font-medium">Stock Value</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatINR(stats?.totalStockValue ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-pink-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Potential Profit</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{formatINR(stats?.potentialProfit ?? 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Health Distribution Bar ── */}
          {healthDist && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">Stock Health:</span>
                  {healthDist.healthy > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
                      {healthDist.healthy} Healthy
                    </span>
                  )}
                  {healthDist.lowStock > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
                      {healthDist.lowStock} Low
                    </span>
                  )}
                  {healthDist.critical > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                      {healthDist.critical} Critical
                    </span>
                  )}
                  {healthDist.empty > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full bg-slate-400" />
                      {healthDist.empty} Empty
                    </span>
                  )}
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200">
                  {healthDist.healthy > 0 && (
                    <div className="bg-emerald-500" style={{ width: `${(healthDist.healthy / Math.max(bins.length, 1)) * 100}%` }} />
                  )}
                  {healthDist.lowStock > 0 && (
                    <div className="bg-amber-500" style={{ width: `${(healthDist.lowStock / Math.max(bins.length, 1)) * 100}%` }} />
                  )}
                  {healthDist.critical > 0 && (
                    <div className="bg-red-500" style={{ width: `${(healthDist.critical / Math.max(bins.length, 1)) * 100}%` }} />
                  )}
                  {healthDist.empty > 0 && (
                    <div className="bg-slate-400" style={{ width: `${(healthDist.empty / Math.max(bins.length, 1)) * 100}%` }} />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Filter Bar ── */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search style, color, code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Health" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Health</SelectItem>
                  <SelectItem value="Healthy">Healthy</SelectItem>
                  <SelectItem value="LowStock">Low Stock</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="Empty">Empty</SelectItem>
                  <SelectItem value="DeadStock">Dead Stock</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="styleNo">Style</SelectItem>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="availableQty">Available Qty</SelectItem>
                  <SelectItem value="totalPieces">Total Pieces</SelectItem>
                  <SelectItem value="unitCost">Stock Value</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortDir === 'asc' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 rotate-[-90deg]" />}
              </Button>
            </CardContent>
          </Card>

          {/* ── Stock Table (Desktop) ── */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">QC Pending</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Dispatched</TableHead>
                    <TableHead>Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.keys(groupedBins).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-12 text-center text-muted-foreground">
                        <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                        <p>No finished goods stock found</p>
                        <p className="text-sm">Click &quot;Add Stock&quot; or &quot;New FG GRN&quot; to get started</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.entries(groupedBins).map(([styleNo, styleBins]) => (
                      <StyleGroupRow
                        key={styleNo}
                        styleNo={styleNo}
                        styleName={styleBins[0]?.styleName || ''}
                        image={styleBins[0]?.image || null}
                        bins={styleBins}
                        expanded={expandedStyles.has(styleNo)}
                        onToggle={() => toggleStyleExpand(styleNo)}
                        onSelectBin={(bin) => { setSelectedBin(bin); setBinDetailOpen(true) }}
                        onStyleDetail={() => { setSelectedStyleNo(styleNo); setStyleDetailOpen(true) }}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Mobile Cards ── */}
          <div className="space-y-3 md:hidden">
            {Object.keys(groupedBins).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12">
                  <Package className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No finished goods stock found</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedBins).map(([styleNo, styleBins]) => (
                <Card
                  key={styleNo}
                  className="cursor-pointer border-l-4 border-l-primary"
                  onClick={() => toggleStyleExpand(styleNo)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {styleBins[0]?.image && (
                        <img src={styleBins[0].image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{styleNo} — {styleBins[0]?.styleName}</p>
                        <p className="text-sm text-muted-foreground">
                          {styleBins.length} color×size variants · {formatQty(styleBins.reduce((a, b) => a + b.totalPieces, 0))} pieces
                        </p>
                      </div>
                      {expandedStyles.has(styleNo) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </div>

                    {expandedStyles.has(styleNo) && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {styleBins
                          .reduce((acc, bin) => {
                            const colorGroup = acc.find(g => g.color === bin.color && g.colorCode === bin.colorCode)
                            if (colorGroup) {
                              colorGroup.sizes.push(bin)
                            } else {
                              acc.push({ color: bin.color, colorCode: bin.colorCode, sizes: [bin] })
                            }
                            return acc
                          }, [] as { color: string; colorCode: string; sizes: FGStockBin[] }[])
                          .map(group => (
                            <div key={group.colorCode} className="rounded-lg bg-muted/50 p-3">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{group.colorCode} — {group.color}</span>
                                <HealthBadge health={group.sizes[0]?.health || 'Empty'} />
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 text-sm">
                                {group.sizes.map(s => (
                                  <span key={s.id} className="rounded bg-background px-2 py-0.5">
                                    {s.size}: <span className="font-medium">{s.availableQty}</span>
                                  </span>
                                ))}
                              </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                <span>Available: {formatQty(group.sizes.reduce((a, b) => a + b.availableQty, 0))}</span>
                                <span>Value: {formatINR(group.sizes.reduce((a, b) => a + b.stockValue, 0))}</span>
                              </div>
                              {(() => {
                                // Phase 6 — last dispatched client/date for this color group
                                const ld = latestDispatch(group.sizes)
                                if (!ld) return null
                                return (
                                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-1.5">
                                    <Truck className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      Dispatched {formatDispatchDate(ld.date)}
                                      {ld.partyName ? ` · ${ld.partyName}` : ''}
                                      {ld.dispatchNo ? ` · ${ld.dispatchNo}` : ''}
                                    </span>
                                  </div>
                                )
                              })()}
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: Stock Matrix                                             */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Label className="whitespace-nowrap">Style:</Label>
              <Select value={selectedStyleForMatrix} onValueChange={(v) => { setSelectedStyleForMatrix(v); fetchMatrix(v) }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Styles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Styles</SelectItem>
                  {styleOptions.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {matrixData.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <PackageSearch className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground">No stock data for matrix view</p>
              </CardContent>
            </Card>
          ) : (
            matrixData.map((style) => (
              <Card key={style.styleNo}>
                <CardContent className="p-4">
                  <div className="mb-4 flex items-center gap-3">
                    {style.image && (
                      <img src={style.image} alt="" className="h-14 w-14 rounded-lg object-cover border" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold">{style.styleNo} — {style.styleName}</h3>
                      <div className="flex gap-3 text-sm text-muted-foreground">
                        <span>Sets: <span className="font-medium text-foreground">{formatQty(style.fullSets)}</span></span>
                        <span>Orphan: <span className="font-medium text-amber-600">{formatQty(style.orphanPieces)}</span></span>
                        <span>Value: <span className="font-medium">{formatINR(style.totals.stockValue)}</span></span>
                        <span>Sell: <span className="font-medium">{formatINR(style.totals.sellValue)}</span></span>
                      </div>
                    </div>
                  </div>

                  {style.sizes.length > 0 && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[80px]">Color</TableHead>
                            <TableHead className="min-w-[60px] text-center text-xs">Code</TableHead>
                            {style.sizes.map(size => (
                              <TableHead key={size} className="min-w-[60px] text-center">{size}</TableHead>
                            ))}
                            <TableHead className="text-right min-w-[60px]">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {style.colors.map(color => {
                            const colorRow = style.matrix[color]
                            if (!colorRow) return null
                            return (
                              <TableRow key={color}>
                                <TableCell className="font-medium">{color}</TableCell>
                                <TableCell className="text-center text-xs text-muted-foreground">{colorRow.colorCode}</TableCell>
                                {style.sizes.map(size => {
                                  const cell = colorRow.sizes[size]
                                  const qty = cell?.availableQty || 0
                                  return (
                                    <TableCell key={size} className="text-center">
                                      <span className={`inline-block min-w-[2rem] rounded px-1.5 py-0.5 text-xs font-semibold ${getMatrixCellColor(qty)}`}>
                                        {qty}
                                      </span>
                                    </TableCell>
                                  )
                                })}
                                <TableCell className="text-right font-semibold">{formatQty(colorRow.rowTotal.availableQty)}</TableCell>
                              </TableRow>
                            )
                          })}
                          {/* Column Totals */}
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Total</TableCell>
                            <TableCell></TableCell>
                            {style.sizes.map(size => {
                              const colTotal = style.colors.reduce((acc, color) => acc + (style.matrix[color]?.sizes[size]?.availableQty || 0), 0)
                              return (
                                <TableCell key={size} className="text-center">{formatQty(colTotal)}</TableCell>
                              )
                            })}
                            <TableCell className="text-right">{formatQty(style.totals.availableQty)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: FG GRN                                                   */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="grn" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GRN No</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grnNotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                        <p>No FG GRN notes yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    grnNotes.map(grn => (
                      <TableRow key={grn.id}>
                        <TableCell className="font-mono text-sm">{grn.grnNo}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {grn.image && <img src={grn.image} alt="" className="h-8 w-8 rounded object-cover" />}
                            <span>{grn.styleNo}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{grn.sourceType}</Badge>
                          <span className="ml-1 text-xs text-muted-foreground">{grn.sourceName}</span>
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(grn.receivedDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-right">{formatQty(grn.totalReceivedQty)}</TableCell>
                        <TableCell className="text-right">{formatQty(grn.totalAcceptedQty)}</TableCell>
                        <TableCell className="text-right">{formatQty(grn.totalRejectedQty)}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeColor(grn.status)}`}>
                            {grn.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {grn.status === 'Draft' && (
                            <Button size="sm" variant="outline" onClick={() => handleApproveGrn(grn.id)} disabled={submitting}>
                              Approve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: Movements                                                */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <Select value={moveTypeFilter} onValueChange={setMoveTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Movement Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Types</SelectItem>
                  {movementTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by style, color, code..."
                  value={moveSearchFilter}
                  onChange={(e) => setMoveSearchFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>No</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                        <MoveRight className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                        <p>No stock movements recorded</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{format(new Date(m.movedAt), 'dd MMM yyyy HH:mm')}</TableCell>
                        <TableCell className="font-mono text-xs">{m.movementNo}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getMovementBadgeColor(m.movementType)}`}>
                            {m.movementType}
                          </span>
                        </TableCell>
                        <TableCell>{m.styleNo}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{m.colorCode}</span>
                          <span className="ml-1">{m.color}</span>
                        </TableCell>
                        <TableCell>{m.size}</TableCell>
                        <TableCell className={`text-right font-semibold ${m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {m.quantity >= 0 ? '+' : ''}{m.quantity}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.referenceNo || (m.referenceType || '—')}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[120px]">
                          {m.reason || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: Reports                                                  */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="reports">
          <FGReports />
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: Exhibition                                              */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="exhibition">
          <FGExhibitionModule />
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB: Promotional                                              */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="promotional">
          <FGPromotionalModule />
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SHEET: Style Detail                                           */}
      {/* ════════════════════════════════════════════════════════════ */}
      <FGStyleDetail
        styleNo={selectedStyleNo}
        open={styleDetailOpen}
        onClose={() => { setStyleDetailOpen(false); setSelectedStyleNo('') }}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Add Stock                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Finished Goods Stock</DialogTitle>
            <DialogDescription>Create a new stock bin. Color code will be auto-generated.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Style No *</Label>
                <Input value={addForm.styleNo} onChange={e => setAddForm(p => ({ ...p, styleNo: e.target.value }))} placeholder="DH-01" />
              </div>
              <div>
                <Label>Style Name *</Label>
                <Input value={addForm.styleName} onChange={e => setAddForm(p => ({ ...p, styleName: e.target.value }))} placeholder="Cotton Print Kurti" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Color *</Label>
                <Input value={addForm.color} onChange={e => setAddForm(p => ({ ...p, color: e.target.value }))} placeholder="Pink" />
              </div>
              <div>
                <Label>Size *</Label>
                <Input value={addForm.size} onChange={e => setAddForm(p => ({ ...p, size: e.target.value }))} placeholder="S" />
              </div>
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" value={addForm.availableQty} onChange={e => setAddForm(p => ({ ...p, availableQty: parseInt(e.target.value) || 0 }))} placeholder="0" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unit Cost (₹)</Label>
                <Input type="number" value={addForm.unitCost} onChange={e => setAddForm(p => ({ ...p, unitCost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Sell Price (₹)</Label>
                <Input type="number" value={addForm.unitSellPrice} onChange={e => setAddForm(p => ({ ...p, unitSellPrice: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            {previewColorCode && (
              <div className="rounded-lg bg-muted p-3">
                <span className="text-xs text-muted-foreground">Auto-generated Color Code:</span>
                <p className="font-mono text-lg font-bold text-primary">{previewColorCode}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStockOpen(false)}>Cancel</Button>
            <Button onClick={handleAddStock} disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Record Movement                                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Stock Movement</DialogTitle>
            <DialogDescription>Select the movement type, stock bin, and quantity.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Movement Type</Label>
              <Select value={moveForm.movementType} onValueChange={v => setMoveForm(p => ({ ...p, movementType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {movementTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Label>Search Stock Bin *</Label>
              <Input
                placeholder="Type style, color, or code..."
                value={moveSearch}
                onChange={e => setMoveSearch(e.target.value)}
              />
              {moveSearchBins.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                  {moveSearchBins.map(bin => (
                    <button
                      key={bin.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                      onClick={() => {
                        setMoveForm(p => ({ ...p, fgStockBinId: bin.id }))
                        setMoveSearch(`${bin.styleNo} - ${bin.color} (${bin.colorCode}) - ${bin.size} [${bin.availableQty}]`)
                        setMoveSearchBins([])
                      }}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{bin.colorCode}</span>
                      <span>{bin.styleNo} — {bin.color} ({bin.size})</span>
                      <Badge variant="outline" className="ml-auto text-xs">{bin.availableQty}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {moveForm.fgStockBinId && (
              <div className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">
                Selected: {moveSearch}
              </div>
            )}
            <div>
              <Label>Quantity *</Label>
              <Input type="number" value={moveForm.quantity} onChange={e => setMoveForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Reference Type</Label>
                <Input value={moveForm.referenceType} onChange={e => setMoveForm(p => ({ ...p, referenceType: e.target.value }))} placeholder="e.g., SalesOrder" />
              </div>
              <div>
                <Label>Reference No</Label>
                <Input value={moveForm.referenceNo} onChange={e => setMoveForm(p => ({ ...p, referenceNo: e.target.value }))} placeholder="e.g., SO-001" />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={moveForm.reason} onChange={e => setMoveForm(p => ({ ...p, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementOpen(false)}>Cancel</Button>
            <Button onClick={handleMovement} disabled={submitting}>
              {submitting ? 'Recording...' : 'Record Movement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: New FG GRN                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={grnCreateOpen} onOpenChange={setGrnCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>New FG Goods Received Note</DialogTitle>
            <DialogDescription>Record incoming finished goods with color × size breakdown.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Source Type</Label>
                  <Select value={grnForm.sourceType} onValueChange={v => setGrnForm(p => ({ ...p, sourceType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vendor">Vendor</SelectItem>
                      <SelectItem value="Production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source Name</Label>
                  <Input value={grnForm.sourceName} onChange={e => setGrnForm(p => ({ ...p, sourceName: e.target.value }))} placeholder="Vendor name or Job No" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Style No *</Label>
                  <Input value={grnForm.styleNo} onChange={e => setGrnForm(p => ({ ...p, styleNo: e.target.value }))} placeholder="DH-01" />
                </div>
                <div>
                  <Label>Style Name *</Label>
                  <Input value={grnForm.styleName} onChange={e => setGrnForm(p => ({ ...p, styleName: e.target.value }))} placeholder="Cotton Print Kurti" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unit Cost (₹)</Label>
                  <Input type="number" value={grnForm.unitCost} onChange={e => setGrnForm(p => ({ ...p, unitCost: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>Sell Price (₹)</Label>
                  <Input type="number" value={grnForm.unitSellPrice} onChange={e => setGrnForm(p => ({ ...p, unitSellPrice: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={grnForm.notes} onChange={e => setGrnForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>

              <Separator />

              {/* ── GRN Items ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Items (Color × Size)</Label>
                  <Button size="sm" variant="outline" onClick={addGrnItem}>
                    <Plus className="mr-1 h-3 w-3" /> Add Row
                  </Button>
                </div>
                {grnItems.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center text-muted-foreground">
                    <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm">No items added yet. Click &quot;Add Row&quot; to add color × size entries.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {grnItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-8 gap-2 items-end rounded-lg border p-2">
                        <div>
                          <Label className="text-xs">Color *</Label>
                          <Input
                            value={item.color}
                            onChange={e => {
                              const newItems = [...grnItems]
                              newItems[idx] = { ...newItems[idx], color: e.target.value }
                              const c = e.target.value.trim().toLowerCase()
                              const prefixes: Record<string, string> = { pink: 'PK', red: 'RD', blue: 'BL', green: 'GR', navy: 'NV', maroon: 'MR', yellow: 'YL', orange: 'OR', purple: 'PU', white: 'WH', black: 'BK', beige: 'BE', cream: 'CR', grey: 'GY', gold: 'GO', brown: 'BR', teal: 'TE', olive: 'OL', peach: 'PE', silver: 'SI' }
                              const prefix = prefixes[c] || (c ? c.substring(0, 2).toUpperCase() : '__')
                              newItems[idx].colorCode = grnForm.styleNo ? `${grnForm.styleNo}-${prefix}__` : '__'
                              setGrnItems(newItems)
                            }}
                            placeholder="Pink"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Size *</Label>
                          <Input
                            value={item.size}
                            onChange={e => {
                              const newItems = [...grnItems]
                              newItems[idx] = { ...newItems[idx], size: e.target.value }
                              setGrnItems(newItems)
                            }}
                            placeholder="S"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Received</Label>
                          <Input
                            type="number"
                            value={item.receivedQty}
                            onChange={e => {
                              const newItems = [...grnItems]
                              const qty = parseInt(e.target.value) || 0
                              newItems[idx] = { ...newItems[idx], receivedQty: qty, acceptedQty: qty }
                              setGrnItems(newItems)
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Accepted</Label>
                          <Input
                            type="number"
                            value={item.acceptedQty}
                            onChange={e => {
                              const newItems = [...grnItems]
                              newItems[idx] = { ...newItems[idx], acceptedQty: parseInt(e.target.value) || 0 }
                              setGrnItems(newItems)
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Rejected</Label>
                          <Input
                            type="number"
                            value={item.rejectedQty}
                            onChange={e => {
                              const newItems = [...grnItems]
                              newItems[idx] = { ...newItems[idx], rejectedQty: parseInt(e.target.value) || 0 }
                              setGrnItems(newItems)
                            }}
                          />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-xs">Code</Label>
                          <p className="text-xs font-mono text-muted-foreground truncate">{item.colorCode}</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Input
                            value={item.defectNotes}
                            onChange={e => {
                              const newItems = [...grnItems]
                              newItems[idx] = { ...newItems[idx], defectNotes: e.target.value }
                              setGrnItems(newItems)
                            }}
                            placeholder="Defect notes"
                          />
                        </div>
                        <div className="col-span-8 flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setGrnItems(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {grnItems.length > 0 && (
                  <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                    <div className="grid grid-cols-3 gap-4">
                      <span>Total Received: <strong>{formatQty(grnItems.reduce((a, b) => a + b.receivedQty, 0))}</strong></span>
                      <span>Accepted: <strong className="text-emerald-600">{formatQty(grnItems.reduce((a, b) => a + b.acceptedQty, 0))}</strong></span>
                      <span>Rejected: <strong className="text-red-600">{formatQty(grnItems.reduce((a, b) => a + b.rejectedQty, 0))}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrnCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGrn} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create GRN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SHEET: Bin Detail                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Sheet open={binDetailOpen} onOpenChange={setBinDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Stock Bin Detail</SheetTitle>
            <SheetDescription>Detailed view of a single stock bin</SheetDescription>
          </SheetHeader>
          {selectedBin && (
            <div className="mt-6 space-y-6">
              {/* Photo + Basic Info */}
              <div className="flex items-start gap-4">
                {selectedBin.image ? (
                  <img src={selectedBin.image} alt="" className="h-24 w-24 rounded-xl border object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl border bg-muted">
                    <Package className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold">{selectedBin.styleNo} — {selectedBin.styleName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedBin.colorCode} · {selectedBin.color} · Size {selectedBin.size}
                  </p>
                  <HealthBadge health={selectedBin.health} />
                </div>
              </div>

              {/* Quantity Buckets */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Available', value: selectedBin.availableQty, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Reserved', value: selectedBin.reservedQty, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'QC Pending', value: selectedBin.qcPendingQty, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Under Repair', value: selectedBin.underRepairQty, color: 'text-orange-600', bg: 'bg-orange-50' },
                  { label: 'Defective', value: selectedBin.defectiveQty, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Scrapped', value: selectedBin.scrappedQty, color: 'text-red-800', bg: 'bg-red-100' },
                  { label: 'At Exhibition', value: selectedBin.exhibitionQty, color: 'text-teal-600', bg: 'bg-teal-50' },
                  { label: 'Total Pieces', value: selectedBin.totalPieces, color: 'text-foreground', bg: 'bg-muted' },
                ].map(bucket => (
                  <div key={bucket.label} className={`rounded-lg p-3 ${bucket.bg}`}>
                    <p className="text-xs text-muted-foreground">{bucket.label}</p>
                    <p className={`text-xl font-bold ${bucket.color}`}>{formatQty(bucket.value)}</p>
                  </div>
                ))}
              </div>

              {/* Pricing */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-semibold">Pricing</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground">Unit Cost</span>
                    <p className="font-semibold">{formatINR(selectedBin.unitCost)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Sell Price</span>
                    <p className="font-semibold">{formatINR(selectedBin.unitSellPrice)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Stock Value</span>
                    <p className="font-semibold">{formatINR(selectedBin.stockValue)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Sell Value</span>
                    <p className="font-semibold">{formatINR(selectedBin.sellValue)}</p>
                  </div>
                </div>
              </div>

              {/* Last Dispatch (Phase 6) */}
              {(() => {
                const ld = selectedBin.lastDispatch || (selectedBin.lastDispatchDate
                  ? { partyName: null, dispatchNo: null, date: selectedBin.lastDispatchDate, qty: 0 }
                  : null)
                if (!ld) return null
                return (
                  <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Truck className="h-3.5 w-3.5 text-primary" /> Last Dispatch
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Dispatched To</span>
                        <span className="font-medium">{ld.partyName || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Dispatch Date</span>
                        <span className="font-medium">{formatDispatchDate(ld.date)}</span>
                      </div>
                      {ld.dispatchNo && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Dispatch No</span>
                          <span className="font-mono font-medium">{ld.dispatchNo}</span>
                        </div>
                      )}
                      {ld.qty > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Qty Dispatched</span>
                          <span className="font-medium">{formatQty(ld.qty)} pcs</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Metadata */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-semibold">Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" />{selectedBin.location}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">First Stock In</span>
                    <span>{selectedBin.firstInDate ? format(new Date(selectedBin.firstInDate), 'dd MMM yyyy') : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Movement</span>
                    <span>{selectedBin.lastMovementDate ? format(new Date(selectedBin.lastMovementDate), 'dd MMM yyyy') : '—'}</span>
                  </div>
                  {selectedBin.notes && (
                    <div>
                      <span className="text-muted-foreground">Notes</span>
                      <p className="mt-0.5">{selectedBin.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Sub-Component: Style Group Row ─────────────────────────────────────────

function StyleGroupRow({
  styleNo,
  styleName,
  image,
  bins,
  expanded,
  onToggle,
  onSelectBin,
  onStyleDetail,
}: {
  styleNo: string
  styleName: string
  image: string | null
  bins: FGStockBin[]
  expanded: boolean
  onToggle: () => void
  onSelectBin: (bin: FGStockBin) => void
  onStyleDetail: () => void
}) {
  const totalAvailable = bins.reduce((a, b) => a + b.availableQty, 0)
  const totalPieces = bins.reduce((a, b) => a + b.totalPieces, 0)
  const totalValue = bins.reduce((a, b) => a + b.stockValue, 0)

  // Calculate full sets (min available per size across all colors)
  const sizes = [...new Set(bins.map(b => b.size))]
  const colors = [...new Set(bins.map(b => b.color))]
  let fullSets = 0
  if (sizes.length > 0) {
    fullSets = Math.min(...sizes.map(size => {
      const sizesForColor = bins.filter(b => b.size === size)
      return sizesForColor.reduce((a, b) => a + b.availableQty, 0)
    }))
  }

  return (
    <>
      {/* Group Header */}
      <TableRow
        className="cursor-pointer bg-muted/30 hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell className="w-12">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </TableCell>
        <TableCell className="w-12">
          {image ? (
            <img src={image} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
              <Shirt className="h-4 w-4 text-muted-foreground/30" />
            </div>
          )}
        </TableCell>
        <TableCell colSpan={3}>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{styleNo}</span>
            <span className="text-muted-foreground">— {styleName}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {colors.length} colors · {sizes.length} sizes · {bins.length} bins
          </p>
        </TableCell>
        <TableCell></TableCell>
        <TableCell className="text-right font-semibold">{formatQty(totalAvailable)}</TableCell>
        <TableCell className="text-right text-muted-foreground">{formatQty(bins.reduce((a, b) => a + b.reservedQty, 0))}</TableCell>
        <TableCell className="text-right text-muted-foreground">{formatQty(bins.reduce((a, b) => a + b.qcPendingQty, 0))}</TableCell>
        <TableCell className="text-right font-medium">{formatQty(totalPieces)}</TableCell>
        <TableCell className="text-right">{formatINR(totalValue)}</TableCell>
        <TableCell>
          {(() => {
            // Phase 6 — most recent dispatch across this style's bins
            const ld = latestDispatch(bins)
            if (!ld) return <span className="text-xs text-muted-foreground">—</span>
            return (
              <div className="text-xs leading-tight max-w-[160px]">
                <span className="font-medium">{formatDispatchDate(ld.date)}</span>
                {ld.partyName && <span className="text-muted-foreground"> · {ld.partyName}</span>}
                {ld.dispatchNo && (
                  <span className="block font-mono text-[10px] text-muted-foreground truncate">{ld.dispatchNo}</span>
                )}
              </div>
            )
          })()}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {fullSets} sets · {totalAvailable - fullSets * sizes.length} orphan
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onStyleDetail() }}
              title="Style Detail"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded Rows */}
      {expanded && bins.map(bin => (
        <TableRow
          key={bin.id}
          className="cursor-pointer hover:bg-muted/30"
          onClick={() => onSelectBin(bin)}
        >
          <TableCell></TableCell>
          <TableCell></TableCell>
          <TableCell className="pl-6 text-sm text-muted-foreground">{bin.styleNo}</TableCell>
          <TableCell className="text-sm">{bin.color}</TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">{bin.colorCode}</TableCell>
          <TableCell className="text-sm">{bin.size}</TableCell>
          <TableCell className="text-right font-semibold">{bin.availableQty}</TableCell>
          <TableCell className="text-right text-muted-foreground">{bin.reservedQty}</TableCell>
          <TableCell className="text-right text-muted-foreground">{bin.qcPendingQty}</TableCell>
          <TableCell className="text-right">{bin.totalPieces}</TableCell>
          <TableCell className="text-right text-sm">{formatINR(bin.stockValue)}</TableCell>
          <TableCell>
            {(() => {
              // Phase 6 — per-bin last dispatched client + date + dispatch no
              const ld = bin.lastDispatch || (bin.lastDispatchDate ? { partyName: null, dispatchNo: null, date: bin.lastDispatchDate, qty: 0 } : null)
              if (!ld) return <span className="text-xs text-muted-foreground">—</span>
              return (
                <div className="text-xs leading-tight max-w-[160px]">
                  <span className="font-medium">{formatDispatchDate(ld.date)}</span>
                  {ld.partyName && <span className="text-muted-foreground"> · {ld.partyName}</span>}
                  {ld.dispatchNo && (
                    <span className="block font-mono text-[10px] text-muted-foreground truncate">{ld.dispatchNo}</span>
                  )}
                </div>
              )
            })()}
          </TableCell>
          <TableCell><HealthBadge health={bin.health} /></TableCell>
        </TableRow>
      ))}
    </>
  )
}
