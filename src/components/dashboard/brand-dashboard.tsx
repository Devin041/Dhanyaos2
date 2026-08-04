'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { Sparkles, TrendingUp, Layers, Palette, Shirt } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StylePerformance {
  styleName: string
  orders: number
  quantity: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

interface CatalogItem {
  id: string
  styleNo: string
  collection: string | null
  season: string | null
  category: string | null
  fit: string | null
  fabric: string | null
  embroidery: string | null
  neck: string | null
  sleeve: string | null
  costPrice: number
  sellPrice: number
  margin: number
  status: string
}

interface DashboardData {
  stylePerformance: StylePerformance[]
  catalog: CatalogItem[]
  collections: { name: string; count: number }[]
  seasons: { name: string; count: number }[]
  categories: { name: string; count: number }[]
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

const CHART_COLORS = [
  'oklch(0.78 0.14 85)',
  'oklch(0.72 0.18 145)',
  'oklch(0.7 0.15 250)',
  'oklch(0.75 0.15 25)',
  'oklch(0.7 0.12 300)',
  'oklch(0.65 0.18 200)',
  'oklch(0.8 0.15 75)',
  'oklch(0.68 0.15 330)',
  'oklch(0.74 0.16 30)',
  'oklch(0.66 0.14 180)',
]

const fitColors: Record<string, string> = {
  Regular: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Slim: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'A-Line': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Relaxed: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  Flowy: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

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

export function BrandDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/brand')
      const json = await res.json()
      if (json.error) return
      setData(json)
    } catch (err) {
      console.error('Failed to fetch brand dashboard:', err)
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

  const topStyles = data.stylePerformance.slice(0, 5)
  const categoryData = data.categories.map((c, i) => ({ ...c, fill: CHART_COLORS[i % CHART_COLORS.length] }))
  const seasonData = data.seasons.map((s, i) => ({ ...s, fill: CHART_COLORS[i % CHART_COLORS.length] }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            <span className="gold-shimmer">Brand Dashboard</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Elysé by Dhanya — Collection performance & style analytics
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 text-primary w-fit">
          <Sparkles className="mr-1 h-3 w-3" />
          {data.collections.length} Collections · {data.catalog.length} Styles
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card border-l-2 border-l-primary/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Styles</p>
                <p className="text-2xl font-bold">{data.catalog.length}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <Shirt className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-emerald-500/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Collections</p>
                <p className="text-2xl font-bold">{data.collections.length}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
                <Layers className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-blue-400/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Avg Margin</p>
                <p className="text-2xl font-bold">{(data.stylePerformance.reduce((s, p) => s + p.margin, 0) / Math.max(data.stylePerformance.length, 1)).toFixed(1)}%</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-400/15">
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-purple-400/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{data.categories.length}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-400/15">
                <Palette className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Selling Styles + Category Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Best Selling Styles
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topStyles} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} />
                  <XAxis type="number" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                  <YAxis type="category" dataKey="styleName" tick={{ fill: 'oklch(0.7 0.01 260)', fontSize: 10 }} axisLine={false} tickLine={false} width={75} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                    {topStyles.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Category Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.3} />
                  <XAxis type="number" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'oklch(0.7 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} width={115} />
                  <Tooltip />
                  <Bar dataKey="count" name="Styles" radius={[0, 4, 4, 0]}>
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Style Performance Table */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Style Performance Analysis
            </CardTitle>
            <span className="text-xs text-muted-foreground">{data.stylePerformance.length} styles tracked</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs">Style</TableHead>
                  <TableHead className="text-xs text-right">Orders</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Profit</TableHead>
                  <TableHead className="text-xs text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stylePerformance.map((style, idx) => (
                  <TableRow key={style.styleName} className={`border-border/30 ${idx === 0 ? 'bg-primary/5' : ''}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${idx < 3 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium">{style.styleName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{style.orders}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{style.quantity.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatINR(style.revenue)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-emerald-400">{formatINR(style.profit)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={style.margin >= 50 ? 'border-emerald-500/30 text-emerald-400' : style.margin >= 40 ? 'border-amber-500/30 text-amber-400' : 'border-red-500/30 text-red-400'}>
                        {style.margin}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Style Catalog Grid */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Style Catalog
            </CardTitle>
            <div className="flex gap-2">
              {data.collections.map((c) => (
                <Badge key={c.name} variant="outline" className="border-primary/20 text-primary/80 text-[10px]">
                  {c.name} ({c.count})
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.catalog.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/50 p-4 transition-colors hover:bg-muted/20 hover:border-primary/20">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold text-primary">{item.styleNo}</p>
                    <p className="text-sm font-medium mt-0.5">{item.category}</p>
                  </div>
                  <Badge variant="outline" className={fitColors[item.fit || ''] || 'bg-muted text-muted-foreground'}>
                    {item.fit}
                  </Badge>
                </div>
                <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                  <p><span className="text-foreground/60">Fabric:</span> {item.fabric}</p>
                  <p><span className="text-foreground/60">Embroidery:</span> {item.embroidery || 'None'}</p>
                  <p><span className="text-foreground/60">Neck:</span> {item.neck} · <span className="text-foreground/60">Sleeve:</span> {item.sleeve}</p>
                </div>
                <div className="flex items-center justify-between border-t border-border/30 pt-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Cost</p>
                    <p className="text-sm font-medium">{formatINR(item.costPrice)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Sell</p>
                    <p className="text-sm font-bold text-primary">{formatINR(item.sellPrice)}</p>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                    {item.margin}% margin
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Season + Collections Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Season Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {seasonData.map((s, i) => {
                const max = Math.max(...seasonData.map(x => x.count))
                const pct = (s.count / max) * 100
                return (
                  <div key={s.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span>{s.name}</span>
                      <span className="font-medium">{s.count} styles</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
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
              Collections Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {data.collections.map((c, i) => {
                const max = Math.max(...data.collections.map(x => x.count))
                const pct = (c.count / max) * 100
                return (
                  <div key={c.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.count} styles</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}