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
  Lock,
  Unlock,
  Eye,
  ChevronLeft,
  ChevronRight,
  Ruler,
  Scissors,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ExportButton } from '@/components/export-button'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FabricStockItem {
  id: string
  fabricName: string
  availableMeters: number
  reservedMeters: number
  averageCost: number
}

interface Reservation {
  id: string
  reservationNo: string
  fabricStockId: string
  referenceType: string
  referenceId: string
  referenceNo: string
  reservedQty: number
  consumedQty: number
  releasedQty: number
  status: string
  reservedDate: string
  releasedDate: string | null
  expiryDate: string | null
  notes: string | null
  fabricStock: { id: string; fabricName: string; availableMeters: number; reservedMeters: number }
}

interface SalesOrder {
  id: string
  orderNo: string
  customerName: string
  status: string
}

interface ProductionJob {
  id: string
  jobNo: string
  styleName: string
  status: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReservationsModule() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({ All: 0 })
  const [summary, setSummary] = useState({ activeReservations: 0, reservedMeters: 0, consumedMeters: 0, availableUnreserved: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [refTypeFilter, setRefTypeFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [fabricStocks, setFabricStocks] = useState<FabricStockItem[]>([])
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([])
  const [productionJobs, setProductionJobs] = useState<ProductionJob[]>([])
  const [createForm, setCreateForm] = useState({
    fabricStockId: '',
    referenceType: 'SalesOrder',
    referenceId: '',
    reservedQty: '',
    expiryDate: '',
    notes: '',
  })

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<Reservation | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (refTypeFilter !== 'All') params.set('referenceType', refTypeFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/stock-reservations?${params}`)
      const data = await res.json()
      setReservations(data.reservations || [])
      setCounts(data.counts || {})
      setSummary(data.summary || { activeReservations: 0, reservedMeters: 0, consumedMeters: 0, availableUnreserved: 0 })
      setTotalPages(data.pagination?.pages || 1)
    } catch {
      toast.error('Failed to load reservations')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, refTypeFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = async () => {
    try {
      const [fsRes, soRes, pjRes] = await Promise.all([
        fetch('/api/fabric-stock?limit=100'),
        fetch('/api/sales-orders?limit=50&status=Confirmed'),
        fetch('/api/production-jobs?limit=50'),
      ])
      const [fsData, soData, pjData] = await Promise.all([fsRes.json(), soRes.json(), pjRes.json()])
      setFabricStocks(fsData.stock || [])
      setSalesOrders((soData.orders || soData.salesOrders || []).filter((o: SalesOrder) => o.status === 'Confirmed' || o.status === 'In Progress'))
      setProductionJobs(pjData.jobs || [])
      setCreateForm({ fabricStockId: '', referenceType: 'SalesOrder', referenceId: '', reservedQty: '', expiryDate: '', notes: '' })
      setCreateOpen(true)
    } catch {
      toast.error('Failed to load data for reservation')
    }
  }

  const handleCreate = async () => {
    if (!createForm.fabricStockId || !createForm.referenceId || !createForm.reservedQty) {
      toast.error('Please fill all required fields')
      return
    }
    const qty = parseFloat(createForm.reservedQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Invalid quantity')
      return
    }

    const refNo = createForm.referenceType === 'SalesOrder'
      ? salesOrders.find(o => o.id === createForm.referenceId)?.orderNo || ''
      : productionJobs.find(j => j.id === createForm.referenceId)?.jobNo || ''

    try {
      const res = await fetch('/api/stock-reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fabricStockId: createForm.fabricStockId,
          referenceType: createForm.referenceType,
          referenceId: createForm.referenceId,
          referenceNo: refNo,
          reservedQty: qty,
          expiryDate: createForm.expiryDate || undefined,
          notes: createForm.notes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create reservation')
      }
      toast.success('Reservation created successfully')
      setCreateOpen(false)
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create reservation')
    }
  }

  const handleRelease = async (id: string, reservationNo: string) => {
    if (!confirm(`Release reservation ${reservationNo}?`)) return
    try {
      const res = await fetch(`/api/stock-reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to release')
      }
      toast.success('Reservation released')
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to release')
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'Active': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'Partially Consumed': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      case 'Fully Consumed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      case 'Released': return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400'
      case 'Expired': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 })

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10"><Lock className="h-5 w-5 text-emerald-500" /></div><div><p className="text-xs text-muted-foreground">Active Reservations</p><p className="text-xl font-bold">{summary.activeReservations}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10"><Layers className="h-5 w-5 text-amber-500" /></div><div><p className="text-xs text-muted-foreground">Reserved Meters</p><p className="text-xl font-bold">{fmt(summary.reservedMeters)}m</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Scissors className="h-5 w-5 text-blue-500" /></div><div><p className="text-xs text-muted-foreground">Consumed Meters</p><p className="text-xl font-bold">{fmt(summary.consumedMeters)}m</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10"><Ruler className="h-5 w-5 text-violet-500" /></div><div><p className="text-xs text-muted-foreground">Available (Unreserved)</p><p className="text-xl font-bold">{fmt(summary.availableUnreserved)}m</p></div></div></CardContent></Card>
      </div>

      {/* ─── Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search reservations..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['All', 'Active', 'Partially Consumed', 'Fully Consumed', 'Released', 'Expired'].map(s => (
              <SelectItem key={s} value={s}>{s}{counts[s] !== undefined ? ` (${counts[s]})` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={refTypeFilter} onValueChange={v => { setRefTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All References</SelectItem>
            <SelectItem value="SalesOrder">Sales Order</SelectItem>
            <SelectItem value="ProductionJob">Production Job</SelectItem>
          </SelectContent>
        </Select>
        <ExportButton module="stock-reservations" status={statusFilter} search={search} />
        <Button className="gap-1.5" onClick={openCreate}><Plus className="h-4 w-4" />New Reservation</Button>
      </div>

      {/* ─── Table ─────────────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-[140px]">SR No</TableHead>
            <TableHead>Fabric</TableHead>
            <TableHead>For</TableHead>
            <TableHead className="text-right">Reserved (m)</TableHead>
            <TableHead className="text-right">Consumed (m)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : reservations.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No reservations found</TableCell></TableRow>
            ) : reservations.map(r => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setDetailItem(r); setDetailOpen(true) }}>
                <TableCell className="font-mono text-xs font-medium">{r.reservationNo}</TableCell>
                <TableCell className="font-medium">{r.fabricStock?.fabricName || '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{r.referenceType === 'SalesOrder' ? 'SO' : 'PJ'}</span>
                    <span className="font-mono text-xs">{r.referenceNo}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt(r.reservedQty)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.consumedQty)}</TableCell>
                <TableCell><Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(r.reservedDate), 'dd-MMM-yyyy')}</TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  {['Active', 'Partially Consumed'].includes(r.status) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleRelease(r.id, r.reservationNo)}>
                      <Unlock className="h-3 w-3" />Release
                    </Button>
                  )}
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>New Stock Reservation</DialogTitle><DialogDescription>Reserve fabric for a sales order or production job.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Fabric Stock *</Label>
              <Select value={createForm.fabricStockId} onValueChange={v => setCreateForm(f => ({ ...f, fabricStockId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select fabric stock" /></SelectTrigger>
                <SelectContent>
                  {fabricStocks.filter(fs => fs.availableMeters > 0).map(fs => (
                    <SelectItem key={fs.id} value={fs.id}>{fs.fabricName} — {fmt(fs.availableMeters)}m available</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Reference Type *</Label>
              <Select value={createForm.referenceType} onValueChange={v => setCreateForm(f => ({ ...f, referenceType: v, referenceId: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SalesOrder">Sales Order</SelectItem>
                  <SelectItem value="ProductionJob">Production Job</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{createForm.referenceType === 'SalesOrder' ? 'Sales Order' : 'Production Job'} *</Label>
              <Select value={createForm.referenceId} onValueChange={v => setCreateForm(f => ({ ...f, referenceId: v }))}>
                <SelectTrigger><SelectValue placeholder={`Select ${createForm.referenceType === 'SalesOrder' ? 'order' : 'job'}`} /></SelectTrigger>
                <SelectContent>
                  {createForm.referenceType === 'SalesOrder'
                    ? salesOrders.map(o => <SelectItem key={o.id} value={o.id}>{o.orderNo} — {o.customerName}</SelectItem>)
                    : productionJobs.map(j => <SelectItem key={j.id} value={j.id}>{j.jobNo} — {j.styleName}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Quantity (meters) *</Label>
              <Input type="number" step="0.1" min="0.1" placeholder="e.g. 50.5" value={createForm.reservedQty} onChange={e => setCreateForm(f => ({ ...f, reservedQty: e.target.value }))} />
              {createForm.fabricStockId && (
                <p className="text-xs text-muted-foreground">
                  Available: {fmt(fabricStocks.find(fs => fs.id === createForm.fabricStockId)?.availableMeters || 0)}m
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Expiry Date (optional)</Label>
              <Input type="date" value={createForm.expiryDate} onChange={e => setCreateForm(f => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Reserve Fabric</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Reservation {detailItem?.reservationNo}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Fabric</span><p className="font-medium">{detailItem.fabricStock?.fabricName}</p></div>
                <div><span className="text-muted-foreground">Status</span><p><Badge variant="secondary" className={statusColor(detailItem.status)}>{detailItem.status}</Badge></p></div>
                <div><span className="text-muted-foreground">Reference</span><p className="font-mono text-xs">{detailItem.referenceType === 'SalesOrder' ? 'SO' : 'PJ'}: {detailItem.referenceNo}</p></div>
                <div><span className="text-muted-foreground">Reserved Date</span><p>{format(new Date(detailItem.reservedDate), 'dd-MMM-yyyy')}</p></div>
                <div><span className="text-muted-foreground">Reserved Qty</span><p className="font-medium">{fmt(detailItem.reservedQty)}m</p></div>
                <div><span className="text-muted-foreground">Consumed Qty</span><p className="font-medium">{fmt(detailItem.consumedQty)}m</p></div>
                <div><span className="text-muted-foreground">Released Qty</span><p className="font-medium">{fmt(detailItem.releasedQty)}m</p></div>
                <div><span className="text-muted-foreground">Remaining</span><p className="font-bold text-amber-600">{fmt(detailItem.reservedQty - detailItem.consumedQty - detailItem.releasedQty)}m</p></div>
                {detailItem.expiryDate && <div><span className="text-muted-foreground">Expiry Date</span><p>{format(new Date(detailItem.expiryDate), 'dd-MMM-yyyy')}</p></div>}
                {detailItem.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes</span><p>{detailItem.notes}</p></div>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            {detailItem && ['Active', 'Partially Consumed'].includes(detailItem.status) && (
              <Button variant="destructive" className="gap-1.5" onClick={() => { handleRelease(detailItem.id, detailItem.reservationNo); setDetailOpen(false) }}>
                <Unlock className="h-4 w-4" />Release
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}