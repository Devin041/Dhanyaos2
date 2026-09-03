'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Factory,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Layers,
  Package,
  Play,
  Pause,
  X,
  CalendarDays,
  Loader2,
  ShoppingCart,
  FileText,
  Clock,
  User,
  Handshake,
  Building2,
  Send,
  ArrowDownLeft,
  Edit3,
  Truck,
  Shirt,
  Scissors,
  Gauge,
  Zap,
  Sparkles,
  Target,
  AlertCircle,
  TrendingDown,
  Palette,
  Trash2,
  Lock,
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
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts'
import { useDashboardStore } from '@/store/dashboard-store'
import { toast } from 'sonner'
import { FabricIssueDialog } from '@/components/modules/production-fabric-issue'
import { colorNameToClasses, isColorJob } from '@/lib/color-badge'

// ─── Types ───────────────────────────────────────────────────────────────────

const PRODUCTION_STAGES = [
  'Fabric Issue',
  'Cutting',
  'Embroidery',
  'Printing',
  'Stitching',
  'Finishing',
  'Quality Check',
  'Packing',
  'Dispatch Ready',
  'Dispatched',
] as const

type StageName = (typeof PRODUCTION_STAGES)[number]

interface SalesOrderRef {
  id: string
  orderNo: string
  status: string
  customer: { id: string; companyName: string }
}

interface EligibleOrder {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  totalAmount: number
  customer: { id: string; companyName: string }
  items: {
    id: string
    styleName: string
    styleNo: string | null
    style: { styleNo: string; category: string | null } | null
    quantity: number
    unitPrice: number
    // Phase 5a: per-item color rows from OrderItemColor (batch-fetched by
    // eligible-orders) — drives the New Job color matrix
    colorBreakdown?: { id: string; color: string; size: string; quantity: number }[]
  }[]
  productionJobs: { id: string; styleNo: string }[]
}

interface ProductionJob {
  id: string
  jobNo: string
  salesOrderId: string | null
  salesOrder: SalesOrderRef | null
  styleNo: string
  styleName: string
  targetQty: number
  completedQty: number
  stage: string
  startDate: string
  endDate: string | null
  status: string
  color?: string | null
  // Phase 5a: color-group linkage + derived metadata from GET /api/production
  parentJobId?: string | null
  orderItemColorId?: string | null
  _childCount?: number
  _parentJobNo?: string | null
  createdAt: string
  updatedAt: string
  _image?: string | null
}

// Phase 5a: editable row of the New Job color matrix (one per OrderItemColor)
interface ColorSplitRow {
  orderItemColorId: string | null
  color: string
  size: string
  quantity: string
  included: boolean
}

interface StageTracking {
  id: string
  productionJobId: string
  stageName: string
  sequence: number
  locationType: string
  vendorId: string | null
  vendor: { id: string; vendorName: string; phone: string | null } | null
  sentDate: string | null
  expectedReturnDate: string | null
  receivedDate: string | null
  sentQty: number
  receivedQty: number
  defectiveQty: number
  perPieceRate: number
  totalAmount: number
  status: string
  notes: string | null
  // Phase 5b — per-split color + vendor-bill lock flag (from the stages API)
  color?: string | null
  hasBills?: boolean
  _bills?: Array<{ id: string; billNo: string; totalAmount: number; status: string }>
}

// Phase 5b — one editable row of the STAGE SPLITS editor (multi-vendor /
// multi-color split rows of a single stage)
interface StageSplitForm {
  id?: string
  color: string
  locationType: string
  vendorId: string
  sentDate: string
  expectedReturnDate: string
  receivedDate: string
  sentQty: string
  receivedQty: string
  defectiveQty: string
  perPieceRate: string
  notes: string
  hasBills: boolean
}

interface VendorOption {
  id: string
  vendorName: string           // display name (vendorName for vendors, name for suppliers)
  phone: string | null
  kind: 'Vendor' | 'Supplier'  // tag so the user can tell them apart
  type: string                 // vendorType or supplierType
}

interface ProductionData {
  jobs: ProductionJob[]
  total: number
  stageCounts: Record<string, number>
  statusCounts: Record<string, number>
}

// ─── Production Efficiency Types (NEW) ──────────────────────────────────────

interface EffStageStat {
  stage: string
  jobCount: number
  totalTarget: number
  totalCompleted: number
  avgProgress: number
  color: string
}

interface EffJob {
  id: string
  jobNo: string
  styleNo: string
  styleName: string
  targetQty: number
  completedQty: number
  progress: number
  stage: string
  status: string
  startDate: string
  endDate: string | null
  daysElapsed: number
  daysPlanned: number
  expectedProgress: number
  efficiency: number
  isBehind: boolean
  isAtRisk: boolean
  throughput: number
}

interface EffSummary {
  totalJobs: number
  completedJobs: number
  inProgressJobs: number
  totalTarget: number
  totalCompleted: number
  overallCompletion: number
  onTimeRate: number
  avgCycleTime: number
  avgEfficiency: number
  totalThroughput: number
  bottleneckStage: string
  bottleneckJobCount: number
  atRiskCount: number
}

interface EffData {
  summary: EffSummary
  stages: EffStageStat[]
  jobs: EffJob[]
  statusDist: Array<{ status: string; count: number }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

function getStageIndex(stage: string): number {
  return PRODUCTION_STAGES.indexOf(stage as StageName)
}

function isOverdue(endDate: string | null, status: string): boolean {
  if (!endDate || status === 'Completed' || status === 'Cancelled') return false
  return new Date(endDate) < new Date()
}

function isNearDue(endDate: string | null, status: string): boolean {
  if (!endDate || status === 'Completed' || status === 'Cancelled') return false
  const diff = new Date(endDate).getTime() - new Date().getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  return days >= 0 && days <= 2
}

function daysRemaining(endDate: string | null): number | null {
  if (!endDate) return null
  const diff = new Date(endDate).getTime() - new Date().getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'Delayed':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'Cancelled':
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    default:
      return 'bg-primary/20 text-primary border-primary/30'
  }
}

function getJobBorderColor(job: ProductionJob): string {
  if (job.status === 'Completed') return 'border-zinc-500/20'
  if (job.status === 'Cancelled') return 'border-zinc-500/10'
  if (job.status === 'Delayed' || isOverdue(job.endDate, job.status))
    return 'border-red-500/40'
  if (isNearDue(job.endDate, job.status))
    return 'border-amber-500/40'
  return 'border-emerald-500/30'
}

// ─── Color badge (Phase 5a) ───────────────────────────────────────────────
// Rounded pill for real garment colors — hidden for 'Free'/null jobs.
// Class strings come from the SHARED lib (@/lib/color-badge) so production,
// QC and the tracker all render identical pills.

function ColorBadge({ color, className }: { color?: string | null; className?: string }) {
  if (!isColorJob(color)) return null
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${colorNameToClasses(color)} ${className || ''}`}
    >
      {color}
    </span>
  )
}

// Color chip used on group headers: color pill + qty ('Red 150')
function GroupColorChip({ color, qty }: { color?: string | null; qty: number }) {
  if (!isColorJob(color)) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${colorNameToClasses(color)}`}
    >
      {color}
      <span className="tabular-nums opacity-80">{formatNumber(qty)}</span>
    </span>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProductionModule() {
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Data
  const [data, setData] = useState<ProductionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [eff, setEff] = useState<EffData | null>(null)

  // Dialogs
  const [selectedJob, setSelectedJob] = useState<ProductionJob | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [newJobOpen, setNewJobOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fabric Issue dialog (Phase 4 — GRN-received fabric → production job)
  const [fabricIssueJob, setFabricIssueJob] = useState<ProductionJob | null>(null)

  // New job form - from sales order
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<EligibleOrder | null>(null)
  const [jobDueDates, setJobDueDates] = useState<Record<string, string>>({})
  const [createMode, setCreateMode] = useState<'order' | 'manual'>('order')

  // Phase 5a — COLOR-WISE JOB SPLIT: "Split by color" toggle + editable
  // color matrix (one row per OrderItemColor, prefilled from the item's
  // colorBreakdown)
  const [splitByColor, setSplitByColor] = useState(true)
  const [colorMatrix, setColorMatrix] = useState<Record<string, ColorSplitRow[]>>({})

  // Manual job form
  const [manualJob, setManualJob] = useState({
    styleNo: '',
    styleName: '',
    targetQty: '',
    endDate: '',
    color: 'Free',             // NEW — optional free-text color for manual jobs
    fabricStockId: '',        // NEW — link to FabricStock row (auto-suggest)
    plannedFabricMeters: '',  // NEW — how much fabric will be consumed
    consumptionPerPiece: '2.5', // NEW — meters of fabric per garment (auto-calc)
  })

  // When product or targetQty or consumptionPerPiece changes, auto-calculate plannedFabricMeters
  useEffect(() => {
    const qty = parseFloat(manualJob.targetQty) || 0
    const perPiece = parseFloat(manualJob.consumptionPerPiece) || 0
    if (qty > 0 && perPiece > 0) {
      setManualJob(prev => ({
        ...prev,
        plannedFabricMeters: String(Math.round(qty * perPiece * 100) / 100),
      }))
    }
  }, [manualJob.targetQty, manualJob.consumptionPerPiece])

  // Product catalog (for manual job product selector — merged from Sample
  // Catalog + Cost Sheets so ALL costed products appear, not just samples)
  const [catalogProducts, setCatalogProducts] = useState<Array<{ id: string; styleNo: string; styleName: string }>>([])

  // Fabric stock list (for fabric auto-suggest in manual job form)
  const [fabricStocks, setFabricStocks] = useState<Array<{ id: string; fabricName: string; color: string | null; lotNumber: string | null; availableMeters: number; averageCost: number }>>([])

  // Fetch product catalog once on mount
  useEffect(() => {
    async function loadCatalog() {
      const merged = new Map<string, { id: string; styleNo: string; styleName: string }>()
      try {
        const res = await fetch('/api/samples')
        const data = await res.json()
        const arr = Array.isArray(data) ? data : (data.samples || [])
        for (const s of arr) {
          if (s.styleNo) merged.set(s.styleNo, { id: s.id, styleNo: s.styleNo, styleName: s.styleName || s.styleNo })
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch('/api/cost-sheets?limit=500')
        const data = await res.json()
        const arr = data.costSheets || data || []
        for (const c of arr) {
          if (c.styleNo && !merged.has(c.styleNo)) {
            merged.set(c.styleNo, { id: c.id, styleNo: c.styleNo, styleName: c.styleName || c.styleNo })
          }
        }
      } catch { /* ignore */ }
      const list = Array.from(merged.values()).sort((a, b) =>
        (a.styleNo || '').localeCompare(b.styleNo || '', undefined, { numeric: true, sensitivity: 'base' })
      )
      setCatalogProducts(list)
    }
    loadCatalog()
  }, [])

  // Fetch available fabric stocks (for auto-suggest in manual job creation)
  useEffect(() => {
    async function loadFabricStocks() {
      try {
        const res = await fetch('/api/fabric-stock')
        if (res.ok) {
          const data = await res.json()
          const arr = (data.stocks || []).filter((s: any) => (s.availableMeters || 0) > 0)
          setFabricStocks(arr.map((s: any) => ({
            id: s.id,
            fabricName: s.fabricName,
            color: s.color || null,
            lotNumber: s.lotNumber || null,
            availableMeters: s.availableMeters,
            averageCost: s.averageCost,
          })))
        }
      } catch { /* silent */ }
    }
    loadFabricStocks()
  }, [])

  // Edit completed qty
  const [editQty, setEditQty] = useState('')
  const [editQtyId, setEditQtyId] = useState<string | null>(null)

  // Phase 5a — color-group state: collapsed groups on the kanban + sibling
  // jobs for the detail dialog (fetched via /api/production?parentId=)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [siblingJobs, setSiblingJobs] = useState<ProductionJob[]>([])

  // Stage tracking
  const [stageTrackings, setStageTrackings] = useState<StageTracking[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [stageEditOpen, setStageEditOpen] = useState(false)
  // Phase 5b — STAGE SPLITS editor state: the stage name being edited + the
  // full list of split rows (one row per vendor/color split of that stage)
  const [editingStageName, setEditingStageName] = useState<string | null>(null)
  const [stageSplits, setStageSplits] = useState<StageSplitForm[]>([])
  const [savingSplits, setSavingSplits] = useState(false)

  // Start date for new jobs
  const [jobStartDate, setJobStartDate] = useState(() => new Date().toISOString().split('T')[0])

  // Mobile stage index for vertical navigation
  const [mobileStageIdx, setMobileStageIdx] = useState(0)

  // Fetch eligible orders when dialog opens
  const fetchEligibleOrders = useCallback(async () => {
    try {
      setEligibleLoading(true)
      const res = await fetch('/api/production/eligible-orders')
      if (res.ok) {
        const json = await res.json()
        setEligibleOrders(json.orders)
      }
    } catch (err) {
      console.error('Failed to fetch eligible orders:', err)
    } finally {
      setEligibleLoading(false)
    }
  }, [])

  // Fetch vendors for dropdowns
  // Fetch counterparties — both Vendors AND Suppliers, since a stage can be
  // outsourced to either. Merging them here matches the universal PO behavior
  // (a PO can be raised against either kind).
  const fetchVendors = useCallback(async () => {
    const merged: VendorOption[] = []
    // Source 1: All Vendors
    try {
      const res = await fetch('/api/vendors')
      if (res.ok) {
        const data = await res.json()
        const arr = data.vendors || data || []
        for (const v of arr) {
          merged.push({
            id: v.id,
            vendorName: v.vendorName,
            phone: v.phone || null,
            kind: 'Vendor',
            type: v.vendorType || v.specialization || '—',
          })
        }
      }
    } catch { /* silent */ }
    // Source 2: All Suppliers (also valid outsourcing counterparties)
    try {
      const res = await fetch('/api/suppliers?limit=500')
      if (res.ok) {
        const data = await res.json()
        const arr = data.suppliers || data || []
        for (const s of arr) {
          merged.push({
            id: s.id,
            vendorName: s.name,
            phone: s.phone || null,
            kind: 'Supplier',
            type: s.supplierType || '—',
          })
        }
      }
    } catch { /* silent */ }
    // Sort alphabetically by name
    merged.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    setVendors(merged)
  }, [])

  // Fetch stage tracking for a job
  const fetchStageTracking = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/production/${jobId}/stages`)
      if (res.ok) {
        const data = await res.json()
        setStageTrackings(data.stages || [])
      }
    } catch { /* silent */ }
  }, [])

  // ─── Phase 5b — STAGE SPLITS editor logic ────────────────────────────
  // One stage carries N vendor/color split rows. The editor edits the FULL
  // list of that stage's rows and saves via PATCH { stageName, rows } with
  // REPLACE semantics (rows absent from the payload are deleted server-side,
  // unless they carry vendor bills — those are locked here AND server-side).

  // Map a saved StageTracking row into the editor's form shape
  const rowToSplitForm = (r: StageTracking): StageSplitForm => ({
    id: r.id,
    color: r.color || '',
    locationType: r.locationType || 'In-House',
    vendorId: r.vendorId || '',
    sentDate: r.sentDate ? r.sentDate.split('T')[0] : '',
    expectedReturnDate: r.expectedReturnDate ? r.expectedReturnDate.split('T')[0] : '',
    receivedDate: r.receivedDate ? r.receivedDate.split('T')[0] : '',
    sentQty: r.sentQty ? String(r.sentQty) : '',
    receivedQty: r.receivedQty ? String(r.receivedQty) : '',
    defectiveQty: r.defectiveQty ? String(r.defectiveQty) : '',
    perPieceRate: r.perPieceRate ? String(r.perPieceRate) : '',
    notes: r.notes || '',
    hasBills: !!r.hasBills,
  })

  // A brand-new split defaults to Outsourced (the whole point of a split is
  // sending work out), today's sent date, and the job's color prefilled
  const blankSplit = (): StageSplitForm => ({
    color: isColorJob(selectedJob?.color) ? (selectedJob?.color as string) : '',
    locationType: 'Outsourced',
    vendorId: '',
    sentDate: new Date().toISOString().split('T')[0],
    expectedReturnDate: '',
    receivedDate: '',
    sentQty: '',
    receivedQty: '',
    defectiveQty: '',
    perPieceRate: '',
    notes: '',
    hasBills: false,
  })

  // Opens the splits editor for a stage — loads ALL rows of that stage
  const openStageEdit = (stageName: string) => {
    const rows = stageTrackings.filter((s) => s.stageName === stageName)
    if (rows.length === 0) return
    setEditingStageName(stageName)
    setStageSplits(rows.map(rowToSplitForm))
    setStageEditOpen(true)
  }

  const updateSplit = (idx: number, patch: Partial<StageSplitForm>) => {
    setStageSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const removeSplit = (idx: number) => {
    setStageSplits((prev) => prev.filter((_, i) => i !== idx))
  }

  // Persist the full split list (silent — callers toast their own success).
  // Returns the saved rows from the server (ids, resolved vendor ids,
  // hasBills flags) or null on failure, and refreshes the editor + pipeline.
  const persistSplits = async (): Promise<StageTracking[] | null> => {
    if (!selectedJob || !editingStageName) return null
    setSavingSplits(true)
    try {
      const payload = {
        stageName: editingStageName,
        rows: stageSplits.map((s) => ({
          id: s.id || undefined,
          ...(s.color.trim() ? { color: s.color.trim() } : {}),
          locationType: s.locationType,
          vendorId: s.locationType === 'Outsourced' ? (s.vendorId || null) : null,
          sentDate: s.sentDate || null,
          expectedReturnDate: s.expectedReturnDate || null,
          receivedDate: s.receivedDate || null,
          sentQty: s.sentQty ? Number(s.sentQty) : 0,
          receivedQty: s.receivedQty ? Number(s.receivedQty) : 0,
          defectiveQty: s.defectiveQty ? Number(s.defectiveQty) : 0,
          perPieceRate: s.perPieceRate ? Number(s.perPieceRate) : 0,
          notes: s.notes || null,
        })),
      }
      const res = await fetch(`/api/production/${selectedJob.id}/stages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error || 'Failed to save stage splits')
        return null
      }
      const json = await res.json()
      const rows: StageTracking[] = json.rows || []
      // Refresh the editor state from the saved rows (ids assigned to new
      // rows, Supplier ids resolved to Vendor ids, hasBills flags)
      setStageSplits(rows.map(rowToSplitForm))
      fetchStageTracking(selectedJob.id)
      return rows
    } catch {
      toast.error('Failed to save stage splits')
      return null
    } finally {
      setSavingSplits(false)
    }
  }

  const handleSaveStageSplits = async () => {
    const rows = await persistSplits()
    if (rows) {
      toast.success(`${editingStageName}: ${rows.length} split${rows.length !== 1 ? 's' : ''} saved`)
      setStageEditOpen(false)
    }
  }

  // Per-split BILL action — saves all splits first (so the server resolves
  // Supplier ids → Vendor ids), then raises a VendorBill against the SAVED
  // row (vendorId + stageTrackingId + amounts from the row itself).
  const handleBillSplit = async (idx: number) => {
    if (!selectedJob || !editingStageName) return
    const split = stageSplits[idx]
    if (!split.id || split.locationType !== 'Outsourced' || !split.vendorId) return
    const rows = await persistSplits()
    if (!rows) return
    const savedRow = rows.find((r) => r.id === split.id)
    if (!savedRow || !savedRow.vendorId) {
      toast.error('Split must be saved with a vendor before billing')
      return
    }
    try {
      const res = await fetch('/api/vendor-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: savedRow.vendorId,
          stageTrackingId: savedRow.id,
          description: `${editingStageName} — ${selectedJob.jobNo} (${savedRow.color || selectedJob.color || 'Free'})`,
          totalQty: savedRow.receivedQty || savedRow.sentQty || 0,
          perPieceRate: savedRow.perPieceRate || 0,
          totalAmount: savedRow.totalAmount || 0,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        toast.success(`Bill ${json.bill?.billNo || ''} created — split locked`)
        // Flip the row to billed (locked) in the editor + pipeline
        setStageSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, hasBills: true } : s)))
        fetchStageTracking(selectedJob.id)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error || 'Failed to create vendor bill')
      }
    } catch {
      toast.error('Failed to create vendor bill')
    }
  }

  const openNewJobDialog = () => {
    setSelectedOrderId(null)
    setSelectedOrder(null)
    setJobDueDates({})
    setJobStartDate(new Date().toISOString().split('T')[0])
    setManualJob({
      styleNo: '',
      styleName: '',
      targetQty: '',
      endDate: '',
      color: 'Free',
      fabricStockId: '',
      plannedFabricMeters: '',
      consumptionPerPiece: '2.5',
    })
    setSplitByColor(true)
    setColorMatrix({})
    setCreateMode('order')
    setNewJobOpen(true)
    fetchEligibleOrders()
  }

  // Derive the per-item color matrix from the selected order's items
  // (colorBreakdown comes from eligible-orders). Re-derives whenever the
  // order selection changes.
  const deriveColorMatrix = (order: EligibleOrder): Record<string, ColorSplitRow[]> => {
    const matrix: Record<string, ColorSplitRow[]> = {}
    for (const item of order.items) {
      if (item.colorBreakdown && item.colorBreakdown.length > 0) {
        matrix[item.id] = item.colorBreakdown.map((cb) => ({
          orderItemColorId: cb.id,
          color: cb.color,
          size: cb.size || '-',
          quantity: String(cb.quantity),
          included: true,
        }))
      }
    }
    return matrix
  }

  const selectOrder = (orderId: string) => {
    const order = eligibleOrders.find((o) => o.id === orderId)
    if (order) {
      setSelectedOrderId(orderId)
      setSelectedOrder(order)
      // Reset split toggle (default ON) + re-derive the color matrix
      setSplitByColor(true)
      setColorMatrix(deriveColorMatrix(order))
      // Set default due dates from order delivery date
      const defaultDue = order.deliveryDate
        ? new Date(order.deliveryDate).toISOString().split('T')[0]
        : ''
      const dates: Record<string, string> = {}
      for (const item of order.items) {
        const styleKey = item.style?.styleNo || item.styleName
        dates[styleKey] = defaultDue
      }
      setJobDueDates(dates)
    }
  }

  const updateMatrixRow = (itemId: string, idx: number, patch: Partial<ColorSplitRow>) => {
    setColorMatrix((prev) => {
      const rows = [...(prev[itemId] || [])]
      rows[idx] = { ...rows[idx], ...patch }
      return { ...prev, [itemId]: rows }
    })
  }

  const handleCreateJobsFromOrder = async () => {
    if (!selectedOrder) return
    try {
      setSaving(true)
      // Row-level validation BEFORE any POST (all-or-nothing per item —
      // the server validates the whole colorSplits array too)
      for (const item of selectedOrder.items) {
        const rows = splitByColor ? (colorMatrix[item.id] || []) : []
        if (splitByColor && (item.colorBreakdown?.length ?? 0) > 0) {
          const included = rows.filter((r) => r.included)
          if (included.length === 0) {
            toast.error(`Select at least one color row for ${item.styleName}`)
            setSaving(false)
            return
          }
          for (const r of included) {
            if (!r.color.trim()) {
              toast.error(`Color is required for every included row (${item.styleName})`)
              setSaving(false)
              return
            }
            if (!(Number(r.quantity) > 0)) {
              toast.error(`Quantity must be > 0 for color "${r.color || '—'}" (${item.styleName})`)
              setSaving(false)
              return
            }
          }
        }
      }
      // Create jobs sequentially to avoid SQLite write-lock conflicts
      const results: { ok: boolean; style: string; error?: string }[] = []
      let colorJobsCreated = 0
      let groupsCreated = 0
      for (const item of selectedOrder.items) {
        const styleKey = item.style?.styleNo || item.styleName
        const rows = splitByColor ? (colorMatrix[item.id] || []) : []
        const useSplit = splitByColor && (item.colorBreakdown?.length ?? 0) > 0
        const includedRows = useSplit ? rows.filter((r) => r.included) : []
        try {
          const body = useSplit
            ? {
                salesOrderId: selectedOrder.id,
                styleNo: item.style?.styleNo || item.styleName,
                styleName: item.styleName,
                orderItemId: item.id,
                // color-split mode: one parent group job + one child per color
                colorSplits: includedRows.map((r) => ({
                  orderItemColorId: r.orderItemColorId || null,
                  color: r.color.trim(),
                  size: r.size || null,
                  quantity: Number(r.quantity),
                })),
                startDate: jobStartDate,
                endDate: jobDueDates[styleKey] || undefined,
              }
            : {
                salesOrderId: selectedOrder.id,
                styleNo: item.style?.styleNo || item.styleName,
                styleName: item.styleName,
                targetQty: item.quantity,
                startDate: jobStartDate,
                endDate: jobDueDates[styleKey] || undefined,
              }
          const r = await fetch('/api/production', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!r.ok) {
            const err = await r.json().catch(() => ({}))
            results.push({ ok: false, style: item.styleName, error: err.error || r.statusText })
          } else {
            results.push({ ok: true, style: item.styleName })
            if (useSplit) {
              const json = await r.json().catch(() => ({}))
              colorJobsCreated += Array.isArray(json.jobs) ? json.jobs.length : 1
              groupsCreated += 1
            } else {
              colorJobsCreated += 1
            }
          }
        } catch {
          results.push({ ok: false, style: item.styleName, error: 'Network error' })
        }
      }
      const failures = results.filter((r) => !r.ok)
      if (failures.length === 0) {
        if (groupsCreated > 0) {
          toast.success(`${colorJobsCreated} color jobs created (${groupsCreated} group${groupsCreated > 1 ? 's' : ''})`)
        } else {
          toast.success(`${results.length} production job(s) created successfully`)
        }
        setNewJobOpen(false)
        setSelectedOrderId(null)
        setSelectedOrder(null)
        setColorMatrix({})
        fetchData()
      } else if (failures.length < results.length) {
        toast.warning(`${results.length - failures.length} job(s) created, ${failures.length} failed`)
        failures.forEach((f) => {
          toast.error(`${f.style}: ${f.error}`)
        })
        fetchData()
      } else {
        toast.error(`All jobs failed to create`)
        failures.forEach((f) => {
          toast.error(`${f.style}: ${f.error}`)
        })
      }
    } catch (err) {
      console.error('Failed to create jobs from order:', err)
      toast.error('Failed to create production jobs')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateManualJob = async () => {
    if (!manualJob.styleNo || !manualJob.styleName || !manualJob.targetQty) return
    try {
      setSaving(true)
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleNo: manualJob.styleNo,
          styleName: manualJob.styleName,
          targetQty: Number(manualJob.targetQty),
          startDate: jobStartDate,
          endDate: manualJob.endDate || undefined,
          // NEW — optional free-text color ('Free' default = one-color job)
          color: manualJob.color.trim() || 'Free',
          // NEW — fabric stock linkage (auto-suggest from available stock)
          fabricStockId: manualJob.fabricStockId || undefined,
          plannedFabricMeters: manualJob.plannedFabricMeters ? Number(manualJob.plannedFabricMeters) : undefined,
        }),
      })
      if (res.ok) {
        toast.success('Production job created successfully')
        setNewJobOpen(false)
        // Reset fabric-related fields too
        setManualJob({ styleNo: '', styleName: '', targetQty: '', endDate: '', color: 'Free', fabricStockId: '', plannedFabricMeters: '', consumptionPerPiece: '2.5' })
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error || 'Failed to create production job')
      }
    } catch (err) {
      console.error('Failed to create job:', err)
      toast.error('Failed to create production job')
    } finally {
      setSaving(false)
    }
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (stageFilter !== 'all') params.set('stage', stageFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/production?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch production data:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, stageFilter, search])

  const fetchEff = useCallback(async () => {
    try {
      const res = await fetch('/api/production/efficiency')
      if (!res.ok) return
      const json = await res.json()
      if (!json.error) setEff(json)
    } catch {
      // Efficiency is optional — fail silently
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchEff()
  }, [fetchData, fetchEff])

  // ─── Actions ───────────────────────────────────────────────────────────

  const handleCreateJob = async () => {
    if (createMode === 'order') {
      await handleCreateJobsFromOrder()
    } else {
      await handleCreateManualJob()
    }
  }

  const handleAdvanceStage = async (jobId: string) => {
    try {
      const res = await fetch(`/api/production/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStage: 'next' }),
      })
      if (res.ok) {
        const updated = await res.json()
        if (selectedJob?.id === jobId) {
          setSelectedJob(updated)
          fetchStageTracking(jobId)
        }
        fetchData()
        toast.success('Stage advanced successfully')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error || 'Failed to advance stage')
      }
    } catch (err) {
      console.error('Failed to advance stage:', err)
      toast.error('Failed to advance stage')
    }
  }

  const handleUpdateStatus = async (jobId: string, status: string) => {
    try {
      const res = await fetch(`/api/production/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const updated = await res.json()
        if (selectedJob?.id === jobId) {
          setSelectedJob(updated)
        }
        fetchData()
        toast.success('Status updated successfully')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error || 'Failed to update status')
      }
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error('Failed to update status')
    }
  }

  const handleSaveQty = async (jobId: string) => {
    try {
      const res = await fetch(`/api/production/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedQty: Number(editQty) }),
      })
      if (res.ok) {
        const updated = await res.json()
        if (selectedJob?.id === jobId) {
          setSelectedJob(updated)
        }
        setEditQtyId(null)
        fetchData()
        toast.success('Quantity updated successfully')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error || 'Failed to update quantity')
      }
    } catch (err) {
      console.error('Failed to update qty:', err)
      toast.error('Failed to update quantity')
    }
  }

  const openDetail = (job: ProductionJob) => {
    setSelectedJob(job)
    setEditQty(String(job.completedQty))
    setDetailOpen(true)
    fetchStageTracking(job.id)
    fetchVendors()
    // Phase 5a — color-group siblings: child → fetch its group's children,
    // parent → fetch its children (via ?parentId=)
    fetchSiblings(job)
  }

  // Sibling/children lookup for the detail dialog's COLOR GROUP JOBS section
  const fetchSiblings = useCallback(async (job: ProductionJob) => {
    const pid = job.parentJobId || ((job._childCount ?? 0) > 0 ? job.id : null)
    if (!pid) {
      setSiblingJobs([])
      return
    }
    try {
      const res = await fetch(`/api/production?parentId=${pid}`)
      if (res.ok) {
        const json = await res.json()
        setSiblingJobs(json.jobs || [])
      } else {
        setSiblingJobs([])
      }
    } catch {
      setSiblingJobs([])
    }
  }, [])

  // ─── Fabric Issue dialog (Phase 4) ────────────────────────────────
  const openFabricIssue = (job: ProductionJob) => {
    setFabricIssueJob({
      ...job,
      color: job.color ?? null,
      _image: job._image ?? null,
    })
  }

  const handleFabricIssued = useCallback(async () => {
    fetchData()
    if (fabricIssueJob) {
      try {
        const res = await fetch(`/api/production/${fabricIssueJob.id}`)
        if (res.ok) {
          const updated = await res.json()
          if (selectedJob?.id === fabricIssueJob.id) {
            setSelectedJob((prev) => (prev ? { ...prev, ...updated } : updated))
          }
        }
        fetchStageTracking(fabricIssueJob.id)
      } catch {
        // refresh is best-effort — fetchData above already reloaded the board
      }
    }
  }, [fetchData, fabricIssueJob, selectedJob, fetchStageTracking])

  // ─── Computed ──────────────────────────────────────────────────────────

  // Phase 5a — leaf jobs only for the stat cards (parents are group headers
  // whose values are Σ children; counting both would double-count)
  const leafJobs = (data?.jobs ?? []).filter((j) => (j._childCount ?? 0) === 0)
  const activeJobs = leafJobs.filter((j) => j.status === 'In Progress' || j.status === 'Delayed')
  const overdueCount = leafJobs.filter((j) => isOverdue(j.endDate, j.status)).length
  const todayOutput = leafJobs
    .filter((j) => {
      const today = new Date().toDateString()
      return new Date(j.updatedAt).toDateString() === today && j.completedQty > 0
    })
    .reduce((sum, j) => sum + j.completedQty, 0)

  // Group jobs by stage for kanban (parents sit at their DERIVED stage —
  // GET computes it server-side)
  const stageGroups: Record<string, ProductionJob[]> = {}
  for (const s of PRODUCTION_STAGES) {
    stageGroups[s] = (data?.jobs ?? []).filter((j) => j.stage === s)
  }

  // Color-group helpers for the kanban
  const jobsById = new Map<string, ProductionJob>((data?.jobs ?? []).map((j) => [j.id, j]))
  const childrenOf = (parentId: string) => (data?.jobs ?? []).filter((j) => j.parentJobId === parentId)
  const toggleGroup = (parentId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  }
  const isGroupCollapsed = (parentId: string) => collapsedGroups.has(parentId)

  // Phase 5a — live job count for the Create button: per split item the
  // included rows + 1 group header; other items count as 1 legacy job.
  const orderModeJobCount = selectedOrder
    ? selectedOrder.items.reduce((sum, item) => {
        if (splitByColor && (item.colorBreakdown?.length ?? 0) > 0) {
          const included = (colorMatrix[item.id] || []).filter((r) => r.included)
          return sum + included.length + (included.length > 0 ? 1 : 0)
        }
        return sum + 1
      }, 0)
    : 0

  // ─── Kanban render helpers (Phase 5a) ───────────────────────────────
  // Unified for desktop + mobile: children render indented under their
  // group header (same column) or with a tiny ↳ group chip (other columns);
  // parents render as collapsible group headers. Existing Free/leaf jobs
  // render exactly as before.

  const renderGroupHeader = (parent: ProductionJob, variant: 'desktop' | 'mobile') => {
    const children = childrenOf(parent.id)
    const collapsed = isGroupCollapsed(parent.id)
    const done = parent.completedQty
    const total = parent.targetQty
    const pct = total ? Math.round((done / total) * 100) : 0
    return (
      <div className={`rounded-lg border border-primary/30 bg-primary/5 ${variant === 'mobile' ? 'p-3' : 'p-2.5'}`}>
        <button
          onClick={() => toggleGroup(parent.id)}
          className="w-full flex items-start justify-between gap-1 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {parent._image ? (
              <img src={parent._image} alt={parent.styleNo} className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                <Layers className="h-4 w-4 text-primary/60" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-semibold text-primary">{parent.jobNo}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 ${getStatusColor(parent.status)} flex-shrink-0`}
                >
                  {parent.status === 'In Progress' ? 'IP' : parent.status === 'Delayed' ? 'DL' : parent.status === 'Completed' ? 'OK' : 'CN'}
                </Badge>
              </div>
              <p className="text-[11px] text-foreground mt-0.5 truncate">{parent.styleName}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatNumber(children.length)} color job{children.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            {collapsed ? (
              <Badge className="bg-primary/15 text-primary border-primary/30 text-[9px] px-1.5 py-0">
                +{children.length} jobs
              </Badge>
            ) : null}
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
            />
          </div>
        </button>

        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{formatNumber(done)}/{formatNumber(total)}</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        {/* color chips per child (capped 6) */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {children.slice(0, 6).map((c) => (
            <GroupColorChip key={c.id} color={c.color} qty={c.targetQty} />
          ))}
          {children.length > 6 && (
            <span className="text-[9px] text-muted-foreground">+{children.length - 6}</span>
          )}
        </div>

        <button
          onClick={() => openDetail(parent)}
          className="mt-1.5 text-[10px] text-primary hover:underline"
        >
          Group details
        </button>
      </div>
    )
  }

  const renderJobCard = (
    job: ProductionJob,
    variant: 'desktop' | 'mobile',
    opts: { isChild?: boolean; indent?: boolean; showParentChip?: boolean } = {}
  ) => {
    const childIndent = opts.isChild && opts.indent ? 'ml-2 border-l-2 border-primary/25 pl-2' : ''
    const parentChip =
      opts.isChild && opts.showParentChip && job._parentJobNo ? (
        <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/80 font-mono mt-0.5">
          ↳ group {job._parentJobNo}
        </span>
      ) : null

    if (variant === 'desktop') {
      return (
        <div className={`space-y-1 ${childIndent}`}>
          <button
            onClick={() => openDetail(job)}
            className={`w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50 ${getJobBorderColor(job)}`}
          >
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-2 min-w-0">
                {job._image ? (
                  <img src={job._image} alt={job.styleNo} className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                    <Shirt className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-[11px] font-mono font-semibold text-primary">
                    {job.jobNo}
                  </span>
                  <p className="text-[11px] text-foreground mt-0.5 truncate">{job.styleName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{job.styleNo}</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 ${getStatusColor(job.status)} flex-shrink-0`}
              >
                {job.status === 'In Progress' ? 'IP' : job.status === 'Delayed' ? 'DL' : job.status === 'Completed' ? 'OK' : 'CN'}
              </Badge>
            </div>
            {job.salesOrder && (
              <p className="text-[10px] text-primary/70 mt-0.5 font-mono flex items-center gap-1">
                <ShoppingCart className="h-2.5 w-2.5" />
                {job.salesOrder.orderNo}
                <span className="text-muted-foreground/50">· {job.salesOrder.customer.companyName}</span>
              </p>
            )}
            {parentChip}
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span className="flex items-center gap-1.5">
                  {formatNumber(job.completedQty)}/{formatNumber(job.targetQty)}
                  <ColorBadge color={job.color} />
                </span>
                <span>{Math.round((job.targetQty ? job.completedQty / job.targetQty : 0) * 100)}%</span>
              </div>
              <Progress value={(job.targetQty ? job.completedQty / job.targetQty : 0) * 100} className="h-1.5" />
            </div>
            {job.endDate && (
              <div className="flex items-center justify-between mt-1.5">
                <span className="flex items-center gap-1 text-[10px]">
                  <CalendarDays className="h-2.5 w-2.5" />
                  <span
                    className={
                      isOverdue(job.endDate, job.status)
                        ? 'text-red-400 font-medium'
                        : isNearDue(job.endDate, job.status)
                        ? 'text-amber-400'
                        : 'text-muted-foreground'
                    }
                  >
                    {new Date(job.endDate).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </span>
                {(() => {
                  const dr = daysRemaining(job.endDate)
                  if (dr === null) return null
                  if (isOverdue(job.endDate, job.status)) {
                    return (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px] px-1 py-0 gap-0.5">
                        <AlertTriangle className="h-2 w-2" />
                        {Math.abs(dr)}d late
                      </Badge>
                    )
                  }
                  if (dr <= 3) {
                    return (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[8px] px-1 py-0">
                        {dr}d left
                      </Badge>
                    )
                  }
                  return (
                    <span className="text-[9px] text-muted-foreground">{dr}d left</span>
                  )
                })()}
              </div>
            )}
          </button>
          {job.stage === 'Fabric Issue' && job.status !== 'Cancelled' && (
            <button
              onClick={() => openFabricIssue(job)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              <Scissors className="h-3 w-3" />
              Issue Fabric
            </button>
          )}
        </div>
      )
    }

    // mobile variant
    return (
      <div className={`space-y-1.5 ${childIndent}`}>
        <button
          onClick={() => openDetail(job)}
          className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${getJobBorderColor(job)}`}
        >
          <div className="flex items-center gap-3">
            {job._image ? (
              <img src={job._image} alt={job.styleNo} className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                <Shirt className="h-4 w-4 text-muted-foreground/30" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-primary">{job.jobNo}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 ${getStatusColor(job.status)}`}
                >
                  {job.status}
                </Badge>
              </div>
              <p className="text-xs text-foreground mt-1">{job.styleName}</p>
              <p className="text-[11px] text-muted-foreground">{job.styleNo}</p>
            </div>
          </div>
          {job.salesOrder && (
            <p className="text-[11px] text-primary/70 mt-1 font-mono flex items-center gap-1">
              <ShoppingCart className="h-3 w-3" />
              {job.salesOrder.orderNo}
              <span className="text-muted-foreground/50">· {job.salesOrder.customer.companyName}</span>
            </p>
          )}
          {parentChip}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1.5">
                {formatNumber(job.completedQty)}/{formatNumber(job.targetQty)} pcs
                <ColorBadge color={job.color} />
              </span>
              <span>{Math.round((job.targetQty ? job.completedQty / job.targetQty : 0) * 100)}%</span>
            </div>
            <Progress value={(job.targetQty ? job.completedQty / job.targetQty : 0) * 100} className="h-2" />
          </div>
          {job.endDate && (
            <div className="flex items-center justify-between mt-2">
              <span className="flex items-center gap-1 text-[11px]">
                <CalendarDays className="h-3 w-3" />
                <span
                  className={
                    isOverdue(job.endDate, job.status)
                      ? 'text-red-400 font-medium'
                      : isNearDue(job.endDate, job.status)
                      ? 'text-amber-400'
                      : 'text-muted-foreground'
                  }
                >
                  {new Date(job.endDate).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </span>
              {(() => {
                const dr = daysRemaining(job.endDate)
                if (dr === null) return null
                if (isOverdue(job.endDate, job.status)) {
                  return (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] px-1.5 py-0 gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {Math.abs(dr)}d late
                    </Badge>
                  )
                }
                if (dr <= 3) {
                  return (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0">
                      {dr}d left
                    </Badge>
                  )
                }
                return (
                  <span className="text-[10px] text-muted-foreground">{dr}d left</span>
                )
              })()}
            </div>
          )}
        </button>
        {job.stage === 'Fabric Issue' && job.status !== 'Cancelled' && (
          <button
            onClick={() => openFabricIssue(job)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <Scissors className="h-3.5 w-3.5" />
            Issue Fabric
          </button>
        )}
      </div>
    )
  }

  // One stage column's job list: parents → collapsible group headers (with
  // same-column children indented under them), children → indented / chip'd
  // (hidden while the group is collapsed), leaf jobs → plain cards.
  const renderStageJobList = (jobsInStage: ProductionJob[], variant: 'desktop' | 'mobile') => {
    return jobsInStage.map((job) => {
      if ((job._childCount ?? 0) > 0) {
        const children = childrenOf(job.id)
        const collapsed = isGroupCollapsed(job.id)
        const sameStageChildren = children.filter((c) => c.stage === job.stage)
        return (
          <div key={job.id} className="space-y-2">
            {renderGroupHeader(job, variant)}
            {!collapsed &&
              sameStageChildren.map((c) =>
                renderJobCard(c, variant, { isChild: true, indent: true })
              )}
          </div>
        )
      }
      if (job.parentJobId) {
        const parent = jobsById.get(job.parentJobId)
        if (parent && isGroupCollapsed(parent.id)) return null // hidden while collapsed
        if (parent && parent.stage === job.stage) return null // rendered under its group header
        return (
          <div key={job.id}>
            {renderJobCard(job, variant, { isChild: true, showParentChip: true })}
          </div>
        )
      }
      return <div key={job.id}>{renderJobCard(job, variant)}</div>
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Factory className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold lg:text-2xl">Production</h1>
            <p className="text-xs text-muted-foreground">
              {data ? `${formatNumber(activeJobs.length)} active jobs` : 'Loading...'}
            </p>
          </div>
        </div>

        <ExportButton module="production" />
        <Dialog open={newJobOpen} onOpenChange={setNewJobOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNewJobDialog}>
                <Plus className="h-4 w-4" />
                New Job
              </Button>
            </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create Production Job</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button
                  onClick={() => setCreateMode('order')}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    createMode === 'order'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  From Sales Order
                </button>
                <button
                  onClick={() => setCreateMode('manual')}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    createMode === 'manual'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Manual Entry
                </button>
              </div>

              {createMode === 'order' ? (
                <>
                  {/* Order selection */}
                  {!selectedOrderId ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Select a sales order to start production. Only confirmed/pending orders not yet in production are shown.
                      </p>
                      {eligibleLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : eligibleOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <ShoppingCart className="h-8 w-8 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">No orders eligible for production</p>
                          <p className="text-xs text-muted-foreground/70">Create and confirm a sales order first</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                          {eligibleOrders.map((order) => (
                            <button
                              key={order.id}
                              onClick={() => selectOrder(order.id)}
                              className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-mono font-semibold text-primary">{order.orderNo}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(order.orderDate).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-foreground font-medium">{order.customer.companyName}</span>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[11px] text-muted-foreground">
                                  {order.items.length} item{order.items.length > 1 ? 's' : ''} · ₹{formatNumber(order.totalAmount)}
                                </span>
                                {order.deliveryDate && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Clock className="h-2.5 w-2.5" />
                                    Due {new Date(order.deliveryDate).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                    })}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    selectedOrder ? (
                    <>
                      {/* Selected order details */}
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-mono font-semibold text-primary">{selectedOrder.orderNo}</span>
                            <span className="text-xs text-muted-foreground ml-2">{selectedOrder.customer.companyName}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => { setSelectedOrderId(null); setSelectedOrder(null); setColorMatrix({}) }}
                          >
                            Change
                          </Button>
                        </div>
                      </div>

                      {/* Phase 5a — Split by color toggle (shown only when the
                          order's items carry a color breakdown) */}
                      {selectedOrder.items.some((it) => (it.colorBreakdown?.length ?? 0) > 0) && (
                        <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 p-3">
                          <div className="flex items-center gap-2">
                            <Palette className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-foreground">Split by color</p>
                              <p className="text-[10px] text-muted-foreground">
                                One child job per color, grouped under a parent job
                              </p>
                            </div>
                          </div>
                          <Switch checked={splitByColor} onCheckedChange={setSplitByColor} />
                        </div>
                      )}

                      {/* Start Date */}
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Start Date</Label>
                          <Input
                            type="date"
                            value={jobStartDate}
                            onChange={(e) => setJobStartDate(e.target.value)}
                            className="h-8 bg-muted/50 border-border text-xs mt-1"
                          />
                        </div>
                      </div>

                      {/* Items with due dates */}
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-foreground">
                          Production Items & End Date
                        </p>
                        <p className="text-[11px] text-muted-foreground -mt-2">
                          Set due date for each item. Jobs will be created with the order&apos;s delivery date as default.
                        </p>
                        {selectedOrder.items.map((item) => {
                          const styleKey = item.style?.styleNo || item.styleName
                          return (
                            <div
                              key={item.id}
                              className="rounded-lg border border-border p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-medium text-foreground">{item.styleName}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {item.style?.styleNo || '—'} · {item.style?.category || '—'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-foreground">{formatNumber(item.quantity)} pcs</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    ₹{formatNumber(item.quantity * item.unitPrice)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <Input
                                  type="date"
                                  value={jobDueDates[styleKey] || ''}
                                  onChange={(e) =>
                                    setJobDueDates((prev) => ({ ...prev, [styleKey]: e.target.value }))
                                  }
                                  className="h-8 bg-muted/50 border-border text-xs"
                                />
                              </div>

                              {/* Phase 5a — COLOR MATRIX: one editable row per
                                  OrderItemColor (prefilled from colorBreakdown).
                                  Shown while "Split by color" is ON. */}
                              {splitByColor && (item.colorBreakdown?.length ?? 0) > 0 && (
                                <div className="rounded-lg border border-border/70 bg-muted/30 p-2 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                                      Color split
                                    </p>
                                    {(() => {
                                      const rows = colorMatrix[item.id] || []
                                      const includedQty = rows
                                        .filter((r) => r.included)
                                        .reduce((s, r) => s + (Number(r.quantity) || 0), 0)
                                      const mismatch = includedQty !== item.quantity
                                      return (
                                        <span className={`text-[10px] tabular-nums ${mismatch ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}`}>
                                          Σ {formatNumber(includedQty)} / {formatNumber(item.quantity)}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                  {(colorMatrix[item.id] || []).map((row, idx) => (
                                    <div key={row.orderItemColorId || idx} className="flex items-center gap-1.5">
                                      <Checkbox
                                        checked={row.included}
                                        onCheckedChange={(v) =>
                                          updateMatrixRow(item.id, idx, { included: v === true })
                                        }
                                        className="h-3.5 w-3.5 shrink-0"
                                      />
                                      <ColorBadge color={row.color} className="shrink-0" />
                                      <Input
                                        value={row.color}
                                        onChange={(e) =>
                                          updateMatrixRow(item.id, idx, { color: e.target.value })
                                        }
                                        className="h-7 bg-muted/50 border-border text-xs flex-1 min-w-0"
                                        placeholder="Color"
                                      />
                                      {row.size && row.size !== '-' && (
                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border text-muted-foreground shrink-0">
                                          {row.size}
                                        </Badge>
                                      )}
                                      <Input
                                        type="number"
                                        value={row.quantity}
                                        onChange={(e) =>
                                          updateMatrixRow(item.id, idx, { quantity: e.target.value })
                                        }
                                        className="h-7 bg-muted/50 border-border text-xs w-16 shrink-0"
                                        min={0}
                                      />
                                    </div>
                                  ))}
                                  {(() => {
                                    const rows = colorMatrix[item.id] || []
                                    const includedQty = rows
                                      .filter((r) => r.included)
                                      .reduce((s, r) => s + (Number(r.quantity) || 0), 0)
                                    if (includedQty === item.quantity) return null
                                    return (
                                      <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Σ colors ({formatNumber(includedQty)}) ≠ ordered ({formatNumber(item.quantity)})
                                      </p>
                                    )
                                  })()}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : null)}
                </>
              ) : (
                /* Manual entry mode */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Style No * <span className="text-[10px] text-muted-foreground/70">(select from catalog)</span></Label>
                      <Select
                        value={manualJob.styleNo}
                        onValueChange={(v) => {
                          const p = catalogProducts.find(p => p.styleNo === v)
                          setManualJob({
                            ...manualJob,
                            styleNo: v,
                            styleName: p?.styleName || manualJob.styleName,
                          })
                        }}
                      >
                        <SelectTrigger className="bg-muted/50 border-border">
                          <SelectValue placeholder="Select product from catalog..." />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogProducts.map((p) => (
                            <SelectItem key={p.id} value={p.styleNo}>
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{p.styleNo}</span>
                                <span className="text-muted-foreground text-[10px]">{p.styleName}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Allow manual override if product not in catalog */}
                      <Input
                        placeholder="...or type a custom style no"
                        value={manualJob.styleNo}
                        onChange={(e) => setManualJob({ ...manualJob, styleNo: e.target.value })}
                        className="bg-muted/50 border-border text-xs h-7"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Target Qty *</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 100"
                        value={manualJob.targetQty}
                        onChange={(e) => setManualJob({ ...manualJob, targetQty: e.target.value })}
                        className="bg-muted/50 border-border"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Style Name *</Label>
                    <Input
                      placeholder="e.g. Anarkali Kurta - Emerald"
                      value={manualJob.styleName}
                      onChange={(e) => setManualJob({ ...manualJob, styleName: e.target.value })}
                      className="bg-muted/50 border-border"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Color <span className="text-[10px] text-muted-foreground/70">— optional</span>
                      </Label>
                      <Input
                        placeholder="e.g. Red"
                        value={manualJob.color}
                        onChange={(e) => setManualJob({ ...manualJob, color: e.target.value })}
                        className="bg-muted/50 border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Preview</Label>
                      <div className="h-9 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3">
                        {manualJob.color.trim().toLowerCase() === 'free' || !manualJob.color.trim() ? (
                          <span className="text-xs text-muted-foreground">Free (no color)</span>
                        ) : (
                          <>
                            <ColorBadge color={manualJob.color} />
                            <span className="text-[10px] text-muted-foreground">color job</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Start Date</Label>
                      <Input
                        type="date"
                        value={jobStartDate}
                        onChange={(e) => setJobStartDate(e.target.value)}
                        className="bg-muted/50 border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">End Date</Label>
                      <Input
                        type="date"
                        value={manualJob.endDate}
                        onChange={(e) => setManualJob({ ...manualJob, endDate: e.target.value })}
                        className="bg-muted/50 border-border"
                      />
                    </div>
                  </div>

                  {/* Fabric auto-suggest from available stock (NEW) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Fabric (from stock) <span className="text-[10px] text-muted-foreground/70">— auto-suggest</span>
                      </Label>
                      <Select
                        value={manualJob.fabricStockId}
                        onValueChange={(v) => setManualJob({ ...manualJob, fabricStockId: v })}
                      >
                        <SelectTrigger className="bg-muted/50 border-border">
                          <SelectValue placeholder={fabricStocks.length > 0 ? 'Select fabric from stock...' : 'No fabric in stock'} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {fabricStocks.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              <span className="flex flex-col">
                                <span className="font-medium text-xs">
                                  {f.fabricName}
                                  {f.color && <span className="text-muted-foreground"> · {f.color}</span>}
                                  {f.lotNumber && <span className="text-muted-foreground/70 text-[10px]"> · Lot {f.lotNumber}</span>}
                                </span>
                                <span className="text-[10px] text-emerald-500">
                                  {f.availableMeters}m available · ₹{f.averageCost}/m
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Planned Fabric (meters)</Label>
                      <Input
                        type="number"
                        placeholder="auto-calculated"
                        value={manualJob.plannedFabricMeters}
                        onChange={(e) => setManualJob({ ...manualJob, plannedFabricMeters: e.target.value })}
                        className="bg-muted/50 border-border"
                        min={0}
                      />
                      {(() => {
                        const selected = fabricStocks.find((f) => f.id === manualJob.fabricStockId)
                        if (!selected) return null
                        const planned = parseFloat(manualJob.plannedFabricMeters) || 0
                        if (planned > selected.availableMeters) {
                          return (
                            <p className="text-[10px] text-amber-500">
                              ⚠ Planned ({planned}m) exceeds available ({selected.availableMeters}m)
                            </p>
                          )
                        }
                        return (
                          <p className="text-[10px] text-muted-foreground">
                            Will reserve {planned || 0}m of {selected.availableMeters}m available
                          </p>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Consumption per piece + auto-calc helper (NEW) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Fabric / Piece (m)</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 2.5"
                        value={manualJob.consumptionPerPiece}
                        onChange={(e) => setManualJob({ ...manualJob, consumptionPerPiece: e.target.value })}
                        className="bg-muted/50 border-border"
                        min={0}
                        step={0.1}
                      />
                      <p className="text-[10px] text-muted-foreground/70">
                        Meters of fabric needed per garment (auto-calculates planned fabric)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Auto-Calc</Label>
                      <div className="h-9 flex items-center px-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                        {(() => {
                          const qty = parseFloat(manualJob.targetQty) || 0
                          const perPiece = parseFloat(manualJob.consumptionPerPiece) || 0
                          if (qty > 0 && perPiece > 0) {
                            return `${qty} pcs × ${perPiece}m = ${Math.round(qty * perPiece * 100) / 100}m`
                          }
                          return 'Enter qty + fabric/piece'
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setNewJobOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleCreateJob}
                  disabled={
                    saving ||
                    (createMode === 'order' && !selectedOrderId) ||
                    (createMode === 'manual' && (!manualJob.styleNo || !manualJob.styleName || !manualJob.targetQty))
                  }
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {createMode === 'order'
                    ? `Create ${orderModeJobCount} Job${orderModeJobCount > 1 ? 's' : ''}`
                    : 'Create Job'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Bar */}
      {!loading && data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="glass-card border-border">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Active Jobs</span>
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(activeJobs.length)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Today&apos;s Output</span>
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(todayOutput)} pcs</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Jobs</span>
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(leafJobs.length)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-xs text-muted-foreground">Overdue</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl font-bold text-foreground">{overdueCount}</p>
                {overdueCount > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">
                    !
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stage distribution mini bar */}
      {!loading && data && (
        <div className="glass-card border-border rounded-xl p-3 lg:p-4">
          <p className="text-xs text-muted-foreground mb-2">Jobs by Stage</p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/50">
            {PRODUCTION_STAGES.map((stage, idx) => {
              const count = data.stageCounts[stage] || 0
              if (count === 0) return null
              const total = Object.values(data.stageCounts).reduce((a, b) => a + b, 0)
              const pct = (count / total) * 100
              const colors = [
                'bg-violet-500',
                'bg-sky-500',
                'bg-rose-500',
                'bg-amber-500',
                'bg-emerald-500',
                'bg-cyan-500',
                'bg-primary',
                'bg-orange-500',
                'bg-teal-500',
                'bg-lime-500',
              ]
              return (
                <div
                  key={stage}
                  className={`${colors[idx]} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${stage}: ${count}`}
                />
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {PRODUCTION_STAGES.map((stage, idx) => {
              const count = data.stageCounts[stage] || 0
              if (count === 0) return null
              const colors = [
                'bg-violet-500',
                'bg-sky-500',
                'bg-rose-500',
                'bg-amber-500',
                'bg-emerald-500',
                'bg-cyan-500',
                'bg-primary',
                'bg-orange-500',
                'bg-teal-500',
                'bg-lime-500',
              ]
              return (
                <span key={stage} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className={`inline-block h-2 w-2 rounded-full ${colors[idx]}`} />
                  {stage} ({count})
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {['all', 'In Progress', 'Delayed', 'Completed', 'Cancelled'].map((s) => {
            const isActive = statusFilter === s
            const label = s === 'all' ? 'All' : s
            const count =
              s === 'all'
                ? data?.total ?? 0
                : (data?.statusCounts[s] ?? 0)
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-40 bg-muted/50 border-border text-xs lg:w-56"
          />
          {/* Stage filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-36 bg-muted/50 border-border text-xs">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Stages</SelectItem>
              {PRODUCTION_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content: Kanban (desktop) / Vertical (mobile) */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : !data || data.jobs.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
            <Factory className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== 'all' || stageFilter !== 'all'
              ? 'No jobs match the current filters'
              : 'No production jobs yet'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: Horizontal Kanban */}
          <div className="hidden md:block">
            <div className="flex gap-3 overflow-x-auto pb-4">
              {PRODUCTION_STAGES.map((stage) => {
                const jobs = stageGroups[stage] ?? []
                const stageIdx = PRODUCTION_STAGES.indexOf(stage)
                const stageColors = [
                  'border-violet-500/30',
                  'border-sky-500/30',
                  'border-rose-500/30',
                  'border-amber-500/30',
                  'border-emerald-500/30',
                  'border-cyan-500/30',
                  'border-primary/30',
                  'border-orange-500/30',
                  'border-teal-500/30',
                  'border-lime-500/30',
                ]
                const stageIconColors = [
                  'text-violet-400',
                  'text-sky-400',
                  'text-rose-400',
                  'text-amber-400',
                  'text-emerald-400',
                  'text-cyan-400',
                  'text-primary',
                  'text-orange-400',
                  'text-teal-400',
                  'text-lime-400',
                ]

                return (
                  <div
                    key={stage}
                    className="glass-card min-w-[200px] max-w-[220px] flex-shrink-0 rounded-xl border-border p-3"
                  >
                    {/* Stage header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${stageIconColors[stageIdx]}`}>
                          {stageIdx + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                          {stage}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${stageColors[stageIdx]}`}
                      >
                        {jobs.length}
                      </Badge>
                    </div>

                    {/* Job list */}
                    <div className="space-y-2 max-h-[420px] overflow-y-auto">
                      {renderStageJobList(jobs, 'desktop')}
                      {jobs.length === 0 && (
                        <p className="text-[10px] text-muted-foreground text-center py-4">No jobs</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Mobile: Vertical stage list */}
          <div className="md:hidden space-y-3">
            {/* Stage navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileStageIdx((i) => Math.max(0, i - 1))}
                disabled={mobileStageIdx === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-1.5">
                  {PRODUCTION_STAGES.map((stage, idx) => {
                    const count = stageGroups[stage]?.length ?? 0
                    return (
                      <button
                        key={stage}
                        onClick={() => setMobileStageIdx(idx)}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                          mobileStageIdx === idx
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        {stage}
                        <span className="rounded-full bg-black/10 px-1 py-0 text-[9px]">
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <button
                onClick={() => setMobileStageIdx((i) => Math.min(PRODUCTION_STAGES.length - 1, i + 1))}
                disabled={mobileStageIdx === PRODUCTION_STAGES.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Stage jobs */}
            <div className="glass-card border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-foreground">
                  {PRODUCTION_STAGES[mobileStageIdx]}
                </h3>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                  {stageGroups[PRODUCTION_STAGES[mobileStageIdx]]?.length ?? 0} jobs
                </Badge>
              </div>
              {renderStageJobList(stageGroups[PRODUCTION_STAGES[mobileStageIdx]] ?? [], 'mobile')}
              {(stageGroups[PRODUCTION_STAGES[mobileStageIdx]] ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No jobs in this stage</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Job Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="glass-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedJob && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {selectedJob._image ? (
                    <img src={selectedJob._image} alt={selectedJob.styleNo} className="h-20 w-20 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted flex-shrink-0">
                      <Shirt className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <DialogTitle className="text-lg text-foreground">
                          {selectedJob.jobNo}
                        </DialogTitle>
                        <ColorBadge color={selectedJob.color} />
                        {(selectedJob._childCount ?? 0) > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary shrink-0">
                            <Layers className="h-2.5 w-2.5 mr-0.5" />
                            Group
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className={`${getStatusColor(selectedJob.status)} text-xs flex-shrink-0`}>
                    {selectedJob.status}
                  </Badge>
                </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{selectedJob.styleName}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Job info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Style No</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{selectedJob.styleNo}</p>
                    {isColorJob(selectedJob.color) && (
                      <p className="mt-1 flex items-center gap-1.5">
                        <ColorBadge color={selectedJob.color} />
                        <span className="text-[10px] text-muted-foreground">color job</span>
                      </p>
                    )}
                  </div>
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Linked Order</p>
                    {selectedJob.salesOrder ? (
                      <div className="mt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-primary font-mono">
                            {selectedJob.salesOrder.orderNo}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">
                            {selectedJob.salesOrder.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {selectedJob.salesOrder.customer.companyName}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground mt-0.5">— (Manual Job)</p>
                    )}
                  </div>
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Target Qty</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">
                      {formatNumber(selectedJob.targetQty)} pcs
                    </p>
                  </div>
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Completed Qty</p>
                    {editQtyId === selectedJob.id ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Input
                          type="number"
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          className="h-7 w-20 bg-muted/50 border-border text-sm"
                          min={0}
                          max={selectedJob.targetQty}
                        />
                        <Button
                          size="sm"
                          className="h-7 bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-2"
                          onClick={() => handleSaveQty(selectedJob.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-1"
                          onClick={() => setEditQtyId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if ((selectedJob._childCount ?? 0) > 0) return
                          setEditQtyId(selectedJob.id)
                          setEditQty(String(selectedJob.completedQty))
                        }}
                        className="flex items-center gap-1 mt-0.5 group"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {formatNumber(selectedJob.completedQty)} pcs
                        </p>
                        {(selectedJob._childCount ?? 0) === 0 && (
                          <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            edit
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Due date */}
                <div className="glass-card border-border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Due Date</p>
                        <p
                          className={`text-sm font-semibold mt-0.5 ${
                            isOverdue(selectedJob.endDate, selectedJob.status)
                              ? 'text-red-400'
                              : isNearDue(selectedJob.endDate, selectedJob.status)
                              ? 'text-amber-400'
                              : 'text-foreground'
                          }`}
                        >
                          {selectedJob.endDate
                            ? new Date(selectedJob.endDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Not set'}
                          {isOverdue(selectedJob.endDate, selectedJob.status) && (
                            <span className="ml-2 text-xs"> (Overdue by {Math.abs(daysRemaining(selectedJob.endDate))}d)</span>
                          )}
                          {isNearDue(selectedJob.endDate, selectedJob.status) &&
                            !isOverdue(selectedJob.endDate, selectedJob.status) && (
                              <span className="ml-2 text-xs"> ({daysRemaining(selectedJob.endDate)}d left)</span>
                            )}
                          {!isOverdue(selectedJob.endDate, selectedJob.status) &&
                            !isNearDue(selectedJob.endDate, selectedJob.status) &&
                            daysRemaining(selectedJob.endDate) !== null &&
                            selectedJob.status !== 'Completed' && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({daysRemaining(selectedJob.endDate)}d left)
                              </span>
                            )}
                        </p>
                      </div>
                    </div>
                    {selectedJob.salesOrder?.customer && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Customer</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {selectedJob.salesOrder.customer.companyName}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Phase 5a — COLOR GROUP JOBS: child job → clickable sibling
                    rows (switches the dialog); parent → children list */}
                {siblingJobs.length > 0 && (
                  <div className="glass-card border-border rounded-lg p-3 space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {(selectedJob._childCount ?? 0) > 0
                        ? `Color group header — ${siblingJobs.length} child job${siblingJobs.length !== 1 ? 's' : ''}`
                        : 'Color group jobs'}
                    </p>
                    <div className="space-y-1">
                      {siblingJobs.map((sib) => {
                        const isCurrent = sib.id === selectedJob.id
                        return (
                          <button
                            key={sib.id}
                            onClick={() => { if (!isCurrent) openDetail(sib) }}
                            className={`w-full flex items-center justify-between gap-2 rounded-lg border p-2 text-left transition-colors ${
                              isCurrent
                                ? 'border-primary/40 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/50 hover:border-primary/30'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-mono font-semibold text-primary truncate">{sib.jobNo}</span>
                              <ColorBadge color={sib.color} />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {formatNumber(sib.completedQty)}/{formatNumber(sib.targetQty)} · {sib.stage}
                              </span>
                              <Badge variant="outline" className={`text-[8px] px-1 py-0 ${getStatusColor(sib.status)}`}>
                                {sib.status === 'In Progress' ? 'IP' : sib.status === 'Delayed' ? 'DL' : sib.status === 'Completed' ? 'OK' : 'CN'}
                              </Badge>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {(selectedJob._childCount ?? 0) > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Group values are derived (Σ children). Actions live on the child jobs.
                      </p>
                    )}
                  </div>
                )}

                <Separator className="bg-border" />

                {/* 10-Stage Progress with Tracking */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground font-medium">Production Pipeline</p>
                    {stageTrackings.some((s) => s.locationType === 'Outsourced') && (
                      <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-[9px] px-1.5 py-0">
                        <Handshake className="h-2.5 w-2.5 mr-1" />
                        Outsourced stages
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {PRODUCTION_STAGES.map((stage, idx) => {
                      const currentIdx = getStageIndex(selectedJob.stage)
                      const isCurrent = idx === currentIdx
                      const isPast = idx < currentIdx
                      // Phase 5b — a stage can carry N split rows: aggregate
                      // them for the pipeline display (Σ qtys / Σ amount,
                      // distinct vendor names, distinct colors, split count)
                      const stageRows = stageTrackings.filter((s) => s.stageName === stage)
                      const tracking = stageRows[0]
                      const multiSplit = stageRows.length > 1
                      const outsourcedRows = stageRows.filter((r) => r.locationType === 'Outsourced')
                      const isOutsourcedStage = outsourcedRows.length > 0
                      const distinctVendors = Array.from(
                        new Set(outsourcedRows.map((r) => r.vendor?.vendorName).filter((n): n is string => !!n))
                      )
                      const stageColors = Array.from(
                        new Set(stageRows.map((r) => r.color).filter((c) => isColorJob(c)))
                      )
                      const sumSent = stageRows.reduce((s, r) => s + (r.sentQty || 0), 0)
                      const sumReceived = stageRows.reduce((s, r) => s + (r.receivedQty || 0), 0)
                      const sumDefective = stageRows.reduce((s, r) => s + (r.defectiveQty || 0), 0)
                      const sumAmount = stageRows.reduce((s, r) => s + (r.totalAmount || 0), 0)
                      const anySentOut = stageRows.some((r) => r.status === 'Sent Out')
                      const latestExpectedReturn = stageRows
                        .map((r) => r.expectedReturnDate)
                        .filter((d): d is string => !!d)
                        .sort()
                        .pop()
                      const anyBilled = stageRows.some((r) => r.hasBills)

                      return (
                        <button
                          key={stage}
                          onClick={() => stageRows.length > 0 && openStageEdit(stage)}
                          className="w-full flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/30 text-left group"
                        >
                          {/* Node */}
                          <div className="relative flex flex-col items-center shrink-0">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                                isCurrent
                                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                                  : isPast
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-muted/50 text-muted-foreground border border-border'
                              }`}
                            >
                              {isPast ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            {idx < PRODUCTION_STAGES.length - 1 && (
                              <div
                                className={`w-0.5 h-5 ${
                                  isPast ? 'bg-emerald-500/40' : 'bg-border'
                                }`}
                              />
                            )}
                          </div>

                          {/* Label + Tracking Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs ${
                                  isCurrent
                                    ? 'text-primary font-bold'
                                    : isPast
                                    ? 'text-emerald-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {stage}
                              </span>
                              {multiSplit && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
                                  {stageRows.length} splits
                                </Badge>
                              )}
                              {isOutsourcedStage && (
                                <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-[8px] px-1 py-0 shrink-0">
                                  <Building2 className="h-2 w-2 mr-0.5" />
                                  {distinctVendors[0] || 'Outsourced'}
                                  {distinctVendors.length > 1 ? ` +${distinctVendors.length - 1}` : ''}
                                </Badge>
                              )}
                              {!isOutsourcedStage && tracking?.locationType === 'In-House' && !isPast && !isCurrent && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-500/30 text-emerald-400 shrink-0">
                                  In-House
                                </Badge>
                              )}
                              {anyBilled && (
                                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[8px] px-1 py-0 shrink-0 gap-0.5">
                                  <Lock className="h-2 w-2" />
                                  Billed
                                </Badge>
                              )}
                              {stageColors.slice(0, 4).map((c) => (
                                <ColorBadge key={c} color={c} />
                              ))}
                              {stageColors.length > 4 && (
                                <span className="text-[9px] text-muted-foreground">+{stageColors.length - 4}</span>
                              )}
                            </div>
                            {/* Outsourced tracking info (aggregated across splits) */}
                            {isOutsourcedStage && (sumSent > 0 || sumReceived > 0 || sumAmount > 0) && (
                              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                                {anySentOut && sumSent > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <Send className="h-2.5 w-2.5" />
                                    Sent {formatNumber(sumSent)}
                                    {latestExpectedReturn && (
                                      <> · Exp {new Date(latestExpectedReturn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</>
                                    )}
                                  </span>
                                )}
                                {sumReceived > 0 && (
                                  <span className="flex items-center gap-0.5 text-emerald-400">
                                    <ArrowDownLeft className="h-2.5 w-2.5" />
                                    Received {formatNumber(sumReceived)}
                                    {sumDefective > 0 && (
                                      <span className="text-red-400 ml-1">({formatNumber(sumDefective)} defect)</span>
                                    )}
                                  </span>
                                )}
                                {sumAmount > 0 && (
                                  <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                                    ₹{new Intl.NumberFormat('en-IN').format(Math.round(sumAmount))}
                                    {tracking?.perPieceRate > 0 && !multiSplit && (
                                      <span className="text-muted-foreground font-normal ml-0.5">
                                        @{tracking.perPieceRate}/pc
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right side */}
                          <div className="flex items-center gap-1 shrink-0">
                            {isCurrent && (
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1.5 py-0">
                                Current
                              </Badge>
                            )}
                            {stageRows.length > 0 && (
                              <Edit3 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-semibold text-foreground">
                      {Math.round((selectedJob.targetQty ? selectedJob.completedQty / selectedJob.targetQty : 0) * 100)}%
                    </span>
                  </div>
                  <Progress value={(selectedJob.targetQty ? selectedJob.completedQty / selectedJob.targetQty : 0) * 100} className="h-3" />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatNumber(selectedJob.completedQty)} of {formatNumber(selectedJob.targetQty)} pieces completed
                  </p>
                </div>

                {/* Action buttons — hidden for color-group headers (their
                    values are derived; actions live on leaf jobs) */}
                {selectedJob.status !== 'Completed' && selectedJob.status !== 'Cancelled' && (selectedJob._childCount ?? 0) === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.stage === 'Fabric Issue' && (
                      <Button
                        className="gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90"
                        onClick={() => openFabricIssue(selectedJob)}
                      >
                        <Scissors className="h-3.5 w-3.5" />
                        Issue Fabric
                      </Button>
                    )}
                    {getStageIndex(selectedJob.stage) < PRODUCTION_STAGES.length - 1 && (
                      <Button
                        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => handleAdvanceStage(selectedJob.id)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Advance to {PRODUCTION_STAGES[getStageIndex(selectedJob.stage) + 1]}
                      </Button>
                    )}
                    {getStageIndex(selectedJob.stage) === PRODUCTION_STAGES.length - 1 && selectedJob.status !== 'Completed' && (
                      <Button
                        className="gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90"
                        onClick={() => handleAdvanceStage(selectedJob.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark Dispatched
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => handleUpdateStatus(selectedJob.id, 'Completed')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Complete
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      onClick={() => handleUpdateStatus(selectedJob.id, 'Delayed')}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Mark Delayed
                    </Button>
                    {(selectedJob.stage === 'Dispatch Ready' || selectedJob.stage === 'Dispatched') && (
                      <Button
                        variant="outline"
                        className="gap-2 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                        onClick={() => {
                          // Phase 6 — hand the order/customer to the dispatch
                          // module (sessionStorage 'dispatch-prefill') so its
                          // create dialog auto-selects this job's order.
                          try {
                            if (selectedJob.salesOrderId) {
                              sessionStorage.setItem(
                                'dispatch-prefill',
                                JSON.stringify({
                                  salesOrderId: selectedJob.salesOrderId,
                                  customerId: selectedJob.salesOrder?.customer?.id || null,
                                }),
                              )
                            }
                          } catch { /* storage unavailable — plain navigation */ }
                          setDetailOpen(false)
                          useDashboardStore.getState().setActiveView('dispatch')
                        }}
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Create Delivery Challan
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Stage SPLITS Dialog (Phase 5b — one stage, N vendor/color splits) */}
      <Dialog open={stageEditOpen} onOpenChange={setStageEditOpen}>
        <DialogContent className="glass-card border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {editingStageName && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  <span className="text-primary">{editingStageName}</span> — Stage Splits
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedJob?.jobNo} · {formatNumber(selectedJob?.targetQty || 0)} pcs target ·{' '}
                  {isColorJob(selectedJob?.color) ? 'Color ' : ''}
                  {selectedJob?.color || '—'}
                  {' '}· Split this stage across multiple vendors and colors (e.g. Cutting me Red
                  vendor A ko, Maroon vendor B ko).
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {/* Split rows — one card per vendor/color split */}
                {stageSplits.map((split, idx) => {
                  const derivedStatus = split.receivedDate
                    ? 'Completed'
                    : split.sentDate
                    ? 'Sent Out'
                    : 'In Progress'
                  const rowTotal = (Number(split.receivedQty) || 0) * (Number(split.perPieceRate) || 0)
                  return (
                    <div
                      key={split.id || `new-split-${idx}`}
                      className="rounded-lg border border-border bg-muted/10 p-3 space-y-3"
                    >
                      {/* Split header: number + vendor + color + billed lock + actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                            #{idx + 1}
                          </span>
                          {split.locationType === 'Outsourced' ? (
                            <span className="text-xs font-medium truncate max-w-[160px]">
                              {vendors.find((v) => v.id === split.vendorId)?.vendorName || 'No vendor selected'}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">In-House</span>
                          )}
                          <ColorBadge color={split.color} />
                          <Badge
                            variant="outline"
                            className={`text-[8px] px-1 py-0 shrink-0 ${
                              derivedStatus === 'Completed'
                                ? 'border-emerald-500/30 text-emerald-400'
                                : derivedStatus === 'Sent Out'
                                ? 'border-orange-500/30 text-orange-400'
                                : 'border-border text-muted-foreground'
                            }`}
                          >
                            {derivedStatus}
                          </Badge>
                          {split.hasBills && (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0 gap-1 shrink-0">
                              <Lock className="h-2.5 w-2.5" />
                              Billed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {split.id && split.locationType === 'Outsourced' && !split.hasBills && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px] gap-1"
                              disabled={savingSplits}
                              onClick={() => handleBillSplit(idx)}
                              title="Raise a vendor bill for this split"
                            >
                              <FileText className="h-3 w-3" />
                              Bill
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={split.hasBills || savingSplits}
                            title={
                              split.hasBills
                                ? 'This split has vendor bills — cancel them first'
                                : 'Remove split'
                            }
                            onClick={() => removeSplit(idx)}
                          >
                            {split.hasBills ? (
                              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Location toggle */}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={split.locationType === 'In-House' ? 'default' : 'outline'}
                          className={`flex-1 text-xs h-8 ${split.locationType !== 'In-House' ? 'border-border' : ''}`}
                          onClick={() => updateSplit(idx, { locationType: 'In-House', vendorId: '' })}
                        >
                          <Factory className="h-3.5 w-3.5 mr-1" />
                          In-House
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={split.locationType === 'Outsourced' ? 'default' : 'outline'}
                          className={`flex-1 text-xs h-8 ${split.locationType !== 'Outsourced' ? 'border-border' : ''}`}
                          onClick={() => updateSplit(idx, { locationType: 'Outsourced' })}
                        >
                          <Handshake className="h-3.5 w-3.5 mr-1" />
                          Outsourced
                        </Button>
                      </div>

                      {/* Color + vendor */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Color</Label>
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={split.color}
                              onChange={(e) => updateSplit(idx, { color: e.target.value })}
                              placeholder={
                                isColorJob(selectedJob?.color)
                                  ? (selectedJob?.color as string)
                                  : 'e.g. Red'
                              }
                              className="h-8 bg-muted/50 border-border text-xs flex-1"
                            />
                            <ColorBadge color={split.color} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Vendor / Supplier</Label>
                          {split.locationType === 'Outsourced' ? (
                            vendors.length > 0 ? (
                              <Select
                                value={split.vendorId}
                                onValueChange={(v) => updateSplit(idx, { vendorId: v })}
                              >
                                <SelectTrigger className="bg-muted/50 border-border text-xs h-8">
                                  <SelectValue placeholder="Select vendor or supplier..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                  {vendors.map((v) => (
                                    <SelectItem key={`${v.kind}-${v.id}`} value={v.id} className="text-xs">
                                      <span className="flex items-center gap-1.5">
                                        <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                                          v.kind === 'Supplier'
                                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                            : 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                                        }`}>
                                          {v.kind === 'Supplier' ? 'SUP' : 'VEN'}
                                        </span>
                                        <span className="font-medium">{v.vendorName}</span>
                                        <span className="text-muted-foreground text-[10px]">({v.type})</span>
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2 border border-border">
                                No vendors/suppliers yet — add them in the Vendors section.
                              </p>
                            )
                          ) : (
                            <div className="flex h-8 items-center rounded-md border border-border bg-muted/30 px-2.5 text-xs text-muted-foreground">
                              Not outsourced
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dates */}
                      {split.locationType === 'Outsourced' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground">Sent Date</Label>
                            <Input
                              type="date"
                              value={split.sentDate}
                              onChange={(e) => updateSplit(idx, { sentDate: e.target.value })}
                              className="h-8 bg-muted/50 border-border text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground">Expected Return</Label>
                            <Input
                              type="date"
                              value={split.expectedReturnDate}
                              onChange={(e) => updateSplit(idx, { expectedReturnDate: e.target.value })}
                              className="h-8 bg-muted/50 border-border text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground">Received Date</Label>
                            <Input
                              type="date"
                              value={split.receivedDate}
                              onChange={(e) => updateSplit(idx, { receivedDate: e.target.value })}
                              className="h-8 bg-muted/50 border-border text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {/* Qty + rate grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Sent Qty</Label>
                          <Input
                            type="number"
                            value={split.sentQty}
                            onChange={(e) => updateSplit(idx, { sentQty: e.target.value })}
                            placeholder="0"
                            className="h-8 bg-muted/50 border-border text-xs"
                            min={0}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Received Qty</Label>
                          <Input
                            type="number"
                            value={split.receivedQty}
                            onChange={(e) => updateSplit(idx, { receivedQty: e.target.value })}
                            placeholder="0"
                            className="h-8 bg-muted/50 border-border text-xs"
                            min={0}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Defective</Label>
                          <Input
                            type="number"
                            value={split.defectiveQty}
                            onChange={(e) => updateSplit(idx, { defectiveQty: e.target.value })}
                            placeholder="0"
                            className="h-8 bg-muted/50 border-border text-xs"
                            min={0}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Rate (₹/pc)</Label>
                          <Input
                            type="number"
                            value={split.perPieceRate}
                            onChange={(e) => updateSplit(idx, { perPieceRate: e.target.value })}
                            placeholder="e.g. 15"
                            className="h-8 bg-muted/50 border-border text-xs"
                            min={0}
                            step={0.5}
                          />
                        </div>
                      </div>

                      {/* Live per-row total */}
                      {rowTotal > 0 && (
                        <p className="text-[10px] text-amber-400 font-medium">
                          Row total: ₹{new Intl.NumberFormat('en-IN').format(Math.round(rowTotal))}
                          {Number(split.perPieceRate) > 0 && (
                            <span className="text-muted-foreground font-normal">
                              {' '}({Number(split.receivedQty) || 0} × ₹{Number(split.perPieceRate) || 0})
                            </span>
                          )}
                        </p>
                      )}

                      {/* Notes */}
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Notes</Label>
                        <Input
                          value={split.notes}
                          onChange={(e) => updateSplit(idx, { notes: e.target.value })}
                          placeholder="e.g. Special instructions for vendor..."
                          className="h-8 bg-muted/50 border-border text-xs"
                        />
                      </div>
                    </div>
                  )
                })}

                {/* Add Split */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed text-xs gap-1.5"
                  onClick={() => setStageSplits((prev) => [...prev, blankSplit()])}
                  disabled={savingSplits}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Split
                </Button>

                {/* Σ footer validation */}
                {(() => {
                  const target = selectedJob?.targetQty || 0
                  const totalSent = stageSplits.reduce((s, r) => s + (Number(r.sentQty) || 0), 0)
                  const totalReceived = stageSplits.reduce((s, r) => s + (Number(r.receivedQty) || 0), 0)
                  const totalAmount = stageSplits.reduce(
                    (s, r) => s + (Number(r.receivedQty) || 0) * (Number(r.perPieceRate) || 0), 0
                  )
                  const maxAllowed = target * 1.5
                  const overLimit = totalSent > maxAllowed
                  const overTarget = totalSent > target
                  return (
                    <div
                      className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 flex-wrap ${
                        overLimit
                          ? 'border-red-500/40 bg-red-500/10'
                          : overTarget
                          ? 'border-amber-500/40 bg-amber-500/10'
                          : 'border-border bg-muted/20'
                      }`}
                    >
                      <p
                        className={`text-xs font-medium ${
                          overLimit
                            ? 'text-red-400'
                            : overTarget
                            ? 'text-amber-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        Σ sent {formatNumber(totalSent)}/{formatNumber(target)} pcs · Σ received{' '}
                        {formatNumber(totalReceived)} · Σ ₹
                        {new Intl.NumberFormat('en-IN').format(Math.round(totalAmount))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {overLimit
                          ? `Over the 1.5× rework limit (${formatNumber(maxAllowed)} pcs) — Save disabled`
                          : overTarget
                          ? `Above target — allowed up to 1.5× for rework (${formatNumber(maxAllowed)} pcs)`
                          : 'Within target'}
                      </p>
                    </div>
                  )
                })()}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setStageEditOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                    onClick={handleSaveStageSplits}
                    disabled={
                      savingSplits ||
                      stageSplits.reduce((s, r) => s + (Number(r.sentQty) || 0), 0) >
                        (selectedJob?.targetQty || 0) * 1.5
                    }
                  >
                    {savingSplits ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      `Save ${stageSplits.length} split${stageSplits.length !== 1 ? 's' : ''}`
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Fabric Issue Dialog (Phase 4 — GRN-received fabric → job) ── */}
      {fabricIssueJob && (
        <FabricIssueDialog
          job={fabricIssueJob}
          onClose={() => setFabricIssueJob(null)}
          onIssued={handleFabricIssued}
        />
      )}

      {/* ─── Production Efficiency Dashboard (NEW FEATURE) ───────────── */}
      {eff && eff.summary.totalJobs > 0 && (
        <ProductionEfficiencyWidget data={eff} />
      )}
    </div>
  )
}

// ─── Production Efficiency Widget (NEW FEATURE) ──────────────────────────────
// Tracks production job progress, stage bottlenecks, throughput, and identifies
// at-risk jobs that are behind schedule.

function EffChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { jobCount: number; avgProgress: number } }>; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      <p className="font-semibold tabular-nums">{payload[0].value} units</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {p.jobCount} job{p.jobCount !== 1 ? 's' : ''} · {p.avgProgress}% avg progress
      </p>
    </div>
  )
}

function getEffColor(efficiency: number): string {
  if (efficiency >= 100) return 'oklch(0.72 0.18 145)' // green
  if (efficiency >= 75) return 'oklch(0.8 0.15 75)'   // gold
  if (efficiency >= 50) return 'oklch(0.75 0.15 65)'  // orange
  return 'oklch(0.65 0.22 25)'                         // red
}

function ProductionEfficiencyWidget({ data }: { data: EffData }) {
  const { summary, stages, jobs, statusDist } = data
  const hasBottleneck = summary.bottleneckStage !== '—'
  const hasAtRisk = summary.atRiskCount > 0

  // Top 5 jobs by efficiency (excluding completed)
  const activeJobs = jobs.filter(j => j.status !== 'Completed')
  const topPerformers = [...activeJobs].sort((a, b) => b.efficiency - a.efficiency).slice(0, 5)
  const atRiskJobs = jobs.filter(j => j.isAtRisk).sort((a, b) => a.efficiency - b.efficiency).slice(0, 5)

  // Radial gauge data for overall completion
  const completionGauge = [{ name: 'completion', value: summary.overallCompletion, fill: 'oklch(0.78 0.14 85)' }]
  const efficiencyGauge = [{ name: 'efficiency', value: summary.avgEfficiency, fill: 'oklch(0.72 0.18 145)' }]

  return (
    <div className="premium-card rounded-xl p-5">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 glow-ring">
            <Gauge className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Production Efficiency Dashboard</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                AI Tracked
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.totalJobs} jobs · {summary.totalCompleted}/{summary.totalTarget} units ({summary.overallCompletion}%) · {summary.avgEfficiency}% efficiency · {summary.totalThroughput} units/day
            </p>
          </div>
        </div>
      </div>

      {/* Metrics grid with radial gauges */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Overall Completion gauge */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Target className="h-3 w-3" />
                Completion
              </div>
              <p className="mt-1 text-lg font-bold tabular-nums">{summary.overallCompletion}%</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{summary.completedJobs} done · {summary.inProgressJobs} active</p>
            </div>
            <div className="h-14 w-14">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" data={completionGauge} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={6} angleAxisId={0} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Efficiency gauge */}
        <div className={`rounded-lg border p-3 ${summary.avgEfficiency >= 75 ? 'border-emerald-500/30 bg-emerald-500/5' : summary.avgEfficiency >= 50 ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${summary.avgEfficiency >= 75 ? 'text-emerald-400' : summary.avgEfficiency >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                <Gauge className="h-3 w-3" />
                Efficiency
              </div>
              <p className={`mt-1 text-lg font-bold tabular-nums ${summary.avgEfficiency >= 75 ? 'text-emerald-400' : summary.avgEfficiency >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{summary.avgEfficiency}%</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">On-time: {summary.onTimeRate}%</p>
            </div>
            <div className="h-14 w-14">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" data={efficiencyGauge} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={6} angleAxisId={0} fill={getEffColor(summary.avgEfficiency)} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Throughput */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Zap className="h-3 w-3" />
            Throughput
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{summary.totalThroughput}</p>
          <p className="text-[10px] text-muted-foreground">units/day · cycle: {summary.avgCycleTime}d</p>
        </div>

        {/* Bottleneck */}
        <div className={`rounded-lg border p-3 ${hasBottleneck ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-muted/20'}`}>
          <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${hasBottleneck ? 'text-amber-400' : 'text-muted-foreground'}`}>
            <AlertCircle className="h-3 w-3" />
            Bottleneck
          </div>
          <p className={`mt-1 text-sm font-bold ${hasBottleneck ? 'text-amber-400' : ''}`}>
            {summary.bottleneckStage}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{summary.bottleneckJobCount} jobs stuck</p>
        </div>
      </div>

      {/* Stage analysis chart */}
      <div className="mb-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Stage-wise Production Analysis
        </h4>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stages} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} />
              <XAxis
                dataKey="stage"
                tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <RTooltip content={<EffChartTooltip />} cursor={{ fill: 'oklch(0.5 0.01 260 / 10%)' }} />
              <Bar dataKey="totalCompleted" name="Completed" radius={[4, 4, 0, 0]} barSize={28}>
                {stages.map((s, i) => (
                  <RCell key={`comp-${i}`} fill={s.color} fillOpacity={0.9} />
                ))}
              </Bar>
              <Bar dataKey="totalTarget" name="Target" radius={[4, 4, 0, 0]} barSize={28}>
                {stages.map((s, i) => (
                  <RCell key={`tgt-${i}`} fill={s.color} fillOpacity={0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Stage progress bars */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stages.map((s, i) => (
            <div key={s.stage} className="animate-slide-in space-y-1" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium truncate">{s.stage}</span>
                <span className="tabular-nums font-semibold" style={{ color: s.color }}>{s.avgProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${s.avgProgress}%`, backgroundColor: s.color }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground tabular-nums">{s.jobCount} jobs · {s.totalCompleted}/{s.totalTarget}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two columns: Top performers + At-risk jobs */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top performers */}
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Top Performers (by efficiency)
          </h4>
          <div className="space-y-2">
            {topPerformers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No active jobs</p>
            ) : (
              topPerformers.map((j, i) => (
                <div key={j.id} className="animate-slide-in flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-2.5" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-400">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{j.styleName}</span>
                      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: getEffColor(j.efficiency) }}>
                        {j.efficiency}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="tabular-nums">{j.completedQty}/{j.targetQty}</span>
                      <span>·</span>
                      <span>{j.stage}</span>
                      <span>·</span>
                      <span className="tabular-nums">{j.throughput}/day</span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, j.progress)}%`, backgroundColor: getEffColor(j.efficiency) }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* At-risk jobs */}
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            At-Risk Jobs (behind schedule)
          </h4>
          <div className="space-y-2">
            {atRiskJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No at-risk jobs — all on track!</p>
            ) : (
              atRiskJobs.map((j, i) => (
                <div key={j.id} className="animate-slide-in flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5" style={{ animationDelay: `${i * 60}ms` }}>
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{j.styleName}</span>
                      <span className="text-xs font-bold tabular-nums text-red-400 shrink-0">{j.efficiency}%</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="tabular-nums">{j.completedQty}/{j.targetQty}</span>
                      <span>·</span>
                      <span>{j.stage}</span>
                      <span>·</span>
                      <span className="text-red-400 tabular-nums">{j.progress}% vs {j.expectedProgress}% expected</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                        <div className="h-full rounded-full bg-red-500/60" style={{ width: `${Math.min(100, j.progress)}%` }} />
                      </div>
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-muted/40" title="Expected progress">
                        <div className="h-full rounded-full bg-amber-500/50" style={{ width: `${Math.min(100, j.expectedProgress)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottleneck alert */}
      {hasBottleneck && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 animate-slide-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-400">Production Bottleneck Detected</p>
            <p className="text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{summary.bottleneckStage}</span> stage has{' '}
              <span className="font-medium text-amber-400">{summary.bottleneckJobCount} job{summary.bottleneckJobCount !== 1 ? 's' : ''}</span>{' '}
              in progress. Reallocate resources, add workers, or prioritize these jobs to unblock the production pipeline.
              {hasAtRisk && ` ${summary.atRiskCount} job${summary.atRiskCount !== 1 ? 's are' : ' is'} behind schedule.`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}