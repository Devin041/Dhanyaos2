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
  ShoppingCart,
  Users,
  TrendingUp,
  Truck,
  IndianRupee,
  Repeat,
  ArrowRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecentOrder {
  orderNo: string
  customer: string
  buyer: string | null
  amount: number
  status: string
  paymentStatus: string
  date: string
  paidAmount: number
}

interface OrderPipeline {
  status: string
  count: number
  value: number
}

interface DispatchSchedule {
  orderNo: string
  customer: string
  amount: number
  status: string
  deliveryDate: string
  daysUntilDelivery: number | null
}

interface Collections {
  paid: number
  partialPaid: number
  partialOutstanding: number
  unpaid: number
  totalCollected: number
  totalOutstanding: number
}

interface MonthlyTrend {
  month: string
  revenue: number
  profit: number
  orders: number
}

interface KPIs {
  todayRevenue: number
  totalOrders: number
  pendingOrders: number
  totalCustomers: number
  repeatCustomers: number
  repeatRate: number
}

interface DashboardData {
  recentOrders: RecentOrder[]
  orderPipeline: OrderPipeline[]
  repeatCustomers: number
  repeatRate: number
  totalCustomers: number
  dispatchSchedule: DispatchSchedule[]
  collections: Collections
  monthlyTrend: MonthlyTrend[]
  kpis: KPIs
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

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  color,
  isCurrency = false,
  subtitle,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
  isCurrency?: boolean
  subtitle?: string
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
              {isCurrency ? formatINR(typeof value === 'number' ? value : 0) : value}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
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

const pipelineColors: Record<string, string> = {
  Pending: 'oklch(0.8 0.15 75)',
  Confirmed: 'oklch(0.7 0.15 250)',
  'In Production': 'oklch(0.7 0.15 200)',
  Dispatched: 'oklch(0.7 0.12 300)',
  Delivered: 'oklch(0.72 0.18 145)',
  Cancelled: 'oklch(0.65 0.22 25)',
}

// ─── Funnel Stages ───────────────────────────────────────────────────────────

const funnelStages = ['Pending', 'Confirmed', 'In Production', 'Dispatched', 'Delivered']

// ─── Main Component ──────────────────────────────────────────────────────────

export function SalesDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/sales')
      const json = await res.json()
      if (json.error) return
      setData(json)
    } catch (err) {
      console.error('Failed to fetch sales dashboard:', err)
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

  const kpis = data.kpis
  const totalPipelineValue = data.orderPipeline.reduce((s, p) => s + p.value, 0)
  const totalCollectionValue = data.collections.totalCollected + data.collections.totalOutstanding

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Sales Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Elysé by Dhanya — Orders, pipeline & collections overview
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · Last updated just now
        </div>
      </div>

      {/* ─── Row 1: KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard icon={IndianRupee} label="Today's Revenue" value={kpis.todayRevenue} color="#10b981" isCurrency />
        <KPICard icon={ShoppingCart} label="Total Orders" value={kpis.totalOrders} color="#f59e0b" subtitle={`${kpis.pendingOrders} pending`} />
        <KPICard icon={Users} label="Total Customers" value={kpis.totalCustomers} color="var(--color-primary)" />
        <KPICard icon={Repeat} label="Repeat Customers" value={kpis.repeatCustomers} color="#06b6d4" subtitle={`${kpis.repeatRate}% repeat rate`} />
        <KPICard icon={TrendingUp} label="Total Collected" value={data.collections.totalCollected} color="#a855f7" isCurrency />
        <KPICard icon={Truck} label="Upcoming Dispatches" value={data.dispatchSchedule.length} color="#f97316" />
      </div>

      {/* ─── Row 2: Sales Pipeline Funnel + Monthly Trend ─────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Sales Pipeline Funnel */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sales Pipeline (Funnel)
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {formatINR(totalPipelineValue)} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-3">
              {funnelStages.map((stage, idx) => {
                const pipeline = data.orderPipeline.find(p => p.status === stage)
                const count = pipeline?.count || 0
                const value = pipeline?.value || 0
                const pct = totalPipelineValue > 0 ? (value / totalPipelineValue) * 100 : 0
                const maxPct = 100 - idx * 12
                const barPct = count > 0 ? Math.min(maxPct, pct * 2.5 + 15) : 5

                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={statusColors[stage] || ''}>
                          {stage}
                        </Badge>
                        <span className="text-muted-foreground">{count} orders</span>
                      </div>
                      <span className="font-semibold">{formatINR(value)}</span>
                    </div>
                    <div className="mx-auto h-8 w-full overflow-hidden rounded-md bg-muted/30" style={{ maxWidth: `${barPct}%` }}>
                      <div
                        className="flex h-full items-center justify-center rounded-md transition-all duration-700 text-[11px] font-medium text-white/90"
                        style={{
                          width: '100%',
                          backgroundColor: pipelineColors[stage] || 'oklch(0.5 0.05 260)',
                        }}
                      >
                        {count > 0 && `${count} · ${formatCompact(value)}`}
                      </div>
                    </div>
                    {idx < funnelStages.length - 1 && count > 0 && (
                      <div className="flex justify-center">
                        <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Sales Trend (Bar Chart) */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Monthly Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyTrend} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill="oklch(0.78 0.14 85)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="profit"
                    name="Profit"
                    fill="oklch(0.72 0.18 145)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 3: Collections Summary + Dispatch Schedule ──────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Collections Summary */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Collections Summary
              </CardTitle>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                {Math.round(totalCollectionValue > 0 ? (data.collections.totalCollected / totalCollectionValue) * 100 : 0)}% Collected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2 space-y-4">
            {/* Paid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="font-medium text-emerald-400">Fully Paid</span>
                </div>
                <span className="font-semibold">{formatINR(data.collections.paid)}</span>
              </div>
              <Progress
                value={totalCollectionValue > 0 ? (data.collections.paid / totalCollectionValue) * 100 : 0}
                className="h-2"
              />
            </div>
            {/* Partial */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-medium text-amber-400">Partial Payment</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{formatINR(data.collections.partialPaid)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">/ {formatINR(data.collections.partialPaid + data.collections.partialOutstanding)}</span>
                </div>
              </div>
              <Progress
                value={totalCollectionValue > 0 ? (data.collections.partialPaid / totalCollectionValue) * 100 : 0}
                className="h-2"
              />
              <p className="text-xs text-amber-400/80">
                Outstanding: {formatINR(data.collections.partialOutstanding)}
              </p>
            </div>
            {/* Unpaid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="font-medium text-red-400">Unpaid</span>
                </div>
                <span className="font-semibold text-red-400">{formatINR(data.collections.unpaid)}</span>
              </div>
              <Progress
                value={totalCollectionValue > 0 ? (data.collections.unpaid / totalCollectionValue) * 100 : 0}
                className="h-2"
              />
            </div>
            {/* Total */}
            <div className="flex items-center justify-between border-t border-border/50 pt-3">
              <span className="text-sm font-medium text-muted-foreground">Total Outstanding</span>
              <span className="text-lg font-bold text-red-400">{formatINR(data.collections.totalOutstanding)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Dispatch Schedule */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Upcoming Dispatches
              </CardTitle>
              <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                {data.dispatchSchedule.length} Scheduled
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {data.dispatchSchedule.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No upcoming dispatches</p>
              ) : (
                data.dispatchSchedule.map((d) => (
                  <div
                    key={d.orderNo}
                    className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {d.orderNo}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[d.status] || ''}`}>
                          {d.status}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold">{formatINR(d.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{d.customer}</span>
                      {d.daysUntilDelivery !== null && (
                        <span className={d.daysUntilDelivery <= 3 ? 'text-amber-400 font-medium' : ''}>
                          {d.deliveryDate} · {d.daysUntilDelivery}d
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 4: Customer Orders Table ─────────────────────────── */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Customer Orders
            </CardTitle>
            <Badge variant="outline" className="border-primary/30 text-primary">
              {data.recentOrders.length} Recent
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-[400px] overflow-y-auto pr-1">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs">Order #</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Payment</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentOrders.map((order) => (
                  <TableRow key={order.orderNo} className="border-border/30">
                    <TableCell>
                      <p className="font-mono text-xs font-medium">{order.orderNo}</p>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs font-medium">{order.customer}</p>
                        {order.buyer && (
                          <p className="text-xs text-muted-foreground">{order.buyer}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      {formatINR(order.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[order.status] || ''}`}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[order.paymentStatus] || ''}`}>
                        {order.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{order.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}