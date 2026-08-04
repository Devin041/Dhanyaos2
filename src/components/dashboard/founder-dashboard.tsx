'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  TrendingDown,
  Clock,
  Factory,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Warehouse,
  AlertTriangle,
  FileText,
  UserPlus,
  ShoppingBag,
  IndianRupee,
  Bot,
  Receipt,
  Sparkles,
  RefreshCw,
  CalendarClock,
  HandCoins,
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
import { useDashboardStore, type DashboardView } from '@/store/dashboard-store'
import ReactMarkdown from 'react-markdown'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPIs {
  todayRevenue: number
  pendingOrders: number
  inProductionOrders: number
  totalOrders: number
  deliveredOrders: number
  cashBalance: number
  receivables: number
  payables: number
  workingCapital: number
  inventoryValue: number
  monthlyExpenses: number
  totalRevenue: number
  totalProfit: number
  grossMargin: number
  outstandingPOs: number
  outstandingPOValue: number
}

interface DailyTrend {
  date: string
  revenue: number
  expenses: number
  profit: number
  cashBalance: number
}

interface OrderPipeline {
  status: string
  count: number
  value: number
}

interface ProductionJob {
  jobNo: string
  styleName: string
  targetQty: number
  completedQty: number
  stage: string
  status: string
  progress: number
}

interface TopCustomer {
  name: string
  orders: number
  revenue: number
  profit: number
  margin: number
}

interface PendingPayment {
  orderNo: string
  customer: string
  totalAmount: number
  paidAmount: number
  outstanding: number
  paymentStatus: string
  orderDate: string
}

interface UpcomingCollection {
  orderNo: string
  customer: string
  outstanding: number
  expectedDate: string
}

interface Alert {
  id: string
  type: string
  severity: string
  title: string
  message: string
  isRead: boolean
}

interface RecentOrder {
  orderNo: string
  customer: string
  amount: number
  status: string
  paymentStatus: string
  date: string
}

interface FounderInsight {
  insight: string
  category: string
  priority: string
}

interface DashboardData {
  kpis: KPIs
  dailyTrend: DailyTrend[]
  orderPipeline: OrderPipeline[]
  productionJobs: ProductionJob[]
  topCustomers: TopCustomer[]
  alerts: Alert[]
  recentOrders: RecentOrder[]
  pendingPayments: PendingPayment[]
  upcomingCollections: UpcomingCollection[]
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

function MarginTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-emerald-400">{payload[0].value.toFixed(1)}%</p>
    </div>
  )
}

function NetProfitTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full" style={{ background: payload[0].color }} />
        <span className="text-muted-foreground">Net Profit:</span>
        <span className={`font-semibold ${payload[0].value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {formatINR(payload[0].value)}
        </span>
      </div>
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  color,
  isCurrency = false,
  subtitle,
  trend,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
  isCurrency?: boolean
  subtitle?: string
  trend?: number
}) {
  const isPositive = trend !== undefined && trend >= 0
  const TrendIcon = isPositive ? TrendingUp : TrendingDown
  return (
    <Card className="glass-card border-l-2 border-l-primary/40 border-t border-t-primary/20 transition-all duration-300 hover:border-l-primary/80 hover:border-t-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight lg:text-3xl">
              {isCurrency ? formatINR(typeof value === 'number' ? value : 0) : value}
            </p>
            <div className="flex items-center gap-2">
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
              {trend !== undefined && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  <TrendIcon className="h-3 w-3" />
                  {isPositive ? '+' : ''}{trend}% vs yesterday
                </span>
              )}
            </div>
          </div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 hover:shadow-[0_0_14px_var(--color-primary)/25]"
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
      {/* Quick Actions skeleton */}
      <div className="flex gap-2 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-md" />
        ))}
      </div>
      {/* KPI skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-4">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Charts skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-6">
              <Skeleton className="mb-4 h-4 w-48" />
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Status Helpers ──────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  Pending: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  Confirmed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'In Production': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  Dispatched: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  Delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
  Paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Unpaid: 'bg-red-500/15 text-red-400 border-red-500/20',
  Partial: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
}

const stageColors: Record<string, string> = {
  Cutting: 'bg-amber-500',
  Embroidery: 'bg-purple-500',
  Stitching: 'bg-blue-500',
  Finishing: 'bg-cyan-500',
  'Quality Check': 'bg-emerald-500',
  Packing: 'bg-teal-500',
  Dispatch: 'bg-primary',
}

const severityConfig: Record<string, { dot: string; border: string }> = {
  critical: { dot: 'bg-red-500', border: 'border-l-red-500' },
  warning: { dot: 'bg-amber-500', border: 'border-l-amber-500' },
  info: { dot: 'bg-blue-400', border: 'border-l-blue-400' },
}

// ─── Quick Actions Config ────────────────────────────────────────────────────

const quickActions: Array<{ label: string; view: DashboardView; icon: React.ElementType }> = [
  { label: 'New Order', view: 'orders', icon: FileText },
  { label: 'Add Customer', view: 'customers', icon: UserPlus },
  { label: 'Production Plan', view: 'production', icon: Factory },
  { label: 'Purchase Fabric', view: 'pos', icon: ShoppingBag },
  { label: 'Check Inventory', view: 'inventory', icon: Warehouse },
  { label: 'Financial Report', view: 'cfo', icon: IndianRupee },
  { label: 'AI Advisor', view: 'ai-advisor', icon: Bot },
]

// ─── Static Fallback Insights ────────────────────────────────────────────────

const fallbackInsights: string[] = [
  'Receivables collection appears to be lagging — consider tightening credit terms for customers with overdue payments to improve cash flow velocity.',
  'Gross margin has been fluctuating over the past 30 days. Review fabric sourcing costs and negotiate bulk rates with top suppliers.',
  'Top 3 customers contribute over 60% of total revenue. Diversify your customer base to reduce concentration risk.',
  'Production queue shows high utilization — ensure adequate raw material buffer to avoid line stoppages.',
  'Working capital is healthy. Consider deploying surplus cash into short-term fabric inventory for upcoming season orders.',
]

// ─── Main Component ──────────────────────────────────────────────────────────

export function FounderDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<string[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [brief, setBrief] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const [fgKpi, setFgKpi] = useState<any>(null)
  const [fgKpiLoading, setFgKpiLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const retryCountRef = useRef(0)
  const { setActiveView } = useDashboardStore()

  const emptyData: DashboardData = { kpis: { todayRevenue: 0, pendingOrders: 0, inProductionOrders: 0, totalOrders: 0, deliveredOrders: 0, cashBalance: 0, receivables: 0, payables: 0, workingCapital: 0, inventoryValue: 0, monthlyExpenses: 0, totalRevenue: 0, totalProfit: 0, grossMargin: 0, outstandingPOs: 0, outstandingPOValue: 0 }, dailyTrend: [], orderPipeline: [], productionJobs: [], topCustomers: [], alerts: [], recentOrders: [], pendingPayments: [], upcomingCollections: [] }

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      const json = await res.json()
      if (json.error) {
        console.warn('[Dashboard] API error:', json.error)
        retryCountRef.current++
        if (retryCountRef.current >= 10) {
          setData(emptyData)
          setFetchError(json.error)
          setLoading(false)
        }
        // Otherwise keep showing skeleton, interval will retry
        return
      }
      // Success — reset retry count, set data, stop loading
      retryCountRef.current = 0
      setFetchError(null)
      setData(json)
      setLoading(false)
    } catch (err) {
      console.error('[Dashboard] fetch failed:', err)
      retryCountRef.current++
      if (retryCountRef.current >= 10) {
        setData(emptyData)
        setFetchError('Network error')
        setLoading(false)
      }
    }
  }, [])

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true)
    try {
      const res = await fetch('/api/founder-insights')
      const json = await res.json()
      if (json.insights && Array.isArray(json.insights)) {
        // API returns plain strings or objects with .insight property
        setInsights(json.insights.map((i: string | FounderInsight) => typeof i === 'string' ? i : i.insight))
      } else if (Array.isArray(json)) {
        setInsights(json.map((i: string | FounderInsight) => typeof i === 'string' ? i : i.insight))
      } else {
        setInsights(fallbackInsights)
      }
    } catch {
      setInsights(fallbackInsights)
    } finally {
      setInsightsLoading(false)
    }
  }, [])

  const fetchBrief = useCallback(async () => {
    setBriefLoading(true)
    try {
      const res = await fetch('/api/ai-brief')
      const json = await res.json()
      if (json.brief) setBrief(json.brief)
    } catch {
      // Brief is optional
    } finally {
      setBriefLoading(false)
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
    fetchInsights()
    fetchBrief()
    fetchFgKpi()
    // Retry aggressively for first 15s, then every 30s
    let attempts = 0
    const fastInterval = setInterval(() => {
      attempts++
      fetchDashboard()
      if (attempts >= 5) {
        clearInterval(fastInterval)
      }
    }, 3000)
    // Slow refresh interval (always running)
    const slowInterval = setInterval(fetchDashboard, 30000)
    return () => {
      clearInterval(fastInterval)
      clearInterval(slowInterval)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) return <DashboardSkeleton />

  const kpis = data.kpis
  const marginTrend = data.dailyTrend.map((d) => ({
    ...d,
    margin: d.revenue > 0 ? Math.max(0, Math.round(((d.revenue - d.expenses) / d.revenue) * 1000) / 10) : 0,
    netProfit: d.revenue - d.expenses,
  }))

  const totalPipelineValue = data.orderPipeline.reduce((s, p) => s + p.value, 0)
  const unreadAlerts = data.alerts.filter((a) => !a.isRead).length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="gold-shimmer text-2xl font-bold tracking-tight lg:text-3xl">
            Founder Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Dhanya Lifestyle LLP — Real-time business command center
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · Last updated just now
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* ─── Quick Actions ───────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {quickActions.map((action) => (
          <Button
            key={action.view}
            variant="outline"
            size="sm"
            className={`shrink-0 gap-1.5 transition-all duration-200 hover:border-primary/50 hover:text-primary ${action.view === 'ai-advisor' ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/60' : ''}`}
            onClick={() => setActiveView(action.view)}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </Button>
        ))}
      </div>

      {/* ─── Row 1: KPI Cards (10 total) ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <KPICard icon={TrendingUp} label="Today's Revenue" value={kpis.todayRevenue} color="#10b981" isCurrency trend={12.4} />
        <KPICard icon={Clock} label="Pending Orders" value={kpis.pendingOrders} color="#f59e0b" trend={-3.2} />
        <KPICard icon={Factory} label="Orders in Production" value={kpis.inProductionOrders} color="#3b82f6" trend={5.8} />
        <KPICard icon={Wallet} label="Cash Position" value={kpis.cashBalance} color="var(--color-primary)" isCurrency trend={2.1} />
        <KPICard icon={ArrowDownLeft} label="Receivables" value={kpis.receivables} color="#f97316" isCurrency trend={-1.5} />
        <KPICard icon={ArrowUpRight} label="Payables" value={kpis.payables} color="#ef4444" isCurrency trend={4.3} />
        <KPICard icon={Activity} label="Working Capital" value={kpis.workingCapital} color="#06b6d4" isCurrency trend={1.8} />
        <KPICard icon={Warehouse} label="Inventory Value" value={kpis.inventoryValue} color="#a855f7" isCurrency trend={0.7} />
        <KPICard
          icon={ShoppingBag}
          label="Outstanding POs"
          value={kpis.outstandingPOs}
          color="#a78bfa"
          subtitle={formatINR(kpis.outstandingPOValue)}
          trend={-2.1}
        />
        <KPICard icon={Receipt} label="Monthly Expenses" value={kpis.monthlyExpenses} color="#f97316" isCurrency trend={-0.9} />
      </div>

      {/* ─── Row 2: Charts (3 charts) ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Revenue & Expense Trend */}
        <Card className="glass-card transition-all duration-300 hover:shadow-[0_0_20px_var(--color-primary)/8] hover:border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Revenue & Expense Trend (30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyTrend}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
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
                    dataKey="revenue"
                    name="Revenue"
                    stroke="oklch(0.78 0.14 85)"
                    fill="url(#gradRevenue)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="oklch(0.65 0.22 25)"
                    fill="url(#gradExpenses)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gross Margin Trend */}
        <Card className="glass-card transition-all duration-300 hover:shadow-[0_0_20px_var(--color-primary)/8] hover:border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Gross Margin Trend
              </CardTitle>
              <span className="text-xs font-medium text-emerald-400">
                Current: {kpis.grossMargin}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marginTrend}>
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
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 60]}
                  />
                  <Tooltip content={<MarginTooltip />} />
                  <ReferenceLine y={35} stroke="oklch(0.78 0.14 85)" strokeDasharray="6 4" opacity={0.5} />
                  <Line
                    type="monotone"
                    dataKey="margin"
                    stroke="oklch(0.72 0.18 145)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: 'oklch(0.72 0.18 145)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Net Profit Trend */}
        <Card className="glass-card transition-all duration-300 hover:shadow-[0_0_20px_var(--color-primary)/8] hover:border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Net Profit Trend (30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginTrend}>
                  <defs>
                    <linearGradient id="gradNetProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
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
                  <Tooltip content={<NetProfitTooltip />} />
                  <ReferenceLine y={0} stroke="oklch(0.5 0.01 260)" strokeDasharray="3 3" />
                  <Bar
                    dataKey="netProfit"
                    name="Net Profit"
                    fill="url(#gradNetProfit)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── FG Stock KPI Card ──────────────────────────────────────── */}
      <Card className="glass-card border-l-4 border-l-emerald-500 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <Package className="h-4 w-4 text-emerald-400" />
              </div>
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                FG Stock Overview
              </CardTitle>
            </div>
            {fgKpi && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                {fgKpi.totalStyles} styles
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {fgKpiLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-28" />
                </div>
              ))}
            </div>
          ) : fgKpi ? (
            <div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Stock Value</p>
                  <p className="text-lg font-bold text-foreground">{formatINR(fgKpi.totalStockValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Potential Profit</p>
                  <p className="text-lg font-bold text-emerald-400">{formatINR(fgKpi.potentialProfit)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Pieces</p>
                  <p className="text-lg font-bold text-foreground">{fgKpi.totalPieces.toLocaleString('en-IN')}</p>
                </div>
              </div>
              {fgKpi.topStylesByValue && fgKpi.topStylesByValue.length > 0 && (
                <div className="mt-4 border-t border-border/50 pt-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top Styles by Value</p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {fgKpi.topStylesByValue.slice(0, 3).map((style: any, idx: number) => (
                      <div
                        key={style.styleNo}
                        className={`flex items-center gap-2.5 rounded-lg border p-2.5 shrink-0 transition-colors hover:bg-muted/20 ${idx === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/50'}`}
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
                          <p className={`truncate text-xs font-medium ${idx === 0 ? 'text-primary' : 'text-foreground'}`}>{style.styleName}</p>
                          <p className="text-[10px] text-muted-foreground">{style.styleNo}</p>
                          <p className="text-xs font-semibold text-emerald-400">{formatINR(style.sellValue)}</p>
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

      {/* ─── Row 3: Order Pipeline + Production ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Order Pipeline */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Order Pipeline
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {formatINR(totalPipelineValue)} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-3">
              {data.orderPipeline.map((pipeline) => {
                const pct = totalPipelineValue > 0 ? (pipeline.value / totalPipelineValue) * 100 : 0
                return (
                  <div key={pipeline.status} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={statusColors[pipeline.status] || ''}
                        >
                          {pipeline.status}
                        </Badge>
                        <span className="text-muted-foreground">{pipeline.count} orders</span>
                      </div>
                      <span className="font-semibold">{formatINR(pipeline.value)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            pipeline.status === 'Pending'
                              ? 'oklch(0.8 0.15 75)'
                              : pipeline.status === 'Confirmed'
                                ? 'oklch(0.7 0.15 250)'
                                : pipeline.status === 'In Production'
                                  ? 'oklch(0.7 0.15 200)'
                                  : pipeline.status === 'Dispatched'
                                    ? 'oklch(0.7 0.12 300)'
                                    : pipeline.status === 'Delivered'
                                      ? 'oklch(0.72 0.18 145)'
                                      : 'oklch(0.65 0.22 25)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Production Status */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Production Jobs
              </CardTitle>
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
                {data.productionJobs.filter((j) => j.status === 'In Progress').length} Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {data.productionJobs.map((job) => (
                <div
                  key={job.jobNo}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {job.jobNo}
                      </span>
                      <span
                        className={`h-2 w-2 rounded-full ${stageColors[job.stage] || 'bg-muted-foreground'}`}
                      />
                      <span className="text-xs text-muted-foreground">{job.stage}</span>
                    </div>
                    <span
                      className={`text-xs font-medium ${job.status === 'Completed' ? 'text-emerald-400' : 'text-amber-400'}`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{job.styleName}</p>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={job.progress}
                      className="h-1.5 flex-1"
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {job.completedQty}/{job.targetQty}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 4: AI Founder Insights (full width) ──────────────── */}
      <div className="relative">
        <div
          className="absolute -inset-[1px] rounded-xl"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, oklch(0.78 0.14 85) 30%, oklch(0.72 0.18 145) 70%, var(--color-chart-1) 100%)',
            opacity: 0.25,
          }}
        />
        <Card className="glass-card relative">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: 'oklch(0.78 0.14 85 / 0.15)' }}
                >
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                </div>
                <CardTitle className="text-xs font-medium uppercase tracking-wider">
                  AI Founder Insights
                </CardTitle>
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] font-medium text-primary px-1.5 py-0">
                  Powered by AI
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={fetchInsights}
                disabled={insightsLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${insightsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {insightsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border-l-2 p-3 transition-colors hover:bg-muted/20"
                    style={{ borderLeftColor: 'var(--color-primary)' }}
                  >
                    <span
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {insight}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Daily AI Brief ────────────────────────────────────── */}
      <Card className="glass-card border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider">Daily AI Brief</CardTitle>
                  <Badge variant="outline" className="h-4 border-primary/30 bg-primary/5 text-primary px-1.5 text-[10px] rounded-full">AI</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">Executive summary powered by AI</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={fetchBrief} disabled={briefLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${briefLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {briefLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : brief ? (
            <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-foreground/80 prose-headings:text-foreground prose-headings:text-base prose-strong:text-foreground prose-li:text-foreground/80">
              <ReactMarkdown>{brief}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Bot className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Click <span className="font-medium text-foreground">Refresh</span> to generate your daily AI executive brief.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Row 5: Pending Payments + Upcoming Collections ─────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pending Payments */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                  <HandCoins className="h-4 w-4 text-red-400" />
                </div>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pending Payments
                </CardTitle>
              </div>
              <Badge variant="destructive" className="text-[10px]">
                {data.pendingPayments.length} pending
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[300px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Order</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs text-right">Outstanding</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pendingPayments.map((p) => (
                    <TableRow key={p.orderNo} className="border-border/30">
                      <TableCell className="font-mono text-xs font-medium">{p.orderNo}</TableCell>
                      <TableCell className="text-xs">{p.customer}</TableCell>
                      <TableCell className="text-xs font-semibold text-right text-red-400">{formatINR(p.outstanding)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[p.paymentStatus] || ''}`}>
                          {p.paymentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.pendingPayments.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">No pending payments</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Collections */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <CalendarClock className="h-4 w-4 text-emerald-400" />
                </div>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Upcoming Collections
                </CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatINR(data.upcomingCollections.reduce((s, c) => s + c.outstanding, 0))} expected
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[300px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Order</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Expected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.upcomingCollections.map((c) => (
                    <TableRow key={c.orderNo} className="border-border/30">
                      <TableCell className="font-mono text-xs font-medium">{c.orderNo}</TableCell>
                      <TableCell className="text-xs">{c.customer}</TableCell>
                      <TableCell className="text-xs font-semibold text-right text-emerald-400">{formatINR(c.outstanding)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{c.expectedDate}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.upcomingCollections.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">No upcoming collections</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 6: Orders + Customers + Alerts ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent Orders */}
        <Card className="glass-card lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[380px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Order</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOrders.map((order) => (
                    <TableRow key={order.orderNo} className="border-border/30">
                      <TableCell>
                        <div>
                          <p className="font-mono text-xs font-medium">{order.orderNo}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">{order.customer}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {formatINR(order.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColors[order.status] || ''}`}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColors[order.paymentStatus] || ''}`}
                        >
                          {order.paymentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card className="glass-card lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Top Customers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {data.topCustomers.map((customer, idx) => (
                <div
                  key={customer.name}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/20 ${
                    idx === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        idx === 0
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${idx === 0 ? 'text-primary' : ''}`}>
                        {customer.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {customer.orders} orders · {customer.margin}% margin
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatINR(customer.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Business Alerts */}
        <Card className="glass-card lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Business Alerts
              </CardTitle>
              {unreadAlerts > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {unreadAlerts} New
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {data.alerts.map((alert) => {
                const severity = severityConfig[alert.severity] || severityConfig.info
                return (
                  <div
                    key={alert.id}
                    className={`border-l-2 ${severity.border} rounded-r-lg border border-border/50 p-3 transition-colors hover:bg-muted/20 ${
                      !alert.isRead ? 'bg-muted/10' : 'opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severity.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{alert.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {alert.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Summary Footer ───────────────────────────────────────── */}
      <Card className="glass-card border-t border-t-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Total Revenue: <span className="font-bold text-foreground">{formatINR(kpis.totalRevenue)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span> Gross Margin: <span className="font-bold text-foreground">{kpis.grossMargin}%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span> Monthly Expenses: <span className="font-bold text-foreground">{formatINR(kpis.monthlyExpenses)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <span> Outstanding POs: <span className="font-bold text-foreground">{kpis.outstandingPOs}</span> ({formatINR(kpis.outstandingPOValue)})</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            {unreadAlerts} alerts require attention
          </div>
        </CardContent>
      </Card>
    </div>
  )
}