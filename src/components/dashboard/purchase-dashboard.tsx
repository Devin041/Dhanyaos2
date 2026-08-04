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
  Package,
  AlertTriangle,
  Star,
  Truck,
  Layers,
  CreditCard,
  Warehouse,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingPO {
  poNumber: string
  supplier: string
  supplierRating: number
  fabricName: string
  quantity: number
  unit: string
  amount: number
  status: string
  paymentStatus: string
  expectedDelivery: string
  receivedQty: number
}

interface FabricStockItem {
  id: string
  fabricName: string
  gsm: number | null
  width: number | null
  lotNumber: string | null
  availableMeters: number
  reservedMeters: number
  averageCost: number
  totalValue: number
  isLowStock: boolean
}

interface SupplierPerf {
  id: string
  name: string
  rating: number
  totalPOs: number
  completedPOs: number
  totalSpent: number
  reliability: number
  pendingPOs: number
}

interface UpcomingPayment {
  poNumber: string
  supplier: string
  amount: number
  paidAmount: number
  balance: number
  paymentStatus: string
  expectedDelivery: string
  daysUntilDue: number | null
}

interface MaterialPlan {
  fabricName: string
  availableMeters: number
  reservedMeters: number
  incomingMeters: number
  netAvailable: number
  stockValue: number
  status: string
}

interface KPIs {
  totalPOValue: number
  unpaidPOValue: number
  pendingPOCount: number
  activeSuppliers: number
  totalFabrics: number
  lowStockAlerts: number
}

interface DashboardData {
  pendingPOs: PendingPO[]
  fabricStock: FabricStockItem[]
  lowStockCount: number
  totalStockValue: number
  totalAvailableMeters: number
  supplierPerformance: SupplierPerf[]
  upcomingPayments: UpcomingPayment[]
  materialPlanning: MaterialPlan[]
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

const poStatusColors: Record<string, string> = {
  Pending: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  Ordered: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Partial: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  Received: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
  Paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Unpaid: 'bg-red-500/15 text-red-400 border-red-500/20',
}

const materialStatusColors: Record<string, string> = {
  Critical: 'bg-red-500/15 text-red-400 border-red-500/20',
  Low: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  Adequate: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating}.0</span>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PurchaseDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/purchase')
      const json = await res.json()
      if (json.error) return
      setData(json)
    } catch (err) {
      console.error('Failed to fetch purchase dashboard:', err)
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Purchase Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Elysé by Dhanya — Procurement, inventory & supplier management
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · Last updated just now
        </div>
      </div>

      {/* ─── Row 1: KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard icon={Package} label="Total PO Value" value={kpis.totalPOValue} color="var(--color-primary)" isCurrency />
        <KPICard icon={CreditCard} label="Unpaid POs" value={kpis.unpaidPOValue} color="#ef4444" isCurrency subtitle={`${data.upcomingPayments.length} upcoming payments`} />
        <KPICard icon={Truck} label="Pending POs" value={kpis.pendingPOCount} color="#f59e0b" />
        <KPICard icon={Layers} label="Active Suppliers" value={kpis.activeSuppliers} color="#06b6d4" />
        <KPICard icon={Warehouse} label="Stock Value" value={data.totalStockValue} color="#a855f7" isCurrency subtitle={`${formatCompact(data.totalAvailableMeters)}m available`} />
        <KPICard icon={AlertTriangle} label="Low Stock Alerts" value={kpis.lowStockAlerts} color="#ef4444" subtitle={`${kpis.totalFabrics} fabrics tracked`} />
      </div>

      {/* ─── Row 2: Pending POs Table + Fabric Stock ──────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pending Purchase Orders */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pending Purchase Orders
              </CardTitle>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                {data.pendingPOs.length} Pending
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[400px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">PO#</TableHead>
                    <TableHead className="text-xs">Supplier</TableHead>
                    <TableHead className="text-xs">Fabric</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pendingPOs.map((po) => (
                    <TableRow key={po.poNumber} className="border-border/30">
                      <TableCell>
                        <p className="font-mono text-xs font-medium">{po.poNumber}</p>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium">{po.supplier}</p>
                          <StarRating rating={po.supplierRating} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium">{po.fabricName}</p>
                          <p className="text-xs text-muted-foreground">{po.quantity} {po.unit}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">{formatINR(po.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${poStatusColors[po.status] || ''}`}>
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{po.expectedDelivery}</TableCell>
                    </TableRow>
                  ))}
                  {data.pendingPOs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No pending purchase orders
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Fabric Stock Overview */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fabric Stock Overview
              </CardTitle>
              <div className="flex items-center gap-2">
                {kpis.lowStockAlerts > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {kpis.lowStockAlerts} Low Stock
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[400px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Fabric</TableHead>
                    <TableHead className="text-xs">Available</TableHead>
                    <TableHead className="text-xs">Reserved</TableHead>
                    <TableHead className="text-xs">Value</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fabricStock.map((f) => (
                    <TableRow key={f.id} className={`border-border/30 ${f.isLowStock ? 'bg-red-500/5' : ''}`}>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium">{f.fabricName}</p>
                          {f.lotNumber && (
                            <p className="text-xs text-muted-foreground">Lot: {f.lotNumber}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        <span className={f.isLowStock ? 'text-red-400' : ''}>{f.availableMeters}m</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f.reservedMeters}m</TableCell>
                      <TableCell className="text-xs font-medium">{formatINR(f.totalValue)}</TableCell>
                      <TableCell>
                        {f.isLowStock ? (
                          <Badge variant="destructive" className="text-[10px]">Low</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.fabricStock.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No fabric stock records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 3: Supplier Performance + Upcoming Payments ──────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Supplier Performance */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Supplier Performance
              </CardTitle>
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
                {data.supplierPerformance.length} Suppliers
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {data.supplierPerformance.map((supplier, idx) => (
                <div
                  key={supplier.id}
                  className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/20 ${
                    idx === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
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
                          {supplier.name}
                        </p>
                        <StarRating rating={supplier.rating} />
                      </div>
                    </div>
                    <span className="text-sm font-semibold">{formatINR(supplier.totalSpent)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{supplier.totalPOs} POs</span>
                    <span>{supplier.completedPOs} completed</span>
                    <span>{supplier.pendingPOs} pending</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground shrink-0">Reliability</span>
                    <Progress value={supplier.reliability} className="h-1.5 flex-1" />
                    <span className={`text-xs font-medium ${supplier.reliability >= 80 ? 'text-emerald-400' : supplier.reliability >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {supplier.reliability}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Payments */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Upcoming Payments
              </CardTitle>
              <Badge variant="outline" className="border-red-500/30 text-red-400">
                {formatINR(data.upcomingPayments.reduce((s, p) => s + p.balance, 0))}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {data.upcomingPayments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No upcoming payments</p>
              ) : (
                data.upcomingPayments.map((up) => (
                  <div
                    key={up.poNumber}
                    className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {up.poNumber}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${poStatusColors[up.paymentStatus] || ''}`}>
                          {up.paymentStatus}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold text-red-400">{formatINR(up.balance)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{up.supplier}</span>
                      {up.daysUntilDue !== null && (
                        <span className={up.daysUntilDue <= 3 ? 'text-amber-400 font-medium' : ''}>
                          Due in {up.daysUntilDue}d · {up.expectedDelivery}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground shrink-0">Paid</span>
                      <Progress
                        value={up.amount > 0 ? (up.paidAmount / up.amount) * 100 : 0}
                        className="h-1.5 flex-1"
                      />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatINR(up.paidAmount)}/{formatINR(up.amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 4: Material Requirement Planning ─────────────────── */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Material Requirement Planning
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-red-500/30 text-red-400">
                {data.materialPlanning.filter(m => m.status === 'Critical').length} Critical
              </Badge>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                {data.materialPlanning.filter(m => m.status === 'Low').length} Low
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-[400px] overflow-y-auto pr-1">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs">Fabric</TableHead>
                  <TableHead className="text-xs">Available</TableHead>
                  <TableHead className="text-xs">Reserved</TableHead>
                  <TableHead className="text-xs">Incoming</TableHead>
                  <TableHead className="text-xs">Net Available</TableHead>
                  <TableHead className="text-xs">Stock Value</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.materialPlanning.map((m) => (
                  <TableRow key={m.fabricName} className={`border-border/30 ${m.status === 'Critical' ? 'bg-red-500/5' : ''}`}>
                    <TableCell className="text-xs font-medium">{m.fabricName}</TableCell>
                    <TableCell className="text-xs">{m.availableMeters}m</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reservedMeters}m</TableCell>
                    <TableCell className="text-xs text-cyan-400">+{m.incomingMeters}m</TableCell>
                    <TableCell className={`text-xs font-semibold ${m.netAvailable <= 50 ? 'text-red-400' : m.netAvailable <= 150 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {m.netAvailable}m
                    </TableCell>
                    <TableCell className="text-xs">{formatINR(m.stockValue)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${materialStatusColors[m.status] || ''}`}>
                        {m.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {data.materialPlanning.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No material planning data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}