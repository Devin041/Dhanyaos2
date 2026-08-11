'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Factory, IndianRupee, TrendingDown, TrendingUp, AlertTriangle,
  RefreshCw, Scissors, Package, Wrench,
} from 'lucide-react'
import { toast } from 'sonner'

interface JobCostData {
  id: string
  jobNo: string
  styleNo: string
  styleName: string
  targetQty: number
  completedQty: number
  stage: string
  status: string
  estimatedCostPerPiece: number
  estimatedTotalCost: number
  estimatedFabric: number
  estimatedLabor: number
  estimatedOverhead: number
  actualFabricCost: number
  actualLaborCost: number
  actualOutsourcedCost: number
  actualOverheadCost: number
  totalActualCost: number
  actualCostPerPiece: number
  variance: number
  variancePercent: number
  fabricDetails: any[]
  laborDetails: any[]
  vendorBillCount: number
  wastageCost: number
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export function JobCostingModule() {
  const [jobs, setJobs] = useState<JobCostData[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [styleFilter, setStyleFilter] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const url = styleFilter ? `/api/accounts/job-costing?styleNo=${styleFilter}` : '/api/accounts/job-costing'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs || [])
        setSummary(data.summary || null)
      }
    } catch { toast.error('Failed to load job costing') }
    finally { setLoading(false) }
  }, [styleFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const styleNos = [...new Set(jobs.map(j => j.styleNo).filter(Boolean))]

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Factory className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Job Costing — Actual vs Estimated</h1>
            <p className="text-xs text-muted-foreground">Real cost per production job with variance analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={styleFilter} onValueChange={(v) => setStyleFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Products" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {styleNos.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchData}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="glass-card border-l-2 border-l-primary/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Package className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Jobs</span></div>
            <p className="text-xl font-bold tabular-nums">{summary.totalJobs}</p>
            <p className="text-[10px] text-muted-foreground">{jobs.reduce((s, j) => s + j.completedQty, 0)} pieces completed</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-amber-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><IndianRupee className="h-3.5 w-3.5 text-amber-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Est. Total Cost</span></div>
            <p className="text-xl font-bold tabular-nums text-amber-400">{formatINR(summary.totalEstimated)}</p>
            <p className="text-[10px] text-muted-foreground">From cost sheets</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-blue-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Factory className="h-3.5 w-3.5 text-blue-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actual Total Cost</span></div>
            <p className="text-xl font-bold tabular-nums text-blue-400">{formatINR(summary.totalActual)}</p>
            <p className="text-[10px] text-muted-foreground">From PO + Labor + Vendor</p>
          </CardContent></Card>
          <Card className={`glass-card border-l-2 ${summary.totalVariance >= 0 ? 'border-l-emerald-500/40' : 'border-l-red-500/40'}`}><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">{summary.totalVariance >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cost Variance</span></div>
            <p className={`text-xl font-bold tabular-nums ${summary.totalVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(summary.totalVariance)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.totalVariance >= 0 ? 'Under budget' : 'Over budget'}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Overhead Info */}
      {summary && summary.monthlyOverhead > 0 && (
        <Card className="glass-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">Monthly Overhead (expenses): <span className="font-bold text-foreground">{formatINR(summary.monthlyOverhead)}</span></span>
              <span className="text-muted-foreground">Overhead per piece: <span className="font-bold text-primary">{formatINR(summary.overheadPerPiece)}</span></span>
              <span className="text-[10px] text-muted-foreground">(Monthly expenses ÷ total pieces produced)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs Table */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Production Jobs — Cost Breakdown</CardTitle></CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Factory className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No production jobs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs">Job No</TableHead>
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Est/Pc</TableHead>
                  <TableHead className="text-xs text-right">Act/Pc</TableHead>
                  <TableHead className="text-xs text-right">Est Total</TableHead>
                  <TableHead className="text-xs text-right">Act Total</TableHead>
                  <TableHead className="text-xs text-right">Variance</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const isOverBudget = j.variance > 0
                  return (
                    <TableRow key={j.id} className="border-border/20">
                      <TableCell className="text-xs font-medium py-2.5">{j.jobNo}</TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{j.styleNo}</span>
                          <span className="text-[10px] text-muted-foreground">{j.styleName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5">{j.completedQty}/{j.targetQty}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5 text-amber-400">{formatINR(j.estimatedCostPerPiece)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5 text-blue-400">{formatINR(j.actualCostPerPiece)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5">{formatINR(j.estimatedTotalCost)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5">{formatINR(j.totalActualCost)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5">
                        {j.variance !== 0 ? (
                          <span className={isOverBudget ? 'text-red-400 font-medium' : 'text-emerald-400 font-medium'}>
                            {isOverBudget ? '+' : ''}{formatINR(j.variance)}
                            <span className="text-[9px] text-muted-foreground ml-1">({j.variancePercent}%)</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-center py-2.5">
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${j.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border-amber-500/20'}`}>
                          {j.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cost Element Breakdown */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Cost Element Analysis (All Jobs)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estimated vs Actual by Element */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Estimated vs Actual by Cost Element</h4>
              <div className="space-y-3">
                {[
                  { label: 'Fabric', icon: Package, estKey: 'estimatedFabric', actKey: 'actualFabricCost', color: 'text-amber-400' },
                  { label: 'Labor', icon: Scissors, estKey: 'estimatedLabor', actKey: 'actualLaborCost', color: 'text-blue-400' },
                  { label: 'Overhead', icon: Wrench, estKey: 'estimatedOverhead', actKey: 'actualOverheadCost', color: 'text-purple-400' },
                  { label: 'Outsourced', icon: Factory, estKey: null, actKey: 'actualOutsourcedCost', color: 'text-teal-400' },
                  { label: 'Wastage', icon: AlertTriangle, estKey: null, actKey: 'wastageCost', color: 'text-red-400' },
                ].map((el) => {
                  const est = jobs.reduce((s, j) => s + ((j as any)[el.estKey] || 0), 0)
                  const act = jobs.reduce((s, j) => s + ((j as any)[el.actKey] || 0), 0)
                  if (est === 0 && act === 0) return null
                  const variance = act - est
                  return (
                    <div key={el.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <el.icon className={`h-3 w-3 ${el.color}`} />
                          <span className="font-medium">{el.label}</span>
                        </span>
                        <span className="tabular-nums">
                          {est > 0 && <span className="text-muted-foreground">Est: {formatINR(est)}</span>}
                          {est > 0 && act > 0 && <span className="text-muted-foreground mx-1">→</span>}
                          {act > 0 && <span className={el.color}>Act: {formatINR(act)}</span>}
                          {variance !== 0 && est > 0 && (
                            <span className={`ml-2 ${variance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              ({variance > 0 ? '+' : ''}{formatINR(variance)})
                            </span>
                          )}
                        </span>
                      </div>
                      {est > 0 && (
                        <div className="flex h-1.5 gap-0.5">
                          <div className="rounded-l-full bg-amber-500/40" style={{ width: `${Math.min(100, (est / Math.max(est, act)) * 100)}%` }} />
                          <div className="rounded-r-full bg-blue-500/60" style={{ width: `${Math.min(100, (act / Math.max(est, act)) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Variance Summary */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Variance Summary</h4>
              <div className="space-y-2">
                {jobs.filter(j => j.variance !== 0).slice(0, 5).map((j) => (
                  <div key={j.id} className="flex items-center justify-between rounded border border-border/40 bg-muted/20 px-3 py-2">
                    <div>
                      <span className="text-xs font-medium">{j.jobNo}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{j.styleNo}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold tabular-nums ${j.variance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {j.variance > 0 ? '+' : ''}{formatINR(j.variance)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">({j.variancePercent}%)</span>
                    </div>
                  </div>
                ))}
                {jobs.filter(j => j.variance !== 0).length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">No variance data — enter actual costs to see analysis</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
