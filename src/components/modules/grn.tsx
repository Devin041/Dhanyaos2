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
  PackageCheck,
  Package,
  Layers,
  Eye,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Ruler,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GrnItem {
  id?: string
  fabricName: string
  color?: string         // NEW — Pink / Maroon / Red
  lotNumber?: string     // NEW — lot/batch number
  orderedQty: number
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  defectNotes: string
  ratePerUnit: number
  totalValue: number
}

interface GrnNote {
  id: string
  grnNo: string
  poId: string | null
  purchaseOrder: { poNumber: string; fabricName: string } | null
  supplierId: string | null
  supplierName: string
  receivedDate: string
  status: string
  totalReceivedQty: number
  acceptedQty: number
  rejectedQty: number
  qualityRemarks: string | null
  notes: string | null
  grnItems: GrnItem[]
  createdAt: string
  updatedAt: string
}

interface Supplier {
  id: string
  name: string
  supplierType: string
  status: string
}

interface PurchaseOrder {
  id: string
  poNumber: string
  supplierId: string | null
  supplier: { name: string } | null
  vendor?: { vendorName: string } | null     // vendor-only POs have supplier=null
  vendorId?: string | null
  supplierName?: string                       // denormalized fallback
  fabricName: string
  quantity: number
  unit: string
  ratePerUnit: number
  status: string
  items?: any[]                                // universal PO line items
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  Draft: {
    label: 'Draft',
    className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25 hover:bg-zinc-500/25',
    icon: <ClipboardCheck className="h-3 w-3" />,
  },
  Inspected: {
    label: 'Inspected',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  Approved: {
    label: 'Approved',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  Rejected: {
    label: 'Rejected',
    className: 'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25',
    icon: <XCircle className="h-3 w-3" />,
  },
}

const STATUS_TABS = ['All', 'Draft', 'Inspected', 'Approved', 'Rejected']

const BLANK_ITEM = (): GrnItem => ({
  fabricName: '',
  color: '',
  lotNumber: '',
  orderedQty: 0,
  receivedQty: 0,
  acceptedQty: 0,
  rejectedQty: 0,
  defectNotes: '',
  ratePerUnit: 0,
  totalValue: 0,
})

// ─── Component ───────────────────────────────────────────────────────────────

export function GrnModule() {
  // Data state
  const [grns, setGrns] = useState<GrnNote[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [summary, setSummary] = useState({ totalReceived: 0, totalAccepted: 0, totalRejected: 0 })
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Filter state
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedGRN, setSelectedGRN] = useState<GrnNote | null>(null)

  // Form state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [form, setForm] = useState({
    poId: '',
    supplierId: '',
    supplierName: '',
    receivedDate: new Date().toISOString().split('T')[0],
    qualityRemarks: '',
    notes: '',
    status: 'Draft',
  })
  const [items, setItems] = useState<GrnItem[]>([BLANK_ITEM()])
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // ─── Fetch GRNs ──────────────────────────────────────────────────────────

  const fetchGrns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== 'All') params.set('status', activeTab)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/grn?${params}`)
      const data = await res.json()
      if (res.ok) {
        setGrns(data.grns)
        setTotalCount(data.total)
        setStatusCounts(data.statusCounts)
        if (data.summary) setSummary(data.summary)
      }
    } catch {
      toast.error('Failed to load GRN notes')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, page])

  useEffect(() => {
    fetchGrns()
  }, [fetchGrns])

  useEffect(() => {
    setPage(1)
  }, [activeTab, search])

  // ─── Load suppliers & POs for forms ──────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/suppliers?limit=500').then((r) => r.json()).catch(() => ({ suppliers: [] })),
      // Fetch POs in statuses that are eligible for fabric receipt:
      // Approved (ready to receive) + Ordered (PO placed, can receive) + Pending (allow early receive)
      fetch('/api/purchase-orders?limit=500').then((r) => r.json()).catch(() => ({ orders: [] })),
    ]).then(([sData, pData]) => {
      if (sData.suppliers) setSuppliers(sData.suppliers)
      // Filter client-side to exclude cancelled POs — include all others
      // (Pending, Approved, Ordered, Received — Received is included for partial
      // receipt scenarios where the user wants to receive more against the same PO)
      const allOrders = pData.orders || []
      const eligible = allOrders.filter((po: any) =>
        po.status !== 'Cancelled'
      )
      setPurchaseOrders(eligible)
    })
  }, [])

  // ─── Create / Edit helpers ───────────────────────────────────────────────

  const resetForm = () => {
    setForm({
      poId: '',
      supplierId: '',
      supplierName: '',
      receivedDate: new Date().toISOString().split('T')[0],
      qualityRemarks: '',
      notes: '',
      status: 'Draft',
    })
    setItems([BLANK_ITEM()])
  }

  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  const openEdit = (grn: GrnNote) => {
    setForm({
      poId: grn.poId || '',
      supplierId: grn.supplierId || '',
      supplierName: grn.supplierName,
      receivedDate: grn.receivedDate ? grn.receivedDate.split('T')[0] : new Date().toISOString().split('T')[0],
      qualityRemarks: grn.qualityRemarks || '',
      notes: grn.notes || '',
      status: grn.status,
    })
    setItems(
      grn.grnItems.length > 0
        ? grn.grnItems.map((i) => ({ ...i, defectNotes: i.defectNotes || '' }))
        : [BLANK_ITEM()],
    )
    setSelectedGRN(grn)
    setEditOpen(true)
  }

  const openDetail = (grn: GrnNote) => {
    setSelectedGRN(grn)
    setDetailOpen(true)
  }

  // ─── Item manipulation ───────────────────────────────────────────────────

  const updateItem = (index: number, field: keyof GrnItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }

      if (field === 'fabricName') {
        item.fabricName = String(value)
      } else if (field === 'defectNotes') {
        item.defectNotes = String(value)
      } else {
        const numVal = Number(value) || 0
        ;(item as Record<string, unknown>)[field] = numVal
        // Auto-calc totalValue
        item.totalValue = item.acceptedQty * item.ratePerUnit
      }

      updated[index] = item
      return updated
    })
  }

  const addItem = () => {
    setItems((prev) => [...prev, BLANK_ITEM()])
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // ─── PO select handler ──────────────────────────────────────────────────
  // Pre-fills ALL line items from the PO (universal POs have multiple items
  // — one per color/fabric/product). Each becomes a GrnItem row so the user
  // can record received/accepted qty per color/lot.
  const handlePOSelect = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId) as any
    if (!po) return
    setForm((prev) => ({
      ...prev,
      poId: po.id,
      supplierId: po.supplierId || po.vendorId || '',
      supplierName: po.supplier?.name || po.vendor?.vendorName || po.supplierName || '—',
    }))
    // Universal POs have `items` array (POItem rows). Use them if available.
    const poItems: any[] = po.items || []
    if (poItems.length > 0) {
      // Build one GRN item per PO line item, preserving color/size/lot info
      const newItems: GrnItem[] = poItems
        .filter((it: any) => (it.itemType || 'FABRIC') === 'FABRIC' || (it.itemType || '') === 'ACCESSORY')
        .map((it: any) => ({
          fabricName: it.name || it.fabricName || '',
          color: it.color || '',
          lotNumber: '',
          orderedQty: it.quantity || 0,
          receivedQty: 0,
          acceptedQty: 0,
          rejectedQty: 0,
          defectNotes: '',
          ratePerUnit: it.ratePerUnit || 0,
          totalValue: 0,
        }))
      setItems(newItems.length > 0 ? newItems : [BLANK_ITEM()])
    } else {
      // Legacy PO (single-fabric mode) — pre-fill primary fabric only
      setItems([
        {
          fabricName: po.fabricName || '',
          color: '',
          lotNumber: '',
          orderedQty: po.quantity || 0,
          receivedQty: 0,
          acceptedQty: 0,
          rejectedQty: 0,
          defectNotes: '',
          ratePerUnit: po.ratePerUnit || 0,
          totalValue: 0,
        },
      ])
    }
  }

  const handleSupplierSelect = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId)
    if (supplier) {
      setForm((prev) => ({ ...prev, supplierId, supplierName: supplier.name }))
    }
  }

  // ─── Submit create ──────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.supplierName.trim()) {
      toast.error('Supplier name is required')
      return
    }
    const validItems = items.filter((i) => i.fabricName.trim() && i.receivedQty > 0)
    if (validItems.length === 0) {
      toast.error('At least one item with fabric name and received qty is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/grn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: form.poId || undefined,
          supplierId: form.supplierId || undefined,
          supplierName: form.supplierName,
          receivedDate: form.receivedDate || undefined,
          status: form.status,
          notes: form.notes || undefined,
          qualityRemarks: form.qualityRemarks || undefined,
          items: validItems.map((i) => ({
            fabricName: i.fabricName,
            orderedQty: i.orderedQty,
            receivedQty: i.receivedQty,
            acceptedQty: i.acceptedQty,
            rejectedQty: i.rejectedQty,
            defectNotes: i.defectNotes || undefined,
            ratePerUnit: i.ratePerUnit,
          })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`GRN ${data.grn.grnNo} created successfully`)
        setCreateOpen(false)
        resetForm()
        fetchGrns()
      } else {
        toast.error(data.error || 'Failed to create GRN')
      }
    } catch {
      toast.error('Failed to create GRN')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Submit edit ────────────────────────────────────────────────────────

  const handleEdit = async () => {
    if (!selectedGRN) return
    if (!form.supplierName.trim()) {
      toast.error('Supplier name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/grn/${selectedGRN.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: form.supplierName,
          receivedDate: form.receivedDate,
          status: form.status,
          notes: form.notes || null,
          qualityRemarks: form.qualityRemarks || null,
          items: items.map((i) => ({
            fabricName: i.fabricName,
            orderedQty: i.orderedQty,
            receivedQty: i.receivedQty,
            acceptedQty: i.acceptedQty,
            rejectedQty: i.rejectedQty,
            defectNotes: i.defectNotes || null,
            ratePerUnit: i.ratePerUnit,
          })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('GRN updated successfully')
        setEditOpen(false)
        setSelectedGRN(null)
        fetchGrns()
      } else {
        toast.error(data.error || 'Failed to update GRN')
      }
    } catch {
      toast.error('Failed to update GRN')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Status actions ─────────────────────────────────────────────────────

  const handleStatusChange = async (grnId: string, newStatus: string) => {
    setActionLoading(true)
    try {
      if (newStatus === 'Approved') {
        const res = await fetch(`/api/grn/${grnId}/approve`, { method: 'POST' })
        const data = await res.json()
        if (res.ok) {
          toast.success('GRN approved — fabric stock updated')
          fetchGrns()
          if (selectedGRN?.id === grnId) {
            setSelectedGRN(data.grn)
          }
          setDetailOpen(false)
        } else {
          toast.error(data.error || 'Failed to approve GRN')
        }
      } else {
        const res = await fetch(`/api/grn/${grnId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success(`GRN marked as ${newStatus}`)
          fetchGrns()
          if (selectedGRN?.id === grnId) {
            setSelectedGRN(data.grn)
          }
          setDetailOpen(false)
        } else {
          toast.error(data.error || 'Failed to update status')
        }
      }
    } catch {
      toast.error('Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (grnId: string) => {
    if (!confirm('Are you sure you want to delete this Draft GRN?')) return
    try {
      const res = await fetch(`/api/grn/${grnId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        toast.success('GRN deleted')
        fetchGrns()
        setDetailOpen(false)
      } else {
        toast.error(data.error || 'Failed to delete GRN')
      }
    } catch {
      toast.error('Failed to delete GRN')
    }
  }

  // ─── Computed values ────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / limit)
  const acceptanceRate = summary.totalReceived > 0
    ? ((summary.totalAccepted / summary.totalReceived) * 100).toFixed(1)
    : '0.0'
  const pendingApproval = (statusCounts['Draft'] || 0) + (statusCounts['Inspected'] || 0)

  const totalFormValue = items.reduce((sum, i) => sum + (i.acceptedQty * i.ratePerUnit), 0)

  // ─── Export data ─────────────────────────────────────────────────────────

  const exportData = grns.map((g) => ({
    'GRN No': g.grnNo,
    'PO Ref': g.purchaseOrder?.poNumber || '-',
    'Supplier': g.supplierName,
    'Date': formatDate(g.receivedDate),
    'Received Qty': g.totalReceivedQty,
    'Accepted Qty': g.acceptedQty,
    'Rejected Qty': g.rejectedQty,
    'Status': g.status,
    'Items': g.grnItems.length,
    'Total Value': formatINR(g.grnItems.reduce((s, i) => s + i.totalValue, 0)),
  }))

  // ─── Shared item table ──────────────────────────────────────────────────

  const renderItemTable = (editable: boolean) => (
    <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="text-[11px] font-semibold text-muted-foreground min-w-[160px]">Fabric</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground w-[100px]">Color</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground w-[90px]">Lot</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground text-right w-[90px]">Ordered</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground text-right w-[90px]">Received</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground text-right w-[90px]">Accepted</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground text-right w-[90px]">Rejected</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground text-right w-[100px]">Rate/Unit</TableHead>
            <TableHead className="text-[11px] font-semibold text-muted-foreground text-right w-[110px]">Value</TableHead>
            {editable && <TableHead className="text-[11px] font-semibold text-muted-foreground w-32">Defects</TableHead>}
            {editable && <TableHead className="w-8" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, idx) => (
            <TableRow key={idx} className="border-border/30">
              <TableCell className="py-1.5">
                {editable ? (
                  <Input
                    className="h-7 text-xs"
                    placeholder="Fabric name"
                    value={item.fabricName}
                    onChange={(e) => updateItem(idx, 'fabricName', e.target.value)}
                  />
                ) : (
                  <span className="text-xs font-medium">{item.fabricName || '—'}</span>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {editable ? (
                  <Input
                    className="h-7 text-xs"
                    placeholder="Color"
                    value={item.color || ''}
                    onChange={(e) => updateItem(idx, 'color', e.target.value)}
                  />
                ) : (
                  <span className="text-xs">{item.color || '—'}</span>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {editable ? (
                  <Input
                    className="h-7 text-xs"
                    placeholder="Lot"
                    value={item.lotNumber || ''}
                    onChange={(e) => updateItem(idx, 'lotNumber', e.target.value)}
                  />
                ) : (
                  <span className="text-xs">{item.lotNumber || '—'}</span>
                )}
              </TableCell>
              {(['orderedQty', 'receivedQty', 'acceptedQty', 'rejectedQty', 'ratePerUnit'] as const).map((field) => (
                <TableCell key={field} className="py-1.5 text-right">
                  {editable ? (
                    <Input
                      type="number"
                      className="h-7 text-xs text-right tabular-nums"
                      placeholder="0"
                      value={item[field] || ''}
                      onChange={(e) => updateItem(idx, field, e.target.value)}
                    />
                  ) : (
                    <span className="text-xs tabular-nums">{formatNumber(item[field])}</span>
                  )}
                </TableCell>
              ))}
              <TableCell className="py-1.5 text-right">
                <span className="text-xs tabular-nums font-semibold text-foreground">
                  {formatINR(item.acceptedQty * item.ratePerUnit)}
                </span>
              </TableCell>
              {editable && (
                <TableCell className="py-1.5">
                  <Input
                    className="h-7 text-xs"
                    placeholder="—"
                    value={item.defectNotes}
                    onChange={(e) => updateItem(idx, 'defectNotes', e.target.value)}
                  />
                </TableCell>
              )}
              {editable && (
                <TableCell className="py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-red-400"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-lg">📦</span>
            Goods Received Note (GRN)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track fabric receipts against purchase orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={exportData}
            filename="grn-notes"
            label="Export"
          />
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New GRN
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <PackageCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total GRNs</p>
                <p className="text-lg font-bold tabular-nums">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <Ruler className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Received</p>
                <p className="text-lg font-bold tabular-nums">{formatNumber(summary.totalReceived)} <span className="text-xs font-normal text-muted-foreground">m</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Accepted Rate</p>
                <p className="text-lg font-bold tabular-nums">{acceptanceRate}<span className="text-xs font-normal text-muted-foreground">%</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
                <p className="text-lg font-bold tabular-nums">{pendingApproval}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab}
              {(statusCounts[tab] ?? 0) > 0 && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    activeTab === tab ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {statusCounts[tab] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search GRN no, supplier, fabric..."
            className="h-8 pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ─── GRN Table ───────────────────────────────────────────────── */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">GRN No</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">PO Ref</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Supplier</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Received</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right hidden lg:table-cell">Accepted</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right hidden xl:table-cell">Rejected</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j} className="py-3">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : grns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <PackageCheck className="h-10 w-10 opacity-30" />
                      <p className="text-sm">No GRN notes found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                grns.map((grn) => {
                  const cfg = STATUS_CONFIG[grn.status] || STATUS_CONFIG.Draft
                  return (
                    <TableRow
                      key={grn.id}
                      className="border-border/30 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDetail(grn)}
                    >
                      <TableCell className="py-3">
                        <span className="text-xs font-semibold text-primary">{grn.grnNo}</span>
                      </TableCell>
                      <TableCell className="py-3 hidden md:table-cell">
                        <span className="text-xs text-foreground/70">
                          {grn.purchaseOrder?.poNumber || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs font-medium text-foreground">{grn.supplierName}</span>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {formatDate(grn.receivedDate)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-foreground/80">
                        {formatNumber(grn.totalReceivedQty)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-emerald-400 hidden lg:table-cell">
                        {formatNumber(grn.acceptedQty)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-red-400 hidden xl:table-cell">
                        {formatNumber(grn.rejectedQty)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${cfg.className}`}>
                          {cfg.icon}
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openDetail(grn)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {grn.status === 'Draft' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-400"
                                onClick={() => openEdit(grn)}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-400"
                                onClick={() => handleDelete(grn.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ─────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs tabular-nums px-2">{page} / {totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Create Dialog ───────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm() }}>
        <DialogContent className="glass-card border-border/50 sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              New Goods Received Note
            </DialogTitle>
            <DialogDescription className="text-xs">
              Record incoming fabric against a purchase order or as a direct receipt. Fabric stock updates automatically on approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Top section: PO + Supplier + Date in a 3-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* PO Reference */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">PO Reference <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.poId} onValueChange={handlePOSelect}>
                  <SelectTrigger className="h-9 text-xs bg-muted/50">
                    <SelectValue placeholder="Select a PO..." />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((po) => (
                      <SelectItem key={po.id} value={po.id} className="text-xs">
                        {po.poNumber} — {(po.supplier?.name) || (po.vendor?.vendorName) || po.supplierName || '—'} — {po.fabricName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.poId && (
                  <p className="text-[10px] text-emerald-500">✓ PO selected — items auto-filled below</p>
                )}
              </div>

              {/* Supplier */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Supplier / Vendor</Label>
                <Select value={form.supplierId} onValueChange={handleSupplierSelect}>
                  <SelectTrigger className="h-9 text-xs bg-muted/50">
                    <SelectValue placeholder="Select supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name} <span className="text-muted-foreground">({s.supplierType})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 text-xs bg-muted/50"
                  placeholder="or type name manually"
                  value={form.supplierName}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplierName: e.target.value }))}
                />
              </div>

              {/* Received Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Received Date</Label>
                <Input
                  type="date"
                  className="h-9 text-xs bg-muted/50"
                  value={form.receivedDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, receivedDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Items section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  Line Items
                  <span className="text-muted-foreground text-[10px]">({items.length} rows)</span>
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px] text-primary border-primary/30"
                  onClick={addItem}
                >
                  <Plus className="h-3 w-3" />
                  Add Item
                </Button>
              </div>
              {renderItemTable(true)}
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground">
                  Total received: <span className="font-medium text-foreground">{items.reduce((s, i) => s + (i.receivedQty || 0), 0)} units</span>
                  {' · '}Accepted: <span className="font-medium text-emerald-500">{items.reduce((s, i) => s + (i.acceptedQty || 0), 0)}</span>
                  {' · '}Rejected: <span className="font-medium text-red-500">{items.reduce((s, i) => s + (i.rejectedQty || 0), 0)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Total Value:{' '}
                  <span className="font-bold text-primary text-sm">{formatINR(totalFormValue)}</span>
                </span>
              </div>
            </div>

            {/* Quality Remarks + Notes in 2-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Quality Remarks</Label>
                <Textarea
                  className="text-xs min-h-[60px] bg-muted/50 resize-none"
                  placeholder="Overall quality observations..."
                  value={form.qualityRemarks}
                  onChange={(e) => setForm((prev) => ({ ...prev, qualityRemarks: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Notes</Label>
                <Textarea
                  className="text-xs min-h-[60px] bg-muted/50 resize-none"
                  placeholder="Additional notes..."
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/30">
            <Button variant="outline" size="sm" onClick={() => { setCreateOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting} className="gap-1.5">
              {submitting ? 'Creating...' : 'Create GRN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setSelectedGRN(null) }}>
        <DialogContent className="glass-card border-border/50 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Edit GRN — {selectedGRN?.grnNo}</DialogTitle>
            <DialogDescription className="text-xs">
              Modify GRN details and item quantities.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Supplier */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Supplier Name</Label>
              <Input
                className="h-8 text-xs"
                value={form.supplierName}
                onChange={(e) => setForm((prev) => ({ ...prev, supplierName: e.target.value }))}
              />
            </div>

            {/* Received Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Received Date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={form.receivedDate}
                onChange={(e) => setForm((prev) => ({ ...prev, receivedDate: e.target.value }))}
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((prev) => ({ ...prev, status: v }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft" className="text-xs">Draft</SelectItem>
                  <SelectItem value="Inspected" className="text-xs">Inspected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Items</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 text-[11px]"
                  onClick={addItem}
                >
                  <Plus className="h-3 w-3" />
                  Add Item
                </Button>
              </div>
              {renderItemTable(true)}
              <div className="flex justify-end">
                <span className="text-xs text-muted-foreground">
                  Total Value:{' '}
                  <span className="font-semibold text-foreground">{formatINR(totalFormValue)}</span>
                </span>
              </div>
            </div>

            {/* Quality Remarks */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Quality Remarks</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Quality observations..."
                value={form.qualityRemarks}
                onChange={(e) => setForm((prev) => ({ ...prev, qualityRemarks: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Additional notes..."
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setEditOpen(false); setSelectedGRN(null) }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEdit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Sheet ────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedGRN(null) }}>
        <SheetContent className="glass-card border-border/50 w-full sm:max-w-lg overflow-y-auto">
          {selectedGRN && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base flex items-center gap-2">
                  {selectedGRN.grnNo}
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 ${(STATUS_CONFIG[selectedGRN.status] || STATUS_CONFIG.Draft).className}`}
                  >
                    {(STATUS_CONFIG[selectedGRN.status] || STATUS_CONFIG.Draft).icon}
                    {selectedGRN.status}
                  </Badge>
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {selectedGRN.supplierName}
                  {selectedGRN.purchaseOrder && (
                    <span className="text-muted-foreground">
                      {' '}· PO: {selectedGRN.purchaseOrder.poNumber}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2">
                  <Card className="glass-card border-border/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Received</p>
                    <p className="text-sm font-bold tabular-nums text-blue-400">
                      {formatNumber(selectedGRN.totalReceivedQty)} m
                    </p>
                  </Card>
                  <Card className="glass-card border-border/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Accepted</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-400">
                      {formatNumber(selectedGRN.acceptedQty)} m
                    </p>
                  </Card>
                  <Card className="glass-card border-border/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Rejected</p>
                    <p className="text-sm font-bold tabular-nums text-red-400">
                      {formatNumber(selectedGRN.rejectedQty)} m
                    </p>
                  </Card>
                </div>

                {/* Info rows */}
                <div className="space-y-2">
                  <InfoRow label="Received Date" value={formatDate(selectedGRN.receivedDate)} />
                  <InfoRow label="Supplier" value={selectedGRN.supplierName} />
                  {selectedGRN.purchaseOrder && (
                    <InfoRow label="PO Reference" value={`${selectedGRN.purchaseOrder.poNumber} — ${selectedGRN.purchaseOrder.fabricName}`} />
                  )}
                  {selectedGRN.qualityRemarks && (
                    <InfoRow label="Quality Remarks" value={selectedGRN.qualityRemarks} />
                  )}
                  {selectedGRN.notes && (
                    <InfoRow label="Notes" value={selectedGRN.notes} />
                  )}
                </div>

                {/* Items table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground">Items ({selectedGRN.grnItems.length})</h4>
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50 hover:bg-transparent">
                          <TableHead className="text-[10px] font-semibold text-muted-foreground">Fabric</TableHead>
                          <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Ordered</TableHead>
                          <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Received</TableHead>
                          <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Accepted</TableHead>
                          <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Rejected</TableHead>
                          <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedGRN.grnItems.map((item, idx) => (
                          <TableRow key={item.id || idx} className="border-border/30">
                            <TableCell className="py-2">
                              <span className="text-xs font-medium">{item.fabricName}</span>
                            </TableCell>
                            <TableCell className="py-2 text-xs text-right tabular-nums">{formatNumber(item.orderedQty)}</TableCell>
                            <TableCell className="py-2 text-xs text-right tabular-nums">{formatNumber(item.receivedQty)}</TableCell>
                            <TableCell className="py-2 text-xs text-right tabular-nums text-emerald-400">{formatNumber(item.acceptedQty)}</TableCell>
                            <TableCell className="py-2 text-xs text-right tabular-nums text-red-400">{formatNumber(item.rejectedQty)}</TableCell>
                            <TableCell className="py-2 text-xs text-right tabular-nums font-semibold">{formatINR(item.totalValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end">
                    <span className="text-xs text-muted-foreground">
                      Total Value:{' '}
                      <span className="font-bold text-foreground">
                        {formatINR(selectedGRN.grnItems.reduce((s, i) => s + i.totalValue, 0))}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Defect notes */}
                {selectedGRN.grnItems.some((i) => i.defectNotes) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground">Defect Notes</h4>
                    <div className="space-y-1">
                      {selectedGRN.grnItems
                        .filter((i) => i.defectNotes)
                        .map((item, idx) => (
                          <div key={idx} className="rounded-lg bg-red-500/5 border border-red-500/10 p-2">
                            <span className="text-[10px] font-medium text-foreground">{item.fabricName}</span>
                            <p className="text-[11px] text-muted-foreground">{item.defectNotes}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                  {selectedGRN.status === 'Draft' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => { setDetailOpen(false); openEdit(selectedGRN) }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        onClick={() => handleStatusChange(selectedGRN.id, 'Inspected')}
                        disabled={actionLoading}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Mark Inspected
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleStatusChange(selectedGRN.id, 'Approved')}
                        disabled={actionLoading}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => handleStatusChange(selectedGRN.id, 'Rejected')}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(selectedGRN.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                  {selectedGRN.status === 'Inspected' && (
                    <>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleStatusChange(selectedGRN.id, 'Approved')}
                        disabled={actionLoading}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => handleStatusChange(selectedGRN.id, 'Rejected')}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  )}
                  {selectedGRN.status === 'Approved' && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Fabric stock has been updated with accepted quantities.
                    </p>
                  )}
                  {selectedGRN.status === 'Rejected' && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      This GRN has been rejected. No stock was updated.
                    </p>
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

// ─── Info Row helper ────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] text-muted-foreground min-w-[100px] shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}