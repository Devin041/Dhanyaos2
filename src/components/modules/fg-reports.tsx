'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Layers,
  ArrowRightLeft,
  TrendingUp,
  Lock,
  Clock,
  AlertTriangle,
  BarChart3,
  RotateCcw,
  Gift,
  Bell,
  Palette,
  ArrowLeft,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ReportDef {
  id: string
  name: string
  icon: LucideIcon
  description: string
  hasDateFilter: boolean
}

// ─── Report Definitions ─────────────────────────────────────────────────────

const REPORTS: ReportDef[] = [
  { id: 'summary', name: 'Stock Summary', icon: Package, description: 'Complete stock overview with value breakdown', hasDateFilter: false },
  { id: 'sets', name: 'Set Analysis', icon: Layers, description: 'Full sets vs orphan pieces per color', hasDateFilter: false },
  { id: 'movements', name: 'Movement Log', icon: ArrowRightLeft, description: 'All stock transactions with filters', hasDateFilter: true },
  { id: 'sale-breakdown', name: 'Sale Breakdown', icon: TrendingUp, description: 'Dispatches grouped by style/color', hasDateFilter: false },
  { id: 'reserved', name: 'Reserved Stock', icon: Lock, description: 'Active reservations overview', hasDateFilter: false },
  { id: 'aging', name: 'Stock Aging', icon: Clock, description: 'Stock age: 0–30, 31–60, 61–90, 90+ days', hasDateFilter: false },
  { id: 'dead-stock', name: 'Dead Stock', icon: AlertTriangle, description: 'Defective, scrapped, slow-moving items', hasDateFilter: false },
  { id: 'channel-performance', name: 'Channel Performance', icon: BarChart3, description: 'Stock flow by channel type', hasDateFilter: false },
  { id: 'return-analysis', name: 'Return Analysis', icon: RotateCcw, description: 'Return rates by style/color', hasDateFilter: false },
  { id: 'promotional', name: 'Promotional Log', icon: Gift, description: 'Free samples and promotional issues', hasDateFilter: false },
  { id: 'reorder-suggestion', name: 'Reorder Alerts', icon: Bell, description: 'Low stock items needing reorder', hasDateFilter: false },
  { id: 'color-size-popularity', name: 'Color/Size Popularity', icon: Palette, description: 'Best selling colors and sizes', hasDateFilter: false },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(num: number): string {
  if (num >= 10000000) return `\u20B9${(num / 10000000).toFixed(2)}Cr`
  if (num >= 100000) return `\u20B9${(num / 100000).toFixed(2)}L`
  if (num >= 1000) return `\u20B9${new Intl.NumberFormat('en-IN').format(num)}`
  return `\u20B9${num}`
}

function getMovementBadgeColor(type: string): string {
  switch (type) {
    case 'Inward': return 'bg-emerald-100 text-emerald-700'
    case 'Outward': return 'bg-red-100 text-red-700'
    case 'Return': return 'bg-amber-100 text-amber-700'
    case 'Exchange': return 'bg-purple-100 text-purple-700'
    case 'Reservation': return 'bg-blue-100 text-blue-700'
    case 'Unreservation': return 'bg-sky-100 text-sky-700'
    case 'Adjustment': return 'bg-slate-100 text-slate-600'
    case 'QCStatusChange': return 'bg-orange-100 text-orange-700'
    case 'Scrapping': return 'bg-red-200 text-red-800'
    case 'PromotionalIssue': return 'bg-pink-100 text-pink-700'
    case 'ExhibitionMove': return 'bg-teal-100 text-teal-700'
    case 'ExhibitionReturn': return 'bg-cyan-100 text-cyan-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function getHealthColor(health: string): string {
  switch (health) {
    case 'Healthy': return 'bg-emerald-100 text-emerald-700'
    case 'LowStock': return 'bg-amber-100 text-amber-700'
    case 'Critical': return 'bg-red-100 text-red-700'
    case 'DeadStock': return 'bg-red-200 text-red-800'
    default: return 'bg-slate-100 text-slate-600'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FGReports() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Movement filter states
  const [movementPage, setMovementPage] = useState(1)
  const [movementTypeFilter, setMovementTypeFilter] = useState('')

  const currentReport = REPORTS.find((r) => r.id === selectedReport)

  const fetchReport = async (reportId: string, page?: number, type?: string) => {
    setLoading(true)
    try {
      let url = `/api/fg-reports/${reportId}?`
      const params = new URLSearchParams()
      if (dateFrom) params.set('fromDate', dateFrom)
      if (dateTo) params.set('toDate', dateTo)
      if (page) params.set('page', String(page))
      if (type) params.set('type', type)
      url += params.toString()

      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch report')
      const data = await res.json()
      setReportData(data)
    } catch {
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedReport) {
      if (selectedReport === 'movements') {
        fetchReport(selectedReport, 1, movementTypeFilter || undefined)
      } else {
        fetchReport(selectedReport)
      }
    }
  }, [selectedReport, dateFrom, dateTo])

  const handleMovementPageChange = (newPage: number) => {
    setMovementPage(newPage)
    fetchReport('movements', newPage, movementTypeFilter || undefined)
  }

  const handleMovementTypeChange = (type: string) => {
    setMovementTypeFilter(type)
    setMovementPage(1)
    fetchReport('movements', 1, type || undefined)
  }

  const handleExport = () => {
    toast.success('Export initiated! Report will be downloaded shortly.')
  }

  // ─── Report Renderers ────────────────────────────────────────────────────

  const renderSummary = () => {
    if (!reportData) return null
    const d = reportData
    const kpis = [
      { label: 'Total Styles', value: d.totalStyles, color: 'text-slate-900' },
      { label: 'Total Colors', value: d.totalColors, color: 'text-slate-700' },
      { label: 'Total Pieces', value: new Intl.NumberFormat('en-IN').format(d.totalPieces), color: 'text-slate-900' },
      { label: 'Stock Value', value: formatINR(d.totalStockValue), color: 'text-amber-700' },
      { label: 'Sell Value', value: formatINR(d.totalSellValue), color: 'text-emerald-700' },
      { label: 'Potential Profit', value: formatINR(d.totalSellValue - d.totalStockValue), color: 'text-emerald-600' },
    ]

    const statusItems = [
      { label: 'Available', value: d.statusBreakdown.available, bg: 'bg-emerald-100 text-emerald-700' },
      { label: 'Reserved', value: d.statusBreakdown.reserved, bg: 'bg-blue-100 text-blue-700' },
      { label: 'QC Pending', value: d.statusBreakdown.qcPending, bg: 'bg-amber-100 text-amber-700' },
      { label: 'Under Repair', value: d.statusBreakdown.underRepair, bg: 'bg-orange-100 text-orange-700' },
      { label: 'Defective', value: d.statusBreakdown.defective, bg: 'bg-red-100 text-red-700' },
      { label: 'Scrapped', value: d.statusBreakdown.scrapped, bg: 'bg-red-200 text-red-800' },
      { label: 'Exhibition', value: d.statusBreakdown.exhibition, bg: 'bg-teal-100 text-teal-700' },
    ]

    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
              <p className={`text-lg font-semibold ${kpi.color}`}>{kpi.value}</p>
            </Card>
          ))}
        </div>

        {/* Status Breakdown */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Status Breakdown</h3>
          <div className="flex flex-wrap gap-3">
            {statusItems.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${s.bg}`}>
                  {s.label}: {new Intl.NumberFormat('en-IN').format(s.value)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Health Distribution */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Health Distribution</h3>
          <div className="flex gap-2 h-6 rounded-md overflow-hidden">
            {Object.entries(d.healthDistribution).map(([key, val]) => {
              const total = Object.values(d.healthDistribution).reduce((s: number, v: any) => s + v, 0) as number
              const pct = total > 0 ? (val / total) * 100 : 0
              if (val === 0) return null
              const colors: Record<string, string> = {
                Healthy: 'bg-emerald-500',
                LowStock: 'bg-amber-500',
                Critical: 'bg-red-500',
                Empty: 'bg-slate-300',
                DeadStock: 'bg-red-800',
              }
              return (
                <div
                  key={key}
                  className={`${colors[key] || 'bg-slate-400'} flex items-center justify-center text-[10px] text-white font-medium`}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? '2rem' : 0 }}
                  title={`${key}: ${val}`}
                >
                  {pct >= 8 ? `${val}` : ''}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {Object.entries(d.healthDistribution).map(([key, val]) => {
              const dotColors: Record<string, string> = {
                Healthy: 'bg-emerald-500',
                LowStock: 'bg-amber-500',
                Critical: 'bg-red-500',
                Empty: 'bg-slate-300',
                DeadStock: 'bg-red-800',
              }
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className={`w-2.5 h-2.5 rounded-sm ${dotColors[key] || 'bg-slate-400'}`} />
                  {key}: {val as number}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Top Styles Table */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Top Styles by Sell Value</h3>
          <ScrollArea className="max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style No</TableHead>
                  <TableHead>Style Name</TableHead>
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead className="text-right">Sell Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.topStyles.map((s: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.styleNo}</TableCell>
                    <TableCell>{s.styleName}</TableCell>
                    <TableCell className="text-right">{new Intl.NumberFormat('en-IN').format(s.pieces)}</TableCell>
                    <TableCell className="text-right">{formatINR(s.stockValue)}</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(s.sellValue)}</TableCell>
                  </TableRow>
                ))}
                {d.topStyles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No styles found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderSets = () => {
    if (!reportData) return null
    const groups = reportData as any[]
    const totalFullSets = groups.reduce((s, g) => s + g.fullSets, 0)
    const totalOrphan = groups.reduce((s, g) => s + g.orphanPieces, 0)

    return (
      <div className="space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Color Groups</p>
            <p className="text-lg font-semibold">{groups.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Full Sets</p>
            <p className="text-lg font-semibold text-emerald-700">{new Intl.NumberFormat('en-IN').format(totalFullSets)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Orphan Pieces</p>
            <p className="text-lg font-semibold text-amber-700">{new Intl.NumberFormat('en-IN').format(totalOrphan)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Pieces</p>
            <p className="text-lg font-semibold">{new Intl.NumberFormat('en-IN').format(groups.reduce((s, g) => s + g.totalPieces, 0))}</p>
          </Card>
        </div>

        <Card className="p-6">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style No</TableHead>
                  <TableHead>Style Name</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Color Code</TableHead>
                  <TableHead className="text-center">Sizes</TableHead>
                  <TableHead className="text-right">Full Sets</TableHead>
                  <TableHead className="text-right">Orphan Pieces</TableHead>
                  <TableHead className="text-right">Total Pieces</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{g.styleNo}</TableCell>
                    <TableCell>{g.styleName}</TableCell>
                    <TableCell>{g.color}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{g.colorCode}</TableCell>
                    <TableCell className="text-center">{g.sizeCount}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-700">{new Intl.NumberFormat('en-IN').format(g.fullSets)}</TableCell>
                    <TableCell className="text-right">
                      <span className={g.orphanPieces > 0 ? 'text-amber-700 font-medium' : ''}>
                        {new Intl.NumberFormat('en-IN').format(g.orphanPieces)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{new Intl.NumberFormat('en-IN').format(g.totalPieces)}</TableCell>
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No set data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderMovements = () => {
    if (!reportData) return null
    const { movements, pagination } = reportData

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Movement Type</label>
            <Select value={movementTypeFilter} onValueChange={handleMovementTypeChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Inward">Inward</SelectItem>
                <SelectItem value="Outward">Outward</SelectItem>
                <SelectItem value="Return">Return</SelectItem>
                <SelectItem value="Exchange">Exchange</SelectItem>
                <SelectItem value="Reservation">Reservation</SelectItem>
                <SelectItem value="Unreservation">Unreservation</SelectItem>
                <SelectItem value="Adjustment">Adjustment</SelectItem>
                <SelectItem value="QCStatusChange">QC Status Change</SelectItem>
                <SelectItem value="Scrapping">Scrapping</SelectItem>
                <SelectItem value="PromotionalIssue">Promotional</SelectItem>
                <SelectItem value="ExhibitionMove">Exhibition</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {pagination.total} movements total · Page {pagination.page} of {pagination.totalPages}
          </div>
        </div>

        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Movement No</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Moved By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">{m.movedAt ? format(new Date(m.movedAt), 'dd MMM yyyy HH:mm') : '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{m.movementNo}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getMovementBadgeColor(m.movementType)}`}>
                        {m.movementType}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{m.styleNo}</TableCell>
                    <TableCell>{m.color}</TableCell>
                    <TableCell>{m.size}</TableCell>
                    <TableCell className="text-right font-medium">{m.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.referenceNo || m.referenceType || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.movedBy || '-'}</TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No movements found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => handleMovementPageChange(pagination.page - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => handleMovementPageChange(pagination.page + 1)}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  const renderSaleBreakdown = () => {
    if (!reportData) return null
    const { groups, grandTotal, grandValue } = reportData

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Style/Color Combos</p>
            <p className="text-lg font-semibold">{groups.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Dispatched</p>
            <p className="text-lg font-semibold">{new Intl.NumberFormat('en-IN').format(grandTotal)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Value (Cost)</p>
            <p className="text-lg font-semibold text-amber-700">{formatINR(grandValue)}</p>
          </Card>
        </div>

        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style No</TableHead>
                  <TableHead>Style Name</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Dispatches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{g.styleNo}</TableCell>
                    <TableCell>{g.styleName}</TableCell>
                    <TableCell>{g.color}</TableCell>
                    <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-IN').format(g.totalQty)}</TableCell>
                    <TableCell className="text-right">{formatINR(g.totalValue)}</TableCell>
                    <TableCell className="text-right">{g.movements.length}</TableCell>
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No outward movements found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderReserved = () => {
    if (!reportData) return null
    const { reservations, summary } = reportData

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Active Reservations</p>
            <p className="text-lg font-semibold text-blue-700">{reservations.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Styles Reserved</p>
            <p className="text-lg font-semibold">{summary.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Reserved Pieces</p>
            <p className="text-lg font-semibold">{new Intl.NumberFormat('en-IN').format(reservations.reduce((s: number, r: any) => s + r.reservedQty, 0))}</p>
          </Card>
        </div>

        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reservation No</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Order No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.reservationNo}</TableCell>
                    <TableCell className="font-medium">{r.styleNo}</TableCell>
                    <TableCell>{r.color}</TableCell>
                    <TableCell>{r.size}</TableCell>
                    <TableCell className="text-right font-medium">{r.reservedQty}</TableCell>
                    <TableCell className="text-xs">{r.orderNo || '-'}</TableCell>
                    <TableCell className="text-xs">{r.customerName || '-'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.reservedDate ? format(new Date(r.reservedDate), 'dd MMM yyyy') : '-'}</TableCell>
                  </TableRow>
                ))}
                {reservations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No active reservations</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderAging = () => {
    if (!reportData) return null
    const { brackets } = reportData
    const maxPieces = Math.max(...brackets.map((b: any) => b.pieces), 1)
    const barColors = ['bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500']

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-6">Stock Aging Distribution</h3>
          {/* CSS Bar Chart */}
          <div className="space-y-4">
            {brackets.map((b: any, i: number) => (
              <div key={b.label} className="flex items-center gap-4">
                <span className="w-24 text-sm font-medium text-right shrink-0">{b.label}</span>
                <div className="flex-1 bg-slate-100 rounded-md h-8 relative overflow-hidden">
                  <div
                    className={`h-full ${barColors[i]} rounded-md flex items-center px-3 transition-all duration-500`}
                    style={{ width: `${Math.max(b.pieces > 0 ? 3 : 0, (b.pieces / maxPieces) * 100)}%` }}
                  >
                    {b.pieces > 0 && (
                      <span className="text-xs text-white font-medium whitespace-nowrap">
                        {new Intl.NumberFormat('en-IN').format(b.pieces)} pcs
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-28 text-sm text-right text-muted-foreground shrink-0">
                  {formatINR(b.value)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Detailed table */}
        {brackets.map((bracket: any) => (
          <Card key={bracket.label} className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-sm ${barColors[brackets.indexOf(bracket)]}`} />
              <h3 className="text-sm font-semibold">{bracket.label}</h3>
              <Badge variant="secondary" className="text-xs">{bracket.bins.length} bins</Badge>
            </div>
            <ScrollArea className="max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Style</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Age (days)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bracket.bins.slice(0, 20).map((b: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{b.styleNo}</TableCell>
                      <TableCell>{b.color}</TableCell>
                      <TableCell>{b.size}</TableCell>
                      <TableCell className="text-right">{b.availableQty}</TableCell>
                      <TableCell className="text-right">{b.totalPieces}</TableCell>
                      <TableCell className="text-right">{formatINR(b.stockValue)}</TableCell>
                      <TableCell className="text-right">{b.ageInDays}</TableCell>
                    </TableRow>
                  ))}
                  {bracket.bins.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-4">No stock in this bracket</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        ))}
      </div>
    )
  }

  const renderDeadStock = () => {
    if (!reportData) return null
    const { bins, totalPieces, totalValue } = reportData

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-4 border-red-200">
            <p className="text-xs text-muted-foreground mb-1">Dead Stock Bins</p>
            <p className="text-lg font-semibold text-red-700">{bins.length}</p>
          </Card>
          <Card className="p-4 border-red-200">
            <p className="text-xs text-muted-foreground mb-1">Total Locked Pieces</p>
            <p className="text-lg font-semibold text-red-700">{new Intl.NumberFormat('en-IN').format(totalPieces)}</p>
          </Card>
          <Card className="p-4 border-red-200">
            <p className="text-xs text-muted-foreground mb-1">Total Locked Value</p>
            <p className="text-lg font-semibold text-red-700">{formatINR(totalValue)}</p>
          </Card>
        </div>

        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Defective</TableHead>
                  <TableHead className="text-right">Scrapped</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bins.map((b: any, i: number) => (
                  <TableRow key={i} className="bg-red-50/50">
                    <TableCell className="font-medium">{b.styleNo}</TableCell>
                    <TableCell>{b.color}</TableCell>
                    <TableCell>{b.size}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getHealthColor(b.health)}`}>
                        {b.health}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{b.defectiveQty}</TableCell>
                    <TableCell className="text-right">{b.scrappedQty}</TableCell>
                    <TableCell className="text-right font-medium">{b.totalPieces}</TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="text-xs">{b.reason}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatINR(b.stockValue)}</TableCell>
                  </TableRow>
                ))}
                {bins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <span>No dead stock found!</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderChannelPerformance = () => {
    if (!reportData) return null
    const { channels } = reportData

    return (
      <div className="space-y-6">
        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Movements</TableHead>
                  <TableHead className="text-right">Inward Qty</TableHead>
                  <TableHead className="text-right">Outward Qty</TableHead>
                  <TableHead className="text-right">Return Qty</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((c: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      <Badge variant="outline" className="font-mono text-xs">{c.channel}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.totalMovements}</TableCell>
                    <TableCell className="text-right text-emerald-700">{c.inwardQty}</TableCell>
                    <TableCell className="text-right text-red-700">{c.outwardQty}</TableCell>
                    <TableCell className="text-right text-amber-700">{c.returnQty}</TableCell>
                    <TableCell className="text-right font-medium">{c.totalQty}</TableCell>
                    <TableCell className="text-right">{formatINR(c.totalValue)}</TableCell>
                  </TableRow>
                ))}
                {channels.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No movement data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderReturnAnalysis = () => {
    if (!reportData) return null
    const { groups } = reportData

    return (
      <div className="space-y-6">
        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style No</TableHead>
                  <TableHead>Style Name</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Outward</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Return Rate</TableHead>
                  <TableHead className="text-right">Return Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{g.styleNo}</TableCell>
                    <TableCell>{g.styleName}</TableCell>
                    <TableCell>{g.color}</TableCell>
                    <TableCell className="text-right">{g.outward}</TableCell>
                    <TableCell className="text-right font-medium">{g.totalReturned}</TableCell>
                    <TableCell className="text-right">
                      <span className={g.returnRate > 10 ? 'text-red-700 font-medium' : g.returnRate > 5 ? 'text-amber-700' : 'text-emerald-700'}>
                        {g.returnRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatINR(g.totalValue)}</TableCell>
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No returns found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderPromotional = () => {
    if (!reportData) return null
    const { movements, summary, grandTotal, grandValue } = reportData

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Issued</p>
            <p className="text-lg font-semibold text-pink-700">{new Intl.NumberFormat('en-IN').format(grandTotal)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Value</p>
            <p className="text-lg font-semibold">{formatINR(grandValue)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Transactions</p>
            <p className="text-lg font-semibold">{movements.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Styles Affected</p>
            <p className="text-lg font-semibold">{summary.length}</p>
          </Card>
        </div>

        {/* Style Summary */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Summary by Style</h3>
          <ScrollArea className="max-h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style No</TableHead>
                  <TableHead>Style Name</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.styleNo}</TableCell>
                    <TableCell>{s.styleName}</TableCell>
                    <TableCell className="text-right font-medium text-pink-700">{s.totalQty}</TableCell>
                    <TableCell className="text-right">{formatINR(s.totalValue)}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Movement Detail */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Movement Details</h3>
          <ScrollArea className="max-h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Movement No</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Party</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">{m.movedAt ? format(new Date(m.movedAt), 'dd MMM yyyy') : '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{m.movementNo}</TableCell>
                    <TableCell className="font-medium">{m.styleNo}</TableCell>
                    <TableCell>{m.color}</TableCell>
                    <TableCell>{m.size}</TableCell>
                    <TableCell className="text-right">{m.quantity}</TableCell>
                    <TableCell className="text-xs">{m.partyName || '-'}</TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No promotional movements found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderReorderSuggestion = () => {
    if (!reportData) return null
    const { suggestions, criticalCount, lowStockCount, totalEstimate } = reportData

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-red-200">
            <p className="text-xs text-muted-foreground mb-1">Critical Items</p>
            <p className="text-lg font-semibold text-red-700">{criticalCount}</p>
          </Card>
          <Card className="p-4 border-amber-200">
            <p className="text-xs text-muted-foreground mb-1">Low Stock Items</p>
            <p className="text-lg font-semibold text-amber-700">{lowStockCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Suggestions</p>
            <p className="text-lg font-semibold">{suggestions.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Estimated Reorder Cost</p>
            <p className="text-lg font-semibold text-amber-700">{formatINR(totalEstimate)}</p>
          </Card>
        </div>

        <Card className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Suggested Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.styleNo}</TableCell>
                    <TableCell>{s.color}</TableCell>
                    <TableCell>{s.size}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getHealthColor(s.health)}`}>
                        {s.health}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{s.availableQty}</TableCell>
                    <TableCell className="text-right font-medium">{s.suggestedQty}</TableCell>
                    <TableCell className="text-right">{formatINR(s.unitCost)}</TableCell>
                    <TableCell className="text-right">{formatINR(s.estimatedCost)}</TableCell>
                  </TableRow>
                ))}
                {suggestions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <span>All stock levels are healthy!</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  const renderColorSizePopularity = () => {
    if (!reportData) return null
    const { topColors, topSizes, topCombos } = reportData
    const maxColorQty = Math.max(...topColors.map((c: any) => c.totalQty), 1)
    const maxSizeQty = Math.max(...topSizes.map((s: any) => s.totalQty), 1)

    return (
      <div className="space-y-6">
        {/* Color Popularity */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Color Popularity (by outward qty)</h3>
          <div className="space-y-3">
            {topColors.map((c: any, i: number) => (
              <div key={c.color} className="flex items-center gap-3">
                <span className="w-24 text-sm text-right shrink-0 truncate" title={c.color}>{c.color}</span>
                <div className="flex-1 bg-slate-100 rounded-md h-6 relative overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-md flex items-center px-3 transition-all duration-500"
                    style={{ width: `${Math.max(c.totalQty > 0 ? 3 : 0, (c.totalQty / maxColorQty) * 100)}%` }}
                  >
                    {c.totalQty > 0 && (
                      <span className="text-[10px] text-white font-medium whitespace-nowrap">
                        {new Intl.NumberFormat('en-IN').format(c.totalQty)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-20 text-xs text-right text-muted-foreground shrink-0">{c.movementCount} txns</span>
              </div>
            ))}
            {topColors.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No outward data</p>}
          </div>
        </Card>

        {/* Size Popularity */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Size Popularity (by outward qty)</h3>
          <div className="space-y-3">
            {topSizes.map((s: any) => (
              <div key={s.size} className="flex items-center gap-3">
                <span className="w-24 text-sm text-right shrink-0">{s.size}</span>
                <div className="flex-1 bg-slate-100 rounded-md h-6 relative overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-md flex items-center px-3 transition-all duration-500"
                    style={{ width: `${Math.max(s.totalQty > 0 ? 3 : 0, (s.totalQty / maxSizeQty) * 100)}%` }}
                  >
                    {s.totalQty > 0 && (
                      <span className="text-[10px] text-white font-medium whitespace-nowrap">
                        {new Intl.NumberFormat('en-IN').format(s.totalQty)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-20 text-xs text-right text-muted-foreground shrink-0">{s.movementCount} txns</span>
              </div>
            ))}
            {topSizes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No outward data</p>}
          </div>
        </Card>

        {/* Top Combos */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Top Style/Color/Size Combinations</h3>
          <ScrollArea className="max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Total Outward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCombos.map((c: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.styleNo}</TableCell>
                    <TableCell>{c.color}</TableCell>
                    <TableCell>{c.size}</TableCell>
                    <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-IN').format(c.totalQty)}</TableCell>
                  </TableRow>
                ))}
                {topCombos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    )
  }

  // ─── Main Render ──────────────────────────────────────────────────────────

  const renderReportContent = () => {
    switch (selectedReport) {
      case 'summary': return renderSummary()
      case 'sets': return renderSets()
      case 'movements': return renderMovements()
      case 'sale-breakdown': return renderSaleBreakdown()
      case 'reserved': return renderReserved()
      case 'aging': return renderAging()
      case 'dead-stock': return renderDeadStock()
      case 'channel-performance': return renderChannelPerformance()
      case 'return-analysis': return renderReturnAnalysis()
      case 'promotional': return renderPromotional()
      case 'reorder-suggestion': return renderReorderSuggestion()
      case 'color-size-popularity': return renderColorSizePopularity()
      default: return null
    }
  }

  // ─── Report Selector Grid ─────────────────────────────────────────────────

  if (!selectedReport) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">FG Inventory Reports</h2>
          <p className="text-sm text-muted-foreground mt-1">Select a report to view detailed analytics</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {REPORTS.map((report) => {
            const Icon = report.icon
            return (
              <Card
                key={report.id}
                className="cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200 group"
                onClick={() => {
                  setSelectedReport(report.id)
                  setReportData(null)
                  setMovementPage(1)
                  setMovementTypeFilter('')
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-slate-100 p-2.5 group-hover:bg-slate-200 transition-colors">
                      <Icon className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold group-hover:text-slate-900">{report.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{report.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Report Data View ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedReport(null); setReportData(null) }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {currentReport && (
            <>
              <div className="rounded-lg bg-slate-100 p-2">
                <currentReport.icon className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{currentReport.name}</h2>
                <p className="text-xs text-muted-foreground">{currentReport.description}</p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Date Filter for applicable reports */}
          {currentReport?.hasDateFilter && (
            <>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 h-8 text-xs"
                placeholder="From"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 h-8 text-xs"
                placeholder="To"
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-7 w-32" />
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        </div>
      ) : (
        renderReportContent()
      )}
    </div>
  )
}
