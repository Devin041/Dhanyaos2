'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { useDashboardStore } from '@/store/dashboard-store'
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
  BarChart3,
  IndianRupee,
  FileText,
  Factory,
  Users,
  Warehouse,
  Scale,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Loader2,
  Lock,
  Package,
  ArrowRight,
  Receipt,
} from 'lucide-react'
import {
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
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportKey = 'profit_loss' | 'order_analysis' | 'production_report' | 'customer_report' | 'inventory_report' | 'balance_sheet'

interface ReportCard {
  key: ReportKey
  label: string
  description: string
  icon: React.ReactNode
}

interface ProfitLossData {
  reportType: string
  period: string
  generatedAt: string
  revenue: { totalRevenue: number; orders: { label: string; amount: number }[] }
  costOfGoods: { totalCOGS: number; items: { label: string; amount: number }[] }
  grossProfit: number
  grossMargin: number
  operatingExpenses: { totalOpex: number; items: { label: string; amount: number }[] }
  netProfit: number
  netMargin: number
  monthlyComparison: { month: string; revenue: number; profit: number }[]
}

interface OrderAnalysisData {
  reportType: string
  totalOrders: number
  statusBreakdown: { status: string; count: number; value: number }[]
  paymentBreakdown: { status: string; count: number; value: number }[]
  topStyles: { styleNo: string; styleName: string; totalQty: number; totalValue: number; orderCount: number }[]
  avgOrderValue: number
  avgMargin: number
}

interface ProductionReportData {
  reportType: string
  totalJobs: number
  statusBreakdown: { status: string; count: number }[]
  stageDistribution: { stage: string; count: number }[]
  totalTarget: number
  totalCompleted: number
  overallProgress: number
  overdueJobs: { jobNo: string; styleName: string; endDate: string; daysOverdue: number; completedPct: number }[]
  efficiency: number
}

interface CustomerReportData {
  reportType: string
  totalCustomers: number
  activeCustomers: number
  topCustomers: {
    companyName: string
    totalOrders: number
    totalValue: number
    totalPaid: number
    outstanding: number
    avgMargin: number
    lastOrderDate: string | null
  }[]
  paymentTermsDistribution: { terms: number; count: number }[]
  totalReceivables: number
  collectionRate: number
}

interface InventoryReportData {
  reportType: string
  totalRawMaterialValue: number
  totalFinishedGoodsValue: number
  totalWIPValue: number
  totalInventoryValue: number
  lowStockItems: { fabricName: string; availableMeters: number; totalValue: number }[]
  fabricUtilization: number
  stockTurnover: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inr = (val: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val)

const num = (val: number) => new Intl.NumberFormat('en-IN').format(val)

const STATUS_COLORS: Record<string, string> = {
  Pending: '#f59e0b',
  'In Progress': '#3b82f6',
  Completed: '#22c55e',
  Cancelled: '#ef4444',
  Paid: '#22c55e',
  Partial: '#f59e0b',
  Unpaid: '#ef4444',
  Approved: '#3b82f6',
  Ordered: '#a855f7',
  Received: '#22c55e',
  Delayed: '#ef4444',
}

const PIE_COLORS = ['oklch(0.78 0.14 85)', 'oklch(0.65 0.18 155)', 'oklch(0.7 0.15 250)', 'oklch(0.75 0.15 25)', 'oklch(0.7 0.12 300)']

// ─── Component ───────────────────────────────────────────────────────────────

export function ReportsModule() {
  const { setActiveView } = useDashboardStore()
  const [selectedReport, setSelectedReport] = useState<ReportKey>('profit_loss')
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async (reportKey: ReportKey) => {
    if (reportKey === 'balance_sheet') return
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(`/api/reports?report=${reportKey}`)
      if (!res.ok) throw new Error('Failed to fetch report')
      const json = await res.json()
      if (!json || typeof json !== 'object') throw new Error('Invalid response')
      // Normalize: ensure all arrays are present to prevent undefined.length crashes
      const rev = json.revenue && typeof json.revenue === 'object' ? json.revenue : {}
      const cogs = json.costOfGoods && typeof json.costOfGoods === 'object' ? json.costOfGoods : {}
      const opex = json.operatingExpenses && typeof json.operatingExpenses === 'object' ? json.operatingExpenses : {}
      const safe = {
        ...json,
        reportType: json.reportType || '',
        period: json.period || '',
        generatedAt: json.generatedAt || new Date().toISOString(),
        revenue: { totalRevenue: rev.totalRevenue ?? 0, orders: Array.isArray(rev.orders) ? rev.orders : [] },
        costOfGoods: { totalCOGS: cogs.totalCOGS ?? 0, items: Array.isArray(cogs.items) ? cogs.items : [] },
        operatingExpenses: { totalOpex: opex.totalOpex ?? 0, items: Array.isArray(opex.items) ? opex.items : [] },
        monthlyComparison: Array.isArray(json.monthlyComparison) ? json.monthlyComparison : [],
        statusBreakdown: Array.isArray(json.statusBreakdown) ? json.statusBreakdown : [],
        paymentBreakdown: Array.isArray(json.paymentBreakdown) ? json.paymentBreakdown : [],
        topStyles: Array.isArray(json.topStyles) ? json.topStyles : [],
        overdueJobs: Array.isArray(json.overdueJobs) ? json.overdueJobs : [],
        stageDistribution: Array.isArray(json.stageDistribution) ? json.stageDistribution : [],
        topCustomers: Array.isArray(json.topCustomers) ? json.topCustomers : [],
        paymentTermsDistribution: Array.isArray(json.paymentTermsDistribution) ? json.paymentTermsDistribution : [],
        lowStockItems: Array.isArray(json.lowStockItems) ? json.lowStockItems : [],
        totalOrders: json.totalOrders ?? 0,
        avgOrderValue: json.avgOrderValue ?? 0,
        avgMargin: json.avgMargin ?? 0,
        totalJobs: json.totalJobs ?? 0,
        totalTarget: json.totalTarget ?? 0,
        totalCompleted: json.totalCompleted ?? 0,
        overallProgress: json.overallProgress ?? 0,
        efficiency: json.efficiency ?? 0,
        totalCustomers: json.totalCustomers ?? 0,
        activeCustomers: json.activeCustomers ?? 0,
        totalReceivables: json.totalReceivables ?? 0,
        collectionRate: json.collectionRate ?? 0,
        totalRawMaterialValue: json.totalRawMaterialValue ?? 0,
        totalFinishedGoodsValue: json.totalFinishedGoodsValue ?? 0,
        totalWIPValue: json.totalWIPValue ?? 0,
        totalInventoryValue: json.totalInventoryValue ?? 0,
        fabricUtilization: json.fabricUtilization ?? 0,
        stockTurnover: json.stockTurnover ?? 0,
        grossProfit: json.grossProfit ?? 0,
        grossMargin: json.grossMargin ?? 0,
        netProfit: json.netProfit ?? 0,
        netMargin: json.netMargin ?? 0,
      }
      setData(safe)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReport(selectedReport)
  }, [selectedReport, fetchReport])

  const reportCards: ReportCard[] = [
    { key: 'profit_loss', label: 'P&L Statement', description: 'Revenue, costs & net profit analysis', icon: <IndianRupee className="h-5 w-5" /> },
    { key: 'order_analysis', label: 'Order Analysis', description: 'Order status, payments & top styles', icon: <FileText className="h-5 w-5" /> },
    { key: 'production_report', label: 'Production Report', description: 'Jobs, stages, efficiency & delays', icon: <Factory className="h-5 w-5" /> },
    { key: 'customer_report', label: 'Customer Report', description: 'Receivables, collection & terms', icon: <Users className="h-5 w-5" /> },
    { key: 'inventory_report', label: 'Inventory Report', description: 'Stock values, utilization & turnover', icon: <Warehouse className="h-5 w-5" /> },
    { key: 'balance_sheet', label: 'Balance Sheet', description: 'Assets, liabilities & equity', icon: <Scale className="h-5 w-5" /> },
  ]

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Reports</h1>
            <p className="text-xs text-muted-foreground">Business Intelligence</p>
          </div>
        </div>
        <ExportButton module="reports" />
      </div>

      {/* ─── Report Type Selector ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {reportCards.map((card) => {
          const isBalanceSheet = card.key === 'balance_sheet'
          const isSelected = selectedReport === card.key
          return (
            <button
              key={card.key}
              onClick={() => setSelectedReport(card.key)}
              className={`glass-card relative flex flex-col items-center gap-2 rounded-xl p-4 transition-all hover:scale-[1.02] ${
                isSelected && !isBalanceSheet
                  ? 'border-primary shadow-[0_0_16px_oklch(0.78_0.14_85/0.15)]'
                  : 'hover:border-primary/30'
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isSelected && !isBalanceSheet ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {card.icon}
              </div>
              <span className={`text-xs font-semibold text-center leading-tight ${isSelected && !isBalanceSheet ? 'text-primary' : 'text-foreground'}`}>
                {card.label}
              </span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight hidden sm:block">{card.description}</span>
              {isBalanceSheet && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
                  <Lock className="h-4 w-4 text-muted-foreground mb-1" />
                  <span className="text-[10px] font-medium text-muted-foreground">Coming Soon</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── GST Reports Navigation ─────────────────────────────── */}
      <button
        onClick={() => setActiveView('gst-reports')}
        className="glass-card group flex w-full items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-[0_0_16px_oklch(0.78_0.14_85/0.1)]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">GST Reports</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Module</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">GSTR-1, GSTR-3B filing, input tax credit & compliance reports</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </button>

      {/* ─── Report Content ───────────────────────────────────────── */}
      <div className="min-h-[50vh]">
        {selectedReport === 'balance_sheet' ? (
          <BalanceSheetPlaceholder />
        ) : loading ? (
          <ReportSkeleton reportKey={selectedReport} />
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-3" />
            <p className="text-sm">Failed to load report data</p>
          </div>
        ) : (
          <ReportContent reportKey={selectedReport} data={data} />
        )}
      </div>
    </div>
  )
}

// ─── Balance Sheet Placeholder ───────────────────────────────────────────────

function BalanceSheetPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
        <Scale className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Balance Sheet</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
        This report is under development. It will provide a comprehensive view of assets, liabilities, and equity for Dhanya Lifestyle LLP.
      </p>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-xs text-muted-foreground">Coming Soon</span>
      </div>
    </div>
  )
}

// ─── Per-Report Error Boundary ──────────────────────────────────────────────

interface ReportErrorState { hasError: boolean; error: Error | null }
class ReportErrorBoundary extends React.Component<
  { children: React.ReactNode; reportName: string },
  ReportErrorState
> {
  constructor(props: { children: React.ReactNode; reportName: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mb-3 text-destructive" />
          <p className="text-sm font-medium mb-1">Failed to render {this.props.reportName}</p>
          <p className="text-xs text-muted-foreground/70 font-mono max-w-md break-all">
            {this.state.error?.message || 'Unknown error'}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Report Content Router ───────────────────────────────────────────────────

function ReportContent({ reportKey, data }: { reportKey: string; data: unknown }) {
  const label = reportKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <ReportErrorBoundary reportName={label}>
      {(() => {
        switch (reportKey) {
          case 'profit_loss':
            return <ProfitLossView data={data as ProfitLossData} />
          case 'order_analysis':
            return <OrderAnalysisView data={data as OrderAnalysisData} />
          case 'production_report':
            return <ProductionReportView data={data as ProductionReportData} />
          case 'customer_report':
            return <CustomerReportView data={data as CustomerReportData} />
          case 'inventory_report':
            return <InventoryReportView data={data as InventoryReportData} />
          default:
            return null
        }
      })()}
    </ReportErrorBoundary>
  )
}

// ─── 1. PROFIT & LOSS VIEW ──────────────────────────────────────────────────

function ProfitLossView({ data }: { data: ProfitLossData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-primary/30 text-primary text-xs">{data.period}</Badge>
        <span className="text-[10px] text-muted-foreground">
          Generated {new Date(data.generatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      {/* Revenue */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Revenue</h3>
        <div className="space-y-2">
          {data.revenue.orders.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                {item.label}
              </span>
              <span className="font-medium tabular-nums">{inr(item.amount)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="font-semibold text-sm">Total Revenue</span>
          <span className="text-lg font-bold text-primary tabular-nums">{inr(data.revenue.totalRevenue)}</span>
        </div>
      </div>

      {/* COGS */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cost of Goods Sold</h3>
        <div className="space-y-2">
          {data.costOfGoods.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                {item.label}
              </span>
              <span className="font-medium tabular-nums">{inr(item.amount)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="font-semibold text-sm">Total COGS</span>
          <span className="text-lg font-bold text-destructive tabular-nums">{inr(data.costOfGoods.totalCOGS)}</span>
        </div>
      </div>

      {/* Gross Profit Highlight */}
      <div className="glass-card rounded-xl border-2 border-primary/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Gross Profit</h3>
            <p className="text-2xl font-bold text-primary mt-1 tabular-nums">{inr(data.grossProfit)}</p>
          </div>
          <div className="flex flex-col items-end">
            <Badge className="bg-primary/20 text-primary border-primary/30">{data.grossMargin}%</Badge>
            <span className="text-[10px] text-muted-foreground mt-1">Gross Margin</span>
          </div>
        </div>
      </div>

      {/* Operating Expenses */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Operating Expenses</h3>
        <div className="space-y-2">
          {data.operatingExpenses.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                {item.label}
              </span>
              <span className="font-medium tabular-nums">{inr(item.amount)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="font-semibold text-sm">Total OPEX</span>
          <span className="text-lg font-bold text-destructive tabular-nums">{inr(data.operatingExpenses.totalOpex)}</span>
        </div>
      </div>

      {/* Net Profit Highlight */}
      <div className={`rounded-xl border-2 p-5 ${data.netProfit >= 0 ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-destructive/50 bg-destructive/5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data.netProfit >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</h3>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${data.netProfit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                {inr(data.netProfit)}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <Badge className={data.netProfit >= 0 ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'bg-destructive/20 text-destructive border-destructive/30'}>
              {data.netMargin}%
            </Badge>
            <span className="text-[10px] text-muted-foreground mt-1">Net Margin</span>
          </div>
        </div>
      </div>

      {/* Monthly Comparison Chart */}
      {data.monthlyComparison.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Monthly Comparison</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyComparison} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.005 260)" />
                <XAxis dataKey="month" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
                <Tooltip
                  contentStyle={{ background: 'oklch(0.17 0.005 260)', border: '1px solid oklch(0.28 0.005 260)', borderRadius: '8px', fontSize: 12 }}
                  labelStyle={{ color: 'oklch(0.95 0 0)' }}
                  formatter={(value: number) => inr(value)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="oklch(0.78 0.14 85)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="oklch(0.65 0.18 155)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 2. ORDER ANALYSIS VIEW ─────────────────────────────────────────────────

function OrderAnalysisView({ data }: { data: OrderAnalysisData }) {
  const statusColorMap: Record<string, string> = {
    Pending: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    'In Progress': 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    Completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    Cancelled: 'bg-red-500/15 text-red-500 border-red-500/30',
  }

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Total Orders" value={num(data.totalOrders)} icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="Avg Order Value" value={inr(data.avgOrderValue)} icon={<IndianRupee className="h-4 w-4" />} />
        <MetricCard label="Avg Margin" value={`${data.avgMargin}%`} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Order Status Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} label={({ status, count }) => `${status}: ${count}`}>
                  {data.statusBreakdown.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[data.statusBreakdown[i]?.status] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'oklch(0.17 0.005 260)', border: '1px solid oklch(0.28 0.005 260)', borderRadius: '8px', fontSize: 12 }}
                  formatter={(value: number, name: string) => [`${value} orders`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Payment Status Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.paymentBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} label={({ status, count }) => `${status}: ${count}`}>
                  {data.paymentBreakdown.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[data.paymentBreakdown[i]?.status] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'oklch(0.17 0.005 260)', border: '1px solid oklch(0.28 0.005 260)', borderRadius: '8px', fontSize: 12 }}
                  formatter={(value: number, name: string) => [`${value} orders`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Status Breakdown Table */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Status Breakdown</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.statusBreakdown.map((row) => {
                const totalVal = data.statusBreakdown.reduce((s, r) => s + r.value, 0)
                const pct = totalVal > 0 ? (row.value / totalVal) * 100 : 0
                return (
                  <TableRow key={row.status}>
                    <TableCell>
                      <Badge variant="outline" className={statusColorMap[row.status] || ''}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(row.value)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Top Styles */}
      {data.topStyles.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Top Styles by Value</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topStyles.map((style) => (
                  <TableRow key={style.styleNo}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{style.styleName}</p>
                        <p className="text-xs text-muted-foreground">{style.styleNo}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{num(style.totalQty)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-primary">{inr(style.totalValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{style.orderCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 3. PRODUCTION REPORT VIEW ──────────────────────────────────────────────

function ProductionReportView({ data }: { data: ProductionReportData }) {
  const overdueCount = data.overdueJobs.length

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Jobs" value={String(data.totalJobs)} icon={<Factory className="h-4 w-4" />} />
        <MetricCard label="Overall Progress" value={`${data.overallProgress}%`} icon={<TrendingUp className="h-4 w-4" />} accent />
        <MetricCard label="Efficiency" value={`${data.efficiency}%`} icon={<Package className="h-4 w-4" />} />
        <MetricCard
          label="Overdue"
          value={String(overdueCount)}
          icon={<AlertTriangle className="h-4 w-4" />}
          danger={overdueCount > 0}
        />
      </div>

      {/* Progress Bar */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Production Progress</h3>
          <span className="text-sm tabular-nums">
            {num(data.totalCompleted)} / {num(data.totalTarget)} units
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all"
            style={{ width: `${Math.min(data.overallProgress, 100)}%` }}
          />
        </div>
      </div>

      {/* Stage Distribution Chart */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Stage Distribution</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.stageDistribution} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.005 260)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip
                contentStyle={{ background: 'oklch(0.17 0.005 260)', border: '1px solid oklch(0.28 0.005 260)', borderRadius: '8px', fontSize: 12 }}
                formatter={(value: number) => [`${value} jobs`, 'Jobs']}
              />
              <Bar dataKey="count" name="Jobs" fill="oklch(0.78 0.14 85)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Overdue Jobs */}
      {data.overdueJobs.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive uppercase tracking-wider">Overdue Jobs</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job No</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.overdueJobs.map((job) => (
                  <TableRow key={job.jobNo}>
                    <TableCell className="font-medium text-sm">{job.jobNo}</TableCell>
                    <TableCell className="text-sm">{job.styleName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{job.endDate}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                        {job.daysOverdue}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${job.completedPct >= 75 ? 'bg-amber-500' : 'bg-destructive'}`}
                            style={{ width: `${job.completedPct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums w-10 text-right">{job.completedPct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 4. CUSTOMER REPORT VIEW ─────────────────────────────────────────────────

function CustomerReportView({ data }: { data: CustomerReportData }) {
  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Active Customers" value={`${data.activeCustomers} / ${data.totalCustomers}`} icon={<Users className="h-4 w-4" />} accent />
        <MetricCard label="Total Receivables" value={inr(data.totalReceivables)} icon={<IndianRupee className="h-4 w-4" />} danger={data.totalReceivables > 0} />
        <MetricCard label="Collection Rate" value={`${data.collectionRate}%`} icon={<TrendingUp className="h-4 w-4" />} accent={data.collectionRate >= 70} danger={data.collectionRate < 70} />
      </div>

      {/* Top Customers Table */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Top Customers</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Last Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topCustomers.map((customer) => (
                <TableRow key={customer.companyName}>
                  <TableCell className="font-medium text-sm">{customer.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums">{customer.totalOrders}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(customer.totalValue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-500">{inr(customer.totalPaid)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={customer.outstanding > 0 ? 'text-destructive' : 'text-emerald-500'}>
                      {inr(customer.outstanding)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{customer.avgMargin}%</Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums hidden lg:table-cell">
                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Payment Terms Distribution */}
      {data.paymentTermsDistribution.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Payment Terms Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.paymentTermsDistribution.map((d) => ({ ...d, label: `${d.terms} Days` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.005 260)" />
                <XAxis dataKey="label" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'oklch(0.17 0.005 260)', border: '1px solid oklch(0.28 0.005 260)', borderRadius: '8px', fontSize: 12 }}
                  formatter={(value: number) => [`${value} customers`, 'Customers']}
                />
                <Bar dataKey="count" name="Customers" fill="oklch(0.65 0.18 155)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 5. INVENTORY REPORT VIEW ────────────────────────────────────────────────

function InventoryReportView({ data }: { data: InventoryReportData }) {
  const chartData = [
    { name: 'Raw Materials', value: data.totalRawMaterialValue, fill: 'oklch(0.78 0.14 85)' },
    { name: 'Finished Goods', value: data.totalFinishedGoodsValue, fill: 'oklch(0.65 0.18 155)' },
    { name: 'WIP', value: data.totalWIPValue, fill: 'oklch(0.7 0.15 250)' },
  ]

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Raw Materials" value={inr(data.totalRawMaterialValue)} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="Finished Goods" value={inr(data.totalFinishedGoodsValue)} icon={<Warehouse className="h-4 w-4" />} />
        <MetricCard label="Work in Progress" value={inr(data.totalWIPValue)} icon={<Factory className="h-4 w-4" />} />
        <MetricCard label="Total Inventory" value={inr(data.totalInventoryValue)} icon={<IndianRupee className="h-4 w-4" />} accent />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fabric Utilization</p>
            <p className="text-lg font-bold tabular-nums">{data.fabricUtilization}%</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stock Turnover</p>
            <p className="text-lg font-bold tabular-nums">{data.stockTurnover}x</p>
          </div>
        </div>
      </div>

      {/* Inventory Proportion Chart */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Inventory Composition</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.005 260)" />
              <XAxis dataKey="name" tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
              <Tooltip
                contentStyle={{ background: 'oklch(0.17 0.005 260)', border: '1px solid oklch(0.28 0.005 260)', borderRadius: '8px', fontSize: 12 }}
                formatter={(value: number) => inr(value)}
              />
              <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Low Stock Items */}
      {data.lowStockItems.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-500 uppercase tracking-wider">Low Stock Items (&lt; 50 meters)</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fabric</TableHead>
                  <TableHead className="text-right">Available (m)</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lowStockItems.map((item) => (
                  <TableRow key={item.fabricName}>
                    <TableCell className="font-medium text-sm">{item.fabricName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={item.availableMeters < 20 ? 'text-destructive font-semibold' : 'text-amber-500'}>
                        {item.availableMeters}m
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(item.totalValue)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={item.availableMeters < 20 ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-amber-500/15 text-amber-500 border-amber-500/30'}>
                        {item.availableMeters < 20 ? 'Critical' : 'Low'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SHARED METRIC CARD ──────────────────────────────────────────────────────

function MetricCard({ label, value, icon, accent, danger }: {
  label: string
  value: string
  icon: React.ReactNode
  accent?: boolean
  danger?: boolean
}) {
  return (
    <div className={`glass-card rounded-xl p-4 flex items-center gap-3 ${danger ? 'border-destructive/30' : accent ? 'border-primary/30' : ''}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${danger ? 'bg-destructive/15 text-destructive' : accent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <p className={`text-base font-bold tabular-nums leading-tight mt-0.5 truncate ${danger ? 'text-destructive' : accent ? 'text-primary' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ─── LOADING SKELETONS ───────────────────────────────────────────────────────

function ReportSkeleton({ reportKey }: { reportKey: string }) {
  const rows = reportKey === 'profit_loss' ? 8 : 5

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="h-6 w-40 rounded-md" />
      </div>

      {reportKey === 'profit_loss' && (
        <div className="grid grid-cols-1 gap-4">
          {/* Revenue/COGS/OPEX sections */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card rounded-xl p-5 space-y-3">
              <Skeleton className="h-4 w-40" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
              <Skeleton className="h-px w-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-32" />
              </div>
            </div>
          ))}
          {/* Gross profit highlight */}
          <Skeleton className="h-20 w-full rounded-xl" />
          {/* Net profit highlight */}
          <Skeleton className="h-20 w-full rounded-xl" />
          {/* Chart */}
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {reportKey === 'order_analysis' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {reportKey === 'production_report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {reportKey === 'customer_report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {reportKey === 'inventory_report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {/* Fallback for unknown report types */}
      {!['profit_loss', 'order_analysis', 'production_report', 'customer_report', 'inventory_report'].includes(reportKey) && (
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}
    </div>
  )
}