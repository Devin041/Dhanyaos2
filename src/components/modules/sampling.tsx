'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { toast } from 'sonner'
import {
  Scissors,
  Plus,
  Search,
  Eye,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  IndianRupee,
  Loader2,
  Send,
  ThumbsUp,
  XCircle,
  RotateCcw,
  FlaskConical,
  PackageOpen,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_STAGES = [
  'Design',
  'Fabric Sourcing',
  'Pattern Making',
  'Cutting',
  'Stitching',
  'Finishing',
  'Ready',
] as const

type StageName = (typeof SAMPLE_STAGES)[number]

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Design: { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30', dot: 'bg-violet-500' },
  'Fabric Sourcing': { bg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500/30', dot: 'bg-sky-500' },
  'Pattern Making': { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' },
  Cutting: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  Stitching: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  Finishing: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  Ready: { bg: 'bg-primary/20', text: 'text-primary', border: 'border-primary/30', dot: 'bg-primary' },
}

const STATUS_COLORS: Record<string, string> = {
  'In Progress': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  Submitted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  Revised: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

const STATUS_TABS = ['All', 'In Progress', 'Submitted', 'Approved', 'Rejected', 'Revised']

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerRef {
  companyName: string
  buyerName: string | null
}

interface Sample {
  id: string
  sampleNo: string
  customerId: string | null
  customer: CustomerRef | null
  styleNo: string
  styleName: string
  stage: string
  status: string
  assignedTo: string | null
  submissionDate: string | null
  approvedDate: string | null
  cost: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface CustomerOption {
  id: string
  companyName: string
}

interface SamplingData {
  samples: Sample[]
  total: number
  page: number
  limit: number
  statusCounts: Record<string, number>
  stageCounts: Record<string, number>
  summary: {
    totalSamples: number
    approvedRate: number
    inProgress: number
    avgCost: number
    totalCost: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getStageIndex(stage: string): number {
  return SAMPLE_STAGES.indexOf(stage as StageName)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SamplingModule() {
  // Filters
  const [statusFilter, setStatusFilter] = useState('All')
  const [stageFilter, setStageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Data
  const [data, setData] = useState<SamplingData | null>(null)
  const [loading, setLoading] = useState(true)

  // Dialogs
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [newSampleOpen, setNewSampleOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Customers for select
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  // New sample form
  const [newSample, setNewSample] = useState({
    styleNo: '',
    styleName: '',
    customerId: '',
    assignedTo: '',
    cost: '',
    notes: '',
  })

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (stageFilter !== 'all') params.set('stage', stageFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', '20')

      const res = await fetch(`/api/sampling?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch samples:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, stageFilter, search, page])

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers?limit=100')
      if (res.ok) {
        const json = await res.json()
        setCustomers(json.customers || [])
      }
    } catch {
      // Silently fail - customer select is optional
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, stageFilter, search])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleCreateSample = async () => {
    if (!newSample.styleNo || !newSample.styleName) return
    try {
      setSaving(true)
      const res = await fetch('/api/sampling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleNo: newSample.styleNo,
          styleName: newSample.styleName,
          customerId: newSample.customerId || undefined,
          assignedTo: newSample.assignedTo || undefined,
          cost: newSample.cost ? Number(newSample.cost) : 0,
          notes: newSample.notes || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Sample created successfully')
        setNewSampleOpen(false)
        setNewSample({ styleNo: '', styleName: '', customerId: '', assignedTo: '', cost: '', notes: '' })
        fetchData()
      }
    } catch (err) {
      console.error('Failed to create sample:', err)
      toast.error('Failed to create sample')
    } finally {
      setSaving(false)
    }
  }

  const handleAdvanceStage = async (sampleId: string) => {
    try {
      setActionLoading(sampleId)
      const res = await fetch(`/api/sampling/${sampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStage: true }),
      })
      if (res.ok) {
        const updated = await res.json()
        if (selectedSample?.id === sampleId) setSelectedSample(updated)
        fetchData()
        toast.success('Stage advanced successfully')
      }
    } catch (err) {
      console.error('Failed to advance stage:', err)
      toast.error('Failed to advance stage')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStatusChange = async (sampleId: string, status: string) => {
    try {
      setActionLoading(sampleId)
      const res = await fetch(`/api/sampling/${sampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const updated = await res.json()
        if (selectedSample?.id === sampleId) setSelectedSample(updated)
        fetchData()
        toast.success('Status updated successfully')
      }
    } catch (err) {
      console.error('Failed to change status:', err)
      toast.error('Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  const openDetail = async (sample: Sample) => {
    setSelectedSample(sample)
    setDetailOpen(true)
    // Fetch full detail
    try {
      const res = await fetch(`/api/sampling/${sample.id}`)
      if (res.ok) {
        const full = await res.json()
        setSelectedSample(full)
      }
    } catch {
      // Use the data we already have
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold lg:text-2xl">Sampling</h1>
            <p className="text-xs text-muted-foreground">
              {data ? `${formatNumber(data.summary.totalSamples)} samples tracked` : 'Loading...'}
            </p>
          </div>
        </div>

        <ExportButton module="sampling" />
        <Dialog open={newSampleOpen} onOpenChange={setNewSampleOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              New Sample
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Sample</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Style No *</Label>
                  <Input
                    placeholder="e.g. ELY-KU-001"
                    value={newSample.styleNo}
                    onChange={(e) => setNewSample({ ...newSample, styleNo: e.target.value })}
                    className="bg-muted/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Customer</Label>
                  <Select
                    value={newSample.customerId}
                    onValueChange={(v) => setNewSample({ ...newSample, customerId: v === '__none__' ? '' : v })}
                  >
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue placeholder="Internal" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="__none__">Internal</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Style Name *</Label>
                <Input
                  placeholder="e.g. Anarkali Kurta - Emerald"
                  value={newSample.styleName}
                  onChange={(e) => setNewSample({ ...newSample, styleName: e.target.value })}
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Assigned To</Label>
                  <Input
                    placeholder="e.g. Priya"
                    value={newSample.assignedTo}
                    onChange={(e) => setNewSample({ ...newSample, assignedTo: e.target.value })}
                    className="bg-muted/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Cost (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newSample.cost}
                    onChange={(e) => setNewSample({ ...newSample, cost: e.target.value })}
                    className="bg-muted/50 border-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea
                  placeholder="Any notes about this sample..."
                  value={newSample.notes}
                  onChange={(e) => setNewSample({ ...newSample, notes: e.target.value })}
                  className="bg-muted/50 border-border min-h-[60px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setNewSampleOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleCreateSample}
                  disabled={!newSample.styleNo || !newSample.styleName || saving}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Sample
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="glass-card border-l-4 border-l-muted-foreground/30 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Samples</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatNumber(data.summary.totalSamples)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-sky-500/50 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-400" />
                <span className="text-xs text-muted-foreground">In Progress</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatNumber(data.summary.inProgress)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-emerald-500/50 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Approved</span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-2xl font-bold text-foreground">{formatNumber(data.statusCounts['Approved'] || 0)}</p>
                <span className="text-xs text-emerald-400 font-medium">{data.summary.approvedRate}% rate</span>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-primary/50 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Cost</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatINR(data.summary.totalCost)}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* 7-Stage Pipeline Visual */}
      {!loading && data && (
        <div className="glass-card border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Sample Pipeline</p>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {SAMPLE_STAGES.map((stage, idx) => {
              const count = data.stageCounts[stage] || 0
              const colors = STAGE_COLORS[stage]
              const isLast = idx === SAMPLE_STAGES.length - 1

              return (
                <div key={stage} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold border transition-all ${
                        count > 0
                          ? `${colors.bg} ${colors.text} ${colors.border}`
                          : 'bg-muted/30 text-muted-foreground/50 border-border'
                      }`}
                    >
                      {count > 0 ? count : '—'}
                    </div>
                    <span
                      className={`text-[10px] mt-1.5 text-center leading-tight font-medium ${
                        count > 0 ? colors.text : 'text-muted-foreground/50'
                      }`}
                    >
                      {stage}
                    </span>
                  </div>
                  {!isLast && (
                    <div className="flex-shrink-0 w-6 lg:w-10 h-px bg-border relative top-[-10px]" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {STATUS_TABS.map((s) => {
            const isActive = statusFilter === s
            const count =
              s === 'All'
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
                {s}
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
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search samples..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-40 bg-muted/50 border-border text-xs lg:w-56 pl-8"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-36 bg-muted/50 border-border text-xs">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Stages</SelectItem>
              {SAMPLE_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !data || data.samples.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
            <Scissors className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== 'All' || stageFilter !== 'all'
              ? 'No samples match the current filters'
              : 'No samples yet. Create your first sample to get started.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: Table */}
          <div className="hidden lg:block glass-card border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sample No</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Style</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stage</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Assigned To</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Cost</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Dates</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.samples.map((sample) => {
                    const stageColor = STAGE_COLORS[sample.stage] || STAGE_COLORS['Design']
                    const statusColor = STATUS_COLORS[sample.status] || ''
                    const stageIdx = getStageIndex(sample.stage)
                    const canAdvance = sample.status === 'In Progress' && stageIdx < SAMPLE_STAGES.length - 1
                    const canMarkReady = sample.stage === 'Finishing' && sample.status === 'In Progress'
                    const canSubmit = sample.stage === 'Ready' && sample.status === 'In Progress'
                    const canApprove = sample.status === 'Submitted'
                    const canReject = sample.status === 'Submitted'
                    const canRevise = sample.status === 'Rejected'

                    return (
                      <tr key={sample.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-primary text-xs">{sample.sampleNo}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-foreground">
                            {sample.customer?.companyName || 'Internal'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-xs font-medium text-foreground">{sample.styleName}</span>
                            <p className="text-[10px] text-muted-foreground">{sample.styleNo}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-[10px] px-2 py-0 ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                            {sample.stage}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-[10px] px-2 py-0 ${statusColor}`}>
                            {sample.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{sample.assignedTo || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-medium text-foreground">{formatINR(sample.cost)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            {sample.submissionDate && <p>Sub: {formatDate(sample.submissionDate)}</p>}
                            {sample.approvedDate && <p>App: {formatDate(sample.approvedDate)}</p>}
                            {!sample.submissionDate && !sample.approvedDate && <p>—</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => openDetail(sample)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {canAdvance && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => handleAdvanceStage(sample.id)}
                                disabled={actionLoading === sample.id}
                              >
                                {actionLoading === sample.id ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                                  <>
                                    <ChevronRight className="h-3 w-3 mr-0.5" />
                                    Advance
                                  </>
                                )}
                              </Button>
                            )}
                            {canSubmit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-amber-400 hover:text-amber-400 hover:bg-amber-500/10"
                                onClick={() => handleStatusChange(sample.id, 'Submitted')}
                                disabled={actionLoading === sample.id}
                              >
                                <Send className="h-3 w-3 mr-0.5" />
                                Submit
                              </Button>
                            )}
                            {canApprove && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-emerald-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                                onClick={() => handleStatusChange(sample.id, 'Approved')}
                                disabled={actionLoading === sample.id}
                              >
                                <ThumbsUp className="h-3 w-3 mr-0.5" />
                                Approve
                              </Button>
                            )}
                            {canReject && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-red-400 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => handleStatusChange(sample.id, 'Rejected')}
                                disabled={actionLoading === sample.id}
                              >
                                <XCircle className="h-3 w-3 mr-0.5" />
                                Reject
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: Card View */}
          <div className="lg:hidden space-y-3">
            {data.samples.map((sample) => {
              const stageColor = STAGE_COLORS[sample.stage] || STAGE_COLORS['Design']
              const statusColor = STATUS_COLORS[sample.status] || ''
              const stageIdx = getStageIndex(sample.stage)
              const canAdvance = sample.status === 'In Progress' && stageIdx < SAMPLE_STAGES.length - 1
              const canSubmit = sample.stage === 'Ready' && sample.status === 'In Progress'
              const canApprove = sample.status === 'Submitted'
              const canReject = sample.status === 'Submitted'
              const canRevise = sample.status === 'Rejected'

              return (
                <button
                  key={sample.id}
                  onClick={() => openDetail(sample)}
                  className="w-full glass-card border-border rounded-xl p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-primary text-xs">{sample.sampleNo}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-2 py-0 ${statusColor}`}>
                      {sample.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1">{sample.styleName}</p>
                  <p className="text-[11px] text-muted-foreground">{sample.styleNo}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] px-2 py-0 ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                      {sample.stage}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {sample.customer?.companyName || 'Internal'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                    <span className="text-xs font-medium text-foreground">{formatINR(sample.cost)}</span>
                    <div className="flex items-center gap-1">
                      {canAdvance && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-primary"
                          onClick={(e) => { e.stopPropagation(); handleAdvanceStage(sample.id) }}
                          disabled={actionLoading === sample.id}
                        >
                          <ChevronRight className="h-3 w-3 mr-0.5" />
                          Advance
                        </Button>
                      )}
                      {canSubmit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-amber-400"
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(sample.id, 'Submitted') }}
                          disabled={actionLoading === sample.id}
                        >
                          <Send className="h-3 w-3 mr-0.5" />
                          Submit
                        </Button>
                      )}
                      {canApprove && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-emerald-400"
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(sample.id, 'Approved') }}
                          disabled={actionLoading === sample.id}
                        >
                          <ThumbsUp className="h-3 w-3 mr-0.5" />
                          Approve
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-red-400"
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(sample.id, 'Rejected') }}
                          disabled={actionLoading === sample.id}
                        >
                          <XCircle className="h-3 w-3 mr-0.5" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {data.total > data.limit && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Sample Detail Dialog ───────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="glass-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedSample && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg text-foreground">
                      {selectedSample.sampleNo}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">{selectedSample.styleName}</p>
                  </div>
                  <Badge variant="outline" className={`${STATUS_COLORS[selectedSample.status] || ''} text-xs`}>
                    {selectedSample.status}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Style No</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{selectedSample.styleNo}</p>
                  </div>
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Customer</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">
                      {selectedSample.customer?.companyName || 'Internal'}
                    </p>
                  </div>
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Assigned To</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{selectedSample.assignedTo || '—'}</p>
                  </div>
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sample Cost</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{formatINR(selectedSample.cost)}</p>
                  </div>
                </div>

                {/* Dates */}
                <div className="glass-card border-border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Submitted</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">
                        {selectedSample.submissionDate ? formatDate(selectedSample.submissionDate) : 'Not submitted'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Approved</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">
                        {selectedSample.approvedDate ? formatDate(selectedSample.approvedDate) : 'Pending'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selectedSample.notes && (
                  <div className="glass-card border-border rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-xs text-foreground">{selectedSample.notes}</p>
                  </div>
                )}

                <Separator className="bg-border" />

                {/* 7-Stage Vertical Progress Pipeline */}
                <div>
                  <p className="text-xs text-muted-foreground mb-3 font-medium">Sampling Pipeline</p>
                  <div className="space-y-0">
                    {SAMPLE_STAGES.map((stage, idx) => {
                      const currentIdx = getStageIndex(selectedSample.stage)
                      const isCurrent = idx === currentIdx
                      const isPast = idx < currentIdx
                      const isFuture = idx > currentIdx
                      const colors = STAGE_COLORS[stage]
                      const count = data?.stageCounts[stage] || 0

                      return (
                        <div key={stage} className="flex items-center gap-3">
                          {/* Node */}
                          <div className="relative flex flex-col items-center">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                                isCurrent
                                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                                  : isPast
                                  ? `${colors.bg} ${colors.text} border ${colors.border}`
                                  : 'bg-muted/50 text-muted-foreground border border-border'
                              }`}
                            >
                              {isPast ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            {idx < SAMPLE_STAGES.length - 1 && (
                              <div
                                className={`w-0.5 h-6 ${
                                  isPast ? 'bg-primary/40' : 'bg-border'
                                }`}
                              />
                            )}
                          </div>

                          {/* Label */}
                          <span
                            className={`text-xs py-1 ${
                              isCurrent
                                ? 'text-primary font-bold'
                                : isPast
                                ? colors.text
                                : 'text-muted-foreground'
                            }`}
                          >
                            {stage}
                          </span>

                          {/* Current stage badge */}
                          {isCurrent && (
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1.5 py-0 ml-auto">
                              Current
                            </Badge>
                          )}

                          {/* Stage count */}
                          {!isCurrent && count > 0 && (
                            <span className={`text-[10px] ml-auto ${colors.text}`}>
                              {count}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Action Buttons */}
                {(() => {
                  const stageIdx = getStageIndex(selectedSample.stage)
                  const canAdvance = selectedSample.status === 'In Progress' && stageIdx < SAMPLE_STAGES.length - 1
                  const canMarkReady = selectedSample.stage === 'Finishing' && selectedSample.status === 'In Progress'
                  const canSubmit = selectedSample.stage === 'Ready' && selectedSample.status === 'In Progress'
                  const canApprove = selectedSample.status === 'Submitted'
                  const canReject = selectedSample.status === 'Submitted'
                  const canRevise = selectedSample.status === 'Rejected'

                  if (!canAdvance && !canMarkReady && !canSubmit && !canApprove && !canReject && !canRevise) return null

                  return (
                    <div className="flex flex-wrap gap-2">
                      {canMarkReady && (
                        <Button
                          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => handleAdvanceStage(selectedSample.id)}
                          disabled={actionLoading === selectedSample.id}
                        >
                          {actionLoading === selectedSample.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                            <>
                              <PackageOpen className="h-3.5 w-3.5" />
                              Mark Ready
                            </>
                          )}
                        </Button>
                      )}
                      {canAdvance && !canMarkReady && (
                        <Button
                          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => handleAdvanceStage(selectedSample.id)}
                          disabled={actionLoading === selectedSample.id}
                        >
                          {actionLoading === selectedSample.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                            <>
                              <ChevronRight className="h-3.5 w-3.5" />
                              Advance to {SAMPLE_STAGES[stageIdx + 1]}
                            </>
                          )}
                        </Button>
                      )}
                      {canSubmit && (
                        <Button
                          variant="outline"
                          className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => handleStatusChange(selectedSample.id, 'Submitted')}
                          disabled={actionLoading === selectedSample.id}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Submit for Review
                        </Button>
                      )}
                      {canApprove && (
                        <Button
                          variant="outline"
                          className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => handleStatusChange(selectedSample.id, 'Approved')}
                          disabled={actionLoading === selectedSample.id}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          variant="outline"
                          className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                          onClick={() => handleStatusChange(selectedSample.id, 'Rejected')}
                          disabled={actionLoading === selectedSample.id}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      )}
                      {canRevise && (
                        <Button
                          variant="outline"
                          className="gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                          onClick={() => handleStatusChange(selectedSample.id, 'Revised')}
                          disabled={actionLoading === selectedSample.id}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Start Revision
                        </Button>
                      )}
                    </div>
                  )
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}