'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
  Truck,
  Eye,
  Edit3,
  Trash2,
  Package,
  PackageCheck,
  MapPin,
  Printer,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  BoxesIcon,
  Shirt,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DispatchItemRow {
  id?: string
  styleNo: string
  styleName: string
  orderedQty: number
  dispatchedQty: number
}

interface Dispatch {
  id: string
  dispatchNo: string
  salesOrderId: string
  salesOrder: { orderNo: string }
  customerId: string
  customer: { companyName: string }
  dispatchDate: string
  status: string
  shippingAddress: string | null
  trackingNo: string | null
  transporter: string | null
  vehicleNo: string | null
  totalDispatchedQty: number
  notes: string | null
  dispatchItems: DispatchItemRow[]
  _count?: { dispatchItems: number }
  createdAt: string
  updatedAt: string
}

interface SalesOrderOption {
  id: string
  orderNo: string
  customerId: string
  customer: { companyName: string; shippingAddress: string | null }
  shippingAddress: string | null
  items: { styleNo: string | null; styleName: string; quantity: number }[]
}

interface KPIData {
  totalDispatches: number
  inTransit: number
  deliveredThisMonth: number
  totalPcs: number
}

const statusTabs = ['All', 'Packed', 'InTransit', 'Delivered'] as const

// ─── Print Delivery Challan ─────────────────────────────────────────────────

function printDeliveryChallan(d: Dispatch) {
  const dateStr = new Date(d.dispatchDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const itemRows = d.dispatchItems.map((it, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${it.styleNo}</td>
      <td>${it.styleName}</td>
      <td style="text-align:center">${it.orderedQty}</td>
      <td style="text-align:center">${it.dispatchedQty}</td>
    </tr>`).join('')
  const totalQty = d.dispatchItems.reduce((s, it) => s + it.dispatchedQty, 0)

  const html = `<!DOCTYPE html>
<html><head><title>Delivery Challan - ${d.dispatchNo}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 20px; font-weight: 700; } .sub { font-size: 12px; color: #666; }
  .doc-no { font-size: 14px; font-weight: 600; } .date { font-size: 11px; color: #666; }
  h2 { font-size: 18px; margin-bottom: 16px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; font-size: 13px; }
  .info-grid dt { color: #666; } .info-grid dd { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
  th { background: #f5f5f5; font-weight: 600; }
  .total-row { font-weight: 700; border-top: 2px solid #1a1a1a; }
  .total-row td { border-bottom: none; }
  .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
  .sig-block { text-align: center; width: 200px; }
  .sig-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 8px; font-size: 12px; color: #333; }
  .footer { margin-top: 40px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <div><div class="brand">Dhanya Lifestyle LLP</div><div class="sub">Elysé by Dhanya · Ahmedabad, Gujarat</div></div>
  <div style="text-align:right"><div class="doc-no">DELIVERY CHALLAN</div><div style="font-size:13px;font-weight:600">${d.dispatchNo}</div><div class="date">Date: ${dateStr}</div></div>
</div>
<h2>Delivery Challan</h2>
<dl class="info-grid">
  <div><dt>Order Reference</dt><dd>${d.salesOrder.orderNo}</dd></div>
  <div><dt>Customer</dt><dd>${d.customer.companyName}</dd></div>
  <div><dt>Shipping Address</dt><dd>${d.shippingAddress || '—'}</dd></div>
  <div><dt>Transporter</dt><dd>${d.transporter || '—'}${d.vehicleNo ? ` · Vehicle: ${d.vehicleNo}` : ''}</dd></div>
  <div><dt>Tracking No</dt><dd>${d.trackingNo || '—'}</dd></div>
  <div><dt>Status</dt><dd>${d.status}</dd></div>
</dl>
<table>
  <thead><tr><th style="text-align:center">#</th><th>Style No</th><th>Style Name</th><th style="text-align:center">Ordered Qty</th><th style="text-align:center">Dispatched Qty</th></tr></thead>
  <tbody>
    ${itemRows}
    <tr class="total-row"><td colspan="4" style="text-align:right"><strong>Total Pieces</strong></td><td style="text-align:center"><strong>${totalQty}</strong></td></tr>
  </tbody>
</table>
${d.notes ? `<p style="margin-top:8px;font-size:12px;color:#666"><strong>Notes:</strong> ${d.notes}</p>` : ''}
<div class="signatures">
  <div class="sig-block"><div class="sig-line">Prepared By</div></div>
  <div class="sig-block"><div class="sig-line">Checked By</div></div>
  <div class="sig-block"><div class="sig-line">Dispatch In-Charge</div></div>
  <div class="sig-block"><div class="sig-line">Received By</div></div>
</div>
<div class="footer">Dhanya OS v1.0 · Generated on ${new Date().toLocaleString('en-IN')}</div>
<script>window.onload = () => window.print();</script>
</body></html>`
  const w = window.open('', '_blank', 'width=800,height=600')
  if (w) { w.document.write(html); w.document.close() }
}

// ─── Module ──────────────────────────────────────────────────────────────────

export function DispatchModule() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string>('All')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [kpi, setKpi] = useState<KPIData>({ totalDispatches: 0, inTransit: 0, deliveredThisMonth: 0, totalPcs: 0 })

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Detail sheet
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null)

  // Form state
  const [formSalesOrderId, setFormSalesOrderId] = useState('')
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formShippingAddress, setFormShippingAddress] = useState('')
  const [formTrackingNo, setFormTrackingNo] = useState('')
  const [formTransporter, setFormTransporter] = useState('')
  const [formVehicleNo, setFormVehicleNo] = useState('')
  const [formStatus, setFormStatus] = useState('Packed')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<DispatchItemRow[]>([])
  const [formCustomerName, setFormCustomerName] = useState('')

  // Eligible sales orders
  const [eligibleOrders, setEligibleOrders] = useState<SalesOrderOption[]>([])

  // ─── Fetch dispatches ──────────────────────────────────────────────
  const fetchDispatches = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (activeStatus && activeStatus !== 'All') params.set('status', activeStatus)
      if (search) params.set('search', search)
      const res = await fetch(`/api/dispatch?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setDispatches(data.dispatches || [])
      setStatusCounts(data.statusCounts || {})

      // Compute KPIs from full list (fetch all for accurate counts)
      const allRes = await fetch('/api/dispatch')
      if (allRes.ok) {
        const allData = await allRes.json()
        const all = allData.dispatches || []
        const now = new Date()
        const thisMonth = all.filter((d: Dispatch) => {
          const dd = new Date(d.dispatchDate)
          return dd.getMonth() === now.getMonth() && dd.getFullYear() === now.getFullYear() && d.status === 'Delivered'
        })
        setKpi({
          totalDispatches: allData.totalCount || all.length,
          inTransit: allData.statusCounts?.InTransit || 0,
          deliveredThisMonth: thisMonth.length,
          totalPcs: all.reduce((s: number, d: Dispatch) => s + d.totalDispatchedQty, 0),
        })
      }
    } catch {
      toast.error('Failed to load dispatches')
    } finally {
      setLoading(false)
    }
  }, [activeStatus, search])

  useEffect(() => { fetchDispatches() }, [fetchDispatches])

  // ─── Fetch eligible orders (Confirmed/In Production) ───────────────
  useEffect(() => {
    if (!dialogOpen) return
    const fetchOrders = async () => {
      try {
        const res = await fetch('/api/orders?status=Confirmed')
        if (!res.ok) throw new Error()
        const data = await res.json()
        const orders = (data.orders || []).filter((o: { status: string }) =>
          o.status === 'Confirmed' || o.status === 'In Production'
        )
        setEligibleOrders(orders)
      } catch {
        // Try fetching all and filtering client-side
        try {
          const res2 = await fetch('/api/orders?limit=200')
          if (res2.ok) {
            const data2 = await res2.json()
            const orders = (data2.orders || []).filter((o: { status: string }) =>
              o.status === 'Confirmed' || o.status === 'In Production'
            )
            setEligibleOrders(orders)
          }
        } catch { /* silent */ }
      }
    }
    fetchOrders()
  }, [dialogOpen])

  // ─── Reset form ───────────────────────────────────────────────────
  const resetForm = () => {
    setEditingId(null)
    setFormSalesOrderId('')
    setFormCustomerId('')
    setFormShippingAddress('')
    setFormTrackingNo('')
    setFormTransporter('')
    setFormVehicleNo('')
    setFormStatus('Packed')
    setFormNotes('')
    setFormItems([])
    setFormCustomerName('')
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (d: Dispatch) => {
    setEditingId(d.id)
    setFormSalesOrderId(d.salesOrderId)
    setFormCustomerId(d.customerId)
    setFormShippingAddress(d.shippingAddress || '')
    setFormTrackingNo(d.trackingNo || '')
    setFormTransporter(d.transporter || '')
    setFormVehicleNo(d.vehicleNo || '')
    setFormStatus(d.status)
    setFormNotes(d.notes || '')
    setFormItems(d.dispatchItems.map(it => ({ ...it })))
    setFormCustomerName(d.customer.companyName)
    setDialogOpen(true)
  }

  const openDetail = (d: Dispatch) => {
    setSelectedDispatch(d)
    setDetailOpen(true)
  }

  // ─── Handle sales order selection (auto-fill) ─────────────────────
  const handleOrderSelect = (orderId: string) => {
    setFormSalesOrderId(orderId)
    const order = eligibleOrders.find(o => o.id === orderId)
    if (order) {
      setFormCustomerId(order.customerId)
      setFormCustomerName(order.customer.companyName)
      setFormShippingAddress(order.shippingAddress || order.customer?.shippingAddress || '')
      setFormItems(
        (order.items || []).map(it => ({
          styleNo: it.styleNo || '',
          styleName: it.styleName || '',
          orderedQty: it.quantity || 0,
          dispatchedQty: it.quantity || 0,
        }))
      )
    }
  }

  // ─── Update item dispatched qty ────────────────────────────────────
  const updateItemQty = (index: number, qty: number) => {
    setFormItems(prev => prev.map((it, i) => i === index ? { ...it, dispatchedQty: Math.max(0, qty) } : it))
  }

  // ─── Save (create or update) ──────────────────────────────────────
  const handleSave = async () => {
    if (!formSalesOrderId || !formCustomerId || formItems.length === 0) {
      toast.error('Sales order, customer, and items are required')
      return
    }
    if (formItems.some(it => it.dispatchedQty <= 0)) {
      toast.error('All items must have a dispatched quantity > 0')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        // Update via PATCH
        const res = await fetch(`/api/dispatch/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: formStatus,
            trackingNo: formTrackingNo,
            transporter: formTransporter,
            vehicleNo: formVehicleNo,
            shippingAddress: formShippingAddress,
            notes: formNotes,
          }),
        })
        if (!res.ok) throw new Error('Update failed')
        toast.success('Dispatch updated')
      } else {
        // Create via POST
        const res = await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salesOrderId: formSalesOrderId,
            customerId: formCustomerId,
            shippingAddress: formShippingAddress,
            trackingNo: formTrackingNo,
            transporter: formTransporter,
            vehicleNo: formVehicleNo,
            notes: formNotes,
            status: formStatus,
            items: formItems,
          }),
        })
        if (!res.ok) throw new Error('Create failed')
        toast.success('Dispatch created')
      }
      setDialogOpen(false)
      resetForm()
      fetchDispatches()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dispatch? Only packed dispatches can be deleted.')) return
    try {
      const res = await fetch(`/api/dispatch/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Delete failed')
      }
      toast.success('Dispatch deleted')
      fetchDispatches()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ─── Mark Delivered ───────────────────────────────────────────────
  const handleDeliver = async (id: string) => {
    if (!confirm('Mark this dispatch as delivered? This will deduct quantities from finished goods inventory.')) return
    try {
      const res = await fetch(`/api/dispatch/${id}/deliver`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to deliver')
      }
      const data = await res.json()
      toast.success('Marked as delivered')
      if (data.warnings?.length) {
        toast.warning(data.warnings.join('\n'))
      }
      fetchDispatches()
      setDetailOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark delivered')
    }
  }

  // ─── Status badge helper ──────────────────────────────────────────
  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; icon: typeof Package }> = {
      Packed: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Package },
      InTransit: { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Truck },
      Delivered: { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: PackageCheck },
    }
    const cfg = map[status] || map.Packed
    const Icon = cfg.icon
    return (
      <Badge variant="secondary" className={`${cfg.cls} gap-1`}>
        <Icon className="size-3" />
        {status}
      </Badge>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            🚚 Dispatch &amp; Shipping
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage deliveries, tracking, and shipping challans</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="dispatch" />
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="size-4" />
            New Dispatch
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Truck className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Dispatches</p>
                <p className="text-xl font-bold tabular-nums">{kpi.totalDispatches}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Clock className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">In Transit</p>
                <p className="text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{kpi.inTransit}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delivered (this month)</p>
                <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{kpi.deliveredThisMonth}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <BoxesIcon className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Pcs Shipped</p>
                <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{kpi.totalPcs.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {statusTabs.map(tab => (
          <Button
            key={tab}
            variant={activeStatus === tab ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveStatus(tab)}
            className="gap-1.5"
          >
            {tab}
            <span className="ml-1 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium">
              {statusCounts[tab] || 0}
            </span>
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search dispatch no, order, customer..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : dispatches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Truck className="size-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No dispatches found</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="size-4" /> Create first dispatch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Dispatch No</TableHead>
                  <TableHead className="whitespace-nowrap">Order No</TableHead>
                  <TableHead className="whitespace-nowrap">Customer</TableHead>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Pcs</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Tracking</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatches.map(d => (
                  <TableRow key={d.id} className="group">
                    <TableCell className="font-mono text-sm font-medium">{d.dispatchNo}</TableCell>
                    <TableCell className="font-mono text-sm">{d.salesOrder.orderNo}</TableCell>
                    <TableCell className="font-medium">{d.customer.companyName}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                      {new Date(d.dispatchDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-center font-medium tabular-nums">{d.totalDispatchedQty}</TableCell>
                    <TableCell>{statusBadge(d.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                      {d.trackingNo || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openDetail(d)} title="View">
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(d)} title="Edit">
                          <Edit3 className="size-4" />
                        </Button>
                        {d.status === 'Packed' && (
                          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(d.id)} title="Delete">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ─── Create / Edit Dialog ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Dispatch' : 'New Dispatch'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update dispatch details and status.' : 'Create a new dispatch / delivery challan from a sales order.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Sales Order Selector (create only) */}
            {!editingId && (
              <div className="grid gap-2">
                <Label>Sales Order *</Label>
                <Select value={formSalesOrderId} onValueChange={handleOrderSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a sales order..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {eligibleOrders.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.orderNo} — {o.customer?.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Customer (auto-filled) */}
            <div className="grid gap-2">
              <Label>Customer</Label>
              <Input value={formCustomerName} disabled placeholder="Auto-filled from order" />
            </div>

            {/* Shipping Address */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5"><MapPin className="size-3.5" /> Shipping Address</Label>
              <Textarea
                value={formShippingAddress}
                onChange={(e) => setFormShippingAddress(e.target.value)}
                placeholder="Enter shipping address..."
                rows={2}
              />
            </div>

            {/* Transporter, Vehicle, Tracking */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Transporter</Label>
                <Input value={formTransporter} onChange={(e) => setFormTransporter(e.target.value)} placeholder="Transporter name" />
              </div>
              <div className="grid gap-2">
                <Label>Vehicle No</Label>
                <Input value={formVehicleNo} onChange={(e) => setFormVehicleNo(e.target.value)} placeholder="GJ01XX1234" />
              </div>
              <div className="grid gap-2">
                <Label>Tracking No</Label>
                <Input value={formTrackingNo} onChange={(e) => setFormTrackingNo(e.target.value)} placeholder="AWB / Docket No" />
              </div>
            </div>

            {/* Status (edit only) */}
            {editingId && (
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Packed">Packed</SelectItem>
                    <SelectItem value="InTransit">In Transit</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
            </div>

            {/* Items Table */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Items ({formItems.length})</Label>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Style No</TableHead>
                      <TableHead>Style Name</TableHead>
                      <TableHead className="text-center">Ordered</TableHead>
                      <TableHead className="text-center">Dispatched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                          Select a sales order to auto-fill items
                        </TableCell>
                      </TableRow>
                    ) : (
                      formItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{item.styleNo}</TableCell>
                          <TableCell className="text-sm">{item.styleName}</TableCell>
                          <TableCell className="text-center tabular-nums">{item.orderedQty}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              max={item.orderedQty}
                              value={item.dispatchedQty}
                              onChange={(e) => updateItemQty(idx, parseInt(e.target.value) || 0)}
                              className="w-20 text-center mx-auto"
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <span className="size-4 animate-spin border-2 border-current border-t-transparent rounded-full" />}
              {editingId ? 'Update' : 'Create Dispatch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Sheet ─────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedDispatch && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedDispatch.dispatchNo}
                  {statusBadge(selectedDispatch.status)}
                </SheetTitle>
                <SheetDescription>
                  Created {new Date(selectedDispatch.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Sales Order</p>
                    <p className="font-mono font-medium">{selectedDispatch.salesOrder.orderNo}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Customer</p>
                    <p className="font-medium">{selectedDispatch.customer.companyName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Dispatch Date</p>
                    <p className="font-medium">
                      {new Date(selectedDispatch.dispatchDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total Pcs</p>
                    <p className="font-bold text-lg tabular-nums">{selectedDispatch.totalDispatchedQty}</p>
                  </div>
                </div>

                {selectedDispatch.shippingAddress && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Shipping Address</p>
                    <p className="bg-muted rounded-lg p-3 text-sm">{selectedDispatch.shippingAddress}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Transporter</p>
                    <p className="font-medium">{selectedDispatch.transporter || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Vehicle No</p>
                    <p className="font-mono font-medium">{selectedDispatch.vehicleNo || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Tracking No</p>
                    <p className="font-mono font-medium">{selectedDispatch.trackingNo || '—'}</p>
                  </div>
                </div>

                {selectedDispatch.notes && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    <p className="text-sm">{selectedDispatch.notes}</p>
                  </div>
                )}

                {/* Items Table */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Items</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Img</TableHead>
                          <TableHead>Style No</TableHead>
                          <TableHead>Style Name</TableHead>
                          <TableHead className="text-center">Ordered</TableHead>
                          <TableHead className="text-center">Dispatched</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDispatch.dispatchItems.map((it, i) => (
                          <TableRow key={it.id || i}>
                            <TableCell>
                              {(it as any)._image ? (
                                <img src={(it as any)._image} alt={it.styleName} className="h-10 w-10 rounded object-cover" />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                                  <Shirt className="h-5 w-5 text-muted-foreground/30" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{it.styleNo}</TableCell>
                            <TableCell className="text-sm">{it.styleName}</TableCell>
                            <TableCell className="text-center tabular-nums">{it.orderedQty}</TableCell>
                            <TableCell className="text-center tabular-nums font-semibold">{it.dispatchedQty}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold">
                          <TableCell colSpan={3} className="text-right">Total</TableCell>
                          <TableCell className="text-center tabular-nums">
                            {selectedDispatch.dispatchItems.reduce((s, it) => s + it.dispatchedQty, 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" className="gap-2" onClick={() => printDeliveryChallan(selectedDispatch)}>
                    <Printer className="size-4" />
                    Print Challan
                  </Button>

                  {selectedDispatch.status === 'Packed' && (
                    <Button variant="outline" className="gap-2" onClick={() => handleDeliver(selectedDispatch.id)}>
                      <PackageCheck className="size-4" />
                      Mark Delivered
                    </Button>
                  )}

                  {selectedDispatch.status === 'InTransit' && (
                    <Button variant="outline" className="gap-2" onClick={() => handleDeliver(selectedDispatch.id)}>
                      <PackageCheck className="size-4" />
                      Mark Delivered
                    </Button>
                  )}

                  {selectedDispatch.status === 'Packed' && (
                    <Button variant="destructive" className="gap-2" onClick={() => { handleDelete(selectedDispatch.id); setDetailOpen(false) }}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}