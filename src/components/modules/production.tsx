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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  Gauge,
  Zap,
  Sparkles,
  Target,
  AlertCircle,
  TrendingDown,
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
  customer: { companyName: string }
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
  createdAt: string
  updatedAt: string
  _image?: string | null
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
}

interface VendorOption {
  id: string
  vendorName: string
  phone: string | null
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

  // New job form - from sales order
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<EligibleOrder | null>(null)
  const [jobDueDates, setJobDueDates] = useState<Record<string, string>>({})
  const [createMode, setCreateMode] = useState<'order' | 'manual'>('order')

  // Manual job form
  const [manualJob, setManualJob] = useState({
    styleNo: '',
    styleName: '',
    targetQty: '',
    endDate: '',
  })

  // Product catalog (for manual job product selector — merged from Sample
  // Catalog + Cost Sheets so ALL costed products appear, not just samples)
  const [catalogProducts, setCatalogProducts] = useState<Array<{ id: string; styleNo: string; styleName: string }>>([])

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

  // Edit completed qty
  const [editQty, setEditQty] = useState('')
  const [editQtyId, setEditQtyId] = useState<string | null>(null)

  // Stage tracking
  const [stageTrackings, setStageTrackings] = useState<StageTracking[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [stageEditOpen, setStageEditOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<StageTracking | null>(null)
  const [stageForm, setStageForm] = useState({
    locationType: 'In-House',
    vendorId: '',
    sentDate: '',
    expectedReturnDate: '',
    receivedDate: '',
    sentQty: '',
    receivedQty: '',
    defectiveQty: '',
    perPieceRate: '',
    notes: '',
  })

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
  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch('/api/vendors')
      if (res.ok) {
        const data = await res.json()
        setVendors(data.vendors.map((v: { id: string; vendorName: string; phone: string | null }) => ({
          id: v.id,
          vendorName: v.vendorName,
          phone: v.phone,
        })))
      }
    } catch { /* silent */ }
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

  // Save stage tracking edit
  const handleSaveStageTracking = async () => {
    if (!selectedJob || !editingStage) return
    try {
      const derivedStatus = stageForm.receivedDate ? 'Completed' : stageForm.sentDate ? 'Sent Out' : 'In Progress'
      const payload: Record<string, unknown> = {
        stageName: editingStage.stageName,
        locationType: stageForm.locationType,
        vendorId: stageForm.locationType === 'Outsourced' ? (stageForm.vendorId || null) : null,
        sentDate: stageForm.sentDate || null,
        expectedReturnDate: stageForm.expectedReturnDate || null,
        receivedDate: stageForm.receivedDate || null,
        sentQty: stageForm.sentQty ? Number(stageForm.sentQty) : 0,
        receivedQty: stageForm.receivedQty ? Number(stageForm.receivedQty) : 0,
        defectiveQty: stageForm.defectiveQty ? Number(stageForm.defectiveQty) : 0,
        perPieceRate: stageForm.perPieceRate ? Number(stageForm.perPieceRate) : 0,
        status: derivedStatus,
        notes: stageForm.notes || null,
      }
      const res = await fetch(`/api/production/${selectedJob.id}/stages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(`${editingStage.stageName} updated`)
        setStageEditOpen(false)
        fetchStageTracking(selectedJob.id)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to update stage')
      }
    } catch {
      toast.error('Failed to update stage')
    }
  }

  const openStageEdit = (stage: StageTracking) => {
    setEditingStage(stage)
    setStageForm({
      locationType: stage.locationType,
      vendorId: stage.vendorId || '',
      sentDate: stage.sentDate ? stage.sentDate.split('T')[0] : '',
      expectedReturnDate: stage.expectedReturnDate ? stage.expectedReturnDate.split('T')[0] : '',
      receivedDate: stage.receivedDate ? stage.receivedDate.split('T')[0] : '',
      sentQty: stage.sentQty ? String(stage.sentQty) : '',
      receivedQty: stage.receivedQty ? String(stage.receivedQty) : '',
      defectiveQty: stage.defectiveQty ? String(stage.defectiveQty) : '',
      perPieceRate: stage.perPieceRate ? String(stage.perPieceRate) : '',
      notes: stage.notes || '',
    })
    setStageEditOpen(true)
  }

  const openNewJobDialog = () => {
    setSelectedOrderId(null)
    setSelectedOrder(null)
    setJobDueDates({})
    setJobStartDate(new Date().toISOString().split('T')[0])
    setManualJob({ styleNo: '', styleName: '', targetQty: '', endDate: '' })
    setCreateMode('order')
    setNewJobOpen(true)
    fetchEligibleOrders()
  }

  const selectOrder = (orderId: string) => {
    const order = eligibleOrders.find((o) => o.id === orderId)
    if (order) {
      setSelectedOrderId(orderId)
      setSelectedOrder(order)
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

  const handleCreateJobsFromOrder = async () => {
    if (!selectedOrder) return
    try {
      setSaving(true)
      // Create jobs sequentially to avoid SQLite write-lock conflicts
      const results: { ok: boolean; style: string; error?: string }[] = []
      for (const item of selectedOrder.items) {
        const styleKey = item.style?.styleNo || item.styleName
        try {
          const r = await fetch('/api/production', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              salesOrderId: selectedOrder.id,
              styleNo: item.style?.styleNo || item.styleName,
              styleName: item.styleName,
              targetQty: item.quantity,
              startDate: jobStartDate,
              endDate: jobDueDates[styleKey] || undefined,
            }),
          })
          if (!r.ok) {
            const err = await r.json().catch(() => ({}))
            results.push({ ok: false, style: item.styleName, error: err.error || r.statusText })
          } else {
            results.push({ ok: true, style: item.styleName })
          }
        } catch {
          results.push({ ok: false, style: item.styleName, error: 'Network error' })
        }
      }
      const failures = results.filter((r) => !r.ok)
      if (failures.length === 0) {
        toast.success(`${results.length} production job(s) created successfully`)
        setNewJobOpen(false)
        setSelectedOrderId(null)
        setSelectedOrder(null)
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
        }),
      })
      if (res.ok) {
        toast.success('Production job created successfully')
        setNewJobOpen(false)
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
  }

  // ─── Computed ──────────────────────────────────────────────────────────

  const activeJobs = data?.jobs.filter((j) => j.status === 'In Progress' || j.status === 'Delayed') ?? []
  const overdueCount = data?.jobs.filter((j) => isOverdue(j.endDate, j.status)).length ?? 0
  const todayOutput = data?.jobs
    .filter((j) => {
      const today = new Date().toDateString()
      return new Date(j.updatedAt).toDateString() === today && j.completedQty > 0
    })
    .reduce((sum, j) => sum + j.completedQty, 0) ?? 0

  // Group jobs by stage for kanban
  const stageGroups: Record<string, ProductionJob[]> = {}
  for (const s of PRODUCTION_STAGES) {
    stageGroups[s] = (data?.jobs ?? []).filter((j) => j.stage === s)
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
                            onClick={() => { setSelectedOrderId(null); setSelectedOrder(null) }}
                          >
                            Change
                          </Button>
                        </div>
                      </div>

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
                    ? `Create ${selectedOrder ? selectedOrder.items.length : 0} Job${selectedOrder && selectedOrder.items.length > 1 ? 's' : ''}`
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
              <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(data.total)}</p>
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
                      {jobs.map((job) => (
                        <button
                          key={job.id}
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
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                              <span>{formatNumber(job.completedQty)}/{formatNumber(job.targetQty)}</span>
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
                      ))}
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
              {(stageGroups[PRODUCTION_STAGES[mobileStageIdx]] ?? []).map((job) => (
                <button
                  key={job.id}
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
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>
                        {formatNumber(job.completedQty)}/{formatNumber(job.targetQty)} pcs
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
              ))}
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
                      <DialogTitle className="text-lg text-foreground">
                        {selectedJob.jobNo}
                      </DialogTitle>
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
                          setEditQtyId(selectedJob.id)
                          setEditQty(String(selectedJob.completedQty))
                        }}
                        className="flex items-center gap-1 mt-0.5 group"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {formatNumber(selectedJob.completedQty)} pcs
                        </p>
                        <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          edit
                        </span>
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
                      const tracking = stageTrackings.find((s) => s.stageName === stage)

                      return (
                        <button
                          key={stage}
                          onClick={() => tracking && openStageEdit(tracking)}
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
                            <div className="flex items-center gap-2">
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
                              {tracking?.locationType === 'Outsourced' && (
                                <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-[8px] px-1 py-0 shrink-0">
                                  <Building2 className="h-2 w-2 mr-0.5" />
                                  {tracking.vendor?.vendorName || 'Outsourced'}
                                </Badge>
                              )}
                              {tracking?.locationType === 'In-House' && !isPast && !isCurrent && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-500/30 text-emerald-400 shrink-0">
                                  In-House
                                </Badge>
                              )}
                            </div>
                            {/* Outsourced tracking info */}
                            {tracking?.locationType === 'Outsourced' && (
                              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                                {tracking.status === 'Sent Out' && tracking.sentQty > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <Send className="h-2.5 w-2.5" />
                                    Sent {tracking.sentQty}
                                    {tracking.expectedReturnDate && (
                                      <> · Exp {new Date(tracking.expectedReturnDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</>
                                    )}
                                  </span>
                                )}
                                {tracking.receivedQty > 0 && (
                                  <span className="flex items-center gap-0.5 text-emerald-400">
                                    <ArrowDownLeft className="h-2.5 w-2.5" />
                                    Received {tracking.receivedQty}
                                    {tracking.defectiveQty > 0 && (
                                      <span className="text-red-400 ml-1">({tracking.defectiveQty} defect)</span>
                                    )}
                                  </span>
                                )}
                                {tracking.totalAmount > 0 && (
                                  <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                                    ₹{new Intl.NumberFormat('en-IN').format(Math.round(tracking.totalAmount))}
                                    {tracking.perPieceRate > 0 && (
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
                            {tracking && (
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

                {/* Action buttons */}
                {selectedJob.status !== 'Completed' && selectedJob.status !== 'Cancelled' && (
                  <div className="flex flex-wrap gap-2">
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

      {/* Stage Tracking Edit Dialog */}
      <Dialog open={stageEditOpen} onOpenChange={setStageEditOpen}>
        <DialogContent className="glass-card border-border sm:max-w-md">
          {editingStage && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  <span className="text-primary">{editingStage.stageName}</span> — Stage Tracking
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Location Type */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={stageForm.locationType === 'In-House' ? 'default' : 'outline'}
                      className={`flex-1 text-xs ${stageForm.locationType !== 'In-House' ? 'border-border' : ''}`}
                      onClick={() => setStageForm({ ...stageForm, locationType: 'In-House', vendorId: '' })}
                    >
                      <Factory className="h-3.5 w-3.5 mr-1" />
                      In-House
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={stageForm.locationType === 'Outsourced' ? 'default' : 'outline'}
                      className={`flex-1 text-xs ${stageForm.locationType !== 'Outsourced' ? 'border-border' : ''}`}
                      onClick={() => setStageForm({ ...stageForm, locationType: 'Outsourced' })}
                    >
                      <Handshake className="h-3.5 w-3.5 mr-1" />
                      Outsourced
                    </Button>
                  </div>
                </div>

                {/* Vendor (only if Outsourced) */}
                {stageForm.locationType === 'Outsourced' && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Vendor</Label>
                    {vendors.length > 0 ? (
                      <Select value={stageForm.vendorId} onValueChange={(v) => setStageForm({ ...stageForm, vendorId: v })}>
                        <SelectTrigger className="bg-muted/50 border-border text-xs h-9">
                          <SelectValue placeholder="Select vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id} className="text-xs">
                              {v.vendorName} {v.phone ? `· ${v.phone}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 border border-border">
                        No vendors added yet. Go to <span className="text-primary font-medium">Vendors</span> section to add outsourcing partners.
                      </p>
                    )}
                  </div>
                )}

                <Separator className="bg-border" />

                {/* Tracking fields */}
                {stageForm.locationType === 'Outsourced' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Sent Date</Label>
                      <Input
                        type="date"
                        value={stageForm.sentDate}
                        onChange={(e) => setStageForm({ ...stageForm, sentDate: e.target.value })}
                        className="h-8 bg-muted/50 border-border text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Expected Return</Label>
                      <Input
                        type="date"
                        value={stageForm.expectedReturnDate}
                        onChange={(e) => setStageForm({ ...stageForm, expectedReturnDate: e.target.value })}
                        className="h-8 bg-muted/50 border-border text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Received Date</Label>
                      <Input
                        type="date"
                        value={stageForm.receivedDate}
                        onChange={(e) => setStageForm({ ...stageForm, receivedDate: e.target.value })}
                        className="h-8 bg-muted/50 border-border text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Status</Label>
                      <Select
                        value={stageForm.receivedDate ? 'Completed' : stageForm.sentDate ? 'Sent Out' : 'In Progress'}
                        disabled
                      >
                        <SelectTrigger className="h-8 bg-muted/50 border-border text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="In Progress" className="text-xs">In Progress</SelectItem>
                          <SelectItem value="Sent Out" className="text-xs">Sent Out</SelectItem>
                          <SelectItem value="Completed" className="text-xs">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Qty tracking */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Sent Qty</Label>
                    <Input
                      type="number"
                      value={stageForm.sentQty}
                      onChange={(e) => setStageForm({ ...stageForm, sentQty: e.target.value })}
                      placeholder="0"
                      className="h-8 bg-muted/50 border-border text-xs"
                      min={0}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Received Qty</Label>
                    <Input
                      type="number"
                      value={stageForm.receivedQty}
                      onChange={(e) => setStageForm({ ...stageForm, receivedQty: e.target.value })}
                      placeholder="0"
                      className="h-8 bg-muted/50 border-border text-xs"
                      min={0}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Defective</Label>
                    <Input
                      type="number"
                      value={stageForm.defectiveQty}
                      onChange={(e) => setStageForm({ ...stageForm, defectiveQty: e.target.value })}
                      placeholder="0"
                      className="h-8 bg-muted/50 border-border text-xs"
                      min={0}
                    />
                  </div>
                </div>

                {/* Per-piece rate + Total Amount (for outsourced stages) */}
                {stageForm.locationType === 'Outsourced' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Per Piece Rate (₹)</Label>
                      <Input
                        type="number"
                        value={stageForm.perPieceRate}
                        onChange={(e) => setStageForm({ ...stageForm, perPieceRate: e.target.value })}
                        placeholder="e.g. 15"
                        className="h-8 bg-muted/50 border-border text-xs"
                        min={0}
                        step={0.5}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Total Amount (₹)</Label>
                      <div className="flex h-8 items-center rounded-md border border-border bg-muted/30 px-2.5 text-xs font-semibold text-foreground">
                        {stageForm.perPieceRate && stageForm.receivedQty
                          ? `₹${new Intl.NumberFormat('en-IN').format(Math.round(Number(stageForm.perPieceRate) * Number(stageForm.receivedQty)))}`
                          : '₹0'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Notes</Label>
                  <Input
                    value={stageForm.notes}
                    onChange={(e) => setStageForm({ ...stageForm, notes: e.target.value })}
                    placeholder="e.g. Special instructions for vendor..."
                    className="h-8 bg-muted/50 border-border text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setStageEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs" onClick={handleSaveStageTracking}>
                    Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Production Efficiency Dashboard (NEW FEATURE) ─────────────── */}
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