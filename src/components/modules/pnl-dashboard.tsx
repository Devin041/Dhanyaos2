'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  TrendingUp, TrendingDown, IndianRupee, Plus, RefreshCw, Calendar,
  Wallet, AlertCircle, Target, Receipt, Scale, Info,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts'
import { toast } from 'sonner'

type ViewMode = 'target' | 'actual' | 'net'

interface MonthPnL {
  month: string
  target: { revenue: number; cogs: number; grossProfit: number; margin: number; orderCount: number }
  actual: {
    revenue: number; invoiceCount: number
    directCosts: { material: number; jobWork: number; broker: number; expenseEntries: number }
    totalCosts: number; grossProfit: number; margin: number
  }
  gst: { output: number; input: number; netPayable: number }
  indirect: { expenses: number; breakdown: Array<{ category: string; amount: number }> }
  net: { profit: number; margin: number }
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const VIEW_META: Record<ViewMode, { label: string; hint: string }> = {
  target: { label: 'TARGET', hint: 'Bookings + cost-sheet plan — what we aimed for, NOT actuals' },
  actual: { label: 'ACTUAL', hint: 'Invoiced revenue − actual direct costs (material, job work, broker)' },
  net: { label: 'NET', hint: 'Actual gross − net GST payable − indirect expenses — money left in business' },
}

export function PnLModule() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('actual')
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    type: 'Debit' as 'Debit' | 'Credit',
    category: '',
    amount: '',
    description: '',
    referenceNo: '',
    date: new Date().toISOString().split('T')[0],
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/accounts/monthly-pnl?months=6')
      if (res.ok) setData(await res.json())
    } catch { toast.error('Failed to load P&L data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    if (!form.category || !form.amount || parseFloat(form.amount) <= 0) {
      toast.error('Category and amount are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          category: form.category,
          amount: parseFloat(form.amount),
          description: form.description || undefined,
          referenceNo: form.referenceNo || undefined,
          date: form.date || undefined,
        }),
      })
      if (res.ok) {
        toast.success(`${form.type === 'Debit' ? 'Expense' : 'Income'} of ${formatINR(parseFloat(form.amount))} recorded`)
        setCreateOpen(false)
        setForm({ type: 'Debit', category: '', amount: '', description: '', referenceNo: '', date: new Date().toISOString().split('T')[0] })
        fetchData()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to save')
      }
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const months: MonthPnL[] = data?.months || []
  const summary = data?.summary || {}
  const expenseCategories = data?.expenseCategories || []
  const incomeCategories = data?.incomeCategories || []
  const currentMonth = months[months.length - 1]

  // Chart data per view
  const chartData = months.map(m => {
    if (view === 'target') {
      return { month: m.month, Revenue: m.target.revenue, Costs: m.target.cogs, Profit: m.target.grossProfit }
    }
    if (view === 'actual') {
      return { month: m.month, Revenue: m.actual.revenue, Costs: m.actual.totalCosts, Profit: m.actual.grossProfit }
    }
    return {
      month: m.month,
      'Net Profit': m.net.profit,
      'Net GST': m.gst.netPayable,
      Indirect: m.indirect.expenses,
    }
  })

  // Summary card values per view
  const cards = view === 'target' ? [
    { label: 'Target Revenue (6mo)', value: formatINR(summary.target?.revenue || 0), sub: 'booking value of orders', tone: 'emerald' as const, icon: TrendingUp },
    { label: 'Target COGS (6mo)', value: formatINR(summary.target?.cogs || 0), sub: 'cost-sheet estimate', tone: 'red' as const, icon: TrendingDown },
    { label: 'Target Gross Profit', value: formatINR(summary.target?.grossProfit || 0), sub: 'booking − cost-sheet target', tone: 'primary' as const, icon: Target },
    { label: 'Invoiced Actual', value: formatINR(summary.actual?.revenue || 0), sub: 'for comparison — invoices raised', tone: 'muted' as const, icon: Receipt },
  ] : view === 'actual' ? [
    { label: 'Invoiced Revenue (6mo)', value: formatINR(summary.actual?.revenue || 0), sub: 'actual invoices raised', tone: 'emerald' as const, icon: TrendingUp },
    { label: 'Actual Direct Costs', value: formatINR(summary.actual?.directCosts || 0), sub: 'material + job work + broker', tone: 'red' as const, icon: TrendingDown },
    { label: 'Actual Gross Profit', value: formatINR(summary.actual?.grossProfit || 0), sub: 'invoiced − actual direct', tone: 'primary' as const, icon: Receipt },
    { label: 'Target Gross (compare)', value: formatINR(summary.target?.grossProfit || 0), sub: 'cost-sheet plan — labeled, not actual', tone: 'muted' as const, icon: Target },
  ] : [
    { label: 'Net Profit (6mo)', value: formatINR(summary.net?.profit || 0), sub: 'after GST + indirect', tone: (summary.net?.profit || 0) >= 0 ? 'primary' as const : 'red' as const, icon: IndianRupee },
    { label: 'Net GST Payable', value: formatINR(summary.gst?.netPayable || 0), sub: 'cross-utilized (Rule 88A)', tone: 'red' as const, icon: Scale },
    { label: 'Indirect Expenses', value: formatINR(summary.indirect?.expenses || 0), sub: 'salary, rent, admin…', tone: 'red' as const, icon: TrendingDown },
    { label: 'Avg Net Margin', value: `${summary.net?.avgMargin || 0}%`, sub: 'net profit / invoiced revenue', tone: 'muted' as const, icon: Calendar },
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Profit &amp; Loss Statement</h1>
            <p className="text-xs text-muted-foreground">Target vs Actual vs Net — every number clearly labeled</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Expense/Income
          </Button>
        </div>
      </div>

      {/* View switcher */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-1 w-fit">
          {(['target', 'actual', 'net'] as ViewMode[]).map(v => (
            <button
              key={v}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all ${
                view === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setView(v)}
            >
              {VIEW_META[v].label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Info className="h-3 w-3 shrink-0" />
          {VIEW_META[view].hint}
        </p>
      </div>

      {/* Honesty banner: target ≠ actual */}
      {view === 'target' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
            This is the <b>TARGET view</b> — booking value and cost-sheet estimates. It is <b>not</b> money received or spent.
            Switch to <b>ACTUAL</b> for invoiced revenue and real direct costs, or <b>NET</b> for profit after GST &amp; overheads.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <Card
            key={i}
            className={`glass-card border-l-2 ${
              c.tone === 'emerald' ? 'border-l-emerald-500/40'
              : c.tone === 'red' ? 'border-l-red-500/40'
              : c.tone === 'primary' ? 'border-l-primary/40'
              : 'border-l-muted/40'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <c.icon className={`h-3.5 w-3.5 ${
                  c.tone === 'emerald' ? 'text-emerald-400'
                  : c.tone === 'red' ? 'text-red-400'
                  : c.tone === 'primary' ? 'text-primary'
                  : 'text-muted-foreground'
                }`} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</span>
              </div>
              <p className={`text-xl font-bold tabular-nums ${
                c.tone === 'emerald' ? 'text-emerald-400'
                : c.tone === 'red' ? 'text-red-400'
                : c.tone === 'primary' ? 'text-primary'
                : 'text-foreground'
              }`}>{c.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 6-Month chart per view */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            6-Month Trend — {VIEW_META[view].label} view
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} />
                <XAxis dataKey="month" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                <RTooltip
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
                      <p className="mb-1.5 font-medium">{label}</p>
                      {payload.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.name}
                          </span>
                          <span className="font-medium tabular-nums">{formatINR(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  cursor={{ fill: 'oklch(0.5 0.01 260 / 10%)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {view === 'net' ? (
                  <>
                    <Bar dataKey="Net Profit" fill="oklch(0.78 0.14 85)" radius={[4, 4, 0, 0]} barSize={22} />
                    <Bar dataKey="Net GST" fill="oklch(0.65 0.22 25)" radius={[4, 4, 0, 0]} barSize={22} />
                    <Bar dataKey="Indirect" fill="oklch(0.7 0.15 250)" radius={[4, 4, 0, 0]} barSize={22} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="Revenue" fill="oklch(0.72 0.18 145)" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="Costs" fill="oklch(0.65 0.22 25)" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="Profit" fill="oklch(0.78 0.14 85)" radius={[4, 4, 0, 0]} barSize={20} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Current month detail per view */}
      {currentMonth && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {view === 'target' && (
            <>
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-primary" />
                    {currentMonth.month} — Bookings (Target)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Orders booked</span>
                      <span className="font-medium">{currentMonth.target.orderCount}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Target revenue (booking value)</span>
                      <span className="font-bold tabular-nums text-emerald-400">{formatINR(currentMonth.target.revenue)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Target COGS (cost-sheet)</span>
                      <span className="font-bold tabular-nums text-red-400">{formatINR(currentMonth.target.cogs)}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="font-semibold">Target gross profit</span>
                      <span className="font-bold tabular-nums text-primary">
                        {formatINR(currentMonth.target.grossProfit)} ({currentMonth.target.margin}%)
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    {currentMonth.month} — Target vs Actual gap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Target revenue (bookings)</span>
                      <span className="font-medium tabular-nums">{formatINR(currentMonth.target.revenue)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Actual revenue (invoiced)</span>
                      <span className="font-medium tabular-nums">{formatINR(currentMonth.actual.revenue)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Target gross profit</span>
                      <span className="font-medium tabular-nums">{formatINR(currentMonth.target.grossProfit)}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="font-semibold">Actual gross profit</span>
                      <span className="font-bold tabular-nums text-primary">{formatINR(currentMonth.actual.grossProfit)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1">
                      Gaps mean invoices not yet raised, or actual costs differing from the cost-sheet plan.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {view === 'actual' && (
            <>
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    {currentMonth.month} — Actual Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Invoices raised</span>
                      <span className="font-medium">{currentMonth.actual.invoiceCount}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="font-semibold">Invoiced revenue (GST-incl.)</span>
                      <span className="font-bold tabular-nums text-emerald-400">{formatINR(currentMonth.actual.revenue)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1">
                      Customer payments and capital are cash events, not revenue — they are excluded here.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    {currentMonth.month} — Actual Direct Costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {currentMonth.actual.totalCosts === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No direct costs booked this month</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {([
                        ['Material (purchase orders)', currentMonth.actual.directCosts.material],
                        ['Job work (vendor bills)', currentMonth.actual.directCosts.jobWork],
                        ['Broker commission', currentMonth.actual.directCosts.broker],
                        ['Direct expense entries', currentMonth.actual.directCosts.expenseEntries],
                      ] as [string, number][]).filter(([, v]) => v > 0).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-border/20 py-1.5">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium tabular-nums text-red-400">{formatINR(v)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1.5">
                        <span className="font-semibold">Total direct costs</span>
                        <span className="font-bold tabular-nums text-red-400">{formatINR(currentMonth.actual.totalCosts)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-t border-border/30">
                        <span className="font-semibold">Actual gross profit</span>
                        <span className="font-bold tabular-nums text-primary">
                          {formatINR(currentMonth.actual.grossProfit)} ({currentMonth.actual.margin}%)
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {view === 'net' && (
            <>
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-primary" />
                    {currentMonth.month} — GST &amp; Overheads
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Output GST (collected)</span>
                      <span className="font-medium tabular-nums">{formatINR(currentMonth.gst.output)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Input credit (ITC)</span>
                      <span className="font-medium tabular-nums">−{formatINR(currentMonth.gst.input)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Net GST payable (Rule 88A)</span>
                      <span className="font-medium tabular-nums text-red-400">{formatINR(currentMonth.gst.netPayable)}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="font-semibold">Indirect expenses</span>
                      <span className="font-medium tabular-nums text-red-400">{formatINR(currentMonth.indirect.expenses)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <IndianRupee className="h-4 w-4 text-primary" />
                    {currentMonth.month} — Net Calculation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">Actual gross profit</span>
                      <span className="font-medium tabular-nums">{formatINR(currentMonth.actual.grossProfit)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">− Net GST payable</span>
                      <span className="font-medium tabular-nums">−{formatINR(currentMonth.gst.netPayable)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/20 py-1.5">
                      <span className="text-muted-foreground">− Indirect expenses</span>
                      <span className="font-medium tabular-nums">−{formatINR(currentMonth.indirect.expenses)}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="font-semibold">Net profit</span>
                      <span className={`font-bold tabular-nums ${currentMonth.net.profit >= 0 ? 'text-primary' : 'text-red-400'}`}>
                        {formatINR(currentMonth.net.profit)} ({currentMonth.net.margin}%)
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Monthly P&L table — all three views side by side */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Monthly P&amp;L — Target vs Actual vs Net</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-xs">Month</TableHead>
                <TableHead className="text-xs text-right">Target GP <span className="text-[9px] text-muted-foreground">(plan)</span></TableHead>
                <TableHead className="text-xs text-right">Actual GP <span className="text-[9px] text-muted-foreground">(invoiced − direct)</span></TableHead>
                <TableHead className="text-xs text-right">Net GST</TableHead>
                <TableHead className="text-xs text-right">Indirect</TableHead>
                <TableHead className="text-xs text-right">Net Profit</TableHead>
                <TableHead className="text-xs text-right">Net Margin</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month} className="border-border/20">
                  <TableCell className="text-xs font-medium py-2.5">{m.month}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-2.5 text-muted-foreground">{formatINR(m.target.grossProfit)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-2.5 text-emerald-400">{formatINR(m.actual.grossProfit)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-2.5 text-red-400">−{formatINR(m.gst.netPayable)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-2.5 text-red-400">−{formatINR(m.indirect.expenses)}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-bold py-2.5 ${m.net.profit >= 0 ? 'text-primary' : 'text-red-400'}`}>{formatINR(m.net.profit)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-2.5">{m.net.margin}%</TableCell>
                  <TableCell className="text-xs text-center py-2.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${m.net.profit >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {m.net.profit >= 0 ? 'PROFIT' : 'LOSS'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1.5">
            <Info className="h-3 w-3 shrink-0" />
            Target GP = bookings − cost-sheet estimates. Actual GP = invoiced revenue − actual direct costs. Net = Actual GP − GST − indirect.
          </p>
        </CardContent>
      </Card>

      {/* Add Expense/Income Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Expense / Income</DialogTitle>
            <DialogDescription>Add daily expenses (salary, rent, etc.) or income entries</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Type Toggle */}
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-1">
              <button
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${form.type === 'Debit' ? 'bg-red-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setForm({ ...form, type: 'Debit', category: '' })}
              >
                <TrendingDown className="h-3 w-3 inline mr-1" /> Expense
              </button>
              <button
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${form.type === 'Credit' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setForm({ ...form, type: 'Credit', category: '' })}
              >
                <TrendingUp className="h-3 w-3 inline mr-1" /> Income
              </button>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label className="text-xs">Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-9">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(form.type === 'Debit' ? expenseCategories : incomeCategories).map((cat: string) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Amount (₹) *</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" className="h-9 bg-muted/50 border-border"
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-9 bg-muted/50 border-border"
                  value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Input placeholder="e.g. Monthly salary - August 2026" className="h-9 bg-muted/50 border-border"
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            {/* Reference No */}
            <div className="space-y-2">
              <Label className="text-xs">Reference No (optional)</Label>
              <Input placeholder="e.g. Bill no, UPI ref" className="h-9 bg-muted/50 border-border"
                value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Record Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
