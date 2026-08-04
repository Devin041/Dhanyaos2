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
  TrendingUp,
  DollarSign,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Timer,
  RotateCcw,
  BarChart3,
  Users,
  Fuel,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PLSummary {
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
}

interface CashFlowPoint {
  date: string
  inflow: number
  outflow: number
  net: number
}

interface WorkingCapital {
  receivableDays: number
  payableDays: number
  inventoryDays: number
  cashConversionCycle: number
}

interface AgingBucket {
  bucket: string
  amount: number
  count: number
  percent: number
}

interface ExpenseCategory {
  category: string
  amount: number
  count: number
  percent: number
}

interface CustomerProfit {
  name: string
  revenue: number
  profit: number
  margin: number
}

interface FundingRequirement {
  cashBalance: number
  monthlyBurnRate: number
  runwayDays: number
  runwayMonths: number
  totalReceivables: number
  totalPayables: number
}

interface DashboardData {
  plSummary: PLSummary
  cashFlow: CashFlowPoint[]
  workingCapital: WorkingCapital
  receivableAging: AgingBucket[]
  payableAging: AgingBucket[]
  expenseAnalysis: ExpenseCategory[]
  customerProfitability: CustomerProfit[]
  fundingRequirement: FundingRequirement
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

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold">{formatINR(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{formatINR(payload[0].value)}</p>
    </div>
  )
}

// ─── PL Card ─────────────────────────────────────────────────────────────────

function PLCard({
  icon: Icon,
  label,
  value,
  color,
  isCurrency = true,
  subtext,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
  isCurrency?: boolean
  subtext?: string
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
              {isCurrency ? formatINR(value) : value}
            </p>
            {subtext && (
              <p className="text-[11px] text-muted-foreground">{subtext}</p>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
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
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-6">
              <Skeleton className="mb-4 h-4 w-40" />
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Aging Table Colors ──────────────────────────────────────────────────────

const agingBucketColors: Record<string, string> = {
  '0-15 days': 'text-emerald-400',
  '16-30 days': 'text-amber-400',
  '31-45 days': 'text-orange-400',
  '46-60 days': 'text-red-400',
  '60+ days': 'text-red-500',
}

const barColors = [
  'oklch(0.78 0.14 85)',
  'oklch(0.72 0.18 145)',
  'oklch(0.7 0.15 200)',
  'oklch(0.7 0.12 300)',
  'oklch(0.8 0.15 75)',
  'oklch(0.65 0.22 25)',
  'oklch(0.7 0.15 250)',
  'oklch(0.72 0.12 310)',
]

// ─── Main Component ──────────────────────────────────────────────────────────

export function CfoDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/cfo')
      const json = await res.json()
      if (json.error) return
      setData(json)
    } catch (err) {
      console.error('Failed to fetch CFO dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 30000)
    return () => clearInterval(interval)
  }, [fetchDashboard])

  if (loading || !data) return <DashboardSkeleton />

  const pl = data.plSummary
  const wc = data.workingCapital
  const fr = data.fundingRequirement
  const grossMarginPct = pl.revenue > 0 ? Math.round((pl.grossProfit / pl.revenue) * 10000) / 100 : 0
  const netMarginPct = pl.revenue > 0 ? Math.round((pl.netProfit / pl.revenue) * 10000) / 100 : 0
  const opexRatio = pl.revenue > 0 ? Math.round((pl.operatingExpenses / pl.revenue) * 10000) / 100 : 0
  const totalReceivableAmt = data.receivableAging.reduce((s, a) => s + a.amount, 0)
  const totalPayableAmt = data.payableAging.reduce((s, a) => s + a.amount, 0)

  // Customer profitability chart data sorted by profit desc
  const customerChartData = [...data.customerProfitability].sort((a, b) => b.profit - a.profit)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            CFO Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Elysé by Dhanya — Financial performance & cash flow command center
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · Last updated just now
        </div>
      </div>

      {/* ─── Row 1: P&L Summary ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <PLCard
          icon={TrendingUp}
          label="Revenue"
          value={pl.revenue}
          color="oklch(0.78 0.14 85)"
          subtext={`Gross Margin: ${grossMarginPct}%`}
        />
        <PLCard
          icon={Package}
          label="COGS"
          value={pl.cogs}
          color="oklch(0.65 0.22 25)"
          subtext={`${pl.revenue > 0 ? Math.round(((pl.cogs / pl.revenue) * 10000) / 100) : 0}% of revenue`}
        />
        <PLCard
          icon={DollarSign}
          label="Gross Profit"
          value={pl.grossProfit}
          color="oklch(0.72 0.18 145)"
          subtext={`${grossMarginPct}% margin`}
        />
        <PLCard
          icon={ArrowUpRight}
          label="Operating Expenses"
          value={pl.operatingExpenses}
          color="oklch(0.7 0.15 200)"
          subtext={`${opexRatio}% of revenue`}
        />
        <PLCard
          icon={ShieldCheck}
          label="Net Profit"
          value={pl.netProfit}
          color={pl.netProfit >= 0 ? 'oklch(0.72 0.18 145)' : 'oklch(0.65 0.22 25)'}
          subtext={`${netMarginPct}% net margin`}
        />
      </div>

      {/* ─── Row 2: Cash Flow Chart + Working Capital ──────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Cash Flow Chart */}
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cash Flow (30 Days)
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.72 0.18 145)' }} />
                  Inflow
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.65 0.22 25)' }} />
                  Outflow
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.cashFlow}>
                  <defs>
                    <linearGradient id="gradInflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOutflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0} />
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
                    tickFormatter={(v) => `${formatCompact(v)}`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="inflow"
                    name="Inflow"
                    stroke="oklch(0.72 0.18 145)"
                    fill="url(#gradInflow)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="outflow"
                    name="Outflow"
                    stroke="oklch(0.65 0.22 25)"
                    fill="url(#gradOutflow)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Working Capital Summary */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Working Capital Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            {/* Receivable Days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                    <ArrowDownLeft className="h-4 w-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Receivable Days</p>
                    <p className="text-[11px] text-muted-foreground">Avg collection period</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-orange-400">{wc.receivableDays}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-orange-400 transition-all duration-700"
                  style={{ width: `${Math.min((wc.receivableDays / 60) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Payable Days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <ArrowUpRight className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Payable Days</p>
                    <p className="text-[11px] text-muted-foreground">Avg payment period</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-blue-400">{wc.payableDays}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all duration-700"
                  style={{ width: `${Math.min((wc.payableDays / 60) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Inventory Days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                    <Package className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Inventory Days</p>
                    <p className="text-[11px] text-muted-foreground">Days of inventory on hand</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-purple-400">{wc.inventoryDays}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-purple-400 transition-all duration-700"
                  style={{ width: `${Math.min((wc.inventoryDays / 90) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Cash Conversion Cycle */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <RotateCcw className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Cash Conversion Cycle</p>
                    <p className="text-[11px] text-muted-foreground">Receivable + Inventory − Payable</p>
                  </div>
                </div>
                <span className={`text-lg font-bold ${wc.cashConversionCycle > 45 ? 'text-red-400' : wc.cashConversionCycle > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {wc.cashConversionCycle} days
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 3: Receivable Aging + Payable Aging ───────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Receivable Aging */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Receivable Aging
              </CardTitle>
              <span className="text-xs font-medium text-foreground">
                {formatINR(totalReceivableAmt)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[300px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Aging Bucket</TableHead>
                    <TableHead className="text-xs text-right">Orders</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.receivableAging.map((row) => (
                    <TableRow key={row.bucket} className="border-border/30">
                      <TableCell>
                        <span className={`text-sm font-medium ${agingBucketColors[row.bucket] || ''}`}>
                          {row.bucket}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">
                        {row.count}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        {formatINR(row.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress
                            value={row.percent}
                            className="h-1.5 w-16"
                          />
                          <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                            {row.percent}%
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

        {/* Payable Aging */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Payable Aging
              </CardTitle>
              <span className="text-xs font-medium text-foreground">
                {formatINR(totalPayableAmt)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[300px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Aging Bucket</TableHead>
                    <TableHead className="text-xs text-right">POs</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payableAging.map((row) => (
                    <TableRow key={row.bucket} className="border-border/30">
                      <TableCell>
                        <span className={`text-sm font-medium ${agingBucketColors[row.bucket] || ''}`}>
                          {row.bucket}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">
                        {row.count}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        {formatINR(row.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress
                            value={row.percent}
                            className="h-1.5 w-16"
                          />
                          <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                            {row.percent}%
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
      </div>

      {/* ─── Row 4: Expense Analysis + Customer Profitability ──────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Expense Analysis */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Expense Analysis (30 Days)
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {formatINR(data.expenseAnalysis.reduce((s, e) => s + e.amount, 0))}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.expenseAnalysis} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${formatCompact(v)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {data.expenseAnalysis.map((_, idx) => (
                      <Cell key={idx} fill={barColors[idx % barColors.length]} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Profitability by Customer */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Profitability by Customer
              </CardTitle>
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                Top 8
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${formatCompact(v)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const entry = customerChartData.find((c) => c.name === label)
                      return (
                        <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-primary" />
                              <span className="text-muted-foreground">Revenue:</span>
                              <span className="font-semibold">{formatINR(entry?.revenue || 0)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.72 0.18 145)' }} />
                              <span className="text-muted-foreground">Profit:</span>
                              <span className="font-semibold">{formatINR(entry?.profit || 0)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground pt-1">
                              Margin: <span className="font-medium text-foreground">{entry?.margin}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]} maxBarSize={24} fill="oklch(0.78 0.14 85)" fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 5: Funding Requirement / Cash Runway ──────────────── */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Funding Requirement & Cash Runway
            </CardTitle>
            {fr.runwayDays <= 30 && (
              <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low Runway
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Cash Balance */}
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cash Balance
                </p>
              </div>
              <p className="text-2xl font-bold tracking-tight">{formatINR(fr.cashBalance)}</p>
            </div>

            {/* Monthly Burn Rate */}
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                  <Fuel className="h-4 w-4 text-red-400" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Monthly Burn Rate
                </p>
              </div>
              <p className="text-2xl font-bold tracking-tight">{formatINR(fr.monthlyBurnRate)}</p>
            </div>

            {/* Runway */}
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Timer className="h-4 w-4 text-cyan-400" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cash Runway
                </p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tracking-tight ${fr.runwayDays <= 30 ? 'text-red-400' : fr.runwayDays <= 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {fr.runwayDays}
                </span>
                <span className="text-sm text-muted-foreground">days</span>
                <span className="text-sm text-muted-foreground">(~{fr.runwayMonths} mo)</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${fr.runwayDays <= 30 ? 'bg-red-400' : fr.runwayDays <= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min((fr.runwayDays / 180) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Net Working Capital Position */}
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                  <BarChart3 className="h-4 w-4 text-purple-400" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Net Position
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ArrowDownLeft className="h-3 w-3" /> Receivables
                  </span>
                  <span className="font-semibold">{formatINR(fr.totalReceivables)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-400 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" /> Payables
                  </span>
                  <span className="font-semibold">{formatINR(fr.totalPayables)}</span>
                </div>
                <div className="mt-2 border-t border-border/50 pt-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-muted-foreground">Net</span>
                  <span className={`font-bold ${fr.totalReceivables - fr.totalPayables >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatINR(fr.totalReceivables - fr.totalPayables)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Summary Footer ───────────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.78 0.14 85)' }} />
              <span>Revenue: <span className="font-semibold text-foreground">{formatINR(pl.revenue)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.72 0.18 145)' }} />
              <span>Gross Profit: <span className="font-semibold text-foreground">{formatINR(pl.grossProfit)}</span> ({grossMarginPct}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span>OpEx: <span className="font-semibold text-foreground">{formatINR(pl.operatingExpenses)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.7 0.15 200)' }} />
              <span>CCC: <span className="font-semibold text-foreground">{wc.cashConversionCycle} days</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3 text-primary" />
            {data.customerProfitability.length} active customers tracked
          </div>
        </CardContent>
      </Card>
    </div>
  )
}