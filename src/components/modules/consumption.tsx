'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
  Search,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  AlertTriangle,
  Ruler,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ExportButton } from '@/components/export-button'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Consumption {
  id: string
  consumptionNo: string
  productionJobId: string
  fabricStockId: string
  fabricName: string
  issuedQty: number
  consumedQty: number
  wastageQty: number
  wastagePercent: number
  plannedQty: number
  varianceVsPlan: number
  outputQty: number
  consumptionPerPc: number
  wastageReason: string | null
  wastageRemarks: string | null
  consumptionDate: string
  recordedBy: string | null
  productionJob: { id: string; jobNo: string; styleNo: string; styleName: string } | null
  fabricStock: { id: string; fabricName: string } | null
}

interface ProductionJob {
  id: string
  jobNo: string
  styleName: string
  styleNo: string
}

interface FabricStockItem {
  id: string
  fabricName: string
  availableMeters: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConsumptionModule() {
  const [consumptions, setConsumptions] = useState<Consumption[]>([])
  const [summary, setSummary] = useState({ avgWastagePercent: 0, totalConsumedMeters: 0, totalWastageMeters: 0, highWasteAlerts: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [productionJobs, setProductionJobs] = useState<ProductionJob[]>([])
  const [fabricStocks, setFabricStocks] = useState<FabricStockItem[]>([])
  const [createForm, setCreateForm] = useState({
    productionJobId: '',
    fabricStockId: '',
    issuedQty: '',
    consumedQty: '',
    outputQty: '',
    plannedQty: '',
    wastageReason: '',
    wastageRemarks: '',
  })

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<Consumption | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      if (search) params.set('search', search)
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)

      const res = await fetch(`/api/consumption?${params}`)
      const data = await res.json()
      setConsumptions(data.consumptions || [])
      setSummary(data.summary || { avgWastagePercent: 0, totalConsumedMeters: 0, totalWastageMeters: 0, highWasteAlerts: 0 })
      setTotalPages(data.pagination?.pages || 1)
    } catch {
      toast.error('Failed to load consumption records')
    } finally {
      setLoading(false)
    }
  }, [page, search, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = async () => {
    try {
      const [pjRes, fsRes] = await Promise.all([
        fetch('/api/production-jobs?limit=50'),
        fetch('/api/fabric-stock?limit=100'),
      ])
      const [pjData, fsData] = await Promise.all([pjRes.json(), fsRes.json()])
      setProductionJobs(pjData.jobs || [])
      setFabricStocks(fsData.stock || [])
      setCreateForm({ productionJobId: '', fabricStockId: '', issuedQty: '', consumedQty: '', outputQty: '', plannedQty: '', wastageReason: '', wastageRemarks: '' })
      setCreateOpen(true)
    } catch {
      toast.error('Failed to load data')
    }
  }

  const handleCreate = async () => {
    if (!createForm.productionJobId || !createForm.fabricStockId || !createForm.issuedQty || !createForm.consumedQty || !createForm.outputQty) {
      toast.error('Please fill all required fields')
      return
    }
    try {
      const res = await fetch('/api/consumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          issuedQty: parseFloat(createForm.issuedQty),
          consumedQty: parseFloat(createForm.consumedQty),
          outputQty: parseInt(createForm.outputQty),
          plannedQty: createForm.plannedQty ? parseFloat(createForm.plannedQty) : 0,
          fabricName: fabricStocks.find(f => f.id === createForm.fabricStockId)?.fabricName || '',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create consumption record')
      }
      toast.success('Consumption record created')
      setCreateOpen(false)
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create')
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 })

  const wastageColor = (pct: number) => {
    if (pct > 8) return 'text-red-600 dark:text-red-400 font-semibold'
    if (pct > 5) return 'text-amber-600 dark:text-amber-400'
    return 'text-emerald-600 dark:text-emerald-400'
  }

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10"><TrendingDown className="h-5 w-5 text-amber-500" /></div><div><p className="text-xs text-muted-foreground">Avg Wastage %</p><p className={`text-xl font-bold ${wastageColor(summary.avgWastagePercent)}`}>{summary.avgWastagePercent.toFixed(1)}%</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Ruler className="h-5 w-5 text-blue-500" /></div><div><p className="text-xs text-muted-foreground">Total Fabric Consumed</p><p className="text-xl font-bold">{fmt(summary.totalConsumedMeters)}m</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-500" /></div><div><p className="text-xs text-muted-foreground">Total Wastage</p><p className="text-xl font-bold text-red-600">{fmt(summary.totalWastageMeters)}m</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10"><AlertTriangle className="h-5 w-5 text-orange-500" /></div><div><p className="text-xs text-muted-foreground">High Waste Alerts</p><p className={`text-xl font-bold ${summary.highWasteAlerts > 0 ? 'text-red-600' : ''}`}>{summary.highWasteAlerts}</p></div></div></CardContent></Card>
      </div>

      {/* ─── Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search FC No, fabric, job..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Input type="date" className="w-[150px]" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="w-[150px]" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }} />
        <ExportButton module="consumption" search={search} fromDate={fromDate} toDate={toDate} />
        <Button className="gap-1.5" onClick={openCreate}><Plus className="h-4 w-4" />New Entry</Button>
      </div>

      {/* ─── Table ─────────────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-[140px]">FC No</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Fabric</TableHead>
            <TableHead className="text-right">Issued (m)</TableHead>
            <TableHead className="text-right">Consumed (m)</TableHead>
            <TableHead className="text-right">Waste %</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Mtrs/Pc</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : consumptions.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No consumption records found</TableCell></TableRow>
            ) : consumptions.map(c => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setDetailItem(c); setDetailOpen(true) }}>
                <TableCell className="font-mono text-xs font-medium">{c.consumptionNo}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs font-medium">{c.productionJob?.jobNo || '—'}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">{c.productionJob?.styleName || ''}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[160px] truncate">{c.fabricName}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(c.issuedQty)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmt(c.consumedQty)}</TableCell>
                <TableCell className={`text-right tabular-nums ${wastageColor(c.wastagePercent)}`}>{c.wastagePercent.toFixed(1)}%</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{c.wastageReason || '—'}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{c.consumptionPerPc.toFixed(2)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(c.consumptionDate), 'dd-MMM-yyyy')}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDetailItem(c); setDetailOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ─── Pagination ────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* ─── Create Dialog ─────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>New Fabric Consumption</DialogTitle><DialogDescription>Record fabric issued and consumed for a production job.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Production Job *</Label>
              <Select value={createForm.productionJobId} onValueChange={v => setCreateForm(f => ({ ...f, productionJobId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select job" /></SelectTrigger>
                <SelectContent>
                  {productionJobs.map(j => <SelectItem key={j.id} value={j.id}>{j.jobNo} — {j.styleName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Fabric *</Label>
              <Select value={createForm.fabricStockId} onValueChange={v => setCreateForm(f => ({ ...f, fabricStockId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select fabric" /></SelectTrigger>
                <SelectContent>
                  {fabricStocks.filter(f => f.availableMeters > 0).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.fabricName} — {fmt(f.availableMeters)}m</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Issued Qty (m) *</Label>
                <Input type="number" step="0.1" min="0.1" placeholder="120.5" value={createForm.issuedQty} onChange={e => setCreateForm(f => ({ ...f, issuedQty: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Consumed Qty (m) *</Label>
                <Input type="number" step="0.1" min="0" placeholder="115.0" value={createForm.consumedQty} onChange={e => setCreateForm(f => ({ ...f, consumedQty: e.target.value }))} />
              </div>
            </div>
            {createForm.issuedQty && createForm.consumedQty && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Wastage</span><span className="font-medium text-red-600">{fmt(parseFloat(createForm.issuedQty) - parseFloat(createForm.consumedQty))}m ({((parseFloat(createForm.issuedQty) - parseFloat(createForm.consumedQty)) / parseFloat(createForm.issuedQty) * 100).toFixed(1)}%)</span></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Output Pieces *</Label>
                <Input type="number" min="1" placeholder="100" value={createForm.outputQty} onChange={e => setCreateForm(f => ({ ...f, outputQty: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Planned Qty (m)</Label>
                <Input type="number" step="0.1" min="0" placeholder="114.0" value={createForm.plannedQty} onChange={e => setCreateForm(f => ({ ...f, plannedQty: e.target.value }))} />
              </div>
            </div>
            {createForm.consumedQty && createForm.outputQty && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Meters/Piece</span><span className="font-medium">{(parseFloat(createForm.consumedQty) / parseInt(createForm.outputQty)).toFixed(2)}m</span></div>
                {createForm.plannedQty && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Variance vs Plan</span><span className={`font-medium ${(parseFloat(createForm.consumedQty) - parseFloat(createForm.plannedQty)) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{(parseFloat(createForm.consumedQty) - parseFloat(createForm.plannedQty)) > 0 ? '+' : ''}{fmt(parseFloat(createForm.consumedQty) - parseFloat(createForm.plannedQty))}m</span></div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label>Wastage Reason</Label>
              <Select value={createForm.wastageReason} onValueChange={v => setCreateForm(f => ({ ...f, wastageReason: v }))}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {['Defect', 'Shrinkage', 'Cutting Pattern', 'End Bits', 'Excess', 'Other'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Textarea value={createForm.wastageRemarks} onChange={e => setCreateForm(f => ({ ...f, wastageRemarks: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>{detailItem?.consumptionNo}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Production Job</span><p className="font-mono text-xs font-medium">{detailItem.productionJob?.jobNo} — {detailItem.productionJob?.styleName}</p></div>
                <div><span className="text-muted-foreground">Fabric</span><p className="font-medium">{detailItem.fabricName}</p></div>
                <div><span className="text-muted-foreground">Issued Qty</span><p className="font-medium">{fmt(detailItem.issuedQty)}m</p></div>
                <div><span className="text-muted-foreground">Consumed Qty</span><p className="font-medium">{fmt(detailItem.consumedQty)}m</p></div>
                <div><span className="text-muted-foreground">Wastage</span><p className={`font-medium ${wastageColor(detailItem.wastagePercent)}`}>{fmt(detailItem.wastageQty)}m ({detailItem.wastagePercent.toFixed(1)}%)</p></div>
                <div><span className="text-muted-foreground">Output Pieces</span><p className="font-medium">{detailItem.outputQty}</p></div>
                <div><span className="text-muted-foreground">Meters/Piece</span><p className="font-medium">{detailItem.consumptionPerPc.toFixed(2)}m</p></div>
                {detailItem.plannedQty > 0 && <div><span className="text-muted-foreground">Planned Qty</span><p>{fmt(detailItem.plannedQty)}m</p></div>}
                {detailItem.plannedQty > 0 && <div><span className="text-muted-foreground">Variance</span><p className={detailItem.varianceVsPlan > 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>{detailItem.varianceVsPlan > 0 ? '+' : ''}{fmt(detailItem.varianceVsPlan)}m</p></div>}
                <div><span className="text-muted-foreground">Date</span><p>{format(new Date(detailItem.consumptionDate), 'dd-MMM-yyyy')}</p></div>
                {detailItem.wastageReason && <div><span className="text-muted-foreground">Wastage Reason</span><p><Badge variant="secondary">{detailItem.wastageReason}</Badge></p></div>}
                {detailItem.recordedBy && <div><span className="text-muted-foreground">Recorded By</span><p>{detailItem.recordedBy}</p></div>}
                {detailItem.wastageRemarks && <div className="col-span-2"><span className="text-muted-foreground">Remarks</span><p>{detailItem.wastageRemarks}</p></div>}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}