'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Shirt,
  Scissors,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Package,
  ArrowDownLeft,
  Undo2,
  CheckCircle2,
  Layers,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Stages (must match PRODUCTION_STAGES in production.tsx / API) ─────────
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
] as const

// ─── Types ──────────────────────────────────────────────────────────────────

/** Job shape accepted from production.tsx (superset of ProductionJob fields) */
export interface FabricIssueJob {
  id: string
  jobNo: string
  styleNo: string
  styleName: string
  targetQty: number
  stage: string
  status: string
  color?: string | null
  _image?: string | null
  salesOrder?: { orderNo: string; customer?: { companyName: string } | null } | null
  plannedFabricMeters?: number
  actualFabricConsumed?: number
}

export interface FabricIssueDialogProps {
  job: FabricIssueJob
  onClose: () => void
  onIssued?: () => void
}

interface ReceiptChip {
  id: string
  grnNo: string | null
  poNumber: string | null
  receivedDate: string | null
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  color: string | null
  lotNumber: string | null
  ratePerUnit: number
  notes: string | null
}

interface StockCandidate {
  id: string
  fabricName: string
  color: string | null
  lotNumber: string | null
  styleNo: string | null
  availableMeters: number
  reservedMeters: number
  averageCost: number
  totalValue: number
  supplierId: string | null
  supplierName: string | null
  receipts: ReceiptChip[]
}

interface IssuedRow {
  id: string
  consumptionNo: string
  fabricStockId: string
  fabricName: string
  issuedQty: number
  consumedQty: number
  wastageQty: number
  wastageReason: string | null
  wastageRemarks: string | null
  plannedQty: number
  consumptionPerPc: number
  recordedBy: string | null
  consumptionDate: string | null
  isReturn: boolean
}

interface RequirementLine {
  materialType: string
  materialName: string
  color: string | null
  unit: string
  qtyPerPiece: number
  wastagePercent: number
  requiredQty: number
  availableQty: number | null
  gap: number | null
  status: 'OK' | 'SHORT' | 'UNKNOWN'
}

interface FabricIssueData {
  job: {
    id: string
    jobNo: string
    salesOrderId: string | null
    salesOrder: { orderNo: string; status: string; customer: { companyName: string } | null } | null
    styleNo: string
    styleName: string
    color: string | null
    targetQty: number
    completedQty: number
    stage: string
    status: string
    plannedFabricMeters: number
    actualFabricConsumed: number
    actualFabricCost: number
    fabricStockId: string | null
    endDate: string | null
  }
  stocks: StockCandidate[]
  alreadyIssued: IssuedRow[]
  requirement: { lines: RequirementLine[]; summary: { totalLines: number; ok: number; short: number; unknown: number }; bomVersion: number | null } | null
  requirementNote: string | null
  styleImage: string | null
  summary: {
    totalIssuedMeters: number
    totalReturnedMeters: number
    candidateCount: number
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))

/** Color badge only for real garment colors — 'Free' / null / '' suppressed */
function isColorJob(color?: string | null): boolean {
  const c = String(color || '').trim().toLowerCase()
  return c !== '' && c !== 'free' && c !== 'null'
}

function fmtDateShort(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return ''
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FabricIssueDialog({ job, onClose, onIssued }: FabricIssueDialogProps) {
  const [data, setData] = useState<FabricIssueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-stock selection + meters inputs
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [meters, setMeters] = useState<Record<string, string>>({})

  // Submit states
  const [issuing, setIssuing] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  // Return mini-form (per issued row)
  const [returnRowId, setReturnRowId] = useState<string | null>(null)
  const [returnMeters, setReturnMeters] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning] = useState(false)

  // ─── Load (single call for the whole dialog) ──────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/production/${job.id}/fabric-issue-data`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 404) {
          setError('Production job not found')
          return
        }
        throw new Error((err as { error?: string }).error || 'Failed to load fabric issue data')
      }
      const json: FabricIssueData = await res.json()
      setData(json)

      // Prefill: checkbox + meters = min(plan remaining, available)
      const netIssued = round2(
        json.alreadyIssued
          .filter((c) => !c.isReturn)
          .reduce((sum, c) => sum + (Number(c.issuedQty) || 0), 0),
      )
      const planRemaining = Math.max(0, round2((Number(json.job.plannedFabricMeters) || 0) - netIssued))
      const sel: Record<string, boolean> = {}
      const m: Record<string, string> = {}
      for (const s of json.stocks) {
        const available = round2(Number(s.availableMeters) || 0)
        if (available > 0) {
          const prefill = round2(Math.min(planRemaining, available))
          sel[s.id] = prefill > 0
          m[s.id] = prefill > 0 ? String(prefill) : ''
        } else {
          sel[s.id] = false
          m[s.id] = ''
        }
      }
      setSelected(sel)
      setMeters(m)
    } catch (e) {
      console.error('Fabric issue data load failed:', e)
      setError(e instanceof Error ? e.message : 'Failed to load fabric issue data')
    } finally {
      setLoading(false)
    }
  }, [job.id])

  useEffect(() => {
    load()
  }, [load])

  // ─── Derived numbers ──────────────────────────────────────────────────
  const netIssued = useMemo(
    () =>
      round2(
        (data?.alreadyIssued || [])
          .filter((c) => !c.isReturn)
          .reduce((sum, c) => sum + (Number(c.issuedQty) || 0), 0),
      ),
    [data],
  )
  const totalReturned = useMemo(
    () =>
      round2(
        (data?.alreadyIssued || [])
          .filter((c) => c.isReturn)
          .reduce((sum, c) => sum + (Number(c.wastageQty) || 0), 0),
      ),
    [data],
  )
  const planRemaining = Math.max(0, round2((data?.job.plannedFabricMeters || 0) - netIssued))

  /** Valid = checked, numeric, > 0, ≤ available (over-available excluded from totals) */
  const validLines = useMemo(() => {
    const out: { stock: StockCandidate; meters: number; over: boolean }[] = []
    for (const s of data?.stocks || []) {
      if (!selected[s.id]) continue
      const m = round2(Number(meters[s.id]))
      if (!m || m <= 0) continue
      out.push({ stock: s, meters: m, over: m > round2(s.availableMeters) })
    }
    return out
  }, [data, selected, meters])

  const totalMeters = round2(validLines.filter((l) => !l.over).reduce((sum, l) => sum + l.meters, 0))
  const totalCost = round2(
    validLines.filter((l) => !l.over).reduce((sum, l) => sum + l.meters * (Number(l.stock.averageCost) || 0), 0),
  )
  const hasInvalidRows = validLines.some((l) => l.over)
  const canIssue = !issuing && !loading && !error && validLines.filter((l) => !l.over).length > 0

  const nextStage = useMemo(() => {
    const idx = PRODUCTION_STAGES.indexOf((data?.job.stage || job.stage) as (typeof PRODUCTION_STAGES)[number])
    if (idx === -1 || idx >= PRODUCTION_STAGES.length - 1) return null
    return PRODUCTION_STAGES[idx + 1]
  }, [data, job.stage])

  const jobColor = data?.job.color ?? job.color ?? null
  const jobImage = data?.styleImage ?? job._image ?? null

  // ─── Issue submit ─────────────────────────────────────────────────────
  const handleIssue = async () => {
    const lines = validLines
      .filter((l) => !l.over)
      .map((l) => ({ fabricStockId: l.stock.id, meters: l.meters }))
    if (lines.length === 0) {
      toast.error('Enter meters for at least one fabric stock')
      return
    }
    try {
      setIssuing(true)
      const res = await fetch(`/api/production/${job.id}/fabric-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, recordedBy: 'System' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Failed to issue fabric')
      }
      toast.success((json as { message?: string }).message || `Fabric issued for ${job.jobNo}`)
      onIssued?.()
      await load() // in-place reload (refreshes history + stock levels)
      if (nextStage) setAdvanceOpen(true) // "Advance to Cutting?" confirm
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to issue fabric')
    } finally {
      setIssuing(false)
    }
  }

  // ─── Advance-only second call (from the AlertDialog) ──────────────────
  const handleAdvance = async () => {
    if (!nextStage) return
    try {
      setAdvancing(true)
      const res = await fetch(`/api/production/${job.id}/fabric-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: [], advanceStage: true, recordedBy: 'System' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Failed to advance stage')
      }
      toast.success(`Advanced to ${nextStage}`)
      onIssued?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to advance stage')
    } finally {
      setAdvancing(false)
      setAdvanceOpen(false)
    }
  }

  // ─── Return submit (inline mini-form per issued row) ──────────────────
  const handleReturn = async (row: IssuedRow) => {
    const m = round2(Number(returnMeters))
    if (!row.fabricStockId || !m || m <= 0) {
      toast.error('Enter meters to return')
      return
    }
    try {
      setReturning(true)
      const res = await fetch(`/api/production/${job.id}/fabric-return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fabricStockId: row.fabricStockId,
          meters: m,
          reason: returnReason || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Failed to return fabric')
      }
      toast.success((json as { message?: string }).message || 'Fabric returned to stock')
      setReturnRowId(null)
      setReturnMeters('')
      setReturnReason('')
      onIssued?.()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to return fabric')
    } finally {
      setReturning(false)
    }
  }

  const toggleSelected = (stockId: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [stockId]: checked }))
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent className="glass-card border-border sm:max-w-3xl p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 border-b border-border/60">
            {/* Header banner: style image + job identity + badges */}
            {loading && !data ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-14 w-14 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                {jobImage ? (
                  <img
                    src={jobImage}
                    alt={data?.job.styleNo || job.styleNo}
                    className="h-14 w-14 rounded-xl object-cover border border-border flex-shrink-0"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted border border-border flex-shrink-0">
                    <Shirt className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-base text-foreground">
                      {data?.job.jobNo || job.jobNo}
                    </DialogTitle>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                      {data?.job.stage || job.stage}
                    </Badge>
                    {isColorJob(jobColor) && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/30 text-violet-500 dark:text-violet-400">
                        {jobColor}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {data?.job.styleName || job.styleName}
                    <span className="ml-1 font-mono">({data?.job.styleNo || job.styleNo})</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                      <Package className="h-2.5 w-2.5" />
                      {data?.job.targetQty ?? job.targetQty} pcs
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                      <Layers className="h-2.5 w-2.5" />
                      Plan {data?.job.plannedFabricMeters ?? job.plannedFabricMeters ?? 0}m
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                      <Scissors className="h-2.5 w-2.5" />
                      Issued {netIssued}m
                    </Badge>
                    {data?.job.salesOrder && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary font-mono">
                        <FileText className="h-2.5 w-2.5" />
                        {data.job.salesOrder.orderNo}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogDescription className="sr-only">
              Issue GRN-received fabric to production job {job.jobNo}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
            {error ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" className="gap-2" onClick={load}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : loading && !data ? (
              <div className="space-y-4">
                {/* Requirement chips skeleton */}
                <div className="flex gap-2 flex-wrap">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-6 w-44 rounded-full" />
                  ))}
                </div>
                {/* Stock cards skeleton */}
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </div>
            ) : data ? (
              <>
                {/* ── Requirement chips (BOM truth) ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-foreground">BOM Requirement</p>
                    {data.requirement && (
                      <span className="text-[10px] text-muted-foreground">
                        {data.requirement.summary.ok} OK · {data.requirement.summary.short} short · {data.requirement.summary.unknown} unknown
                        {data.requirement.bomVersion ? ` · BOM v${data.requirement.bomVersion}` : ''}
                      </span>
                    )}
                  </div>
                  {data.requirement && data.requirement.lines.length > 0 ? (
                    <div className="flex gap-2 flex-wrap">
                      {data.requirement.lines.map((l, i) => (
                        <span
                          key={`${l.materialName}-${i}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                            l.status === 'OK'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : l.status === 'SHORT'
                              ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border-border bg-muted/50 text-muted-foreground'
                          }`}
                          title={
                            l.status === 'UNKNOWN'
                              ? `No matching stock found in FabricStock`
                              : `need ${l.requiredQty}${l.unit} · avail ${l.availableQty}${l.unit} · gap ${l.gap}`
                          }
                        >
                          {l.status === 'OK' && <CheckCircle2 className="h-3 w-3" />}
                          {l.status === 'SHORT' && <AlertTriangle className="h-3 w-3" />}
                          {l.materialName}
                          {l.color ? ` (${l.color})` : ''} need {l.requiredQty}
                          {l.unit}
                          {l.availableQty !== null ? (
                            <> · avail {l.availableQty}{l.unit}</>
                          ) : (
                            <> · stock unknown</>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border/60">
                      {data.requirementNote || 'No BOM requirement for this style'}
                    </p>
                  )}
                </div>

                <Separator className="bg-border/60" />

                {/* ── Stock cards (with GRN receipt chips) ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-foreground">
                      Fabric in Stock
                      <span className="ml-1 text-muted-foreground font-normal">
                        ({data.stocks.length} candidate{data.stocks.length === 1 ? '' : 's'})
                      </span>
                    </p>
                    <span className="text-[10px] text-muted-foreground">meters to issue per stock</span>
                  </div>

                  {data.stocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center rounded-lg border border-dashed border-border">
                      <Layers className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No matching fabric stock found</p>
                      <p className="text-[11px] text-muted-foreground/70">
                        Receive fabric via GRN (or add fabric stock) linked to this style
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {data.stocks.map((s) => {
                        const stockSelected = !!selected[s.id]
                        const m = Number(meters[s.id])
                        const available = round2(s.availableMeters)
                        const over = stockSelected && Number.isFinite(m) && m > 0 && m > available
                        const estCost = round2((Number(meters[s.id]) || 0) * (Number(s.averageCost) || 0))
                        return (
                          <div
                            key={s.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              over
                                ? 'border-red-500/50 bg-red-500/5'
                                : stockSelected
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border hover:border-border/80'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`fi-${s.id}`}
                                checked={stockSelected}
                                onCheckedChange={(v) => toggleSelected(s.id, v === true)}
                                className="mt-1"
                                aria-label={`Select ${s.fabricName}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <label
                                    htmlFor={`fi-${s.id}`}
                                    className="text-sm font-medium text-foreground cursor-pointer"
                                  >
                                    {s.fabricName}
                                  </label>
                                  {s.color && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-violet-500/30 text-violet-500 dark:text-violet-400">
                                      {s.color}
                                    </Badge>
                                  )}
                                  {s.lotNumber && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                                      Lot {s.lotNumber}
                                    </Badge>
                                  )}
                                  {s.styleNo && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary font-mono">
                                      {s.styleNo}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {available}m available
                                  {s.reservedMeters > 0 ? ` · ${round2(s.reservedMeters)}m reserved` : ''}
                                  {s.supplierName ? ` · ${s.supplierName}` : ''}
                                  {` · ₹${inr(s.averageCost)}/m`}
                                </p>

                                {/* GRN RECEIPT CHIPS — the GRN connection */}
                                {s.receipts.length > 0 && (
                                  <div className="flex gap-1.5 flex-wrap mt-2">
                                    {s.receipts.map((r) => (
                                      <span
                                        key={r.id}
                                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                                        title={
                                          r.receivedDate
                                            ? `Received ${fmtDateShort(r.receivedDate)}${r.color ? ` · ${r.color}` : ''}${r.lotNumber ? ` · Lot ${r.lotNumber}` : ''} · ₹${r.ratePerUnit}/m`
                                            : 'GRN receipt'
                                        }
                                      >
                                        <ArrowDownLeft className="h-2.5 w-2.5" />
                                        {r.grnNo || 'GRN'}
                                        {r.poNumber ? ` · ${r.poNumber}` : ''}
                                        {r.receivedDate ? ` · ${fmtDateShort(r.receivedDate)}` : ''}
                                        {` · ${round2(r.acceptedQty)}m`}
                                        <CheckCircle2 className="h-2.5 w-2.5" />
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Meters input + est cost */}
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step={0.5}
                                  min={0}
                                  placeholder="0"
                                  value={meters[s.id] || ''}
                                  onChange={(e) => setMeters((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                  disabled={!stockSelected}
                                  className={`h-8 w-24 text-right text-sm tabular-nums bg-muted/50 border-border ${
                                    over ? 'border-red-500/60 focus-visible:ring-red-500/30' : ''
                                  }`}
                                  aria-label={`Meters to issue from ${s.fabricName}`}
                                />
                                {over ? (
                                  <p className="text-[10px] text-red-500 font-medium">
                                    exceeds available ({available}m)
                                  </p>
                                ) : stockSelected && estCost > 0 ? (
                                  <p className="text-[10px] text-muted-foreground">₹{inr(estCost)} est.</p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <Separator className="bg-border/60" />

                {/* ── Issued history + returns ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-foreground">
                      Issued History
                      <span className="ml-1 text-muted-foreground font-normal">
                        ({data.alreadyIssued.filter((c) => !c.isReturn).length} issue{data.alreadyIssued.filter((c) => !c.isReturn).length === 1 ? '' : 's'}
                        {totalReturned > 0 ? ` · ${totalReturned}m returned` : ''})
                      </span>
                    </p>
                  </div>

                  {data.alreadyIssued.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 border border-border/60">
                      No fabric issued yet for this job
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.alreadyIssued.map((c) => {
                        const isReturn = c.isReturn
                        const returnableFromRow = round2(
                          Math.max(0, c.issuedQty) /* per-row return bound checked server-side against net */
                        )
                        return (
                          <div
                            key={c.id}
                            className={`rounded-lg border p-2.5 ${
                              isReturn ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/70'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                {isReturn ? (
                                  <Undo2 className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                ) : (
                                  <Scissors className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                )}
                                <span className="text-[11px] font-mono text-muted-foreground">{c.consumptionNo}</span>
                                <span className="text-xs font-medium text-foreground truncate">{c.fabricName}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${
                                    isReturn
                                      ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                                      : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {isReturn ? `−${round2(c.wastageQty)}m returned` : `${round2(c.issuedQty)}m issued`}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {fmtDateShort(c.consumptionDate)}
                                  {c.recordedBy ? ` · ${c.recordedBy}` : ''}
                                </span>
                                {!isReturn && round2(c.issuedQty) > 0 && returnableFromRow >= 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-amber-500"
                                    onClick={() => {
                                      setReturnRowId(returnRowId === c.id ? null : c.id)
                                      setReturnMeters('')
                                      setReturnReason('')
                                    }}
                                    disabled={returning}
                                  >
                                    <Undo2 className="h-3 w-3" />
                                    Return
                                  </Button>
                                )}
                              </div>
                            </div>
                            {c.wastageRemarks && (
                              <p className="text-[10px] text-muted-foreground mt-1 truncate">Note: {c.wastageRemarks}</p>
                            )}

                            {/* Inline Return mini-form */}
                            {returnRowId === c.id && (
                              <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step={0.5}
                                    min={0.5}
                                    max={round2(c.issuedQty)}
                                    placeholder="meters"
                                    value={returnMeters}
                                    onChange={(e) => setReturnMeters(e.target.value)}
                                    className="h-7 w-24 text-sm bg-muted/50 border-border"
                                    aria-label="Meters to return"
                                  />
                                  <Input
                                    placeholder="reason (optional)"
                                    value={returnReason}
                                    onChange={(e) => setReturnReason(e.target.value)}
                                    className="h-7 flex-1 min-w-[140px] text-xs bg-muted/50 border-border"
                                    aria-label="Return reason"
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 gap-1 bg-amber-600 hover:bg-amber-600/90 text-white text-[11px]"
                                    onClick={() => handleReturn(c)}
                                    disabled={returning || !returnMeters}
                                  >
                                    {returning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                                    Return to Stock
                                  </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  Net issued from this stock: {netIssued}m — can&apos;t return more than issued
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Sticky footer */}
          <div className="sticky bottom-0 border-t border-border/60 bg-background/95 backdrop-blur px-4 py-3 sm:px-6">
            {loading || error ? (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {loading ? 'Loading fabric data…' : 'Could not load fabric data'}
                </span>
                <Button variant="outline" onClick={onClose} className="h-8 text-xs">
                  Close
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="font-semibold text-foreground">
                    {totalMeters}m from {validLines.filter((l) => !l.over).length} stock
                    {validLines.filter((l) => !l.over).length === 1 ? '' : 's'}
                  </span>
                  <span className="text-muted-foreground">₹{inr(totalCost)} est.</span>
                  {(data?.job.plannedFabricMeters || 0) > 0 && (
                    <span className="text-muted-foreground">(plan: {planRemaining}m remaining)</span>
                  )}
                  {hasInvalidRows && (
                    <span className="text-red-500 text-[10px] font-medium">
                      some rows exceed available — excluded
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={onClose} className="h-9 text-xs" disabled={issuing}>
                    Close
                  </Button>
                  <Button
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9"
                    onClick={handleIssue}
                    disabled={!canIssue}
                  >
                    {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                    Issue Fabric
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── "Advance to Cutting?" confirm (second call: advanceStage=true) ── */}
      <AlertDialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <AlertDialogContent className="glass-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Advance to {nextStage || 'next stage'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Fabric issued for {data?.job.jobNo || job.jobNo}. Advance the job from{' '}
              {data?.job.stage || job.stage} to {nextStage || 'the next stage'} now? You can also
              advance later from the job card.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={advancing}>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault() // keep the dialog open while advancing
                handleAdvance()
              }}
              disabled={advancing}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Advance to {nextStage || 'next stage'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
