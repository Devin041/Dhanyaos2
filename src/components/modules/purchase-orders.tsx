'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
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
  FileText,
  TrendingUp,
  PackageCheck,
  IndianRupee,
  Eye,
  CheckCircle2,
  Truck,
  Package,
  Ban,
  ChevronLeft,
  ChevronRight,
  Star,
  CalendarDays,
  CreditCard,
  Trash2,
  Shirt,
  Layers,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { POLineItemBuilder, emptyItem, type LineItem } from '@/components/ui/po-line-item-builder'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: string
  name: string
  supplierType: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  paymentTerms: number
  rating: number
  status: string
}

// Merged counterparty option — either a Supplier OR a Vendor.
// We tag each with `kind` so the backend knows which FK to populate.
interface CounterpartyOption {
  id: string
  label: string          // display name
  kind: 'Supplier' | 'Vendor'
  type: string           // supplierType or vendorType
  sub: string            // contact person or extra info
}

interface PurchaseOrder {
  id: string
  poNumber: string
  poType?: string         // universal PO classification
  supplierId: string | null
  supplier: { name: string; supplierType: string; rating: number; paymentTerms: number } | null
  // Vendor linkage (nullable — vendor-only POs have supplierId = null)
  vendorId: string | null
  vendor: { vendorName: string; vendorType: string; contactPerson: string | null; phone: string | null; paymentTerms: number } | null
  fabricName: string
  quantity: number
  unit: string
  ratePerUnit: number
  totalAmount: number
  expectedDelivery: string | null
  status: string
  paymentStatus: string
  paidAmount: number
  receivedQty: number
  createdAt: string
  updatedAt: string
}

// PODetail is the same shape as PurchaseOrder — kept as a type alias for
// semantic clarity in the detail panel (both supplier and vendor are nullable).
type PODetail = PurchaseOrder

// Helper: returns the "counterparty" for a PO — supplier if set, else vendor.
// Use this everywhere instead of po.supplier.* to avoid "Cannot read properties of null" crashes.
function getCounterparty(po: PurchaseOrder) {
  if (po.supplier) {
    return {
      kind: 'Supplier' as const,
      name: po.supplier.name,
      type: po.supplier.supplierType,
      rating: po.supplier.rating,
      paymentTerms: po.supplier.paymentTerms,
      contactPerson: (po.supplier as any).contactPerson || null,
      phone: (po.supplier as any).phone || null,
      email: (po.supplier as any).email || null,
    }
  }
  if (po.vendor) {
    return {
      kind: 'Vendor' as const,
      name: po.vendor.vendorName,
      type: po.vendor.vendorType,
      rating: null,
      paymentTerms: po.vendor.paymentTerms,
      contactPerson: po.vendor.contactPerson,
      phone: po.vendor.phone,
      email: null,
    }
  }
  // Neither set — shouldn't happen but guard anyway
  return {
    kind: 'Unknown' as const,
    name: '— (no counterparty)',
    type: '—',
    rating: null,
    paymentTerms: 0,
    contactPerson: null,
    phone: null,
    email: null,
  }
}

interface Summary {
  totalPOValue: number
  pendingAmount: number
  receivedThisMonth: number
  unpaidAmount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  Pending: {
    label: 'Pending',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25',
    icon: <FileText className="h-3 w-3" />,
  },
  Approved: {
    label: 'Approved',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/25 hover:bg-blue-500/25',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  Ordered: {
    label: 'Ordered',
    className: 'bg-purple-500/15 text-purple-400 border-purple-500/25 hover:bg-purple-500/25',
    icon: <Truck className="h-3 w-3" />,
  },
  Received: {
    label: 'Received',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25',
    icon: <PackageCheck className="h-3 w-3" />,
  },
  Cancelled: {
    label: 'Cancelled',
    className: 'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25',
    icon: <Ban className="h-3 w-3" />,
  },
}

const PAYMENT_CONFIG: Record<string, { label: string; className: string }> = {
  Paid: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  Partial: { label: 'Partial', className: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  Unpaid: { label: 'Unpaid', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
}

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Ordered', 'Received', 'Cancelled']

const UNITS = ['meters', 'kg', 'pieces', 'rolls']

const STATUS_FLOW = ['Pending', 'Approved', 'Ordered', 'Received']

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchaseOrders() {
  // Data state
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [summary, setSummary] = useState<Summary>({ totalPOValue: 0, pendingAmount: 0, receivedThisMonth: 0, unpaidAmount: 0 })
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
  const [selectedPO, setSelectedPO] = useState<PODetail | null>(null)

  // Create form state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  // Merged list of Suppliers + Vendors for the counterparty dropdown.
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([])
  const [form, setForm] = useState({
    supplierId: '',
    fabricName: '',
    quantity: '',
    unit: 'meters',
    ratePerUnit: '',
    expectedDelivery: '',
    notes: '',
  })
  const [creating, setCreating] = useState(false)

  // Product linkage state (Sprint 1)
  const [samples, setSamples] = useState<Array<{ id: string; styleNo: string; styleName: string; photoCount: number }>>([])
  const [selectedStyleNo, setSelectedStyleNo] = useState('')
  const [selectedStyleName, setSelectedStyleName] = useState('')
  const [selectedProductImage, setSelectedProductImage] = useState<string | null>(null)
  const [useMultiFabric, setUseMultiFabric] = useState(false)
  const [fabricItems, setFabricItems] = useState<Array<{ fabricName: string; color: string; quantity: string; unit: string; ratePerUnit: string }>>([
    { fabricName: '', color: '', quantity: '', unit: 'meters', ratePerUnit: '' },
  ])

  // ── Universal PO mode (new) ────────────────────────────────────────────────
  // When useUniversalPO is true, the form uses the POLineItemBuilder which
  // supports mixed item types (Fabric + Goods + Accessory + Service) in one PO.
  const [useUniversalPO, setUseUniversalPO] = useState(true)
  const [universalItems, setUniversalItems] = useState<Array<any>>([])

  // ── PO-level container fields (GST, broker, discount) ──
  const [newPoType, setNewPoType] = useState('GENERAL')
  const [newGstType, setNewGstType] = useState<'IntraState' | 'InterState'>('IntraState')
  const [newGstPercent, setNewGstPercent] = useState('18')
  const [newBrokerName, setNewBrokerName] = useState('')
  const [newBrokerCommission, setNewBrokerCommission] = useState('0')
  const [newDiscount, setNewDiscount] = useState('0')
  // Payment terms (NEW — auto-copied from supplier when counterparty selected)
  const [newPaymentTerms, setNewPaymentTerms] = useState('30')

  // Action state
  const [actionLoading, setActionLoading] = useState(false)
  const [receiptQty, setReceiptQty] = useState('')
  const [paymentAmt, setPaymentAmt] = useState('')

  // ─── Fetch POs ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== 'All') params.set('status', activeTab)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/purchase-orders?${params}`)
      const data = await res.json()
      if (res.ok) {
        setOrders(data.orders)
        setTotalCount(data.total)
        setStatusCounts(data.statusCounts)
        if (data.summary) setSummary(data.summary)
      }
    } catch {
      toast.error('Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, page])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [activeTab, search])

  // Load suppliers AND vendors for create form — POs can be raised against
  // either a Supplier (raw materials) or a Vendor (job worker / outsourcer).
  // We fetch ALL of them directly from their respective APIs (NOT derived
  // from existing POs, which would miss newly-added counterparties).
  useEffect(() => {
    async function loadCounterparties() {
      const merged: CounterpartyOption[] = []

      // Source 1: All Suppliers
      try {
        const res = await fetch('/api/suppliers?limit=500')
        if (res.ok) {
          const data = await res.json()
          const arr = data.suppliers || data || []
          for (const s of arr) {
            merged.push({
              id: s.id,
              label: s.name,
              kind: 'Supplier',
              type: s.supplierType || '—',
              sub: s.contactPerson || s.phone || '',
            })
          }
        }
      } catch { /* ignore */ }

      // Source 2: All Vendors
      try {
        const res = await fetch('/api/vendors?limit=500')
        if (res.ok) {
          const data = await res.json()
          const arr = data.vendors || data || []
          for (const v of arr) {
            merged.push({
              id: v.id,
              label: v.vendorName,
              kind: 'Vendor',
              type: v.vendorType || v.specialization || '—',
              sub: v.contactPerson || v.phone || '',
            })
          }
        }
      } catch { /* ignore */ }

      // Sort alphabetically by name
      merged.sort((a, b) => (a.label || '').localeCompare(b.label || ''))
      setCounterparties(merged)

      // Also keep the legacy suppliers state for backward compat in detail view
      try {
        const res = await fetch('/api/suppliers?limit=500')
        if (res.ok) {
          const data = await res.json()
          const arr = data.suppliers || data || []
          setSuppliers(arr.map((s: any) => ({
            id: s.id,
            name: s.name,
            supplierType: s.supplierType || 'Fabric',
            contactPerson: s.contactPerson || null,
            phone: s.phone || null,
            email: s.email || null,
            paymentTerms: s.paymentTerms || 15,
            rating: s.rating || 3,
            status: s.status || 'Active',
          })))
        }
      } catch { /* ignore */ }
    }
    loadCounterparties()
  }, [])

  // Load samples for product selector (Sprint 1)
  // IMPORTANT: same fix as sales-orders — merge Sample Catalog AND Cost Sheets
  // so newly costed products also appear in the dropdown. Otherwise the user
  // can't link a PO to a product that has a costing but no Sample Catalog entry.
  useEffect(() => {
    async function loadSamples() {
      const merged = new Map<string, { id: string; styleNo: string; styleName: string; photoCount: number }>()

      // Source 1: Sample Catalog
      try {
        const res = await fetch('/api/samples')
        const data = await res.json()
        const arr = Array.isArray(data) ? data : (data.samples || [])
        for (const s of arr) {
          if (s.styleNo) {
            merged.set(s.styleNo, {
              id: s.id,
              styleNo: s.styleNo,
              styleName: s.styleName || s.styleNo,
              photoCount: s.photoCount || 0,
            })
          }
        }
      } catch { /* ignore */ }

      // Source 2: Cost Sheets
      try {
        const res = await fetch('/api/cost-sheets?limit=500')
        const data = await res.json()
        const arr = data.costSheets || data || []
        for (const c of arr) {
          if (c.styleNo && !merged.has(c.styleNo)) {
            merged.set(c.styleNo, {
              id: c.id,
              styleNo: c.styleNo,
              styleName: c.styleName || c.styleNo,
              photoCount: 0,
            })
          }
        }
      } catch { /* ignore */ }

      // Sort alphabetically with numeric-aware comparison
      const list = Array.from(merged.values()).sort((a, b) =>
        (a.styleNo || '').localeCompare(b.styleNo || '', undefined, { numeric: true, sensitivity: 'base' })
      )
      setSamples(list)
    }
    loadSamples()
  }, [])

  // Handle product selection (Sprint 1)
  const handleProductSelect = async (styleNo: string) => {
    setSelectedStyleNo(styleNo)
    const sample = samples.find(s => s.styleNo === styleNo)
    if (sample) {
      setSelectedStyleName(sample.styleName)
      // Fetch product image
      try {
        const res = await fetch(`/api/style-image?styleNo=${styleNo}`)
        const data = await res.json()
        if (data.imageUrl) setSelectedProductImage(data.imageUrl)
        else setSelectedProductImage(null)
      } catch {
        setSelectedProductImage(null)
      }
    }
  }

  // Add/remove fabric item rows (Sprint 1)
  const addFabricRow = () => {
    setFabricItems([...fabricItems, { fabricName: '', color: '', quantity: '', unit: 'meters', ratePerUnit: '' }])
  }
  const removeFabricRow = (idx: number) => {
    setFabricItems(fabricItems.filter((_, i) => i !== idx))
  }
  const updateFabricRow = (idx: number, field: string, value: string) => {
    setFabricItems(fabricItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }
  const multiFabricTotal = fabricItems.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.ratePerUnit) || 0), 0)

  // ─── Create PO ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    // Validate based on mode — must pick a counterparty (supplier OR vendor)
    if (!form.supplierId) {
      toast.error('Please select a supplier or vendor')
      return
    }

    // Determine whether the selected counterparty is a Supplier or a Vendor.
    const selected = counterparties.find(c => c.id === form.supplierId)
    const isVendor = selected?.kind === 'Vendor'

    // ── Universal PO mode ──
    if (useUniversalPO) {
      const validItems = universalItems.filter(it => it.name && it.quantity > 0 && it.ratePerUnit > 0)
      if (validItems.length === 0) {
        toast.error('Add at least one line item with name, qty > 0, and rate > 0')
        return
      }
      setCreating(true)
      try {
        const payload: any = {
          ...(isVendor ? { vendorId: form.supplierId } : { supplierId: form.supplierId }),
          poType: newPoType,
          expectedDelivery: form.expectedDelivery || undefined,
          notes: form.notes || undefined,
          // Universal line items
          items: validItems.map(it => ({
            itemType: it.itemType,
            styleNo: it.styleNo || undefined,
            styleName: it.styleName || undefined,
            costSheetId: it.costSheetId || undefined,
            name: it.name,
            description: it.description || undefined,
            color: it.color || undefined,
            size: it.size || undefined,
            quantity: it.quantity,
            unit: it.unit,
            ratePerUnit: it.ratePerUnit,
          })),
          // GST + broker + discount
          gstType: newGstType,
          gstPercent: parseFloat(newGstPercent) || 0,
          brokerName: newBrokerName || undefined,
          brokerCommissionPercent: parseFloat(newBrokerCommission) || 0,
          discountPercent: parseFloat(newDiscount) || 0,
          // Payment terms (NEW — auto-calculated due date on backend)
          paymentTerms: parseInt(newPaymentTerms) || 30,
        }
        const res = await fetch('/api/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success(`Purchase Order ${data.poNumber} created successfully`)
          setCreateOpen(false)
          // Reset form
          setForm({ supplierId: '', fabricName: '', quantity: '', unit: 'meters', ratePerUnit: '', expectedDelivery: '', notes: '' })
          setUniversalItems([])
          setNewPoType('GENERAL')
          setNewGstType('IntraState'); setNewGstPercent('18')
          setNewBrokerName(''); setNewBrokerCommission('0'); setNewDiscount('0')
          setNewPaymentTerms('30')
          fetchOrders()
        } else {
          toast.error(data.error || 'Failed to create purchase order')
        }
      } catch {
        toast.error('Failed to create purchase order')
      } finally {
        setCreating(false)
      }
      return
    }

    // ── Legacy mode (single-fabric or multi-fabric) ──
    if (useMultiFabric) {
      const validItems = fabricItems.filter(it => it.fabricName && it.quantity && it.ratePerUnit)
      if (validItems.length === 0) {
        toast.error('Please add at least one fabric item with name, quantity, and rate')
        return
      }
    } else {
      if (!form.fabricName || !form.quantity || !form.ratePerUnit) {
        toast.error('Please fill in all required fields')
        return
      }
    }

    setCreating(true)
    try {
      const payload: any = {
        ...(isVendor ? { vendorId: form.supplierId } : { supplierId: form.supplierId }),
        expectedDelivery: form.expectedDelivery || undefined,
        notes: form.notes || undefined,
        styleNo: selectedStyleNo || undefined,
        styleName: selectedStyleName || undefined,
      }

      if (useMultiFabric) {
        payload.items = fabricItems
          .filter(it => it.fabricName && it.quantity && it.ratePerUnit)
          .map(it => ({
            fabricName: it.fabricName,
            color: it.color || undefined,
            quantity: parseFloat(it.quantity),
            unit: it.unit,
            ratePerUnit: parseFloat(it.ratePerUnit),
          }))
      } else {
        payload.fabricName = form.fabricName
        payload.quantity = parseFloat(form.quantity)
        payload.unit = form.unit
        payload.ratePerUnit = parseFloat(form.ratePerUnit)
      }

      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Purchase Order ${data.poNumber} created successfully`)
        setCreateOpen(false)
        setForm({ supplierId: '', fabricName: '', quantity: '', unit: 'meters', ratePerUnit: '', expectedDelivery: '', notes: '' })
        setSelectedStyleNo('')
        setSelectedStyleName('')
        setSelectedProductImage(null)
        setUseMultiFabric(false)
        setFabricItems([{ fabricName: '', color: '', quantity: '', unit: 'meters', ratePerUnit: '' }])
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to create purchase order')
      }
    } catch {
      toast.error('Failed to create purchase order')
    } finally {
      setCreating(false)
    }
  }

  // ─── View PO Detail ─────────────────────────────────────────────────────

  const openDetail = async (po: PurchaseOrder) => {
    setSelectedPO(null)
    setDetailOpen(true)
    setReceiptQty('')
    setPaymentAmt('')
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`)
      const data = await res.json()
      if (res.ok) {
        setSelectedPO(data)
      } else {
        toast.error('Failed to load PO details')
      }
    } catch {
      toast.error('Failed to load PO details')
    }
  }

  // ─── Status Actions ─────────────────────────────────────────────────────

  const handleStatusUpdate = async (poId: string, newStatus: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`PO status updated to ${newStatus}`)
        // Refresh detail and list
        if (selectedPO?.id === poId) {
          setSelectedPO(data)
        }
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to update status')
      }
    } catch {
      toast.error('Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const handleGoodsReceipt = async () => {
    if (!selectedPO || !receiptQty) return
    const qty = parseFloat(receiptQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedQty: qty, status: 'Received' }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Goods receipt recorded: ${qty} ${selectedPO.unit}`)
        setSelectedPO(data)
        setReceiptQty('')
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to record receipt')
      }
    } catch {
      toast.error('Failed to record receipt')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!selectedPO || !paymentAmt) return
    const amt = parseFloat(paymentAmt)
    if (isNaN(amt) || amt < 0) {
      toast.error('Please enter a valid amount')
      return
    }

    const pending = selectedPO.totalAmount - selectedPO.paidAmount
    let payStatus: string
    if (amt >= pending) {
      payStatus = 'Paid'
    } else {
      payStatus = 'Partial'
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidAmount: selectedPO.paidAmount + amt,
          paymentStatus: payStatus,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Payment of ${formatINR(amt)} recorded`)
        setSelectedPO(data)
        setPaymentAmt('')
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to record payment')
      }
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Computed ───────────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / limit)
  const autoTotal = form.quantity && form.ratePerUnit ? parseFloat(form.quantity) * parseFloat(form.ratePerUnit) : 0

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total PO Value"
          value={formatINR(summary.totalPOValue)}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          accent="border-l-primary/60"
        />
        <SummaryCard
          title="Pending POs"
          value={formatINR(summary.pendingAmount)}
          subtitle={`${statusCounts.Pending || 0} orders`}
          icon={<FileText className="h-4 w-4 text-amber-400" />}
          accent="border-l-amber-500/60"
        />
        <SummaryCard
          title="Received This Month"
          value={formatINR(summary.receivedThisMonth)}
          icon={<PackageCheck className="h-4 w-4 text-emerald-400" />}
          accent="border-l-emerald-500/60"
        />
        <SummaryCard
          title="Unpaid Amount"
          value={formatINR(summary.unpaidAmount)}
          icon={<IndianRupee className="h-4 w-4 text-red-400" />}
          accent="border-l-red-500/60"
        />
      </div>

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">
            Purchase Orders
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totalCount})
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search PO, fabric, supplier..."
              className="h-9 pl-9 bg-muted/50 border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton module="purchase-orders" />
            <Button
              className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New PO</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Status Filter Tabs ───────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === tab
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
            }`}
          >
            {tab}
            {(statusCounts[tab] ?? 0) > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  activeTab === tab ? 'bg-primary/25 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {statusCounts[tab] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── PO Table ─────────────────────────────────────────────────── */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">PO No</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Supplier</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Fabric</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Unit</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right hidden lg:table-cell">Rate</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden xl:table-cell">Delivery</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Payment</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j} className="py-3">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-10 w-10 opacity-30" />
                      <p className="text-sm">No purchase orders found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((po) => {
                  const statusCfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.Pending
                  const payCfg = PAYMENT_CONFIG[po.paymentStatus] || PAYMENT_CONFIG.Unpaid
                  return (
                    <TableRow
                      key={po.id}
                      className="border-border/30 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDetail(po)}
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-primary">{po.poNumber}</span>
                          {po.poType && po.poType !== 'GENERAL' && (
                            <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                              po.poType === 'FABRIC' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                              po.poType === 'GOODS' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                              po.poType === 'ACCESSORY' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' :
                              po.poType === 'SERVICE' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400' :
                              po.poType === 'MIXED' ? 'bg-gradient-to-r from-amber-500/20 to-violet-500/20 text-foreground' :
                              'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                            }`}>
                              {po.poType}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-foreground">
                            {(() => {
                              const cp = getCounterparty(po)
                              return (
                                <>
                                  {cp.kind !== 'Unknown' && (
                                    <span className={`text-[8px] px-1 py-0.5 rounded font-medium mr-1.5 ${
                                      cp.kind === 'Supplier'
                                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                        : 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                                    }`}>
                                      {cp.kind === 'Supplier' ? 'SUP' : 'VEN'}
                                    </span>
                                  )}
                                  {cp.name}
                                </>
                              )
                            })()}
                          </span>
                          {(() => {
                            const cp = getCounterparty(po)
                            return cp.rating !== null ? (
                              <div className="flex items-center gap-1">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                <span className="text-[10px] text-muted-foreground">{cp.rating}/5</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{cp.type}</span>
                            )
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-foreground/80">{po.fabricName}</TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-foreground/80">
                        {po.quantity}
                        <span className="text-muted-foreground md:hidden"> {po.unit}</span>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground hidden md:table-cell">{po.unit}</TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums text-foreground/80 hidden lg:table-cell">
                        {formatINR(po.ratePerUnit)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-right tabular-nums font-semibold text-foreground">
                        {formatINR(po.totalAmount)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground hidden xl:table-cell">
                        {formatDate(po.expectedDelivery)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.className}`}>
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 hidden sm:table-cell">
                        <Badge variant="outline" className={`text-[10px] ${payCfg.className}`}>
                          {payCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-primary/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            openDetail(po)
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ──────────────────────────────────────────────── */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/50"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className={`h-7 w-7 text-xs ${page === pageNum ? 'bg-primary/20 text-primary border-primary/30' : 'border-border/50'}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Create PO Dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Purchase Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Add a new purchase order to track fabric procurement
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Product Selector (Sprint 1 — link PO to product) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
                <Shirt className="h-3 w-3" />
                Product / Style (for tracking)
              </Label>
              <Select value={selectedStyleNo} onValueChange={handleProductSelect}>
                <SelectTrigger className="bg-muted/50 border-border h-9">
                  <SelectValue placeholder="Select product (optional but recommended)" />
                </SelectTrigger>
                <SelectContent>
                  {samples.map((s) => (
                    <SelectItem key={s.id} value={s.styleNo}>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{s.styleNo}</span>
                        <span className="text-muted-foreground text-[10px]">{s.styleName}</span>
                        {s.photoCount > 0 && <span className="text-primary text-[10px]">📷</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Product image preview */}
              {selectedStyleNo && (
                <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                  {selectedProductImage ? (
                    <img src={selectedProductImage} alt={selectedStyleName} className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                      <Shirt className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium">{selectedStyleNo}</p>
                    <p className="text-[10px] text-muted-foreground">{selectedStyleName}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-auto"
                    onClick={() => { setSelectedStyleNo(''); setSelectedStyleName(''); setSelectedProductImage(null) }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Counterparty — Supplier OR Vendor (merged) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Supplier / Vendor *</Label>
              <Select value={form.supplierId} onValueChange={(v) => {
                setForm({ ...form, supplierId: v })
                // Auto-fill payment terms from supplier/vendor when selected
                const cp = counterparties.find(c => c.id === v)
                if (cp) {
                  // Suppliers carry paymentTerms on Supplier table; Vendors on Vendor table.
                  // For simplicity we default to 30 if not found — user can edit.
                  setNewPaymentTerms(cp.kind === 'Supplier' ? '15' : '30')
                }
              }}>
                <SelectTrigger className="bg-muted/50 border-border h-9">
                  <SelectValue placeholder="Select supplier or vendor..." />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {counterparties.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No suppliers/vendors yet. Add one from the Suppliers or Vendors module.
                    </div>
                  )}
                  {counterparties.map((c) => (
                    <SelectItem key={`${c.kind}-${c.id}`} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                          c.kind === 'Supplier'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                        }`}>
                          {c.kind === 'Supplier' ? 'SUP' : 'VEN'}
                        </span>
                        <span className="font-medium">{c.label}</span>
                        <span className="text-muted-foreground text-[10px]">({c.type})</span>
                        {c.sub && (
                          <span className="text-muted-foreground/70 text-[10px]">· {c.sub}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Includes both Suppliers (raw materials) and Vendors (job workers / outsourcers).
                Tagged SUP / VEN for clarity.
              </p>
            </div>

            {/* Mode Toggle: Universal PO (default) vs Legacy fabric-only modes */}
            <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${useUniversalPO ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { setUseUniversalPO(true); setUseMultiFabric(false) }}
              >
                ✦ Universal PO
              </button>
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${!useUniversalPO && !useMultiFabric ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { setUseUniversalPO(false); setUseMultiFabric(false) }}
              >
                Single Fabric
              </button>
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${!useUniversalPO && useMultiFabric ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { setUseUniversalPO(false); setUseMultiFabric(true) }}
              >
                Multi-Fabric
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-1">
              {useUniversalPO
                ? '✦ Universal mode — add Fabric, Finished Goods, Accessories, Services, or any mix in one PO.'
                : 'Legacy fabric-only mode (kept for backward compat).'}
            </p>

            {/* ─── Universal PO mode (line items + GST + broker) ─── */}
            {useUniversalPO && (
              <div className="space-y-3">
                <POLineItemBuilder
                  items={universalItems}
                  onChange={setUniversalItems}
                  catalogProducts={samples}
                />

                {/* GST + Broker section */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">PO Type</Label>
                    <Select value={newPoType} onValueChange={setNewPoType}>
                      <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GENERAL">General</SelectItem>
                        <SelectItem value="FABRIC">Fabric</SelectItem>
                        <SelectItem value="GOODS">Finished Goods</SelectItem>
                        <SelectItem value="ACCESSORY">Accessory</SelectItem>
                        <SelectItem value="SERVICE">Service</SelectItem>
                        <SelectItem value="MIXED">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">GST Type</Label>
                    <Select value={newGstType} onValueChange={(v) => setNewGstType(v as 'IntraState' | 'InterState')}>
                      <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IntraState">IntraState (CGST+SGST)</SelectItem>
                        <SelectItem value="InterState">InterState (IGST)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">GST %</Label>
                    <Input
                      type="number"
                      value={newGstPercent}
                      onChange={(e) => setNewGstPercent(e.target.value)}
                      className="h-8 text-xs bg-muted/50"
                      min={0}
                      step={0.5}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Discount %</Label>
                    <Input
                      type="number"
                      value={newDiscount}
                      onChange={(e) => setNewDiscount(e.target.value)}
                      className="h-8 text-xs bg-muted/50"
                      min={0}
                      max={100}
                      step={0.5}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Payment Terms (days)</Label>
                    <Input
                      type="number"
                      value={newPaymentTerms}
                      onChange={(e) => setNewPaymentTerms(e.target.value)}
                      className="h-8 text-xs bg-muted/50"
                      min={0}
                      step={1}
                      placeholder="e.g. 15, 30, 60, 120"
                    />
                    <p className="text-[10px] text-muted-foreground/70">
                      Days to pay (due date = today + terms)
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[10px] text-muted-foreground">Broker Name (optional)</Label>
                    <Input
                      value={newBrokerName}
                      onChange={(e) => setNewBrokerName(e.target.value)}
                      placeholder="—"
                      className="h-8 text-xs bg-muted/50"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[10px] text-muted-foreground">Commission %</Label>
                    <Input
                      type="number"
                      value={newBrokerCommission}
                      onChange={(e) => setNewBrokerCommission(e.target.value)}
                      className="h-8 text-xs bg-muted/50"
                      min={0}
                      max={100}
                      step={0.5}
                    />
                  </div>
                </div>

                {/* Live summary */}
                {(() => {
                  const subtotal = universalItems.reduce((s, it) => s + (it.quantity || 0) * (it.ratePerUnit || 0), 0)
                  const discountAmt = subtotal * (parseFloat(newDiscount) || 0) / 100
                  const taxable = subtotal - discountAmt
                  const gst = taxable * (parseFloat(newGstPercent) || 0) / 100
                  const grand = taxable + gst
                  const commission = grand * (parseFloat(newBrokerCommission) || 0) / 100
                  const net = grand - commission
                  return (
                    <div className="glass-card rounded-lg p-3 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal ({universalItems.length} items)</span><span>₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      {parseFloat(newDiscount) > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Discount ({newDiscount}%)</span><span className="text-destructive">-₹{discountAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>₹{taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">GST {newGstPercent}% ({newGstType})</span><span>₹{gst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between font-semibold border-t border-border/30 pt-1"><span>Grand Total</span><span className="text-primary">₹{grand.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      {commission > 0 && (
                        <>
                          <div className="flex justify-between"><span className="text-muted-foreground">Broker Commission ({newBrokerCommission}%)</span><span className="text-destructive">-₹{commission.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                          <div className="flex justify-between font-semibold"><span>Net Payable</span><span className="text-primary">₹{net.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                        </>
                      )}
                      {/* Payment due date (auto-calculated from today + terms) */}
                      {(() => {
                        const days = parseInt(newPaymentTerms) || 0
                        if (days <= 0) return null
                        const due = new Date()
                        due.setDate(due.getDate() + days)
                        const dueStr = due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        return (
                          <div className="flex justify-between border-t border-border/30 pt-1"><span className="text-muted-foreground">Payment Due ({days} days)</span><span className="text-amber-500 font-medium">{dueStr}</span></div>
                        )
                      })()}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ─── Legacy Single Fabric Mode ─── */}
            {!useUniversalPO && !useMultiFabric && (
              <>
            {/* Fabric Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Fabric Name *</Label>
              <Input
                placeholder="e.g., Banarasi Silk, Chanderi Cotton"
                className="h-9 bg-muted/50 border-border"
                value={form.fabricName}
                onChange={(e) => setForm({ ...form, fabricName: e.target.value })}
              />
            </div>

            {/* Quantity + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  className="h-9 bg-muted/50 border-border"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger className="h-9 bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rate per unit */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Rate per Unit (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="0.00"
                className="h-9 bg-muted/50 border-border"
                value={form.ratePerUnit}
                onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })}
              />
            </div>

            {/* Auto-calculated total */}
            {autoTotal > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-lg font-bold text-primary">{formatINR(autoTotal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {form.quantity} × {formatINR(parseFloat(form.ratePerUnit) || 0)} per {form.unit}
                </p>
              </div>
            )}
            </>
            )}

            {/* ─── Multi-Fabric / Colors Mode ─── */}
            {useMultiFabric && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground/80">Fabric Items (per color)</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addFabricRow}>
                    <Plus className="h-3 w-3" />
                    Add Fabric
                  </Button>
                </div>
                {fabricItems.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">Item {idx + 1}</span>
                      {fabricItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFabricRow(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Fabric name *"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={item.fabricName}
                        onChange={(e) => updateFabricRow(idx, 'fabricName', e.target.value)}
                      />
                      <Input
                        placeholder="Color (e.g. Red)"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={item.color}
                        onChange={(e) => updateFabricRow(idx, 'color', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number"
                        placeholder="Qty *"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={item.quantity}
                        onChange={(e) => updateFabricRow(idx, 'quantity', e.target.value)}
                      />
                      <Select value={item.unit} onValueChange={(v) => updateFabricRow(idx, 'unit', v)}>
                        <SelectTrigger className="h-8 bg-muted/50 border-border text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Rate *"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={item.ratePerUnit}
                        onChange={(e) => updateFabricRow(idx, 'ratePerUnit', e.target.value)}
                      />
                    </div>
                    {item.quantity && item.ratePerUnit && (
                      <p className="text-[10px] text-muted-foreground text-right">
                        Subtotal: {formatINR(parseFloat(item.quantity) * parseFloat(item.ratePerUnit))}
                      </p>
                    )}
                  </div>
                ))}
                {/* Multi-fabric total */}
                {multiFabricTotal > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Total Amount ({fabricItems.filter(it => it.fabricName && it.quantity).length} items)</p>
                    <p className="text-lg font-bold text-primary">{formatINR(multiFabricTotal)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Expected Delivery */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Expected Delivery</Label>
              <Input
                type="date"
                className="h-9 bg-muted/50 border-border"
                value={form.expectedDelivery}
                onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Notes</Label>
              <Textarea
                placeholder="Any additional notes..."
                className="bg-muted/50 border-border resize-none"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PO Detail Sheet ──────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="glass-card border-border/50 w-full sm:max-w-lg overflow-y-auto">
          {selectedPO ? (
            <div className="space-y-6 pt-6">
              <SheetHeader>
                <SheetTitle className="text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {selectedPO.poNumber}
                </SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  Created {formatDate(selectedPO.createdAt)}
                </SheetDescription>
              </SheetHeader>

              {/* Status + Payment badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`gap-1 ${STATUS_CONFIG[selectedPO.status]?.className || ''}`}>
                  {STATUS_CONFIG[selectedPO.status]?.icon}
                  {selectedPO.status}
                </Badge>
                <Badge variant="outline" className={PAYMENT_CONFIG[selectedPO.paymentStatus]?.className || ''}>
                  {selectedPO.paymentStatus}
                </Badge>
              </div>

              {/* PO Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoBlock label="PO Number" value={selectedPO.poNumber} />
                <InfoBlock label="PO Type" value={(selectedPO as any).poType || 'GENERAL'} />
                <InfoBlock label="Created" value={formatDate(selectedPO.createdAt)} />
                <InfoBlock label="Fabric (legacy)" value={selectedPO.fabricName || '—'} />
              </div>

              {/* Universal Line Items */}
              {(selectedPO as any).items && (selectedPO as any).items.length > 0 && (
                <Card className="glass-card border-border/40 p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Layers className="h-3 w-3" /> Line Items ({(selectedPO as any).items.length})
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {(selectedPO as any).items.map((it: any, i: number) => {
                      const typeColor = it.itemType === 'FABRIC' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                                       it.itemType === 'GOODS' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                                       it.itemType === 'ACCESSORY' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' :
                                       it.itemType === 'SERVICE' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400' :
                                       'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                      return (
                        <div key={it.id || i} className="rounded-md border border-border/30 bg-muted/20 p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className={`text-[8px] px-1 py-0.5 rounded font-medium shrink-0 ${typeColor}`}>
                                {it.itemType || 'FABRIC'}
                              </span>
                              <span className="font-medium truncate">
                                {it.name || it.fabricName || '—'}
                              </span>
                              {it.color && <span className="text-muted-foreground text-[10px]">· {it.color}</span>}
                              {it.size && <span className="text-muted-foreground text-[10px]">· {it.size}</span>}
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {it.quantity} {it.unit} × ₹{it.ratePerUnit} = <span className="font-semibold text-foreground">₹{it.totalAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            </span>
                          </div>
                          {it.styleNo && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">Style: {it.styleNo} {it.styleName ? `· ${it.styleName}` : ''}</p>
                          )}
                          {it.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{it.description}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Line totals summary */}
                  <div className="mt-2 pt-2 border-t border-border/30 text-xs space-y-1">
                    {(() => {
                      const items = (selectedPO as any).items || []
                      const byType: Record<string, number> = {}
                      for (const it of items) {
                        const t = it.itemType || 'FABRIC'
                        byType[t] = (byType[t] || 0) + (it.totalAmount || 0)
                      }
                      return Object.entries(byType).map(([type, amt]) => (
                        <div key={type} className="flex justify-between">
                          <span className="text-muted-foreground">{type}</span>
                          <span>₹{amt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                      ))
                    })()}
                  </div>
                </Card>
              )}

              {/* GST / Broker summary if present */}
              {((selectedPO as any).totalGst > 0 || (selectedPO as any).brokerName) && (
                <Card className="glass-card border-border/40 p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">GST & Broker</p>
                  <div className="space-y-1 text-xs">
                    {(selectedPO as any).taxableAmount > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>₹{(selectedPO as any).taxableAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                    )}
                    {(selectedPO as any).totalGst > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">GST {(selectedPO as any).gstPercent}% ({(selectedPO as any).gstType})</span><span>₹{(selectedPO as any).totalGst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                    )}
                    <div className="flex justify-between font-semibold border-t border-border/30 pt-1"><span>Grand Total</span><span className="text-primary">₹{(selectedPO as any).totalAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                    {(selectedPO as any).brokerName && (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Broker</span><span>{(selectedPO as any).brokerName} ({(selectedPO as any).commissionPercent}%)</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Commission</span><span className="text-destructive">-₹{(selectedPO as any).commissionAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between font-semibold"><span>Net Payable</span><span className="text-primary">₹{(selectedPO as any).netAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      </>
                    )}
                  </div>
                </Card>
              )}

              {/* Supplier Details */}
              <Card className="glass-card border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package className="h-3 w-3" /> {getCounterparty(selectedPO).kind === 'Vendor' ? 'Vendor' : getCounterparty(selectedPO).kind === 'Supplier' ? 'Supplier' : 'Counterparty'}
                </p>
                <div className="space-y-1.5">
                  {(() => {
                    const cp = getCounterparty(selectedPO)
                    return (
                      <>
                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          {cp.kind !== 'Unknown' && (
                            <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                              cp.kind === 'Supplier'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                            }`}>
                              {cp.kind === 'Supplier' ? 'SUP' : 'VEN'}
                            </span>
                          )}
                          {cp.name}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span>Type: {cp.type}</span>
                          {cp.rating !== null && (
                            <span className="flex items-center gap-1">
                              Rating: <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {cp.rating}/5
                            </span>
                          )}
                          <span>Terms: {cp.paymentTerms} days</span>
                          {cp.contactPerson && <span>Contact: {cp.contactPerson}</span>}
                          {cp.phone && <span>Phone: {cp.phone}</span>}
                          {cp.email && <span className="col-span-2">Email: {cp.email}</span>}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </Card>

              {/* Quantity Progress */}
              <Card className="glass-card border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <PackageCheck className="h-3 w-3" /> Quantity
                </p>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{selectedPO.receivedQty}</p>
                    <p className="text-xs text-muted-foreground">of {selectedPO.quantity} {selectedPO.unit} ordered</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPO.quantity > 0
                      ? Math.round((selectedPO.receivedQty / selectedPO.quantity) * 100)
                      : 0}
                    % received
                  </p>
                </div>
                <Progress
                  value={selectedPO.quantity > 0 ? (selectedPO.receivedQty / selectedPO.quantity) * 100 : 0}
                  className="h-2 bg-muted/50"
                />
                {selectedPO.expectedDelivery && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    Expected: {formatDate(selectedPO.expectedDelivery)}
                  </div>
                )}
              </Card>

              {/* Amount Breakdown */}
              <Card className="glass-card border-border/40 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" /> Payment
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-semibold text-foreground">{formatINR(selectedPO.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-medium text-emerald-400">{formatINR(selectedPO.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-border/40 pt-2">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-semibold text-red-400">
                      {formatINR(selectedPO.totalAmount - selectedPO.paidAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Rate per {selectedPO.unit}</span>
                    <span>{formatINR(selectedPO.ratePerUnit)}</span>
                  </div>
                </div>
              </Card>

              {/* Status Timeline */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Status Timeline</p>
                <div className="space-y-0">
                  {STATUS_FLOW.map((step, idx) => {
                    const currentIdx = STATUS_FLOW.indexOf(selectedPO.status)
                    const isCompleted = idx < currentIdx
                    const isCurrent = step === selectedPO.status
                    const isCancelled = selectedPO.status === 'Cancelled' && !isCompleted

                    return (
                      <div key={step} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : isCurrent
                                ? 'bg-primary/20 text-primary border border-primary/40'
                                : 'bg-muted/50 text-muted-foreground border border-border/50'
                            }`}
                          >
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          {idx < STATUS_FLOW.length - 1 && (
                            <div
                              className={`w-0.5 h-6 ${
                                isCompleted ? 'bg-emerald-500/30' : 'bg-border/50'
                              }`}
                            />
                          )}
                        </div>
                        <div className="pt-0.5">
                          <p
                            className={`text-xs font-medium ${
                              isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {step}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {selectedPO.status === 'Cancelled' && (
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center text-[10px] shrink-0">
                        ✕
                      </div>
                      <p className="text-xs font-medium text-red-400 pt-0.5">Cancelled</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Actions ────────────────────────────────────────────── */}
              <div className="space-y-3 pt-2 border-t border-border/30">
                <p className="text-xs font-semibold text-muted-foreground">Actions</p>

                {/* Approve */}
                {selectedPO.status === 'Pending' && (
                  <ActionRow
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Approve this purchase order"
                    btnLabel="Approve"
                    btnClass="bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25"
                    loading={actionLoading}
                    onClick={() => handleStatusUpdate(selectedPO.id, 'Approved')}
                  />
                )}

                {/* Mark as Ordered */}
                {selectedPO.status === 'Approved' && (
                  <ActionRow
                    icon={<Truck className="h-4 w-4" />}
                    label="Confirm order has been placed with supplier"
                    btnLabel="Mark Ordered"
                    btnClass="bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25"
                    loading={actionLoading}
                    onClick={() => handleStatusUpdate(selectedPO.id, 'Ordered')}
                  />
                )}

                {/* Record Goods Receipt */}
                {selectedPO.status === 'Ordered' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <PackageCheck className="h-4 w-4" />
                      <span>Record goods receipt</span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Received qty"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={receiptQty}
                        onChange={(e) => setReceiptQty(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                        disabled={actionLoading || !receiptQty}
                        onClick={handleGoodsReceipt}
                      >
                        {actionLoading ? 'Saving...' : 'Receive'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cancel */}
                {(selectedPO.status === 'Pending' || selectedPO.status === 'Approved') && (
                  <ActionRow
                    icon={<Ban className="h-4 w-4 text-red-400" />}
                    label="Cancel this purchase order"
                    btnLabel="Cancel PO"
                    btnClass="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
                    loading={actionLoading}
                    onClick={() => handleStatusUpdate(selectedPO.id, 'Cancelled')}
                  />
                )}

                {/* Record Payment (any non-cancelled PO) */}
                {selectedPO.status !== 'Cancelled' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                      <span>Record payment</span>
                      <span className="text-[10px]">
                        (Pending: {formatINR(selectedPO.totalAmount - selectedPO.paidAmount)})
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount (₹)"
                        className="h-8 bg-muted/50 border-border text-xs"
                        value={paymentAmt}
                        onChange={(e) => setPaymentAmt(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                        disabled={actionLoading || !paymentAmt || selectedPO.paidAmount >= selectedPO.totalAmount}
                        onClick={handlePayment}
                      >
                        {actionLoading ? 'Saving...' : 'Pay'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Card className={`glass-card border-l-2 ${accent} transition-all hover:border-l-primary/80`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  )
}

function ActionRow({
  icon,
  label,
  btnLabel,
  btnClass,
  loading,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  btnLabel: string
  btnClass: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <Button
        size="sm"
        variant="outline"
        className={`h-7 text-xs ${btnClass}`}
        disabled={loading}
        onClick={onClick}
      >
        {loading ? 'Processing...' : btnLabel}
      </Button>
    </div>
  )
}