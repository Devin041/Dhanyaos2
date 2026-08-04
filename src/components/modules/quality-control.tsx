'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
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
  ShieldCheck,
  Layers,
  Scissors,
  Cog,
  Sparkles,
  CheckCircle,
  Plus,
  Search,
  Eye,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Constants ──────────────────────────────────────────────────────────────

const INSPECTION_POINTS = [
  { name: 'Fabric Check', icon: Layers, color: 'text-sky-400', bg: 'bg-sky-500/10' },
  { name: 'Cutting Check', icon: Scissors, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { name: 'In-Process Check', icon: Cog, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { name: 'Finishing Check', icon: Sparkles, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { name: 'Final Inspection', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
] as const

const COMMON_DEFECTS = [
  'Stitching Defect',
  'Fabric Defect',
  'Color Variation',
  'Size Variation',
  'Seam Puckering',
  'Thread Snarl',
  'Missing Stitch',
  'Oil Stain',
  'Hole / Cut Mark',
  'Embroidery Defect',
  'Print Defect',
  'Button / Accessory Issue',
  'Hemming Issue',
  'Label Misplacement',
  'Pattern Mismatch',
]

const POINT_COLORS: Record<string, string> = {
  'Fabric Check': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'Cutting Check': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'In-Process Check': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Finishing Check': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'Final Inspection': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductionJobRef {
  id: string
  jobNo: string
  styleNo: string
  styleName: string
}

interface QualityCheck {
  id: string
  checkNo: string
  productionJobId: string
  productionJob: ProductionJobRef
  inspectionPoint: string
  checkedQty: number
  passedQty: number
  failedQty: number
  defectType: string | null
  defectCount: number
  severity: string
  status: string
  inspectorName: string | null
  notes: string | null
  checkedAt: string
}

interface QualityData {
  checks: QualityCheck[]
  total: number
  inspectionCounts: Record<string, number>
  statusCounts: Record<string, number>
  severityCounts: Record<string, number>
  summary: {
    totalChecked: number
    totalPassed: number
    totalFailed: number
    passRate: number
    criticalDefects: number
    topDefects: { type: string; count: number }[]
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function passRateColor(rate: number): string {
  if (rate >= 95) return 'text-emerald-400'
  if (rate >= 85) return 'text-amber-400'
  return 'text-red-400'
}

function passRateBarColor(rate: number): string {
  if (rate >= 95) return 'bg-emerald-500'
  if (rate >= 85) return 'bg-amber-500'
  return 'bg-red-500'
}

function statusBadge(status: string) {
  switch (status) {
    case 'Pass':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'Fail':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'Conditional':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'Minor':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'Major':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'Critical':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function getPointPassRate(checks: QualityCheck[], point: string): number {
  const filtered = checks.filter((c) => c.inspectionPoint === point)
  const total = filtered.reduce((s, c) => s + c.checkedQty, 0)
  const passed = filtered.reduce((s, c) => s + c.passedQty, 0)
  return total > 0 ? Math.round((passed / total) * 100) : 100
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QualityControlModule() {
  // Filters
  const [search, setSearch] = useState('')
  const [pointFilter, setPointFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')

  // Data
  const [data, setData] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const limit = 15

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selected, setSelected] = useState<QualityCheck | null>(null)
  const [saving, setSaving] = useState(false)

  // Jobs for create dialog
  const [jobs, setJobs] = useState<ProductionJobRef[]>([])

  // Create form
  const [form, setForm] = useState({
    productionJobId: '',
    inspectionPoint: '',
    checkedQty: '',
    passedQty: '',
    defectType: '',
    defectCount: '',
    severity: 'Minor',
    inspectorName: '',
    notes: '',
  })

  // Edit form
  const [editForm, setEditForm] = useState({
    passedQty: '',
    defectType: '',
    severity: 'Minor',
    notes: '',
  })

  // ─── Fetch data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (pointFilter !== 'all') params.set('inspectionPoint', pointFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (severityFilter !== 'all') params.set('severity', severityFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/quality?${params.toString()}`)
      if (res.ok) setData(await res.json())
    } catch (err) {
      console.error('Failed to fetch quality data:', err)
    } finally {
      setLoading(false)
    }
  }, [pointFilter, statusFilter, severityFilter, search, page])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/production')
      if (res.ok) {
        const json = await res.json()
        setJobs(json.jobs.map((j: { id: string; jobNo: string; styleNo: string; styleName: string }) => ({
          id: j.id,
          jobNo: j.jobNo,
          styleNo: j.styleNo,
          styleName: j.styleName,
        })))
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(1)
  }, [pointFilter, statusFilter, severityFilter, search])

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.productionJobId || !form.inspectionPoint || !form.checkedQty) return
    try {
      setSaving(true)
      const body: Record<string, unknown> = {
        productionJobId: form.productionJobId,
        inspectionPoint: form.inspectionPoint,
        checkedQty: Number(form.checkedQty),
        passedQty: form.passedQty ? Number(form.passedQty) : undefined,
        severity: form.severity,
        inspectorName: form.inspectorName || undefined,
        notes: form.notes || undefined,
      }
      if (Number(form.checkedQty) > Number(form.passedQty || form.checkedQty)) {
        body.defectType = form.defectType || undefined
        body.defectCount = form.defectCount ? Number(form.defectCount) : undefined
      }
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Inspection created successfully')
        setCreateOpen(false)
        setForm({
          productionJobId: '',
          inspectionPoint: '',
          checkedQty: '',
          passedQty: '',
          defectType: '',
          defectCount: '',
          severity: 'Minor',
          inspectorName: '',
          notes: '',
        })
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to create inspection')
      }
    } catch {
      toast.error('Failed to create inspection')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selected) return
    try {
      setSaving(true)
      const res = await fetch(`/api/quality/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passedQty: editForm.passedQty ? Number(editForm.passedQty) : undefined,
          defectType: editForm.defectType || null,
          severity: editForm.severity,
          notes: editForm.notes || null,
        }),
      })
      if (res.ok) {
        toast.success('Inspection updated')
        setEditOpen(false)
        setSelected(null)
        fetchData()
      }
    } catch {
      toast.error('Failed to update inspection')
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (check: QualityCheck) => {
    setSelected(check)
    setDetailOpen(true)
  }

  const openEdit = (check: QualityCheck) => {
    setSelected(check)
    setEditForm({
      passedQty: String(check.passedQty),
      defectType: check.defectType || '',
      severity: check.severity,
      notes: check.notes || '',
    })
    setEditOpen(true)
  }

  const openCreate = () => {
    fetchJobs()
    setCreateOpen(true)
  }

  const computedFailed = Number(form.checkedQty || 0) - Number(form.passedQty || form.checkedQty || 0)

  // ─── Computed ───────────────────────────────────────────────────────────

  const totalPages = data ? Math.ceil(data.total / limit) : 1

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold lg:text-2xl">Quality Control</h1>
            <p className="text-xs text-muted-foreground">
              {data ? `${fmt(data.total)} inspections recorded` : 'Loading...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="quality" />
          <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Inspection
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <LoadingSkeleton />
      ) : !data ? (
        <EmptyState />
      ) : (
        <>
          {/* Inspection Point Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {INSPECTION_POINTS.map((point) => {
              const count = data.inspectionCounts[point.name] || 0
              const rate = getPointPassRate(data.checks, point.name)
              const Icon = point.icon
              const active = pointFilter === point.name
              return (
                <Card
                  key={point.name}
                  className={`glass-card cursor-pointer transition-all hover:border-primary/30 ${active ? 'ring-1 ring-primary/50 border-primary/40' : 'border-border'}`}
                  onClick={() => setPointFilter(active ? 'all' : point.name)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${point.bg}`}>
                        <Icon className={`h-4 w-4 ${point.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{point.name}</p>
                        <p className="text-[11px] text-muted-foreground">{fmt(count)} checks</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${passRateBarColor(rate)}`} style={{ width: `${rate}%` }} />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${passRateColor(rate)}`}>{rate}%</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="glass-card border-border border-l-2 border-l-muted">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Inspections</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(data.total)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{fmt(data.summary.totalChecked)} pieces checked</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border border-l-2 border-l-emerald-500">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pass Rate</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${passRateColor(data.summary.passRate)}`}>
                  {data.summary.passRate}%
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{fmt(data.summary.totalPassed)} pieces passed</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border border-l-2 border-l-red-500">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Failed Pieces</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-red-400">{fmt(data.summary.totalFailed)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {data.statusCounts.Fail || 0} failed inspections
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border border-l-2 border-l-red-600">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Critical Defects</p>
                  {data.summary.criticalDefects > 0 && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-red-400">
                  {data.summary.criticalDefects}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {data.severityCounts.Critical || 0} critical records
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search checks, styles, defects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-muted/50 border-border"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={pointFilter} onValueChange={setPointFilter}>
                <SelectTrigger className="w-[160px] bg-muted/50 border-border h-9 text-xs">
                  <SelectValue placeholder="Inspection Point" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Points</SelectItem>
                  {INSPECTION_POINTS.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] bg-muted/50 border-border h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pass">Pass</SelectItem>
                  <SelectItem value="Fail">Fail</SelectItem>
                  <SelectItem value="Conditional">Conditional</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[130px] bg-muted/50 border-border h-9 text-xs">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="Minor">Minor</SelectItem>
                  <SelectItem value="Major">Major</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Defect Analysis */}
          {data.summary.topDefects.length > 0 && (
            <Card className="glass-card border-border">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Top Defect Analysis
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-2 font-medium">Defect Type</th>
                        <th className="text-right py-2 font-medium">Count</th>
                        <th className="text-right py-2 font-medium">Frequency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.summary.topDefects.map((d) => (
                        <tr key={d.type} className="border-b border-border/50 last:border-0">
                          <td className="py-2 font-medium">{d.type}</td>
                          <td className="py-2 text-right tabular-nums text-red-400">{fmt(d.count)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {data.summary.totalChecked > 0
                              ? ((d.count / data.summary.totalChecked) * 100).toFixed(1)
                              : 0}
                            %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table (Desktop) / Cards (Mobile) */}
          {data.checks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No inspections found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Adjust filters or create a new inspection</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block glass-card border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background/90 backdrop-blur-sm">
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-3 px-4 font-medium">Check No</th>
                        <th className="text-left py-3 px-4 font-medium">Production Job</th>
                        <th className="text-left py-3 px-4 font-medium">Point</th>
                        <th className="text-right py-3 px-4 font-medium">Checked</th>
                        <th className="text-right py-3 px-4 font-medium">Passed</th>
                        <th className="text-right py-3 px-4 font-medium">Failed</th>
                        <th className="text-left py-3 px-4 font-medium">Pass Rate</th>
                        <th className="text-left py-3 px-4 font-medium">Defect</th>
                        <th className="text-left py-3 px-4 font-medium">Severity</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Inspector</th>
                        <th className="text-left py-3 px-4 font-medium">Date</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.checks.map((check) => {
                        const rate = check.checkedQty > 0 ? Math.round((check.passedQty / check.checkedQty) * 100) : 100
                        return (
                          <tr key={check.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="py-2.5 px-4 font-mono text-primary font-medium">{check.checkNo}</td>
                            <td className="py-2.5 px-4">
                              <p className="font-medium">{check.productionJob.jobNo}</p>
                              <p className="text-[11px] text-muted-foreground">{check.productionJob.styleName}</p>
                            </td>
                            <td className="py-2.5 px-4">
                              <Badge variant="outline" className={`text-[10px] ${POINT_COLORS[check.inspectionPoint] || ''}`}>
                                {check.inspectionPoint}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{fmt(check.checkedQty)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-emerald-400">{fmt(check.passedQty)}</td>
                            <td className={`py-2.5 px-4 text-right tabular-nums ${check.failedQty > 0 ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
                              {fmt(check.failedQty)}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full ${passRateBarColor(rate)}`} style={{ width: `${rate}%` }} />
                                </div>
                                <span className={`text-[11px] font-bold tabular-nums ${passRateColor(rate)}`}>{rate}%</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground">{check.defectType || '—'}</td>
                            <td className="py-2.5 px-4">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${severityBadge(check.severity)} ${check.severity === 'Critical' ? 'animate-pulse' : ''}`}
                              >
                                {check.severity}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4">
                              <Badge variant="outline" className={`text-[10px] ${statusBadge(check.status)}`}>
                                {check.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground">{check.inspectorName || '—'}</td>
                            <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{fmtDate(check.checkedAt)}</td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(check)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(check)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {data.checks.map((check) => {
                  const rate = check.checkedQty > 0 ? Math.round((check.passedQty / check.checkedQty) * 100) : 100
                  return (
                    <Card key={check.id} className="glass-card border-border">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-mono text-primary font-medium text-sm">{check.checkNo}</p>
                            <p className="text-[11px] text-muted-foreground">{check.productionJob.jobNo} · {check.productionJob.styleName}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${statusBadge(check.status)}`}>{check.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${POINT_COLORS[check.inspectionPoint] || ''}`}>
                            {check.inspectionPoint}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${severityBadge(check.severity)} ${check.severity === 'Critical' ? 'animate-pulse' : ''}`}
                          >
                            {check.severity}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">Checked</p>
                            <p className="text-sm font-bold tabular-nums">{fmt(check.checkedQty)}</p>
                          </div>
                          <div className="bg-emerald-500/5 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">Passed</p>
                            <p className="text-sm font-bold tabular-nums text-emerald-400">{fmt(check.passedQty)}</p>
                          </div>
                          <div className="bg-red-500/5 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">Failed</p>
                            <p className={`text-sm font-bold tabular-nums ${check.failedQty > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{fmt(check.failedQty)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${passRateBarColor(rate)}`} style={{ width: `${rate}%` }} />
                          </div>
                          <span className={`text-xs font-bold tabular-nums ${passRateColor(rate)}`}>{rate}%</span>
                        </div>
                        {check.defectType && (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium">Defect:</span> {check.defectType} ({check.defectCount})
                          </p>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                          <p className="text-[11px] text-muted-foreground">
                            {check.inspectorName || '—'} · {fmtDate(check.checkedAt)}
                          </p>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(check)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(check)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages} · {fmt(data.total)} results
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Create Inspection Dialog ────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">New Quality Inspection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Production Job *</Label>
              <Select value={form.productionJobId} onValueChange={(v) => setForm({ ...form, productionJobId: v })}>
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.jobNo} — {j.styleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Inspection Point *</Label>
              <Select value={form.inspectionPoint} onValueChange={(v) => setForm({ ...form, inspectionPoint: v })}>
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue placeholder="Select point..." />
                </SelectTrigger>
                <SelectContent>
                  {INSPECTION_POINTS.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Checked Qty *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50"
                  value={form.checkedQty}
                  onChange={(e) => setForm({ ...form, checkedQty: e.target.value, passedQty: form.passedQty || e.target.value })}
                  className="bg-muted/50 border-border"
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Passed Qty</Label>
                <Input
                  type="number"
                  placeholder="e.g. 48"
                  value={form.passedQty || form.checkedQty}
                  onChange={(e) => setForm({ ...form, passedQty: e.target.value })}
                  className="bg-muted/50 border-border"
                  min={0}
                  max={Number(form.checkedQty || 0)}
                />
              </div>
            </div>
            {computedFailed > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-3">
                <p className="font-medium text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {fmt(computedFailed)} failed piece{computedFailed > 1 ? 's' : ''} detected
                </p>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Defect Type</Label>
                  <Select value={form.defectType} onValueChange={(v) => setForm({ ...form, defectType: v })}>
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue placeholder="Select defect type..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-48">
                      {COMMON_DEFECTS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Defect Count</Label>
                  <Input
                    type="number"
                    placeholder={String(computedFailed)}
                    value={form.defectCount}
                    onChange={(e) => setForm({ ...form, defectCount: e.target.value })}
                    className="bg-muted/50 border-border"
                    min={0}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Severity</Label>
              <RadioGroup
                value={form.severity}
                onValueChange={(v) => setForm({ ...form, severity: v })}
                className="flex gap-4"
              >
                {['Minor', 'Major', 'Critical'].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <RadioGroupItem value={s} id={`sev-${s}`} />
                    <Label htmlFor={`sev-${s}`} className={`text-xs cursor-pointer ${s === 'Critical' ? 'text-red-400' : s === 'Major' ? 'text-orange-400' : 'text-amber-400'}`}>
                      {s}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Inspector Name</Label>
                <Input
                  placeholder="Name"
                  value={form.inspectorName}
                  onChange={(e) => setForm({ ...form, inspectorName: e.target.value })}
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Status (auto)</Label>
                <div className="flex items-center h-9 px-3 rounded-md bg-muted/50 border-border">
                  {(() => {
                    const checked = Number(form.checkedQty || 0)
                    const passed = Number(form.passedQty || form.checkedQty || 0)
                    const failed = checked - passed
                    const r = checked > 0 ? (passed / checked) * 100 : 100
                    const autoStatus = r === 100 ? 'Pass' : failed > 5 ? 'Fail' : 'Conditional'
                    return (
                      <Badge variant="outline" className={`text-[10px] ${statusBadge(autoStatus)}`}>{autoStatus}</Badge>
                    )
                  })()}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-muted/50 border-border min-h-[60px]"
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleCreate}
                disabled={saving || !form.productionJobId || !form.inspectionPoint || !form.checkedQty}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Inspection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ──────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="glass-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground font-mono">{selected?.checkNo}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Production Job</p>
                  <p className="font-medium">{selected.productionJob.jobNo}</p>
                  <p className="text-muted-foreground">{selected.productionJob.styleName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Inspection Point</p>
                  <Badge variant="outline" className={`text-[10px] ${POINT_COLORS[selected.inspectionPoint] || ''}`}>
                    {selected.inspectionPoint}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Checked Qty</p>
                  <p className="font-bold tabular-nums">{fmt(selected.checkedQty)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Passed Qty</p>
                  <p className="font-bold tabular-nums text-emerald-400">{fmt(selected.passedQty)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Failed Qty</p>
                  <p className={`font-bold tabular-nums ${selected.failedQty > 0 ? 'text-red-400' : ''}`}>
                    {fmt(selected.failedQty)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Pass Rate</p>
                  {(() => {
                    const r = selected.checkedQty > 0 ? Math.round((selected.passedQty / selected.checkedQty) * 100) : 100
                    return (
                      <div className="flex items-center gap-2">
                        <span className={`font-bold tabular-nums ${passRateColor(r)}`}>{r}%</span>
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${passRateBarColor(r)}`} style={{ width: `${r}%` }} />
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Defect Type</p>
                  <p className="font-medium">{selected.defectType || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Defect Count</p>
                  <p className="font-medium tabular-nums">{selected.defectCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Severity</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${severityBadge(selected.severity)} ${selected.severity === 'Critical' ? 'animate-pulse' : ''}`}
                  >
                    {selected.severity}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`text-[10px] ${statusBadge(selected.status)}`}>
                    {selected.status}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Inspector</p>
                  <p className="font-medium">{selected.inspectorName || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Checked At</p>
                  <p className="font-medium">{fmtDate(selected.checkedAt)}</p>
                </div>
              </div>
              {selected.notes && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs">
                  <p className="text-muted-foreground mb-1">Notes</p>
                  <p>{selected.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="glass-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Inspection — {selected?.checkNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Passed Qty</Label>
              <Input
                type="number"
                value={editForm.passedQty}
                onChange={(e) => setEditForm({ ...editForm, passedQty: e.target.value })}
                className="bg-muted/50 border-border"
                min={0}
                max={selected?.checkedQty || 0}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Defect Type</Label>
              <Select value={editForm.defectType} onValueChange={(v) => setEditForm({ ...editForm, defectType: v })}>
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue placeholder="Select defect..." />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  <SelectItem value="none">None</SelectItem>
                  {COMMON_DEFECTS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Severity</Label>
              <RadioGroup
                value={editForm.severity}
                onValueChange={(v) => setEditForm({ ...editForm, severity: v })}
                className="flex gap-4"
              >
                {['Minor', 'Major', 'Critical'].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <RadioGroupItem value={s} id={`edit-sev-${s}`} />
                    <Label htmlFor={`edit-sev-${s}`} className={`text-xs cursor-pointer ${s === 'Critical' ? 'text-red-400' : s === 'Major' ? 'text-orange-400' : 'text-amber-400'}`}>
                      {s}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="Notes..."
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="bg-muted/50 border-border min-h-[60px]"
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleEdit}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="glass-card border-border">
            <CardContent className="p-4">
              <Skeleton className="h-8 w-8 rounded-lg mb-2" />
              <Skeleton className="h-3 w-24 mb-1" />
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="glass-card border-border">
            <CardContent className="p-4">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="glass-card border-border">
          <CardContent className="p-4">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <ShieldCheck className="h-8 w-8 text-primary/60" />
      </div>
      <h2 className="text-lg font-bold">Quality Control</h2>
      <p className="max-w-sm text-sm text-muted-foreground mt-2">
        No inspections recorded yet. Start by creating your first quality inspection for a production job.
      </p>
    </div>
  )
}