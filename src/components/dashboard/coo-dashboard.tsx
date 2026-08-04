'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Factory,
  Gauge,
  Target,
  Users,
  Cog,
  AlertTriangle,
  Clock,
  TrendingUp,
  ListOrdered,
  ShieldAlert,
  Timer,
  Activity,
  Package,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Capacity {
  totalWorkers: number
  totalDailyCapacity: number
  utilizedCapacity: number
  utilizationPct: number
  dailyOutputTarget: number
  actualDailyOutput: number
  avgProduction30d: number
}

interface ProductionTrendItem {
  date: string
  output: number
  target: number
}

interface ActiveJob {
  jobNo: string
  styleNo: string
  styleName: string
  targetQty: number
  completedQty: number
  stage: string
  status: string
  progress: number
  endDate: string | null
  daysRemaining: number | null
  isOverdue: boolean
}

interface MachineUtilItem {
  stage: string
  jobCount: number
  totalQty: number
  completedQty: number
  utilization: number
}

interface Worker {
  id: string
  name: string
  designation: string
  dailyOutput: number
  efficiency: number
  pieceRate: number
}

interface PendingJob {
  orderNo: string
  customer: string
  totalQty: number
  styles: string
  styleCount: number
  status: string
  deliveryDate: string
  daysToDelivery: number | null
  amount: number
}

interface QualityIssue {
  id: string
  type: string
  severity: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

interface ProductionDelay {
  jobNo: string
  styleName: string
  stage: string
  targetQty: number
  completedQty: number
  progress: number
  endDate: string | null
  daysOverdue: number
}

interface Summary {
  totalJobs: number
  completedJobs: number
  activeJobsCount: number
  delayedJobsCount: number
  pendingJobsQueueCount: number
}

interface DashboardData {
  capacity: Capacity
  productionTrend: ProductionTrendItem[]
  activeJobs: ActiveJob[]
  machineUtilization: MachineUtilItem[]
  workers: Worker[]
  pendingJobsQueue: PendingJob[]
  qualityIssues: QualityIssue[]
  productionDelays: ProductionDelay[]
  delayAlerts: QualityIssue[]
  summary: Summary
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCompact(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('en-IN')
}

// ─── Custom Tooltips ─────────────────────────────────────────────────────────

function ProductionTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold">{entry.value.toLocaleString('en-IN')} pcs</span>
        </div>
      ))}
    </div>
  )
}

function UtilizationTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-primary">{payload[0].value}%</p>
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  subtitle?: string
  color: string
}) {
  return (
    <Card className="glass-card border-l-2 border-l-primary/40 transition-all hover:border-l-primary/80">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-4">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-6">
              <Skeleton className="mb-4 h-4 w-48" />
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Status / Stage Helpers ──────────────────────────────────────────────────

const stageColors: Record<string, string> = {
  Cutting: 'bg-amber-500',
  Embroidery: 'bg-purple-500',
  Stitching: 'bg-blue-500',
  Finishing: 'bg-cyan-500',
  'Quality Check': 'bg-emerald-500',
  Packing: 'bg-teal-500',
  Dispatch: 'bg-primary',
}

const stageBarColors: Record<string, string> = {
  Cutting: 'oklch(0.8 0.15 75)',
  Embroidery: 'oklch(0.7 0.15 300)',
  Stitching: 'oklch(0.65 0.15 250)',
  Finishing: 'oklch(0.7 0.12 200)',
  'Quality Check': 'oklch(0.72 0.18 145)',
  Packing: 'oklch(0.7 0.1 180)',
  Dispatch: 'oklch(0.78 0.14 85)',
}

const severityConfig: Record<string, { dot: string; badge: string }> = {
  critical: { dot: 'bg-red-500', badge: 'bg-red-500/15 text-red-400 border-red-500/20' },
  high: { dot: 'bg-orange-500', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-500 border-amber-500/20' },
  medium: { dot: 'bg-yellow-500', badge: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20' },
  info: { dot: 'bg-blue-400', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  low: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CooDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fgKpi, setFgKpi] = useState<any>(null)
  const [fgKpiLoading, setFgKpiLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/coo')
      const json = await res.json()
      if (json.error) return
      setData(json)
    } catch (err) {
      console.error('Failed to fetch COO dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFgKpi = useCallback(async () => {
    try {
      const res = await fetch('/api/fg-dashboard-kpi')
      const json = await res.json()
      if (!json.error) setFgKpi(json)
    } catch {
      // FG KPI is optional
    } finally {
      setFgKpiLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    fetchFgKpi()
    const interval = setInterval(fetchDashboard, 30000)
    return () => clearInterval(interval)
  }, [fetchDashboard, fetchFgKpi])

  if (loading || !data) return <DashboardSkeleton />

  const cap = data.capacity

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            COO Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Dhanya Lifestyle LLP — Production &amp; Operations Command Center
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · Last updated just now
        </div>
      </div>

      {/* ─── Row 1: Production Capacity KPIs ──────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={Users}
          label="Total Workers"
          value={cap.totalWorkers}
          subtitle={`${cap.totalDailyCapacity} pcs/day capacity`}
          color="oklch(0.7 0.15 250)"
        />
        <KPICard
          icon={Gauge}
          label="Utilization"
          value={`${cap.utilizationPct}%`}
          subtitle={`${cap.utilizedCapacity} of ${cap.totalDailyCapacity} pcs`}
          color={cap.utilizationPct >= 75 ? '#10b981' : cap.utilizationPct >= 50 ? '#f59e0b' : '#ef4444'}
        />
        <KPICard
          icon={Target}
          label="Daily Output Target"
          value={`${cap.dailyOutputTarget} pcs`}
          subtitle={`Actual: ${cap.actualDailyOutput} pcs`}
          color="oklch(0.78 0.14 85)"
        />
        <KPICard
          icon={TrendingUp}
          label="Avg Daily Output (30d)"
          value={`${cap.avgProduction30d} pcs`}
          subtitle={`${data.activeJobs.length} active jobs`}
          color="oklch(0.72 0.18 145)"
        />
        <KPICard
          icon={Factory}
          label="Total Jobs"
          value={data.summary.totalJobs}
          subtitle={`${data.summary.completedJobs} completed`}
          color="oklch(0.7 0.12 200)"
        />
        <KPICard
          icon={Cog}
          label="Pending in Queue"
          value={data.summary.pendingJobsQueueCount}
          subtitle="Orders awaiting production"
          color="#f59e0b"
        />
        <KPICard
          icon={Timer}
          label="Delayed Jobs"
          value={data.summary.delayedJobsCount}
          subtitle={data.summary.delayedJobsCount > 0 ? 'Requires immediate attention' : 'All on track'}
          color={data.summary.delayedJobsCount > 0 ? '#ef4444' : '#10b981'}
        />
        <KPICard
          icon={Activity}
          label="Efficiency Rate"
          value={cap.utilizationPct >= 75 ? 'On Target' : cap.utilizationPct >= 50 ? 'Moderate' : 'Low'}
          subtitle={`${cap.utilizationPct}% utilization`}
          color={cap.utilizationPct >= 75 ? '#10b981' : cap.utilizationPct >= 50 ? '#f59e0b' : '#ef4444'}
        />
      </div>

      {/* ─── Row 2: Production Efficiency Chart + Machine Utilization ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Production Efficiency — 30 Day Trend */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Production Output (30 Days)
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Target: {cap.dailyOutputTarget} pcs/day
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.productionTrend}>
                  <defs>
                    <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip content={<ProductionTooltip />} />
                  <ReferenceLine
                    y={cap.dailyOutputTarget}
                    stroke="oklch(0.65 0.22 25)"
                    strokeDasharray="6 4"
                    opacity={0.6}
                    label={{ value: 'Target', fill: 'oklch(0.65 0.22 25)', fontSize: 10, position: 'right' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="output"
                    name="Output"
                    stroke="oklch(0.78 0.14 85)"
                    fill="url(#gradOutput)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Machine / Stage Utilization */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stage Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.machineUtilization} layout="vertical" barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.2} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fill: 'oklch(0.7 0.01 260)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip content={<UtilizationTooltip />} />
                  <Bar
                    dataKey="utilization"
                    name="Utilization"
                    radius={[0, 6, 6, 0]}
                    fill="oklch(0.78 0.14 85)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Stage Progress Bars */}
            <div className="mt-4 space-y-3">
              {data.machineUtilization.map((m) => (
                <div key={m.stage} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${stageColors[m.stage] || 'bg-muted-foreground'}`} />
                      <span className="text-xs font-medium">{m.stage}</span>
                      <span className="text-xs text-muted-foreground">{m.jobCount} jobs</span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {m.completedQty}/{m.totalQty} pcs · {m.utilization}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${m.utilization}%`,
                        backgroundColor: stageBarColors[m.stage] || 'oklch(0.78 0.14 85)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 3: Active Production Jobs Table ─────────────────── */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Active Production Jobs
            </CardTitle>
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
              {data.activeJobs.length} Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs">Job #</TableHead>
                  <TableHead className="text-xs">Style</TableHead>
                  <TableHead className="text-xs">Stage</TableHead>
                  <TableHead className="text-xs">Progress</TableHead>
                  <TableHead className="text-xs">Qty</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs">Days Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activeJobs.map((job) => (
                  <TableRow
                    key={job.jobNo}
                    className={`border-border/30 ${job.isOverdue ? 'bg-red-500/5' : ''}`}
                  >
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-primary">
                        {job.jobNo}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs font-medium">{job.styleName}</p>
                        <p className="text-[10px] text-muted-foreground">{job.styleNo}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${stageColors[job.stage] || 'bg-muted-foreground'}`} />
                        <span className="text-xs">{job.stage}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={job.progress} className="h-1.5 flex-1" />
                        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                          {job.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {job.completedQty}/{job.targetQty}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.endDate || '—'}
                    </TableCell>
                    <TableCell>
                      {job.daysRemaining !== null && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            job.isOverdue
                              ? 'bg-red-500/15 text-red-400 border-red-500/20'
                              : job.daysRemaining <= 3
                                ? 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {job.isOverdue
                            ? `${Math.abs(job.daysRemaining)}d overdue`
                            : `${job.daysRemaining}d left`}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.activeJobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      No active production jobs
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Row 4: Worker Productivity + Pending Queue + Quality ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Worker Productivity */}
        <Card className="glass-card lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Worker Productivity
              </CardTitle>
              <Badge variant="outline" className="border-primary/30 text-primary">
                {data.workers.length} Workers
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[400px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Worker</TableHead>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs">Output</TableHead>
                    <TableHead className="text-xs">Efficiency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.workers.map((w) => (
                    <TableRow key={w.id} className="border-border/30">
                      <TableCell>
                        <p className="text-xs font-medium">{w.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatINR(w.pieceRate)}/pc</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-[10px] text-muted-foreground">{w.designation}</span>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums font-medium">
                        {w.dailyOutput} pcs
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/50">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                w.efficiency >= 85
                                  ? 'bg-emerald-500'
                                  : w.efficiency >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${w.efficiency}%` }}
                            />
                          </div>
                          <span
                            className={`text-[10px] font-medium ${
                              w.efficiency >= 85
                                ? 'text-emerald-400'
                                : w.efficiency >= 70
                                  ? 'text-amber-500'
                                  : 'text-red-400'
                            }`}
                          >
                            {w.efficiency}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pending Jobs Queue */}
        <Card className="glass-card lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pending Jobs Queue
              </CardTitle>
              <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                {data.pendingJobsQueue.length} Orders
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
              {data.pendingJobsQueue.map((job) => (
                <div
                  key={job.orderNo}
                  className="rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {job.orderNo}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          job.status === 'Confirmed'
                            ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                            : 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                        }`}
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold">{formatINR(job.amount)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{job.customer}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {job.totalQty} pcs · {job.styles}
                      {job.styleCount > 2 && ` +${job.styleCount - 2} more`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {job.deliveryDate}
                    </div>
                    {job.daysToDelivery !== null && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          job.daysToDelivery <= 3
                            ? 'bg-red-500/15 text-red-400 border-red-500/20'
                            : job.daysToDelivery <= 7
                              ? 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {job.daysToDelivery}d to delivery
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {data.pendingJobsQueue.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  No pending orders in queue
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quality Issues */}
        <Card className="glass-card lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Quality Issues
              </CardTitle>
              {data.qualityIssues.length > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {data.qualityIssues.filter(q => !q.isRead).length} New
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
              {data.qualityIssues.map((issue) => {
                const severity = severityConfig[issue.severity] || severityConfig.info
                return (
                  <div
                    key={issue.id}
                    className={`border-l-2 border-l-red-500 rounded-r-lg border border-border/50 p-3 transition-colors hover:bg-muted/20 ${
                      !issue.isRead ? 'bg-muted/10' : 'opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severity.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{issue.title}</p>
                          <Badge variant="outline" className={`text-[10px] ${severity.badge}`}>
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                          {issue.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {data.qualityIssues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShieldAlert className="mb-2 h-8 w-8 text-emerald-500/50" />
                  <p className="text-sm font-medium text-emerald-400">No quality issues</p>
                  <p className="text-xs text-muted-foreground">All production lines are clean</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── FG Stock Alert Widget ─────────────────────────────────── */}
      <Card className="glass-card border-l-4 border-l-amber-500 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Package className="h-4 w-4 text-amber-500" />
              </div>
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                FG Stock Alerts
              </CardTitle>
            </div>
            {fgKpi && (fgKpi.lowStockStyles + fgKpi.criticalStyles) > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {fgKpi.lowStockStyles + fgKpi.criticalStyles} at risk
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {fgKpiLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          ) : fgKpi ? (
            <div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Low Stock</p>
                  <p className="text-xl font-bold text-amber-500">{fgKpi.lowStockStyles}</p>
                  <p className="text-[10px] text-muted-foreground">styles</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Critical</p>
                  <p className="text-xl font-bold text-red-400">{fgKpi.criticalStyles}</p>
                  <p className="text-[10px] text-muted-foreground">styles</p>
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                  <p className="text-xs text-muted-foreground">QC Pending</p>
                  <p className="text-xl font-bold text-sky-400">{fgKpi.qcPendingPieces}</p>
                  <p className="text-[10px] text-muted-foreground">pieces</p>
                </div>
                <div className="rounded-lg border border-muted-foreground/20 bg-muted/5 p-3">
                  <p className="text-xs text-muted-foreground">Dead Stock</p>
                  <p className="text-xl font-bold text-muted-foreground">{fgKpi.deadStockPieces}</p>
                  <p className="text-[10px] text-muted-foreground">pieces</p>
                </div>
              </div>
              {fgKpi.lowStockStylesList && fgKpi.lowStockStylesList.length > 0 && (
                <div className="mt-4 border-t border-border/50 pt-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Low Stock Styles</p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {fgKpi.lowStockStylesList.slice(0, 5).map((style: any) => (
                      <div
                        key={style.styleNo}
                        className="flex items-center gap-2.5 rounded-lg border border-border/50 p-2.5 shrink-0 transition-colors hover:bg-muted/20"
                      >
                        {style.image ? (
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            <img src={style.image} alt={style.styleNo} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{style.styleName}</p>
                          <p className="text-[10px] text-muted-foreground">{style.styleNo}</p>
                          <p className="text-xs font-semibold text-amber-500">{style.availableQty} pcs</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">No FG stock data available</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Row 5: Production Delays ─────────────────────────────── */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Production Delays
              </CardTitle>
            </div>
            {data.productionDelays.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {data.productionDelays.length} Delayed
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.productionDelays.length > 0 ? (
            <div className="max-h-[340px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Job #</TableHead>
                    <TableHead className="text-xs">Style</TableHead>
                    <TableHead className="text-xs">Stage</TableHead>
                    <TableHead className="text-xs">Progress</TableHead>
                    <TableHead className="text-xs">Qty</TableHead>
                    <TableHead className="text-xs">Due Date</TableHead>
                    <TableHead className="text-xs">Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.productionDelays.map((delay) => (
                    <TableRow key={delay.jobNo} className="border-border/30 bg-red-500/5">
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-red-400">
                          {delay.jobNo}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {delay.styleName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${stageColors[delay.stage] || 'bg-muted-foreground'}`} />
                          <span className="text-xs">{delay.stage}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={delay.progress} className="h-1.5 flex-1 [&>div]:bg-red-400" />
                          <span className="text-xs tabular-nums text-red-400 w-8 text-right">
                            {delay.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {delay.completedQty}/{delay.targetQty}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {delay.endDate}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-[10px]">
                          {delay.daysOverdue}d overdue
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <Activity className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-emerald-400">All jobs on schedule</p>
              <p className="text-xs text-muted-foreground">No production delays detected</p>
            </div>
          )}

          {/* Delay Alerts */}
          {data.delayAlerts.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-border/50 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Delay Alerts
              </p>
              {data.delayAlerts.slice(0, 5).map((alert) => {
                const severity = severityConfig[alert.severity] || severityConfig.warning
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-2 rounded-lg border border-border/50 p-3 ${
                      alert.severity === 'critical' ? 'border-l-2 border-l-red-500 bg-red-500/5' : 'border-l-2 border-l-amber-500 bg-amber-500/5'
                    }`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severity.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{alert.title}</p>
                        <Badge variant="outline" className={`text-[10px] ${severity.badge}`}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {alert.message}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Summary Footer ───────────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Active Jobs: <span className="font-semibold text-foreground">{data.summary.activeJobsCount}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span> Utilization: <span className="font-semibold text-foreground">{cap.utilizationPct}%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span> Avg Output: <span className="font-semibold text-foreground">{cap.avgProduction30d} pcs/day</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span> Pending Queue: <span className="font-semibold text-foreground">{data.summary.pendingJobsQueueCount} orders</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            {data.summary.delayedJobsCount} jobs delayed · {data.qualityIssues.length} quality issues
          </div>
        </CardContent>
      </Card>
    </div>
  )
}