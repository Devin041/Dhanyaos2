'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Trash2,
  Eye,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  Package,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  X,
  CreditCard,
  IndianRupee,
  Loader2,
  Link2,
  Shirt,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Filter,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell as RCell,
  CartesianGrid,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts'
import { useToast } from '@/hooks/use-toast'

// ─── Inline helper: tiny input to add a label (color/size) on Enter ──────────
function AddLabelInput({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className="h-6 w-20 px-2 text-[10px] bg-background/60 border border-border/40 rounded"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const v = (e.target as HTMLInputElement).value.trim()
          if (v) onAdd(v)
          ;(e.target as HTMLInputElement).value = ''
        }
      }}
    />
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string
  styleId: string | null
  styleName: string
  styleNo: string | null
  collectionName: string | null
  category: string | null
  quantity: number
  unitPrice: number
  unitCost: number
  totalAmount: number
  totalCost: number
  profit: number
  _image?: string | null
  _fgStockAvailable?: number
}

interface Order {
  id: string
  orderNo: string
  customerId: string
  customer: { id: string; companyName: string; buyerName: string | null; phone: string | null; email: string | null }
  orderDate: string
  deliveryDate: string | null
  status: string
  totalAmount: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  paymentStatus: string
  paidAmount: number
  discountPercent: number
  notes: string | null
  quotationId: string | null
  quotationNo: string | null
  items: OrderItem[]
  createdAt: string
  updatedAt: string
}

interface Customer {
  id: string
  companyName: string
  buyerName: string | null
  phone: string | null
  email: string | null
  status: string
}

interface ColorSizeRow {
  color: string
  size: string
  quantity: number
}
interface NewLineItem {
  styleId: string
  styleNo: string
  styleName: string
  quantity: number         // client order qty (auto-calc from matrix if used)
  unitPrice: number
  unitCost: number
  image: string | null
  // Color × Size matrix
  colors: string[]         // e.g. ['Red','Blue','Green']
  sizes: string[]          // e.g. ['S','M','L','XL','XXL']
  matrix: Record<string, Record<string, number>>  // matrix[color][size] = qty
  useMatrix: boolean       // toggle between simple qty vs color×size grid
  // Production planning
  productionQty: number   // what will actually be manufactured
  surplusQty: number      // productionQty - quantity (auto)
}

// ─── Sales Performance Types (NEW) ───────────────────────────────────────────

interface PerfSummary {
  totalOrders: number
  totalQuotations: number
  totalRevenue: number
  totalProfit: number
  avgOrderValue: number
  avgMargin: number
  conversionRate: number
  winRate: number
  avgSalesCycleDays: number
  paymentCollectionRate: number
  salesEfficiencyScore: number
  grade: string
  pendingValue: number
  inProductionValue: number
  deliveredValue: number
}

interface PerfPipelineStage {
  stage: string
  count: number
  value: number
  color: string
  percentage: number
}

interface PerfTrend {
  month: string
  revenue: number
  profit: number
  orders: number
  avgOrderValue: number
}

interface PerfTopCustomer {
  id: string
  name: string
  orderCount: number
  totalValue: number
  totalProfit: number
  avgMargin: number
}

interface PerfData {
  summary: PerfSummary
  pipeline: PerfPipelineStage[]
  trend: PerfTrend[]
  topCustomers: PerfTopCustomer[]
  quotFunnel: { draft: number; sent: number; accepted: number; converted: number; rejected: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  Pending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <Clock className="h-3 w-3" /> },
  'In Progress': { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: <Package className="h-3 w-3" /> },
  Completed: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  Cancelled: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <XCircle className="h-3 w-3" /> },
  Confirmed: { color: 'bg-sky-500/15 text-sky-400 border-sky-500/30', icon: <FileText className="h-3 w-3" /> },
  'In Production': { color: 'bg-violet-500/15 text-violet-400 border-violet-500/30', icon: <Package className="h-3 w-3" /> },
  Dispatched: { color: 'bg-teal-500/15 text-teal-400 border-teal-500/30', icon: <Package className="h-3 w-3" /> },
}

const PAYMENT_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  Paid: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  Partial: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <CreditCard className="h-3 w-3" /> },
  Unpaid: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <CreditCard className="h-3 w-3" /> },
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SalesOrders() {
  const { toast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [statuses, setStatuses] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [sortField, setSortField] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [perf, setPerf] = useState<PerfData | null>(null)

  // Create order dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [createLoading, setCreateLoading] = useState(false)
  const [newCustomerId, setNewCustomerId] = useState('')
  const emptyLineItem = (): NewLineItem => ({
    styleId: '', styleNo: '', styleName: '',
    quantity: 1, unitPrice: 0, unitCost: 0, image: null,
    colors: [], sizes: [], matrix: {}, useMatrix: false,
    productionQty: 0, surplusQty: 0,
  })
  const [newItems, setNewItems] = useState<NewLineItem[]>([emptyLineItem()])
  const [catalogProducts, setCatalogProducts] = useState<Array<{ id: string; styleNo: string; styleName: string; photoCount: number }>>([])
  const [newDeliveryDate, setNewDeliveryDate] = useState('')
  const [newDiscount, setNewDiscount] = useState('0')
  const [newNotes, setNewNotes] = useState('')
  const [newShippingAddress, setNewShippingAddress] = useState('')
  const [newGstType, setNewGstType] = useState<'IntraState' | 'InterState'>('IntraState')
  const [newGstPercent, setNewGstPercent] = useState('18')
  const [newBrokerName, setNewBrokerName] = useState('')
  const [newBrokerCommission, setNewBrokerCommission] = useState('0')

  // Detail panel
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // ─── Fetch Orders ─────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sort', sortField)
      params.set('order', sortOrder)

      const res = await fetch(`/api/orders?${params}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders)
        setTotal(data.total)
        setStatuses(data.statuses || {})
      }
    } catch {
      toast({ title: 'Error loading orders', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page, limit, sortField, sortOrder, toast])

  const fetchPerf = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/sales-performance')
      if (!res.ok) return
      const json = await res.json()
      if (!json.error) setPerf(json)
    } catch {
      // Performance is optional — fail silently
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    fetchPerf()
  }, [fetchOrders, fetchPerf])

  // Load catalog products for item selector (Sprint 2)
  // IMPORTANT: The catalog must include EVERY product the user has costed,
  // not just the ones in the Sample Catalog. Otherwise, newly added costings
  // (e.g. "Purple Master Aline", "EL-01111") won't show up in the dropdown
  // and the user can't create an order for them. We therefore merge two
  // sources: the Sample Catalog (/api/samples) AND Cost Sheets (/api/cost-sheets),
  // deduplicating by styleNo.
  useEffect(() => {
    async function loadCatalog() {
      const merged = new Map<string, { id: string; styleNo: string; styleName: string; photoCount: number }>()

      // Source 1: Sample Catalog (has photos)
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

      // Source 2: Cost Sheets (has pricing + new products not yet in Sample Catalog)
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

      // Sort alphabetically by styleNo for easy scanning
      const list = Array.from(merged.values()).sort((a, b) =>
        (a.styleNo || '').localeCompare(b.styleNo || '', undefined, { numeric: true, sensitivity: 'base' })
      )
      setCatalogProducts(list)
    }
    loadCatalog()
  }, [])

  // Handle product selection for a line item (Sprint 2)
  const handleProductSelect = async (idx: number, sampleId: string) => {
    const product = catalogProducts.find(p => p.id === sampleId)
    if (!product) return

    // Fetch product image
    let imageUrl: string | null = null
    try {
      const res = await fetch(`/api/style-image?styleNo=${product.styleNo}`)
      const data = await res.json()
      imageUrl = data.imageUrl || null
    } catch { /* ignore */ }

    // Fetch costing for auto-fill price
    let unitPrice = 0
    let unitCost = 0
    try {
      const res = await fetch(`/api/cost-sheets?search=${product.styleNo}`)
      const data = await res.json()
      const sheets = data.costSheets || []
      if (sheets.length > 0) {
        const latest = sheets[0]
        unitPrice = Math.round(latest.sellingPrice || 0)
        unitCost = Math.round(latest.totalCost || 0)
      }
    } catch { /* ignore */ }

    setNewItems(newItems.map((item, i) => i === idx ? {
      ...item,
      styleId: sampleId,
      styleNo: product.styleNo,
      styleName: product.styleName,
      unitPrice,
      unitCost,
      image: imageUrl,
      // Reset color×size matrix when a new product is chosen
      colors: [],
      sizes: [],
      matrix: {},
      useMatrix: false,
      productionQty: 0,
      surplusQty: 0,
    } : item))
  }

  // ─── Color×Size Matrix helpers ─────────────────────────────────────────────
  // Add a color/size label to a line item
  const addColor = (idx: number, color: string) => {
    if (!color.trim()) return
    setNewItems(newItems.map((item, i) => {
      if (i !== idx) return item
      if (item.colors.includes(color)) return item
      return { ...item, colors: [...item.colors, color] }
    }))
  }
  const removeColor = (idx: number, color: string) => {
    setNewItems(newItems.map((item, i) => {
      if (i !== idx) return item
      const newMatrix = { ...item.matrix }
      delete newMatrix[color]
      return { ...item, colors: item.colors.filter(c => c !== color), matrix: newMatrix }
    }))
  }
  const addSize = (idx: number, size: string) => {
    if (!size.trim()) return
    setNewItems(newItems.map((item, i) => {
      if (i !== idx) return item
      if (item.sizes.includes(size)) return item
      return { ...item, sizes: [...item.sizes, size] }
    }))
  }
  const removeSize = (idx: number, size: string) => {
    setNewItems(newItems.map((item, i) => {
      if (i !== idx) return item
      const newMatrix: Record<string, Record<string, number>> = {}
      for (const [c, row] of Object.entries(item.matrix)) {
        const { [size]: _removed, ...rest } = row
        newMatrix[c] = rest
      }
      return { ...item, sizes: item.sizes.filter(s => s !== size), matrix: newMatrix }
    }))
  }
  const setMatrixCell = (idx: number, color: string, size: string, qty: number) => {
    setNewItems(newItems.map((item, i) => {
      if (i !== idx) return item
      const m = { ...item.matrix }
      if (!m[color]) m[color] = {}
      m[color] = { ...m[color], [size]: Math.max(0, Math.floor(qty || 0)) }
      return { ...item, matrix: m }
    }))
  }
  // Bulk-fill: set qty per color for all sizes (e.g., 120 pcs / 5 sizes = 24 each)
  const distributeQtyPerColor = (idx: number, qtyPerColor: number) => {
    setNewItems(newItems.map((item, i) => {
      if (i !== idx) return item
      if (item.colors.length === 0 || item.sizes.length === 0) return item
      const perSize = Math.floor(qtyPerColor / item.sizes.length)
      const remainder = qtyPerColor - perSize * item.sizes.length
      const m: Record<string, Record<string, number>> = {}
      for (const c of item.colors) {
        m[c] = {}
        item.sizes.forEach((s, si) => { m[c][s] = perSize + (si < remainder ? 1 : 0) })
      }
      // Auto-set productionQty to match if not already set
      const total = item.colors.length * qtyPerColor
      return { ...item, matrix: m, productionQty: item.productionQty || total }
    }))
  }

  // ─── Fetch Customers for Create Dialog ────────────────────────────────────

  const fetchCustomers = useCallback(async () => {
    // Fetch ALL customers directly from the customers API — NOT derived
    // from existing orders. Otherwise, newly added customers (who haven't
    // placed any order yet) won't appear in the dropdown, which is a
    // critical UX bug when creating the very first order for a new client.
    try {
      const res = await fetch('/api/customers?limit=500')
      if (res.ok) {
        const data = await res.json()
        const list: Customer[] = (data.customers || data || []).map((c: any) => ({
          id: c.id,
          companyName: c.companyName,
          buyerName: c.buyerName,
          phone: c.phone,
          email: c.email,
          status: c.status || 'Active',
        }))
        // Sort alphabetically by companyName for easy scanning
        list.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''))
        setCustomers(list)
      }
    } catch { /* ignore — customers list will be empty but order creation still works */ }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // ─── Search Handler ───────────────────────────────────────────────────────

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  // ─── Sort Handler ─────────────────────────────────────────────────────────

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  // ─── Create Order ─────────────────────────────────────────────────────────

  // Compute the effective order quantity for a line item:
  // if using the color×size matrix, sum all cells; otherwise use the quantity field.
  const lineItemQty = (i: NewLineItem): number => {
    if (i.useMatrix && i.colors.length > 0 && i.sizes.length > 0) {
      let total = 0
      for (const c of i.colors) for (const s of i.sizes) total += i.matrix[c]?.[s] || 0
      return total
    }
    return i.quantity
  }
  // Compute the surplus = productionQty - orderQty
  const lineItemSurplus = (i: NewLineItem): number => {
    const q = lineItemQty(i)
    const p = i.productionQty || q
    return Math.max(0, p - q)
  }
  // Flatten matrix into rows for the API
  const lineItemColorRows = (i: NewLineItem): ColorSizeRow[] => {
    if (!i.useMatrix) return []
    const rows: ColorSizeRow[] = []
    for (const c of i.colors) for (const s of i.sizes) {
      const q = i.matrix[c]?.[s] || 0
      if (q > 0) rows.push({ color: c, size: s, quantity: q })
    }
    return rows
  }

  const handleCreateOrder = async () => {
    // Validate
    if (!newCustomerId) {
      toast({ title: 'Please select a customer', variant: 'destructive' })
      return
    }
    const invalid = newItems.some((i) => !i.styleName || lineItemQty(i) <= 0 || i.unitPrice <= 0)
    if (invalid) {
      toast({ title: 'Each item needs a product, quantity > 0, and unit price > 0', variant: 'destructive' })
      return
    }
    setCreateLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: newCustomerId,
          items: newItems.map((i) => {
            const q = lineItemQty(i)
            const p = i.productionQty || q
            const colors = lineItemColorRows(i)
            return {
              styleId: i.styleId || undefined,
              styleNo: i.styleNo || undefined,
              styleName: i.styleName,
              quantity: q,
              unitPrice: i.unitPrice,
              unitCost: i.unitCost,
              productionQty: p,
              colors: colors.length > 0 ? colors : undefined,
            }
          }),
          deliveryDate: newDeliveryDate || undefined,
          discountPercent: parseFloat(newDiscount) || 0,
          notes: newNotes || undefined,
          shippingAddress: newShippingAddress || undefined,
          gstType: newGstType,
          gstPercent: parseFloat(newGstPercent) || 0,
          brokerName: newBrokerName || undefined,
          brokerCommissionPercent: parseFloat(newBrokerCommission) || 0,
        }),
      })
      if (res.ok) {
        toast({ title: 'Order created successfully' })
        setCreateOpen(false)
        resetCreateForm()
        fetchOrders()
      } else {
        const data = await res.json()
        toast({ title: data.error || 'Failed to create order', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Failed to create order', variant: 'destructive' })
    } finally {
      setCreateLoading(false)
    }
  }

  const resetCreateForm = () => {
    setNewCustomerId('')
    setNewItems([emptyLineItem()])
    setNewDeliveryDate('')
    setNewDiscount('0')
    setNewNotes('')
    setNewShippingAddress('')
    setNewGstType('IntraState')
    setNewGstPercent('18')
    setNewBrokerName('')
    setNewBrokerCommission('0')
  }

  const addItemRow = () => {
    setNewItems([...newItems, emptyLineItem()])
  }

  const removeItemRow = (idx: number) => {
    if (newItems.length <= 1) return
    setNewItems(newItems.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: keyof NewLineItem, value: string | number) => {
    const updated = [...newItems]
    updated[idx] = { ...updated[idx], [field]: value }
    setNewItems(updated)
  }

  const createTotals = newItems.reduce(
    (acc, item) => {
      const q = lineItemQty(item)
      const lineTotal = q * item.unitPrice
      const lineCost = q * item.unitCost
      acc.amount += lineTotal
      acc.cost += lineCost
      acc.qty += q
      acc.productionQty += item.productionQty || q
      acc.surplusQty += lineItemSurplus(item)
      return acc
    },
    { amount: 0, cost: 0, qty: 0, productionQty: 0, surplusQty: 0 },
  )
  const discountAmt = createTotals.amount * (parseFloat(newDiscount) || 0) / 100
  const taxableAmount = createTotals.amount - discountAmt
  const gstPercentVal = parseFloat(newGstPercent) || 0
  const totalGst = newGstType === 'IntraState'
    ? taxableAmount * gstPercentVal / 100  // (CGST + SGST split visually, same total)
    : taxableAmount * gstPercentVal / 100
  const grandTotal = taxableAmount + totalGst
  const commissionAmt = grandTotal * (parseFloat(newBrokerCommission) || 0) / 100
  const netPayable = grandTotal - commissionAmt
  const profit = taxableAmount - createTotals.cost

  // ─── Order Detail Actions ─────────────────────────────────────────────────

  // Linked POs for the detail view (POs raised against this SO)
  const [linkedPOs, setLinkedPOs] = useState<any[]>([])
  const [linkedPOsLoading, setLinkedPOsLoading] = useState(false)

  const openDetail = async (order: Order) => {
    setDetailOrder(order)
    setDetailOpen(true)
    setEditNotes(order.notes || '')
    setPayAmount('')
    // Fetch linked POs (purchase orders raised against this sales order)
    setLinkedPOsLoading(true)
    try {
      const res = await fetch('/api/purchase-orders?limit=500')
      if (res.ok) {
        const data = await res.json()
        const linked = (data.orders || []).filter((po: any) => po.salesOrderId === order.id)
        setLinkedPOs(linked)
      }
    } catch { /* ignore */ }
    setLinkedPOsLoading(false)
  }

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetailOrder(data.order)
        fetchOrders()
        toast({ title: `Order status updated to ${newStatus}` })
      }
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handlePayment = async (orderId: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) return
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAmount: parseFloat(amount) }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetailOrder(data.order)
        fetchOrders()
        setPayAmount('')
        toast({ title: 'Payment recorded' })
      }
    } catch {
      toast({ title: 'Failed to record payment', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleSaveNotes = async (orderId: string) => {
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetailOrder(data.order)
        fetchOrders()
        toast({ title: 'Notes saved' })
      }
    } catch {
      toast({ title: 'Failed to save notes', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Order cancelled' })
        setDetailOpen(false)
        setDetailOrder(null)
        fetchOrders()
      }
    } catch {
      toast({ title: 'Failed to cancel order', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  // ─── Pagination ───────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / limit)

  // ─── Filter Tabs ──────────────────────────────────────────────────────────

  const filterTabs = [
    { key: '', label: 'All', count: total },
    { key: 'Pending', label: 'Pending', count: statuses['Pending'] || 0 },
    { key: 'In Progress', label: 'In Progress', count: statuses['In Progress'] || 0 },
    { key: 'Completed', label: 'Completed', count: statuses['Completed'] || 0 },
    { key: 'Cancelled', label: 'Cancelled', count: statuses['Cancelled'] || 0 },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Sales Orders</h1>
            <p className="text-xs text-muted-foreground">
              {total} orders · {statuses['Pending'] || 0} pending
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="sales-orders" />
          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* ─── Status Filter Tabs ─────────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-1.5">
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === tab.key
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  statusFilter === tab.key
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Search & Sort ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order no. or customer..."
            className="pl-9 bg-muted/50 border-border/50 h-9 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={`${sortField}-${sortOrder}`}
            onValueChange={(v) => {
              const [f, o] = v.split('-')
              setSortField(f)
              setSortOrder(o as 'asc' | 'desc')
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[160px] h-9 bg-muted/50 border-border/50 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-desc">Newest First</SelectItem>
              <SelectItem value="createdAt-asc">Oldest First</SelectItem>
              <SelectItem value="totalAmount-desc">Highest Amount</SelectItem>
              <SelectItem value="totalAmount-asc">Lowest Amount</SelectItem>
              <SelectItem value="orderNo-asc">Order No (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Orders Table ───────────────────────────────────────────────── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-8 text-xs font-medium text-muted-foreground" />
                <TableHead
                  className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort('orderNo')}
                >
                  <span className="flex items-center gap-1">Order No <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden sm:table-cell">Customer</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden md:table-cell">Date</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden lg:table-cell">Items</TableHead>
                <TableHead
                  className="text-xs font-medium text-muted-foreground text-right cursor-pointer select-none"
                  onClick={() => handleSort('totalAmount')}
                >
                  <span className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden xl:table-cell">Cost</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden xl:table-cell">Margin</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden md:table-cell">Payment</TableHead>
                <TableHead className="w-10 text-xs font-medium text-muted-foreground" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell colSpan={11}>
                      <div className="flex items-center gap-3 py-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-32 hidden sm:block" />
                        <Skeleton className="h-4 w-20 hidden md:block" />
                        <div className="flex-1" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-14" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow className="border-border/30">
                  <TableCell colSpan={11} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No orders found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    expanded={expandedOrder === order.id}
                    onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    onView={() => openDetail(order)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ──────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
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
                    variant={page === pageNum ? 'default' : 'ghost'}
                    size="icon"
                    className={`h-7 w-7 text-xs ${page === pageNum ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE ORDER DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm() }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Sales Order
            </DialogTitle>
            <DialogDescription>Comprehensive order form — color×size matrix, GST, broker & production planning</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* ── Customer + Delivery ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs font-medium">Customer *</Label>
                <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue placeholder="Select a customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName}{c.buyerName ? ` — ${c.buyerName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Delivery Date</Label>
                <Input
                  type="date"
                  className="h-8 text-sm bg-muted/50"
                  value={newDeliveryDate}
                  onChange={(e) => setNewDeliveryDate(e.target.value)}
                />
              </div>
            </div>

            {/* Shipping address */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Shipping Address <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="Delivery address (defaults to customer billing if blank)"
                className="h-8 text-sm bg-muted/50"
                value={newShippingAddress}
                onChange={(e) => setNewShippingAddress(e.target.value)}
              />
            </div>

            {/* ── Line Items ─────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Line Items *</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" onClick={addItemRow}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              <div className="space-y-3">
                {newItems.map((item, idx) => (
                  <div key={idx} className="glass-card rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.useMatrix}
                            onChange={(e) => updateItem(idx, 'useMatrix', e.target.checked)}
                            className="h-3 w-3"
                          />
                          Color × Size matrix
                        </label>
                        {newItems.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItemRow(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Product selector + image */}
                    <div className="flex items-center gap-2">
                      <Select value={item.styleId} onValueChange={(v) => handleProductSelect(idx, v)}>
                        <SelectTrigger className="h-8 text-xs bg-muted/50 flex-1">
                          <SelectValue placeholder="Select from Catalog (auto-fills name, price, image)" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{p.styleNo}</span>
                                <span className="text-muted-foreground text-[10px]">{p.styleName}</span>
                                {p.photoCount > 0 && <span className="text-primary text-[10px]">📷</span>}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.image && (
                        <img src={item.image} alt={item.styleName} className="h-8 w-8 rounded object-cover shrink-0" />
                      )}
                    </div>

                    {/* Style name + price + cost */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        placeholder="Style / Product name *"
                        className="h-8 text-sm bg-muted/50"
                        value={item.styleName}
                        onChange={(e) => updateItem(idx, 'styleName', e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="Unit Price (₹)"
                        className="h-8 text-sm bg-muted/50"
                        value={item.unitPrice || ''}
                        onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                      <Input
                        type="number"
                        placeholder="Unit Cost (₹)"
                        className="h-8 text-sm bg-muted/50"
                        value={item.unitCost || ''}
                        onChange={(e) => updateItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                    </div>

                    {/* ── Color × Size matrix OR simple qty ───────────────────── */}
                    {item.useMatrix ? (
                      <div className="space-y-2 border rounded-md p-2 bg-muted/20">
                        {/* Color + Size inputs */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-medium text-muted-foreground">Colors:</span>
                            {item.colors.map((c) => (
                              <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">
                                {c}
                                <button type="button" onClick={() => removeColor(idx, c)} className="hover:text-destructive">×</button>
                              </span>
                            ))}
                            <AddLabelInput onAdd={(v) => addColor(idx, v)} placeholder="+ color" />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-medium text-muted-foreground">Sizes:</span>
                            {item.sizes.map((s) => (
                              <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px]">
                                {s}
                                <button type="button" onClick={() => removeSize(idx, s)} className="hover:text-destructive">×</button>
                              </span>
                            ))}
                            <AddLabelInput onAdd={(v) => addSize(idx, v)} placeholder="+ size" />
                          </div>
                        </div>

                        {/* Quick distribute input */}
                        {item.colors.length > 0 && item.sizes.length > 0 && (
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-muted-foreground">Quick fill:</span>
                            <Input
                              type="number"
                              placeholder="pcs per color"
                              className="h-6 w-28 text-[10px] bg-muted/50"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  distributeQtyPerColor(idx, parseInt((e.target as HTMLInputElement).value) || 0)
                                  ;(e.target as HTMLInputElement).value = ''
                                }
                              }}
                              min={0}
                            />
                            <span className="text-muted-foreground">→ auto-distribute across {item.sizes.length} sizes</span>
                          </div>
                        )}

                        {/* Matrix grid */}
                        {item.colors.length > 0 && item.sizes.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr>
                                  <th className="text-left p-1 text-muted-foreground">Color \ Size</th>
                                  {item.sizes.map((s) => (
                                    <th key={s} className="p-1 text-center font-medium">{s}</th>
                                  ))}
                                  <th className="p-1 text-right text-muted-foreground">Color Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.colors.map((c) => {
                                  const rowTotal = item.sizes.reduce((sum, s) => sum + (item.matrix[c]?.[s] || 0), 0)
                                  return (
                                    <tr key={c}>
                                      <td className="p-1 font-medium">{c}</td>
                                      {item.sizes.map((s) => (
                                        <td key={s} className="p-0.5">
                                          <input
                                            type="number"
                                            min={0}
                                            value={item.matrix[c]?.[s] || ''}
                                            onChange={(e) => setMatrixCell(idx, c, s, parseInt(e.target.value) || 0)}
                                            className="w-full h-7 px-1 text-center bg-background/60 border border-border/40 rounded"
                                          />
                                        </td>
                                      ))}
                                      <td className="p-1 text-right font-semibold text-primary">{rowTotal}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t">
                                  <td className="p-1 font-medium">Size Total</td>
                                  {item.sizes.map((s) => {
                                    const colTotal = item.colors.reduce((sum, c) => sum + (item.matrix[c]?.[s] || 0), 0)
                                    return <td key={s} className="p-1 text-center font-semibold text-primary">{colTotal}</td>
                                  })}
                                  <td className="p-1 text-right font-bold text-primary">{lineItemQty(item)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Simple qty input */
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Order Qty (client)</Label>
                          <Input
                            type="number"
                            placeholder="Quantity"
                            className="h-8 text-sm bg-muted/50"
                            value={item.quantity || ''}
                            onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                            min={1}
                          />
                        </div>
                        <div className="sm:col-span-2" />
                      </div>
                    )}

                    {/* ── Production planning ─────────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
                      <div>
                        <Label className="text-[10px] text-amber-600 dark:text-amber-400">Client Order Qty</Label>
                        <p className="text-sm font-semibold">{lineItemQty(item)} pcs</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-amber-600 dark:text-amber-400">Production Qty</Label>
                        <Input
                          type="number"
                          placeholder={String(lineItemQty(item))}
                          className="h-7 text-sm bg-muted/50"
                          value={item.productionQty || ''}
                          onChange={(e) => updateItem(idx, 'productionQty', parseInt(e.target.value) || 0)}
                          min={0}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-emerald-600 dark:text-emerald-400">Surplus → FG Inventory</Label>
                        <p className="text-sm font-semibold text-emerald-500">+{lineItemSurplus(item)} pcs</p>
                      </div>
                    </div>
                    {lineItemSurplus(item) > 0 && (
                      <p className="text-[10px] text-muted-foreground italic">
                        Overproduction: extra {lineItemSurplus(item)} pcs will be added to Finished Goods inventory
                        for future orders / resale.
                      </p>
                    )}

                    {/* Line summary */}
                    {lineItemQty(item) > 0 && item.unitPrice > 0 && (
                      <p className="text-[11px] text-muted-foreground text-right">
                        Line: {formatINR(lineItemQty(item) * item.unitPrice)}
                        {item.unitCost > 0 && (
                          <> · Cost: {formatINR(lineItemQty(item) * item.unitCost)} · Profit: {formatINR(lineItemQty(item) * (item.unitPrice - item.unitCost))}</>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── GST + Broker ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">GST Type</Label>
                <Select value={newGstType} onValueChange={(v) => setNewGstType(v as 'IntraState' | 'InterState')}>
                  <SelectTrigger className="bg-muted/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IntraState">IntraState (CGST+SGST)</SelectItem>
                    <SelectItem value="InterState">InterState (IGST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">GST %</Label>
                <Input
                  type="number"
                  className="h-8 text-sm bg-muted/50"
                  value={newGstPercent}
                  onChange={(e) => setNewGstPercent(e.target.value)}
                  min={0}
                  step={0.5}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Broker Name <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  className="h-8 text-sm bg-muted/50"
                  value={newBrokerName}
                  onChange={(e) => setNewBrokerName(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Commission %</Label>
                <Input
                  type="number"
                  className="h-8 text-sm bg-muted/50"
                  value={newBrokerCommission}
                  onChange={(e) => setNewBrokerCommission(e.target.value)}
                  min={0}
                  max={100}
                  step={0.5}
                />
              </div>
            </div>

            {/* Discount + Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Discount (%)</Label>
                <Input
                  type="number"
                  className="h-8 text-sm bg-muted/50"
                  value={newDiscount}
                  onChange={(e) => setNewDiscount(e.target.value)}
                  min={0}
                  max={100}
                  step={0.5}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs font-medium">Notes</Label>
                <Input
                  placeholder="Order notes or special instructions..."
                  className="h-8 text-sm bg-muted/50"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>
            </div>

            {/* ── Order Summary ─────────────────────────────────────────────── */}
            {createTotals.amount > 0 && (
              <div className="glass-card rounded-lg p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Summary</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({createTotals.qty} pcs)</span>
                  <span>{formatINR(createTotals.amount)}</span>
                </div>
                {parseFloat(newDiscount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount ({newDiscount}%)</span>
                    <span className="text-destructive">-{formatINR(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxable Amount</span>
                  <span>{formatINR(taxableAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    GST {newGstPercent}% {newGstType === 'IntraState' ? '(CGST+SGST)' : '(IGST)'}
                  </span>
                  <span>{formatINR(totalGst)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Grand Total</span>
                  <span className="text-primary">{formatINR(grandTotal)}</span>
                </div>
                {commissionAmt > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Broker Commission ({newBrokerCommission}%)</span>
                    <span className="text-destructive">-{formatINR(commissionAmt)}</span>
                  </div>
                )}
                {commissionAmt > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span>Net Receivable</span>
                    <span className="text-primary">{formatINR(netPayable)}</span>
                  </div>
                )}
                {createTotals.cost > 0 && (
                  <>
                    <Separator className="my-1" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Cost</span>
                      <span>{formatINR(createTotals.cost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gross Profit</span>
                      <span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatINR(profit)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gross Margin</span>
                      <span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {taxableAmount > 0 ? ((profit / taxableAmount) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </>
                )}
                {/* Production summary */}
                {(createTotals.productionQty > 0 || createTotals.surplusQty > 0) && (
                  <>
                    <Separator className="my-1" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Client Order Qty</span>
                      <span className="font-semibold">{createTotals.qty} pcs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Production Qty</span>
                      <span className="font-semibold text-amber-500">{createTotals.productionQty} pcs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Surplus → FG Inventory</span>
                      <span className="font-semibold text-emerald-500">+{createTotals.surplusQty} pcs</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); resetCreateForm() }}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreateOrder}
              disabled={createLoading || !newCustomerId || newItems.some((i) => !i.styleName || i.quantity <= 0 || i.unitPrice <= 0)}
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          ORDER DETAIL DIALOG
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setDetailOrder(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          {detailOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-primary flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {detailOrder.orderNo}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {formatDate(detailOrder.orderDate)} · {relativeTime(detailOrder.createdAt)}
                    </DialogDescription>
                    {detailOrder.quotationNo && (
                      <Badge
                        variant="outline"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium border-primary/30 text-primary bg-primary/5"
                      >
                        <Link2 className="h-3 w-3" />
                        From Quotation {detailOrder.quotationNo}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={detailOrder.status} type="order" />
                    <PaymentBadge status={detailOrder.paymentStatus} />
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* ─── Customer Info ──────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Company</span>
                      <p className="font-medium">{detailOrder.customer.companyName}</p>
                    </div>
                    {detailOrder.customer.buyerName && (
                      <div>
                        <span className="text-muted-foreground text-xs">Buyer</span>
                        <p className="font-medium">{detailOrder.customer.buyerName}</p>
                      </div>
                    )}
                    {detailOrder.customer.phone && (
                      <div>
                        <span className="text-muted-foreground text-xs">Phone</span>
                        <p>{detailOrder.customer.phone}</p>
                      </div>
                    )}
                    {detailOrder.customer.email && (
                      <div>
                        <span className="text-muted-foreground text-xs">Email</span>
                        <p>{detailOrder.customer.email}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Actions Row ─────────────────────────────────────── */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground">Change Status</Label>
                    <Select
                      value={detailOrder.status}
                      onValueChange={(v) => handleStatusChange(detailOrder.id, v)}
                      disabled={updateLoading}
                    >
                      <SelectTrigger className="h-8 bg-muted/50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground">Record Payment</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount (₹)"
                        className="h-8 bg-muted/50 text-xs flex-1"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        min={0}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                        disabled={updateLoading || !payAmount || parseFloat(payAmount) <= 0}
                        onClick={() => handlePayment(detailOrder.id, payAmount)}
                      >
                        Record
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={updateLoading || detailOrder.status === 'Cancelled'}
                      onClick={() => handleCancelOrder(detailOrder.id)}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>

                {/* ─── Line Items ──────────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Line Items ({detailOrder.items.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/30 hover:bg-transparent">
                          <TableHead className="text-xs">Style</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right hidden sm:table-cell">Unit Price</TableHead>
                          <TableHead className="text-xs text-right hidden sm:table-cell">Unit Cost</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs text-right hidden md:table-cell">Profit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailOrder.items.map((item) => (
                          <TableRow key={item.id} className="border-border/20">
                            <TableCell className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {item._image ? (
                                  <img src={item._image} alt={item.styleNo || item.styleName} className="h-8 w-8 shrink-0 rounded object-cover" />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
                                    <Shirt className="h-4 w-4 text-muted-foreground/30" />
                                  </div>
                                )}
                                <div>
                                  <p>{item.styleName}</p>
                                  {item.styleNo && (
                                    <p className="text-[10px] text-muted-foreground">{item.styleNo}</p>
                                  )}
                                  {item._fgStockAvailable !== undefined && (
                                    <Badge variant={item._fgStockAvailable > 10 ? 'default' : item._fgStockAvailable > 0 ? 'secondary' : 'destructive'} className="text-[10px] px-1.5 py-0 h-4 mt-0.5">
                                      {item._fgStockAvailable > 10 ? '✅' : item._fgStockAvailable > 0 ? '⚠️' : '❌'} {item._fgStockAvailable} pcs
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{item.quantity}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums hidden sm:table-cell">{formatINR(item.unitPrice)}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums hidden sm:table-cell">{formatINR(item.unitCost)}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums font-medium">{formatINR(item.totalAmount)}</TableCell>
                            <TableCell className={`text-sm text-right tabular-nums hidden md:table-cell ${item.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatINR(item.profit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* ─── Order Totals ────────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order Totals</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Amount</p>
                      <p className="text-lg font-bold text-primary">{formatINR(detailOrder.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Cost</p>
                      <p className="text-lg font-bold">{formatINR(detailOrder.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Profit</p>
                      <p className={`text-lg font-bold ${detailOrder.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatINR(detailOrder.grossProfit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Margin</p>
                      <p className={`text-lg font-bold ${detailOrder.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {detailOrder.grossMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {detailOrder.discountPercent > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Discount: {detailOrder.discountPercent}% applied
                    </p>
                  )}

                  <Separator className="my-3" />

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Paid: <span className="text-emerald-400 font-medium">{formatINR(detailOrder.paidAmount)}</span>
                        {detailOrder.totalAmount - detailOrder.paidAmount > 0 && (
                          <span> of {formatINR(detailOrder.totalAmount)}</span>
                        )}
                      </span>
                    </div>
                    <div className="w-48">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Collection</span>
                        <span>{detailOrder.totalAmount > 0 ? ((detailOrder.paidAmount / detailOrder.totalAmount) * 100).toFixed(0) : 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${detailOrder.totalAmount > 0 ? Math.min(100, (detailOrder.paidAmount / detailOrder.totalAmount) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Delivery & Notes ─────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="glass-card rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Delivery</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {detailOrder.deliveryDate ? (
                        <span>{formatDate(detailOrder.deliveryDate)}</span>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </div>
                  </div>
                  <div className="glass-card rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                      {editNotes !== (detailOrder.notes || '') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-primary"
                          disabled={updateLoading}
                          onClick={() => handleSaveNotes(detailOrder.id)}
                        >
                          {updateLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Save
                        </Button>
                      )}
                    </div>
                    <Textarea
                      className="min-h-[60px] text-sm bg-muted/50 resize-none"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes..."
                    />
                  </div>
                </div>

                {/* ─── Order Timeline ───────────────────────────────────── */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline</h4>
                  <div className="space-y-3">
                    <TimelineItem
                      label="Order Created"
                      time={detailOrder.createdAt}
                      isActive
                    />
                    <TimelineItem
                      label={`Status: ${detailOrder.status}`}
                      time={detailOrder.updatedAt}
                      isActive={detailOrder.status !== 'Pending'}
                    />
                    {detailOrder.paidAmount > 0 && (
                      <TimelineItem
                        label={`Payment: ${detailOrder.paymentStatus} (${formatINR(detailOrder.paidAmount)})`}
                        time={detailOrder.updatedAt}
                        isActive
                      />
                    )}
                    {detailOrder.deliveryDate && (
                      <TimelineItem
                        label={`Delivery: ${formatDate(detailOrder.deliveryDate)}`}
                        time={detailOrder.deliveryDate}
                        isUpcoming={new Date(detailOrder.deliveryDate) > new Date()}
                      />
                    )}
                  </div>
                </div>

                {/* ─── Linked Purchase Orders (procurement tracking) ─── */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Linked Purchase Orders <span className="text-muted-foreground/70 normal-case">({linkedPOs.length})</span>
                  </Label>
                  {linkedPOsLoading ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : linkedPOs.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/40 p-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        No POs linked to this order yet.
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Create a PO from Purchase Orders → New PO → select this SO in "Linked Sales Order"
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {linkedPOs.map((po: any) => {
                        const cp = po.supplier?.name || po.vendor?.vendorName || po.supplierName || '—'
                        const cpKind = po.supplier ? 'SUP' : po.vendor ? 'VEN' : ''
                        return (
                          <div key={po.id} className="rounded-md border border-border/30 bg-muted/20 p-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="font-medium text-primary shrink-0">{po.poNumber}</span>
                              {cpKind && (
                                <span className={`text-[8px] px-1 py-0.5 rounded font-medium shrink-0 ${
                                  cpKind === 'SUP' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                                }`}>{cpKind}</span>
                              )}
                              <span className="text-muted-foreground truncate">{cp}</span>
                              {po.poType && po.poType !== 'GENERAL' && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-slate-500/15 text-slate-600 dark:text-slate-400 shrink-0">{po.poType}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold">{formatINR(po.totalAmount || 0)}</span>
                              <span className={`text-[9px] px-1 py-0.5 rounded ${
                                po.status === 'Received' ? 'bg-emerald-500/15 text-emerald-600' :
                                po.status === 'Pending' ? 'bg-amber-500/15 text-amber-600' :
                                po.status === 'Cancelled' ? 'bg-red-500/15 text-red-600' :
                                'bg-slate-500/15 text-slate-600'
                              }`}>{po.status}</span>
                            </div>
                          </div>
                        )
                      })}
                      {/* Procurement summary */}
                      <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                        {(() => {
                          const totalProcurement = linkedPOs.reduce((s: number, po: any) => s + (po.totalAmount || 0), 0)
                          const revenue = detailOrder?.totalAmount || 0
                          const profit = revenue - totalProcurement
                          const margin = revenue > 0 ? (profit / revenue) * 100 : 0
                          return (
                            <>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Total Procurement Cost</span>
                                <span className="font-semibold">{formatINR(totalProcurement)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Order Revenue</span>
                                <span className="font-semibold">{formatINR(revenue)}</span>
                              </div>
                              <div className="flex justify-between text-xs font-semibold border-t border-border/30 pt-1">
                                <span>{profit >= 0 ? 'Estimated Profit' : 'Estimated Loss'}</span>
                                <span className={profit >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                  {profit >= 0 ? '+' : ''}{formatINR(profit)} ({margin.toFixed(1)}%)
                                </span>
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Sales Performance Dashboard (NEW FEATURE) ──────────────── */}
      {perf && perf.summary.totalOrders > 0 && (
        <SalesPerformanceWidget data={perf} />
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function OrderRow({
  order,
  expanded,
  onToggle,
  onView,
}: {
  order: Order
  expanded: boolean
  onToggle: () => void
  onView: () => void
}) {
  return (
    <>
      <TableRow
        className="border-border/20 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <TableCell className="w-8 py-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="py-2">
          <span className="text-sm font-semibold text-primary">{order.orderNo}</span>
          <span className="text-[10px] text-muted-foreground block sm:hidden">{order.customer.companyName}</span>
        </TableCell>
        <TableCell className="py-2 text-sm hidden sm:table-cell">
          <div>
            <p className="font-medium">{order.customer.companyName}</p>
            {order.customer.buyerName && <p className="text-[11px] text-muted-foreground">{order.customer.buyerName}</p>}
          </div>
        </TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground hidden md:table-cell">
          {formatDate(order.orderDate)}
        </TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground text-right hidden lg:table-cell tabular-nums">
          {order.items.length} items
        </TableCell>
        <TableCell className="py-2 text-sm font-semibold text-right tabular-nums">
          {formatINR(order.totalAmount)}
        </TableCell>
        <TableCell className="py-2 text-sm text-right tabular-nums text-muted-foreground hidden xl:table-cell">
          {formatINR(order.totalCost)}
        </TableCell>
        <TableCell className="py-2 text-sm text-right tabular-nums hidden xl:table-cell">
          <span className={order.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {order.grossMargin.toFixed(1)}%
          </span>
        </TableCell>
        <TableCell className="py-2">
          <StatusBadge status={order.status} type="order" />
        </TableCell>
        <TableCell className="py-2 hidden md:table-cell">
          <PaymentBadge status={order.paymentStatus} />
        </TableCell>
        <TableCell className="py-2 w-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView() }}>
                <Eye className="h-3.5 w-3.5 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Cancel Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {/* ─── Expanded Row ─────────────────────────────────────────────── */}
      {expanded && (
        <TableRow className="border-border/10 bg-muted/10">
          <TableCell colSpan={11} className="px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {order.items.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  {item._image ? (
                    <img src={item._image} alt={item.styleNo || item.styleName} className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shirt className="h-4 w-4 text-primary/40" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{item.styleName}</p>
                      {item._fgStockAvailable !== undefined && (
                        <Badge variant={item._fgStockAvailable > 10 ? 'default' : item._fgStockAvailable > 0 ? 'secondary' : 'destructive'} className="text-[10px] px-1.5 py-0 h-4">
                          {item._fgStockAvailable > 10 ? '✅' : item._fgStockAvailable > 0 ? '⚠️' : '❌'} {item._fgStockAvailable}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {item.quantity} × {formatINR(item.unitPrice)} = {formatINR(item.totalAmount)}
                    </p>
                    {item.styleNo && (
                      <p className="text-[10px] text-muted-foreground">{item.styleNo}</p>
                    )}
                  </div>
                </div>
              ))}
              {order.items.length > 4 && (
                <div className="flex items-center">
                  <span className="text-xs text-muted-foreground">+{order.items.length - 4} more items</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-4 text-xs text-muted-foreground">
                {order.deliveryDate && <span>Delivery: {formatDate(order.deliveryDate)}</span>}
                {order.discountPercent > 0 && <span>Discount: {order.discountPercent}%</span>}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" onClick={(e) => { e.stopPropagation(); onView() }}>
                <Eye className="h-3 w-3" /> Full Details
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function StatusBadge({ status, type }: { status: string; type: 'order' | 'payment' }) {
  const config = type === 'order' ? STATUS_CONFIG[status] : PAYMENT_CONFIG[status]
  if (!config) {
    return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${config.color}`}>
      {config.icon}
      {status}
    </Badge>
  )
}

function PaymentBadge({ status }: { status: string }) {
  return <StatusBadge status={status} type="payment" />
}

function TimelineItem({
  label,
  time,
  isActive = false,
  isUpcoming = false,
}: {
  label: string
  time: string
  isActive?: boolean
  isUpcoming?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-primary' : isUpcoming ? 'bg-amber-500/50' : 'bg-muted-foreground/30'}`} />
        <div className="w-px h-6 bg-border/50" />
      </div>
      <div className="-mt-0.5">
        <p className={`text-xs ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</p>
        <p className="text-[10px] text-muted-foreground">{relativeTime(time)}</p>
      </div>
    </div>
  )
}
// ─── Sales Performance Widget (NEW FEATURE) ──────────────────────────────────
// Tracks sales pipeline, conversion rates, win/loss ratio, trends, and top
// customers for comprehensive sales performance analysis.

function PerfTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-muted-foreground">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-medium tabular-nums">{formatINR(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'oklch(0.72 0.18 145)' // green
  if (score >= 70) return 'oklch(0.8 0.15 75)'   // gold
  if (score >= 55) return 'oklch(0.75 0.15 65)'  // orange
  return 'oklch(0.65 0.22 25)'                     // red
}

function SalesPerformanceWidget({ data }: { data: PerfData }) {
  const { summary, pipeline, trend, topCustomers, quotFunnel } = data
  const hasLowConversion = summary.conversionRate < 30
  const hasLowPayment = summary.paymentCollectionRate < 50

  const scoreGauge = [{ name: 'efficiency', value: summary.salesEfficiencyScore, fill: getScoreColor(summary.salesEfficiencyScore) }]
  const convGauge = [{ name: 'conversion', value: summary.conversionRate, fill: 'oklch(0.72 0.18 145)' }]

  // Pipeline funnel data
  const funnelSteps = [
    { label: 'Draft', count: quotFunnel.draft, color: 'oklch(0.6 0.01 260)' },
    { label: 'Sent', count: quotFunnel.sent, color: 'oklch(0.7 0.15 250)' },
    { label: 'Accepted', count: quotFunnel.accepted, color: 'oklch(0.8 0.15 75)' },
    { label: 'Converted', count: quotFunnel.converted, color: 'oklch(0.72 0.18 145)' },
    { label: 'Rejected', count: quotFunnel.rejected, color: 'oklch(0.65 0.22 25)' },
  ]
  const maxFunnelCount = Math.max(...funnelSteps.map(f => f.count), 1)

  return (
    <div className="premium-card rounded-xl p-5">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 glow-ring">
            <Gauge className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Sales Performance Dashboard</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                Pipeline AI
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.totalOrders} orders · {summary.totalQuotations} quotations · {formatINR(summary.totalRevenue)} revenue · {summary.avgMargin}% margin · Grade {summary.grade}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics grid with radial gauges */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Efficiency Score gauge */}
        <div className={`rounded-lg border p-3 ${summary.salesEfficiencyScore >= 85 ? 'border-emerald-500/30 bg-emerald-500/5' : summary.salesEfficiencyScore >= 70 ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${summary.salesEfficiencyScore >= 85 ? 'text-emerald-400' : summary.salesEfficiencyScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                <Target className="h-3 w-3" />
                Efficiency
              </div>
              <p className={`mt-1 text-lg font-bold tabular-nums ${summary.salesEfficiencyScore >= 85 ? 'text-emerald-400' : summary.salesEfficiencyScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                {summary.salesEfficiencyScore}
              </p>
              <p className="text-[10px] text-muted-foreground">Grade {summary.grade}</p>
            </div>
            <div className="h-14 w-14">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" data={scoreGauge} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={6} angleAxisId={0} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Conversion Rate gauge */}
        <div className={`rounded-lg border p-3 ${summary.conversionRate >= 50 ? 'border-emerald-500/30 bg-emerald-500/5' : summary.conversionRate >= 30 ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${summary.conversionRate >= 50 ? 'text-emerald-400' : summary.conversionRate >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                <TrendingUp className="h-3 w-3" />
                Conversion
              </div>
              <p className={`mt-1 text-lg font-bold tabular-nums ${summary.conversionRate >= 50 ? 'text-emerald-400' : summary.conversionRate >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                {summary.conversionRate}%
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">Win: {summary.winRate}%</p>
            </div>
            <div className="h-14 w-14">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" data={convGauge} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={6} angleAxisId={0} fill={summary.conversionRate >= 50 ? 'oklch(0.72 0.18 145)' : summary.conversionRate >= 30 ? 'oklch(0.8 0.15 75)' : 'oklch(0.65 0.22 25)'} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <IndianRupee className="h-3 w-3" />
            Total Revenue
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatINR(summary.totalRevenue)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">Profit: {formatINR(summary.totalProfit)}</p>
        </div>

        {/* Avg Order Value */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <CreditCard className="h-3 w-3" />
            Avg Order Value
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatINR(summary.avgOrderValue)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">Paid: {summary.paymentCollectionRate}%</p>
        </div>
      </div>

      {/* Revenue trend + Pipeline */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* 6-month revenue trend */}
        <div className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue & Profit Trend (6 Months)
          </h4>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPerfRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.78 0.14 85)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradPerfProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <RTooltip content={<PerfTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="oklch(0.78 0.14 85)"
                  fill="url(#gradPerfRev)"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="oklch(0.72 0.18 145)"
                  fill="url(#gradPerfProfit)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quotation funnel */}
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Quotation Funnel
          </h4>
          <div className="space-y-2">
            {funnelSteps.map((f, i) => (
              <div key={f.label} className="animate-slide-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: f.color }} />
                    <span className="font-medium text-foreground/80">{f.label}</span>
                  </span>
                  <span className="tabular-nums font-semibold">{f.count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(f.count / maxFunnelCount) * 100}%`, backgroundColor: f.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Win Rate</p>
            <p className={`text-lg font-bold tabular-nums ${summary.winRate >= 60 ? 'text-emerald-400' : summary.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {summary.winRate}%
            </p>
          </div>
        </div>
      </div>

      {/* Pipeline stages + Top customers */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Pipeline stages bar chart */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sales Pipeline by Stage
          </h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.005 260)" opacity={0.25} />
                <XAxis
                  dataKey="stage"
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fill: 'oklch(0.6 0.01 260)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <RTooltip
                  content={({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { count: number; percentage: number } }>; label?: string }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-border/50 bg-background/95 px-3 py-2 text-xs shadow-xl">
                        <p className="font-medium">{label}</p>
                        <p className="tabular-nums">{formatINR(payload[0].value)}</p>
                        <p className="text-[10px] text-muted-foreground">{payload[0].payload.count} orders · {payload[0].payload.percentage}%</p>
                      </div>
                    ) : null
                  }
                  cursor={{ fill: 'oklch(0.5 0.01 260 / 10%)' }}
                />
                <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]} barSize={32}>
                  {pipeline.map((s, i) => (
                    <RCell key={`pipe-${i}`} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 customers */}
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 text-primary" />
            Top 5 Customers by Revenue
          </h4>
          <div className="space-y-2">
            {topCustomers.map((c, i) => (
              <div key={c.id} className="animate-slide-in flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-2.5" style={{ animationDelay: `${i * 60}ms` }}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  i === 0 ? 'bg-primary/20 text-primary' :
                  i === 1 ? 'bg-emerald-500/15 text-emerald-400' :
                  i === 2 ? 'bg-amber-500/15 text-amber-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{c.name}</span>
                    <span className="text-xs font-bold tabular-nums shrink-0 text-primary">{formatINR(c.totalValue)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{c.orderCount} orders</span>
                    <span>·</span>
                    <span className="tabular-nums">{formatINR(c.totalProfit)} profit</span>
                    <span>·</span>
                    <span className="tabular-nums text-emerald-400">{c.avgMargin}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(hasLowConversion || hasLowPayment) && (
        <div className="mt-4 space-y-2">
          {hasLowConversion && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 animate-slide-in">
              <TrendingUp className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-amber-400">Low Conversion Rate</p>
                <p className="text-muted-foreground mt-0.5">
                  Only {summary.conversionRate}% of quotations convert to orders ({summary.totalQuotations - Math.round(summary.totalQuotations * summary.conversionRate / 100)}/{summary.totalQuotations} not converted).
                  Follow up on pending quotations and improve sales pitch to boost conversion.
                </p>
              </div>
            </div>
          )}
          {hasLowPayment && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/5 p-3 animate-slide-in">
              <CreditCard className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-red-400">Low Payment Collection</p>
                <p className="text-muted-foreground mt-0.5">
                  Only {summary.paymentCollectionRate}% of revenue has been collected. Outstanding receivables need urgent attention.
                  Prioritize follow-ups with customers who have large unpaid balances.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
