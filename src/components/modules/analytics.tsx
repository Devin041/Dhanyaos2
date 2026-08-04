'use client'

import { useEffect, useState, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { LineChart, Loader2 } from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ComposedChart,
  Line,
} from 'recharts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PackageCheck,
  Users,
  Timer,
  ShieldCheck,
  Factory,
  Clock,
  Activity,
  Banknote,
  BarChart3,
  Target,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiSummary {
  totalRevenue: number
  totalProfit: number
  avgGrossMargin: number
  totalOrders: number
  avgOrderValue: number
  orderCompletionRate: number
  customerRetentionRate: number
  productionEfficiency: number
}

interface RevenueTrendItem {
  week: string
  revenue: number
  orders: number
}

interface CategoryPerformanceItem {
  category: string
  revenue: number
  orders: number
  margin: number
}

interface CustomerTierItem {
  tier: string
  count: number
  revenue: number
  percent: number
}

interface StageEfficiencyItem {
  stage: string
  efficiency: number
}

interface ProductionAnalytics {
  stageBottleneck: string
  avgCycleTime: number
  onTimeDelivery: number
  qualityPassRate: number
  stageEfficiency: StageEfficiencyItem[]
}

interface FinancialHealth {
  cashRunwayDays: number
  receivablesTurnover: number
  inventoryTurnover: number
  debtToEquity: number
  currentRatio: number
  quickRatio: number
}

interface TopCustomer {
  name: string
  revenue: number
  margin: number
  orders: number
}

interface TopStyle {
  styleNo: string
  styleName: string
  revenue: number
  qty: number
  margin: number
}

interface TopCollection {
  collection: string
  revenue: number
  orders: number
  margin: number
}

interface MonthlyComparisonItem {
  month: string
  revenue: number
  profit: number
  orders: number
  margin: number
}

interface AnalyticsData {
  kpiSummary: KpiSummary
  revenueTrend: RevenueTrendItem[]
  categoryPerformance: CategoryPerformanceItem[]
  customerTierAnalysis: CustomerTierItem[]
  productionAnalytics: ProductionAnalytics
  financialHealth: FinancialHealth
  topPerformers: {
    topCustomers: TopCustomer[]
    topStyles: TopStyle[]
    topCollections: TopCollection[]
  }
  monthlyComparison: MonthlyComparisonItem[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)

const shortInr = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${n}`
}

const GOLD = 'oklch(0.78 0.14 85)'
const EMERALD = 'oklch(0.65 0.18 155)'
const RED = 'oklch(0.65 0.2 25)'
const SKY = 'oklch(0.7 0.15 250)'
const AMBER = 'oklch(0.75 0.15 75)'
const SILVER = 'oklch(0.7 0.01 260)'
const MUTED = 'oklch(0.55 0.02 260)'

const TIER_COLORS = [GOLD, SILVER, AMBER, MUTED]

function TrendIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const isUp = value >= 0
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${
        isUp ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      {isUp ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  )
}

// Custom tooltip
function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  formatter?: (val: number, name: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card rounded-lg border border-[oklch(0.78_0.14_85/30%)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold text-foreground/90">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
          <span className="font-mono font-semibold tabular-nums text-foreground/90">
            {formatter ? formatter(p.value, p.name) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// Circular progress indicator
function CircularProgress({
  value,
  size = 80,
  strokeWidth = 6,
  color = EMERALD,
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(0.3 0.01 260)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums text-foreground">
        {value.toFixed(1)}%
      </span>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnalyticsModule() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('[Analytics]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // ─── Loading State ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
            <LineChart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-1 h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="glass-card h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="glass-card h-80 rounded-xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Failed to load analytics.</p>
      </div>
    )
  }

  const { kpiSummary, revenueTrend, categoryPerformance, customerTierAnalysis,
    productionAnalytics, financialHealth, topPerformers, monthlyComparison } = data

  // ─── KPI Card definitions ───────────────────────────────────────────
  const kpiCards = [
    {
      label: 'Total Revenue',
      value: shortInr(kpiSummary.totalRevenue),
      trend: 12.4,
      icon: <IndianRupee className="h-4 w-4" />,
      border: 'border-l-[oklch(0.78_0.14_85)]',
      iconBg: 'bg-[oklch(0.78_0.14_85/15%)]',
      iconColor: 'text-[oklch(0.78_0.14_85)]',
    },
    {
      label: 'Gross Margin %',
      value: `${kpiSummary.avgGrossMargin}%`,
      trend: 3.2,
      icon: <DollarSign className="h-4 w-4" />,
      border: 'border-l-emerald-500',
      iconBg: 'bg-emerald-500/15%',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Order Completion Rate',
      value: `${kpiSummary.orderCompletionRate}%`,
      trend: 5.1,
      icon: <PackageCheck className="h-4 w-4" />,
      border: 'border-l-sky-500',
      iconBg: 'bg-sky-500/15%',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Production Efficiency',
      value: `${kpiSummary.productionEfficiency}%`,
      trend: -2.3,
      icon: <Factory className="h-4 w-4" />,
      border: 'border-l-amber-500',
      iconBg: 'bg-amber-500/15%',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Avg Order Value',
      value: shortInr(kpiSummary.avgOrderValue),
      trend: 1.8,
      icon: <BarChart3 className="h-4 w-4" />,
      border: 'border-l-[oklch(0.55_0.02_260)]',
      iconBg: 'bg-muted/30%',
      iconColor: 'text-muted-foreground',
    },
    {
      label: 'Customer Retention',
      value: `${kpiSummary.customerRetentionRate}%`,
      trend: 8.5,
      icon: <Users className="h-4 w-4" />,
      border: 'border-l-emerald-500',
      iconBg: 'bg-emerald-500/15%',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Cash Runway (Days)',
      value: `${financialHealth.cashRunwayDays}`,
      trend: -4.2,
      icon: <Timer className="h-4 w-4" />,
      border: 'border-l-[oklch(0.78_0.14_85)]',
      iconBg: 'bg-[oklch(0.78_0.14_85/15%)]',
      iconColor: 'text-[oklch(0.78_0.14_85)]',
    },
    {
      label: 'Quality Pass Rate',
      value: `${productionAnalytics.qualityPassRate}%`,
      trend: 1.5,
      icon: <ShieldCheck className="h-4 w-4" />,
      border: 'border-l-emerald-500',
      iconBg: 'bg-emerald-500/15%',
      iconColor: 'text-emerald-400',
    },
  ]

  // ─── Financial health card configs ──────────────────────────────────
  const finCards = [
    { label: 'Cash Runway', value: `${financialHealth.cashRunwayDays} days`, key: 'cashRunway' as const, threshold: [30, 60] },
    { label: 'Receivables Turnover', value: `${financialHealth.receivablesTurnover}x`, key: 'receivables' as const, threshold: [3, 6] },
    { label: 'Inventory Turnover', value: `${financialHealth.inventoryTurnover}x`, key: 'inventory' as const, threshold: [2, 5] },
    { label: 'Debt to Equity', value: financialHealth.debtToEquity.toFixed(1), key: 'debt' as const, threshold: [0.5, 1], invert: true },
    { label: 'Current Ratio', value: financialHealth.currentRatio.toFixed(1), key: 'current' as const, threshold: [1.5, 3] },
    { label: 'Quick Ratio', value: financialHealth.quickRatio.toFixed(1), key: 'quick' as const, threshold: [1, 2] },
  ]

  function getHealthStatus(val: number, threshold: number[], invert = false): 'healthy' | 'moderate' | 'concerning' {
    const v = invert ? val : val
    if (invert) {
      if (v <= threshold[0]) return 'healthy'
      if (v <= threshold[1]) return 'moderate'
      return 'concerning'
    }
    if (v >= threshold[1]) return 'healthy'
    if (v >= threshold[0]) return 'moderate'
    return 'concerning'
  }

  const healthColors = {
    healthy: 'bg-emerald-500',
    moderate: 'bg-amber-500',
    concerning: 'bg-red-500',
  }

  const healthLabels = {
    healthy: 'Healthy',
    moderate: 'Moderate',
    concerning: 'Concerning',
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
            <LineChart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">Business Intelligence</p>
          </div>
        </div>
        <ExportButton module="analytics" />
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((kpi, i) => (
          <div
            key={i}
            className={`glass-card border-l-4 ${kpi.border} rounded-xl p-4 transition-all hover:scale-[1.02]`}
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.iconBg} ${kpi.iconColor}`}
              >
                {kpi.icon}
              </div>
              <TrendIndicator value={kpi.trend} />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold tabular-nums tracking-tight">
                {kpi.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Revenue & Orders Trend ──────────────────────────────────── */}
      <div className="glass-card rounded-xl p-4 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue & Orders Trend
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={revenueTrend} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" />
              <XAxis dataKey="week" tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }} />
              <YAxis
                yAxisId="left"
                tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }}
                tickFormatter={(v) => shortInr(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip formatter={(v, name) => name === 'Revenue' ? shortInr(v) : String(v)} />} />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                fill={GOLD}
                fillOpacity={0.2}
                stroke={GOLD}
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="orders"
                name="Orders"
                stroke={EMERALD}
                strokeWidth={2}
                dot={{ fill: EMERALD, r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Category & Customer Tier ────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category Performance */}
        <div className="glass-card rounded-xl p-4 lg:p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Category Performance
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryPerformance}
                layout="vertical"
                margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }} tickFormatter={(v) => shortInr(v)} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={130}
                  tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip formatter={(v) => shortInr(v as number)} />} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                  {categoryPerformance.map((_, i) => (
                    <Cell
                      key={i}
                      fill={GOLD}
                      fillOpacity={1 - i * 0.12}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Tier Distribution */}
        <div className="glass-card rounded-xl p-4 lg:p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Customer Tier Distribution
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={customerTierAnalysis}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="revenue"
                  nameKey="tier"
                  label={({ tier, percent }: { tier: string; percent: number }) => `${tier.split(' ')[0]} ${percent}%`}
                >
                  {customerTierAnalysis.map((_, i) => (
                    <Cell key={i} fill={TIER_COLORS[i] || MUTED} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip formatter={(v) => shortInr(v as number)} />} />
                <Legend
                  formatter={(value: string) => {
                    const item = customerTierAnalysis.find((t) => t.tier === value)
                    if (!item) return value
                    return `${value} — ${item.count} customers, ${shortInr(item.revenue)}`
                  }}
                  wrapperStyle={{ fontSize: 11, color: 'oklch(0.7 0.01 260)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Production Analytics ────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-4 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Production Analytics
        </h2>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Stage Efficiency Chart */}
          <div className="lg:col-span-2">
            <h3 className="mb-3 text-xs font-medium text-muted-foreground">Stage Efficiency</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productionAnalytics.stageEfficiency}
                  layout="vertical"
                  margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    width={120}
                    tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }}
                  />
                  <Tooltip
                    content={<CustomTooltip formatter={(v) => `${v}%`} />}
                  />
                  <Bar dataKey="efficiency" name="Efficiency" radius={[0, 4, 4, 0]}>
                    {productionAnalytics.stageEfficiency.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.stage === productionAnalytics.stageBottleneck
                            ? RED
                            : entry.efficiency >= 85
                            ? EMERALD
                            : entry.efficiency >= 60
                            ? AMBER
                            : RED
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="flex flex-col gap-4">
            {/* Bottleneck */}
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-xs font-medium text-red-400">Bottleneck Stage</p>
              <p className="mt-1 text-lg font-bold text-red-300">
                {productionAnalytics.stageBottleneck}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Lowest efficiency</p>
            </div>

            {/* On-Time Delivery */}
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-400" />
                <p className="text-xs font-medium text-sky-400">On-Time Delivery</p>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {productionAnalytics.onTimeDelivery}%
              </p>
            </div>

            {/* Avg Cycle Time */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-amber-400" />
                <p className="text-xs font-medium text-amber-400">Avg Cycle Time</p>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {productionAnalytics.avgCycleTime}
                <span className="ml-1 text-sm font-normal text-muted-foreground">days</span>
              </p>
            </div>

            {/* Quality Pass Rate — Circular */}
            <div className="flex flex-col items-center rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="mb-2 text-xs font-medium text-emerald-400">Quality Pass Rate</p>
              <CircularProgress value={productionAnalytics.qualityPassRate} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Financial Health ────────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-4 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Financial Health
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {finCards.map((fc, i) => {
            const numVal = parseFloat(fc.value)
            const status = getHealthStatus(numVal, fc.threshold, fc.invert)
            return (
              <div
                key={i}
                className="rounded-lg border border-border/50 bg-muted/10 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{fc.label}</p>
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${healthColors[status]}`}
                  />
                </div>
                <p className="mt-2 text-xl font-bold tabular-nums">{fc.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{healthLabels[status]}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Top Performers ──────────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-4 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Top Performers
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Top Customers */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Top Customers
            </h3>
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-right text-xs">Margin</TableHead>
                  <TableHead className="text-right text-xs">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPerformers.topCustomers.map((c, i) => (
                  <TableRow key={i} className="border-border/20">
                    <TableCell className="text-xs font-medium">{c.name}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {shortInr(c.revenue)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-emerald-400">
                      {c.margin}%
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {c.orders}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Top Styles */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Top Styles
            </h3>
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs">Style</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-right text-xs">Qty</TableHead>
                  <TableHead className="text-right text-xs">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPerformers.topStyles.map((s, i) => (
                  <TableRow key={i} className="border-border/20">
                    <TableCell className="text-xs">
                      <span className="font-mono text-muted-foreground">{s.styleNo}</span>
                      <br />
                      <span className="font-medium">{s.styleName}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {shortInr(s.revenue)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {s.qty}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-emerald-400">
                      {s.margin}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Top Collections */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Top Collections
            </h3>
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs">Collection</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-right text-xs">Orders</TableHead>
                  <TableHead className="text-right text-xs">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPerformers.topCollections.map((c, i) => (
                  <TableRow key={i} className="border-border/20">
                    <TableCell className="text-xs font-medium">{c.collection}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {shortInr(c.revenue)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {c.orders}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-emerald-400">
                      {c.margin}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── Monthly Comparison ──────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-4 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Monthly Comparison
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyComparison} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" />
              <XAxis dataKey="month" tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'oklch(0.65 0.01 260)', fontSize: 11 }} tickFormatter={(v) => shortInr(v)} />
              <Tooltip content={<CustomTooltip formatter={(v) => shortInr(v as number)} />} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Profit" fill={EMERALD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}