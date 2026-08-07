'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Wallet, Receipt, AlertCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  CartesianGrid, Cell, Legend,
} from 'recharts'
import { toast } from 'sonner'

interface MonthPnL {
  month: string
  revenue: number
  expenses: number
  profit: number
  margin: number
  expenseBreakdown: Array<{ category: string; amount: number; percentage: number }>
  revenueBreakdown: Array<{ category: string; amount: number }>
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const EXPENSE_COLORS = [
  'oklch(0.65 0.22 25)', 'oklch(0.8 0.15 75)', 'oklch(0.75 0.15 65)',
  'oklch(0.7 0.15 250)', 'oklch(0.7 0.15 300)', 'oklch(0.65 0.12 180)',
  'oklch(0.72 0.18 145)', 'oklch(0.7 0.15 350)',
]

export function PnLModule() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [txnType, setTxnType] = useState<'Debit' | 'Credit'>('Debit')

  // Form state
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

  const chartData = months.map(m => ({
    month: m.month,
    Revenue: m.revenue,
    Expenses: m.expenses,
    Profit: m.profit,
  }))

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
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
            <h1 className="text-lg font-bold">Profit & Loss Statement</h1>
            <p className="text-xs text-muted-foreground">Monthly revenue vs expenses — actual profit/loss tracking</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-card border-l-2 border-l-emerald-500/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Revenue (6mo)</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-emerald-400">{formatINR(summary.totalRevenue || 0)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-2 border-l-red-500/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Expenses (6mo)</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-red-400">{formatINR(summary.totalExpenses || 0)}</p>
          </CardContent>
        </Card>
        <Card className={`glass-card border-l-2 ${(summary.totalProfit || 0) >= 0 ? 'border-l-primary/40' : 'border-l-red-500/40'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Net Profit (6mo)</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${(summary.totalProfit || 0) >= 0 ? 'text-primary' : 'text-red-400'}`}>
              {formatINR(summary.totalProfit || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg Margin</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{summary.avgMargin || 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* 6-Month P&L Chart */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">6-Month P&L Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} />
                <XAxis dataKey="month" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 10000000 ? `${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
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
                <Bar dataKey="Revenue" fill="oklch(0.72 0.18 145)" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="Expenses" fill="oklch(0.65 0.22 25)" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="Profit" fill="oklch(0.78 0.14 85)" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Current Month Breakdown */}
      {currentMonth && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Expense Breakdown */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-red-400" />
                {currentMonth.month} Expenses Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentMonth.expenseBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No expenses recorded this month</p>
              ) : (
                <div className="space-y-2">
                  {currentMonth.expenseBreakdown.map((e, i) => (
                    <div key={e.category} className="animate-slide-in space-y-1" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                          <span className="font-medium text-foreground/80">{e.category}</span>
                        </span>
                        <span className="tabular-nums font-medium">{formatINR(e.amount)} <span className="text-muted-foreground">({e.percentage}%)</span></span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${e.percentage}%`, backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2 text-xs">
                    <span className="font-semibold">Total Expenses</span>
                    <span className="font-bold tabular-nums text-red-400">{formatINR(currentMonth.expenses)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Breakdown */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                {currentMonth.month} Revenue Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentMonth.revenueBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No revenue this month</p>
              ) : (
                <div className="space-y-2">
                  {currentMonth.revenueBreakdown.map((r, i) => (
                    <div key={r.category} className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
                      <span className="font-medium text-foreground/80">{r.category}</span>
                      <span className="font-bold tabular-nums text-emerald-400">{formatINR(r.amount)}</span>
                    </div>
                  ))}
                  <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2 text-xs">
                    <span className="font-semibold">Total Revenue</span>
                    <span className="font-bold tabular-nums text-emerald-400">{formatINR(currentMonth.revenue)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="font-semibold">Net Profit</span>
                    <span className={`font-bold tabular-nums ${currentMonth.profit >= 0 ? 'text-primary' : 'text-red-400'}`}>
                      {formatINR(currentMonth.profit)} ({currentMonth.margin}%)
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly P&L Table */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Monthly P&L Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-xs">Month</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Expenses</TableHead>
                <TableHead className="text-xs text-right">Profit/Loss</TableHead>
                <TableHead className="text-xs text-right">Margin</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month} className="border-border/20">
                  <TableCell className="text-xs font-medium py-2.5">{m.month}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-emerald-400 py-2.5">{formatINR(m.revenue)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-red-400 py-2.5">{formatINR(m.expenses)}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-bold py-2.5 ${m.profit >= 0 ? 'text-primary' : 'text-red-400'}`}>{formatINR(m.profit)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums py-2.5">{m.margin}%</TableCell>
                  <TableCell className="text-xs text-center py-2.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${m.profit >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {m.profit >= 0 ? 'PROFIT' : 'LOSS'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
