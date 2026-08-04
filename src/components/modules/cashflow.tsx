'use client'

import { useEffect, useState, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  TrendingUp,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Gauge,
  Clock,
  Construction,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  ReferenceLine,
} from 'recharts'
import { differenceInDays, format, parseISO } from 'date-fns'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CashFlowSummary {
  openingBalance: number
  totalCashIn: number
  totalCashOut: number
  netCashFlow: number
  closingBalance: number
  avgDailyCashIn: number
  avgDailyCashOut: number
}

interface DailyFlowItem {
  date: string
  cashIn: number
  cashOut: number
  netFlow: number
  balance: number
}

interface BreakdownItem {
  category: string
  amount: number
  percent: number
}

interface UpcomingItem {
  description: string
  amount: number
  dueDate: string
  type: 'purchase' | 'order'
}

interface CashFlowData {
  summary: CashFlowSummary
  dailyFlow: DailyFlowItem[]
  inflowBreakdown: BreakdownItem[]
  outflowBreakdown: BreakdownItem[]
  upcomingOutflows: UpcomingItem[]
  upcomingInflows: UpcomingItem[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INR = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v)

const GOLD = 'oklch(0.78 0.14 85)'
const EMERALD = 'oklch(0.65 0.18 155)'
const RED = 'oklch(0.65 0.2 25)'
const SKY = 'oklch(0.7 0.15 250)'
const PURPLE = 'oklch(0.7 0.15 300)'
const ORANGE = 'oklch(0.75 0.15 65)'
const PINK = 'oklch(0.7 0.15 350)'
const TEAL = 'oklch(0.65 0.12 180)'
const LIME = 'oklch(0.72 0.18 130)'

const PIE_COLORS = [GOLD, EMERALD, SKY, PURPLE, ORANGE, PINK, TEAL, LIME, RED, 'oklch(0.6 0.1 300)']

const PERIOD_OPTIONS = [
  { label: '30D', value: 30 },
  { label: '60D', value: 60 },
  { label: '90D', value: 90 },
  { label: '180D', value: 180 },
  { label: '1Y', value: 365 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dueDate: string): number {
  return differenceInDays(parseISO(dueDate), new Date())
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(1)}L`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
  return String(value)
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CashFlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-muted-foreground">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-medium tabular-nums">{INR(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { percent: number } }> }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="font-medium">{item.name}</p>
      <p className="mt-0.5 tabular-nums">{INR(item.value)} · {item.payload.percent}%</p>
    </div>
  )
}

// ─── Sub Component: Summary Card ─────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  borderColor,
  valueColor,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subtext?: string
  borderColor: string
  valueColor?: string
}) {
  return (
    <div className={`glass-card rounded-xl p-4 border-l-[3px] ${borderColor}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${valueColor || ''}`}>{value}</p>
          {subtext && <p className="text-[11px] text-muted-foreground">{subtext}</p>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

// ─── Sub Component: Metric Pill ──────────────────────────────────────────────

function MetricPill({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="glass-card flex items-center gap-3 rounded-lg px-4 py-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-semibold tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  )
}

// ─── Sub Component: Pie Legend ────────────────────────────────────────────────

function PieLegend({ data, colors }: { data: BreakdownItem[]; colors: string[] }) {
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={item.category} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="truncate text-muted-foreground">{item.category}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-2">
            <span className="tabular-nums font-medium">{INR(item.amount)}</span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">{item.percent}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Sub Component: Upcoming Table ───────────────────────────────────────────

function UpcomingTable({
  items,
  type,
}: {
  items: UpcomingItem[]
  type: 'inflow' | 'outflow'
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 mb-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No upcoming {type}s</p>
      </div>
    )
  }

  const sorted = [...items].sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/30 hover:bg-transparent">
            <TableHead className="text-xs">Description</TableHead>
            <TableHead className="text-xs text-right">Amount</TableHead>
            <TableHead className="text-xs text-right">Due Date</TableHead>
            <TableHead className="text-xs text-right">Days Until Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item, i) => {
            const days = daysUntil(item.dueDate)
            const isOverdue = days < 0
            const isDueSoon = days >= 0 && days <= 7
            return (
              <TableRow key={`${item.description}-${i}`} className="border-border/20">
                <TableCell className="text-xs font-medium py-2.5">{item.description}</TableCell>
                <TableCell className={`text-xs text-right font-semibold tabular-nums py-2.5 ${type === 'inflow' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {INR(item.amount)}
                </TableCell>
                <TableCell className="text-xs text-right text-muted-foreground py-2.5 tabular-nums">
                  {format(parseISO(item.dueDate), 'dd MMM yyyy')}
                </TableCell>
                <TableCell className="text-xs text-right py-2.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      isOverdue
                        ? 'border-red-500/40 text-red-400'
                        : isDueSoon
                          ? 'border-amber-500/40 text-amber-400'
                          : 'border-border text-muted-foreground'
                    }`}
                  >
                    {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-14 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>

      {/* Sub metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>

      {/* Chart */}
      <Skeleton className="h-[340px] rounded-xl" />

      {/* Pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>

      {/* Upcoming */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CashFlowModule() {
  const [data, setData] = useState<CashFlowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cashflow?period=${p}`)
      if (!res.ok) throw new Error('Failed to fetch cash flow data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(period)
  }, [period, fetchData])

  if (loading) return <LoadingSkeleton />

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
          <Construction className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold">Unable to Load Cash Flow</h2>
        <p className="max-w-md text-sm text-muted-foreground">{error || 'No data available'}</p>
      </div>
    )
  }

  const { summary, dailyFlow, inflowBreakdown, outflowBreakdown, upcomingOutflows, upcomingInflows } = data
  const cashRunway = summary.avgDailyCashOut > 0 ? Math.round(summary.closingBalance / summary.avgDailyCashOut) : 0

  return (
    <div className="space-y-6">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cash Flow</h1>
            <p className="text-xs text-muted-foreground">Real-time cash movement analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ExportButton module="cashflow" />
          <div className="flex items-center gap-1.5 rounded-lg bg-muted/30 p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  period === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Wallet}
          label="Opening Balance"
          value={INR(summary.openingBalance)}
          borderColor="border-l-muted-foreground/40"
        />
        <SummaryCard
          icon={ArrowDownLeft}
          label="Total Cash In"
          value={INR(summary.totalCashIn)}
          valueColor="text-emerald-400"
          borderColor="border-l-emerald-500/60"
        />
        <SummaryCard
          icon={ArrowUpRight}
          label="Total Cash Out"
          value={INR(summary.totalCashOut)}
          valueColor="text-red-400"
          borderColor="border-l-red-500/60"
        />
        <SummaryCard
          icon={TrendingUp}
          label={summary.netCashFlow >= 0 ? 'Net Cash Flow' : 'Net Cash Flow'}
          value={INR(summary.netCashFlow)}
          subtext={`Closing: ${INR(summary.closingBalance)}`}
          valueColor={summary.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}
          borderColor="border-l-primary/60"
        />
      </div>

      {/* ─── Sub Metrics ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricPill icon={ArrowDownLeft} label="Avg Daily Inflow" value={INR(summary.avgDailyCashIn)} />
        <MetricPill icon={ArrowUpRight} label="Avg Daily Outflow" value={INR(summary.avgDailyCashOut)} />
        <MetricPill
          icon={Gauge}
          label="Cash Runway"
          value={`${cashRunway} days`}
        />
      </div>

      {/* ─── Daily Cash Flow Chart ─────────────────────────────────── */}
      <div className="glass-card rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Daily Cash Flow</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Cash inflows, outflows and net movement over time</p>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cfGradIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cfGradOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={RED} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={RED} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'oklch(0.55 0 0)' }}
                tickFormatter={(v: string) => format(parseISO(v), 'dd MMM')}
                interval={Math.max(0, Math.floor(dailyFlow.length / 7) - 1)}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'oklch(0.55 0 0)' }}
                tickFormatter={(v: number) => formatCompact(v)}
                width={60}
              />
              <Tooltip content={<CashFlowTooltip />} />
              <ReferenceLine y={0} stroke="oklch(0.4 0 0)" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="cashIn"
                name="Cash In"
                stroke={EMERALD}
                fill="url(#cfGradIn)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="cashOut"
                name="Cash Out"
                stroke={RED}
                fill="url(#cfGradOut)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="netFlow"
                name="Net Flow"
                stroke={GOLD}
                strokeWidth={2}
                dot={false}
                strokeDasharray="6 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center justify-center gap-6 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: EMERALD, opacity: 0.6 }} />
            Cash In
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: RED, opacity: 0.6 }} />
            Cash Out
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ backgroundColor: GOLD, borderTop: '2px dashed' }} />
            Net Flow
          </span>
        </div>
      </div>

      {/* ─── Pie Charts: Inflow & Outflow Breakdown ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Inflow Pie */}
        <div className="glass-card rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Cash Inflow Breakdown</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Total: <span className="text-emerald-400 font-medium">{INR(summary.totalCashIn)}</span>
            </p>
          </div>
          {inflowBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              No inflow data for this period
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="h-[200px] w-full max-w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inflowBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="amount"
                      nameKey="category"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {inflowBreakdown.map((_entry, i) => (
                        <Cell key={`in-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full max-w-[320px]">
                <PieLegend data={inflowBreakdown} colors={PIE_COLORS} />
              </div>
            </div>
          )}
        </div>

        {/* Outflow Pie */}
        <div className="glass-card rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Cash Outflow Breakdown</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Total: <span className="text-red-400 font-medium">{INR(summary.totalCashOut)}</span>
            </p>
          </div>
          {outflowBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              No outflow data for this period
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="h-[200px] w-full max-w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={outflowBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="amount"
                      nameKey="category"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {outflowBreakdown.map((_entry, i) => (
                        <Cell key={`out-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full max-w-[320px]">
                <PieLegend data={outflowBreakdown} colors={PIE_COLORS} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Upcoming Cash Flows ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expected Inflows */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Expected Inflows</h3>
              <p className="text-[11px] text-muted-foreground">
                {upcomingInflows.length} pending receivable{upcomingInflows.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <UpcomingTable items={upcomingInflows} type="inflow" />
        </div>

        {/* Expected Outflows */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
              <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Expected Outflows</h3>
              <p className="text-[11px] text-muted-foreground">
                {upcomingOutflows.length} pending payable{upcomingOutflows.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <UpcomingTable items={upcomingOutflows} type="outflow" />
        </div>
      </div>
    </div>
  )
}