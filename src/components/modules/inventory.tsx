'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  Warehouse,
  Layers,
  ArrowUpDown,
  AlertTriangle,
  BarChart3,
  CircleDot,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────
interface SupplierBrief {
  id: string
  name: string
  supplierType: string
}

interface FabricStockItem {
  id: string
  supplierId: string | null
  supplier: SupplierBrief | null
  fabricName: string
  gsm: number | null
  width: number | null
  lotNumber: string | null
  availableMeters: number
  reservedMeters: number
  averageCost: number
  totalValue: number
}

interface WIPJob {
  id: string
  jobNo: string
  orderNo: string | null
  styleNo: string
  styleName: string
  targetQty: number
  completedQty: number
  stage: string
  startDate: string
  endDate: string | null
  status: string
}

interface InventoryStats {
  totalRawMaterialValue: number
  totalWIPCount: number
  totalWIPUnits: number
  totalWIPRemaining: number
  wipValue: number
  totalInventoryValue: number
  uniqueStyles: number
  lowStockItems: number
}

interface InventoryData {
  fabricStock: FabricStockItem[]
  wipJobs: WIPJob[]
  stats: InventoryStats
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value)
}

function getStockHealth(available: number, reserved: number): {
  label: string
  color: string
  bg: string
  percent: number
} {
  const total = available + reserved
  if (total === 0) return { label: 'Empty', color: 'text-red-400', bg: 'bg-red-500', percent: 0 }
  const pct = (available / total) * 100
  if (pct >= 60) return { label: 'Healthy', color: 'text-emerald-400', bg: 'bg-emerald-500', percent: pct }
  if (pct >= 30) return { label: 'Moderate', color: 'text-amber-400', bg: 'bg-amber-500', percent: pct }
  return { label: 'Low', color: 'text-red-400', bg: 'bg-red-500', percent: pct }
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

const PRODUCTION_STAGES = [
  'Fabric Issue',
  'Cutting',
  'Embroidery',
  'Printing',
  'Stitching',
  'Finishing',
  'Quality Check',
  'Packing',
  'Dispatch Ready',
  'Dispatched',
]

// ─── Component ─────────────────────────────────────────────────────────────
export function InventoryModule() {
  const [data, setData] = useState<InventoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fabricSort, setFabricSort] = useState<'name' | 'value' | 'available'>('value')
  const [fabricSortDir, setFabricSortDir] = useState<'asc' | 'desc'>('desc')



  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/inventory')
      if (!res.ok) throw new Error('Failed to fetch inventory')
      const json = await res.json()
      setData(json)
    } catch {
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  // ─── Fabric Sort ─────────────────────────────────────────────────────
  const sortedFabric = (() => {
    if (!data) return []
    const sorted = [...data.fabricStock]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (fabricSort) {
        case 'name':
          cmp = a.fabricName.localeCompare(b.fabricName)
          break
        case 'value':
          cmp = a.totalValue - b.totalValue
          break
        case 'available':
          cmp = a.availableMeters - b.availableMeters
          break
      }
      return fabricSortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  })()

  const toggleSort = (col: 'name' | 'value' | 'available') => {
    if (fabricSort === col) {
      setFabricSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setFabricSort(col)
      setFabricSortDir('desc')
    }
  }

  // ─── Computed values for proportion bar ──────────────────────────────
  const totalInvValue = data?.stats.totalInventoryValue || 0
  const rawPct = totalInvValue > 0 ? ((data?.stats.totalRawMaterialValue || 0) / totalInvValue) * 100 : 50
  const wipPct = totalInvValue > 0 ? ((data?.stats.wipValue || 0) / totalInvValue) * 100 : 50

  // ─── Loading State ───────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Warehouse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Warehouse className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inventory</h1>
            <p className="text-sm text-muted-foreground">
              Raw materials · Work in progress
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="inventory" />
        </div>
      </div>

      {/* ─── Overview Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <Card className="glass-card overflow-hidden border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Total Inventory Value
            </div>
            <p className="text-lg font-bold text-primary sm:text-xl">
              {formatINR(data.stats.totalInventoryValue)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatNumber(data.stats.uniqueStyles)} unique styles
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Layers className="h-3.5 w-3.5" />
              Raw Materials Value
            </div>
            <p className="text-lg font-bold text-foreground sm:text-xl">
              {formatINR(data.stats.totalRawMaterialValue)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data.fabricStock.length} fabric lots
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden border-l-4 border-l-sky-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CircleDot className="h-3.5 w-3.5" />
              Work in Progress
            </div>
            <p className="text-lg font-bold text-foreground sm:text-xl">
              {formatNumber(data.stats.totalWIPCount)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatNumber(data.stats.totalWIPRemaining)} pcs remaining
            </p>
          </CardContent>
        </Card>

      </div>

      {/* ─── Inventory Proportion Bar ──────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">Inventory Breakdown</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Raw {rawPct.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              WIP {wipPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="bg-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(rawPct, 1)}%` }}
            />
            <div
              className="bg-sky-500 transition-all duration-500"
              style={{ width: `${Math.max(wipPct, 1)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabs: Raw Materials | WIP ───────────────── */}
      <Tabs defaultValue="raw" className="space-y-4">
        <TabsList className="glass-card h-10 w-full justify-start gap-1 p-1 sm:inline-flex">
          <TabsTrigger
            value="raw"
            className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none gap-1.5 text-xs sm:text-sm"
          >
            <Layers className="h-3.5 w-3.5" />
            Raw Materials
            <span className="ml-1 hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
              {data.fabricStock.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="wip"
            className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none gap-1.5 text-xs sm:text-sm"
          >
            <CircleDot className="h-3.5 w-3.5" />
            Work in Progress
            <span className="ml-1 hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
              {data.wipJobs.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Raw Materials ───────────────────────────────────── */}
        <TabsContent value="raw">
          <Card className="glass-card">
            <CardContent className="p-0">
              {/* Sort controls */}
              <div className="flex items-center gap-2 border-b border-border p-3">
                <span className="text-xs text-muted-foreground mr-1">Sort:</span>
                {(['name', 'value', 'available'] as const).map((col) => (
                  <Button
                    key={col}
                    variant="ghost"
                    size="sm"
                    className={`h-7 gap-1 text-xs ${fabricSort === col ? 'text-primary' : 'text-muted-foreground'}`}
                    onClick={() => toggleSort(col)}
                  >
                    {col === 'name' ? 'Name' : col === 'value' ? 'Value' : 'Available'}
                    {fabricSort === col && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </Button>
                ))}
              </div>

              {/* Mobile Cards */}
              <div className="block p-3 sm:hidden space-y-3">
                {sortedFabric.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Layers className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No raw materials found</p>
                  </div>
                ) : (
                  sortedFabric.map((item) => {
                    const health = getStockHealth(item.availableMeters, item.reservedMeters)
                    return (
                      <Card key={item.id} className="glass-card border-border/50">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {item.fabricName}
                                </span>
                                {item.availableMeters < 50 && (
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {item.supplier?.name || 'No supplier'}{item.lotNumber ? ` · Lot ${item.lotNumber}` : ''}
                              </p>
                            </div>
                            <span className={`text-xs font-medium ${health.color}`}>{health.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Available:</span>{' '}
                              <span className="font-medium text-foreground">{formatNumber(item.availableMeters)} m</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Reserved:</span>{' '}
                              <span className="font-medium text-foreground">{formatNumber(item.reservedMeters)} m</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Value:</span>{' '}
                              <span className="font-medium text-primary">{formatINR(item.totalValue)}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="bg-emerald-500 transition-all"
                                style={{ width: `${health.percent}%` }}
                              />
                              <div
                                className="bg-amber-500 transition-all"
                                style={{ width: `${100 - health.percent}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Available</span>
                              <span>Reserved</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs">Fabric Name</TableHead>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Lot No</TableHead>
                      <TableHead className="text-xs">Available (m)</TableHead>
                      <TableHead className="text-xs">Reserved (m)</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Avg Cost/m</TableHead>
                      <TableHead className="text-xs text-right">Value</TableHead>
                      <TableHead className="text-xs">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFabric.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                          No raw materials found
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedFabric.map((item) => {
                        const health = getStockHealth(item.availableMeters, item.reservedMeters)
                        return (
                          <TableRow key={item.id} className="border-border/50">
                            <TableCell className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {item.fabricName}
                                {item.availableMeters < 50 && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.supplier?.name || '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                              {item.lotNumber || '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{formatNumber(item.availableMeters)}</span>
                                <div className="hidden lg:flex h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="bg-emerald-500 transition-all"
                                    style={{ width: `${health.percent}%` }}
                                  />
                                  <div
                                    className="bg-amber-500 transition-all"
                                    style={{ width: `${100 - health.percent}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatNumber(item.reservedMeters)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                              {formatINR(item.averageCost)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-primary">
                              {formatINR(item.totalValue)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${health.bg}`} />
                                <span className={`text-xs font-medium ${health.color}`}>{health.label}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Work in Progress ────────────────────────────────── */}
        <TabsContent value="wip">
          <Card className="glass-card">
            <CardContent className="p-0">
              {/* Mobile Cards */}
              <div className="block p-3 sm:hidden space-y-3">
                {data.wipJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CircleDot className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No active production jobs</p>
                  </div>
                ) : (
                  data.wipJobs.map((job) => {
                    const pct = job.targetQty > 0 ? Math.round((job.completedQty / job.targetQty) * 100) : 0
                    const remaining = job.targetQty - job.completedQty
                    return (
                      <Card key={job.id} className="glass-card border-border/50">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-primary">{job.jobNo}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {job.styleName} ({job.styleNo})
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {job.stage}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Target</span>
                              <p className="font-medium text-foreground">{formatNumber(job.targetQty)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Done</span>
                              <p className="font-medium text-emerald-400">{formatNumber(job.completedQty)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Remaining</span>
                              <p className={`font-medium ${remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {formatNumber(remaining)}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{pct}%</span>
                            </div>
                            <Progress value={pct} className="h-2" />
                          </div>
                          {job.endDate && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Due: {new Date(job.endDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs">Job No</TableHead>
                      <TableHead className="text-xs">Style</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Stage</TableHead>
                      <TableHead className="text-xs text-right">Target</TableHead>
                      <TableHead className="text-xs text-right">Completed</TableHead>
                      <TableHead className="text-xs text-right">Remaining</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Due Date</TableHead>
                      <TableHead className="text-xs">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.wipJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                          No active production jobs
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.wipJobs.map((job) => {
                        const pct = job.targetQty > 0 ? Math.round((job.completedQty / job.targetQty) * 100) : 0
                        const remaining = job.targetQty - job.completedQty
                        const stageIndex = PRODUCTION_STAGES.indexOf(job.stage)
                        return (
                          <TableRow key={job.id} className="border-border/50">
                            <TableCell className="text-sm font-medium text-primary">
                              {job.jobNo}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{job.styleName}</p>
                                <p className="text-xs text-muted-foreground">{job.styleNo}</p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px]">
                                {stageIndex >= 0 && (
                                  <span
                                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                                    style={{
                                      backgroundColor: [
                                        'rgb(139 92 246)',
                                        'rgb(56 189 248)',
                                        'rgb(244 63 94)',
                                        'rgb(245 158 11)',
                                        'rgb(16 185 129)',
                                        'rgb(6 182 212)',
                                        'rgb(234 179 8)',
                                        'rgb(249 115 22)',
                                        'rgb(20 184 166)',
                                        'rgb(132 204 22)',
                                      ][stageIndex] || 'rgb(156 163 175)',
                                    }}
                                  />
                                )}
                                {job.stage}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatNumber(job.targetQty)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-emerald-400 font-medium">
                              {formatNumber(job.completedQty)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              <span className={remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                                {formatNumber(remaining)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                              {job.endDate
                                ? new Date(job.endDate).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full transition-all ${getProgressColor(pct)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium tabular-nums w-8 text-right">{pct}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}