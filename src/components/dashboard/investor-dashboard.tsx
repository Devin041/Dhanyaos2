'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, Wallet, ShieldCheck, Target, Rocket, AlertTriangle, CheckCircle2, Clock, ArrowUpRight, Users, Package,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExecSummary {
  company: string; brand: string; stage: string; founded: string; industry: string; headquarters: string
  totalRevenue: number; grossProfit: number; grossMargin: number; totalOrders: number; monthlyGrowth: number
  activeCustomers: number; totalCustomers: number
}

interface RevenueTrend { date: string; revenue: number; profit: number; cashBalance: number }
interface CashFlowData { cashBalance: number; monthlyBurnRate: number; receivables: number; payables: number; workingCapital: number; runwayDays: number }
interface OrderBook { pendingValue: number; pendingOrders: number }
interface GrowthStrategy { label: string; status: string; priority: number }
interface Milestone { date: string; title: string; status: string }
interface RiskAnalysis { risk: string; level: string; mitigation: string }

interface DashboardData {
  executiveSummary: ExecSummary
  revenueTrend: RevenueTrend[]
  cashFlow: CashFlowData
  orderBook: OrderBook
  growthStrategy: GrowthStrategy[]
  milestones: Milestone[]
  riskAnalysis: RiskAnalysis[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}
function formatCompact(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('en-IN')
}

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

const milestoneStatusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  active: { icon: Rocket, color: 'text-primary', bg: 'bg-primary/15' },
  upcoming: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-400/15' },
  future: { icon: Target, color: 'text-muted-foreground', bg: 'bg-muted' },
}

const riskColors: Record<string, string> = {
  Low: 'border-l-emerald-500 bg-emerald-500/5',
  Medium: 'border-l-amber-500 bg-amber-500/5',
  High: 'border-l-red-500 bg-red-500/5',
}

const strategyStatusColors: Record<string, string> = {
  Active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Evaluated: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  Planned: 'bg-blue-400/15 text-blue-400 border-blue-400/20',
  Future: 'bg-muted text-muted-foreground border-border',
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="glass-card"><CardContent className="p-4"><Skeleton className="mb-2 h-3 w-24" /><Skeleton className="h-8 w-32" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="glass-card"><CardContent className="p-6"><Skeleton className="mb-4 h-4 w-48" /><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function InvestorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/investor')
      const json = await res.json()
      if (json.error) return
      setData(json)
    } catch (err) {
      console.error('Failed to fetch investor dashboard:', err)
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

  const s = data.executiveSummary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            <span className="gold-shimmer">Investor Dashboard</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {s.company} — Confidential investor relations view
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 text-primary w-fit">
          <ShieldCheck className="mr-1 h-3 w-3" />
          {s.stage}
        </Badge>
      </div>

      {/* Executive Summary Card */}
      <Card className="glass-card border border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Legal Name</p>
                <p className="font-semibold">{s.company}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Brand</p>
                <p className="font-semibold text-primary">{s.brand}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Headquarters</p>
                <p className="text-sm">{s.headquarters}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Industry</p>
                <p className="text-sm">{s.industry}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Founded</p>
                <p className="text-sm">{s.founded}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Stage</p>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">{s.stage}</Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Total Revenue (All Time)</p>
                <p className="text-xl font-bold">{formatINR(s.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gross Margin</p>
                <p className="text-xl font-bold text-emerald-400">{s.grossMargin}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly Growth</p>
                <p className={`text-lg font-bold ${s.monthlyGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.monthlyGrowth >= 0 ? '+' : ''}{s.monthlyGrowth}%
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Total Orders Delivered</p>
                <p className="text-xl font-bold">{s.totalOrders}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Clients</p>
                <p className="text-xl font-bold">{s.activeCustomers} <span className="text-sm font-normal text-muted-foreground">/ {s.totalCustomers}</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order Book Value</p>
                <p className="text-xl font-bold text-primary">{formatINR(data.orderBook.pendingValue)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card border-l-2 border-l-primary/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cash Balance</p>
                <p className="text-2xl font-bold">{formatINR(data.cashFlow.cashBalance)}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-emerald-500/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Working Capital</p>
                <p className="text-2xl font-bold">{formatINR(data.cashFlow.workingCapital)}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-cyan-400/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cash Runway</p>
                <p className="text-2xl font-bold">{data.cashFlow.runwayDays} <span className="text-sm font-normal text-muted-foreground">days</span></p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-amber-500/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Monthly Burn</p>
                <p className="text-2xl font-bold">{formatINR(data.cashFlow.monthlyBurnRate)}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                <ArrowUpRight className="h-5 w-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend + Cash Flow */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Revenue & Profit Trend
              </CardTitle>
              <span className="text-xs text-emerald-400">+{s.monthlyGrowth}% MoM</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueTrend}>
                  <defs>
                    <linearGradient id="gradInvRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradInvProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="oklch(0.78 0.14 85)" fill="url(#gradInvRevenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" name="Profit" stroke="oklch(0.72 0.18 145)" fill="url(#gradInvProfit)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cash Position Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={300000} stroke="oklch(0.65 0.22 25)" strokeDasharray="6 4" opacity={0.4} label={{ value: 'Min. Reserve', position: 'insideTopRight', fill: 'oklch(0.5 0.01 260)', fontSize: 10 }} />
                  <Line type="monotone" dataKey="cashBalance" name="Cash Balance" stroke="oklch(0.7 0.15 200)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: 'oklch(0.7 0.15 200)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Milestones + Growth Strategy */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Key Milestones
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="relative space-y-0">
              {data.milestones.map((m, i) => {
                const config = milestoneStatusConfig[m.status] || milestoneStatusConfig.future
                const Icon = config.icon
                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      {i < data.milestones.length - 1 && <div className="w-px flex-1 bg-border/50 my-1" />}
                    </div>
                    <div className="pb-6">
                      <p className="text-sm font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.date}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Growth Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {data.growthStrategy.map((g) => (
                <div key={g.label} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {g.priority}
                    </span>
                    <span className="text-sm font-medium">{g.label}</span>
                  </div>
                  <Badge variant="outline" className={strategyStatusColors[g.status] || ''}>
                    {g.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Analysis */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Risk Analysis
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.riskAnalysis.map((r, i) => (
              <div key={i} className={`border-l-2 rounded-r-lg border border-border/50 p-4 ${riskColors[r.level] || ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{r.risk}</p>
                  <Badge variant="outline" className={r.level === 'Low' ? 'border-emerald-500/30 text-emerald-400 text-[10px]' : r.level === 'Medium' ? 'border-amber-500/30 text-amber-400 text-[10px]' : 'border-red-500/30 text-red-400 text-[10px]'}>
                    {r.level}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.mitigation}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow Summary Footer */}
      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Wallet className="h-3 w-3 text-primary" />
              <span>Receivables: <span className="font-semibold text-foreground">{formatINR(data.cashFlow.receivables)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-3 w-3 text-red-400" />
              <span>Payables: <span className="font-semibold text-foreground">{formatINR(data.cashFlow.payables)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-3 w-3 text-blue-400" />
              <span>Order Book: <span className="font-semibold text-foreground">{formatINR(data.orderBook.pendingValue)}</span> ({data.orderBook.pendingOrders} orders)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}