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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
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
  Plus,
  Search,
  Eye,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  X,
  FileSpreadsheet,
  FileDown,
  Percent,
  UserCircle,
  IndianRupee,
  Loader2,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  Shirt,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { differenceInDays, format, startOfDay } from 'date-fns'
import { useQuotationDraftStore } from '@/store/quotation-draft-store'

// --- Types ---

interface QuotationItem {
  id: string
  quotationId: string
  styleName: string
  quantity: number
  unitPrice: number
  unitCost: number
  totalAmount: number
  totalCost: number
  profit: number
  itemDiscountPercent: number
  sampleId: string | null
}

interface Quotation {
  id: string
  quotationNo: string
  customerId: string
  customer: { id: string; companyName: string; buyerName: string | null }
  quotationDate: string
  validUntil: string
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Converted'
  totalAmount: number
  totalCost: number
  discountPercent: number
  notes: string | null
  convertedOrderId: string | null
  convertedOrderNo?: string | null
  itemCount: number
  items?: QuotationItem[]
  createdAt: string
  updatedAt: string
  brokerName: string | null
  brokerCommissionPercent: number
}

interface Customer {
  id: string
  companyName: string
  buyerName: string | null
  phone: string | null
  email: string | null
  status: string
}

interface NewLineItem {
  styleName: string
  quantity: number
  unitPrice: number
  unitCost: number
  itemDiscountPercent: number
  sampleId: string | null
}

// --- Helpers ---

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(1)}L`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
  return String(value)
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return format(d, 'dd/MM/yyyy')
  } catch {
    return '—'
  }
}

function relativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (isNaN(diff)) return ''
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return formatDate(dateStr)
  } catch {
    return ''
  }
}

function marginColor(margin: number): string {
  if (margin >= 25) return 'text-emerald-400'
  if (margin >= 10) return 'text-amber-400'
  return 'text-red-400'
}

function marginBgColor(margin: number): string {
  if (margin >= 25) return 'bg-emerald-500/10 border-emerald-500/20'
  if (margin >= 10) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  Draft: { color: 'bg-muted text-muted-foreground border-muted-foreground/30', icon: <FileSpreadsheet className="h-3 w-3" /> },
  Sent: { color: 'bg-sky-500/15 text-sky-400 border-sky-500/30', icon: <Send className="h-3 w-3" /> },
  Accepted: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  Rejected: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <XCircle className="h-3 w-3" /> },
  Converted: { color: 'bg-primary/15 text-primary border-primary/30', icon: <RefreshCw className="h-3 w-3" /> },
}

const STATUS_STEPS = ['Draft', 'Sent', 'Accepted', 'Converted']

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Draft
  return (
    <Badge variant="outline" className={`gap-1 text-[11px] font-medium ${cfg.color}`}>
      {cfg.icon}
      {status}
    </Badge>
  )
}

// --- Main Component ---

export function Quotations() {
  const { toast } = useToast()
  const { draftItems, draftCustomerId, shouldOpenCreate, clearDraft, consumeOpenSignal } = useQuotationDraftStore()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Summary KPIs
  const [kpiData, setKpiData] = useState({
    totalValue: 0,
    pendingCount: 0,
    acceptedCount: 0,
    acceptedValue: 0,
    convertedCount: 0,
  })

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [createLoading, setCreateLoading] = useState(false)
  const [newCustomerId, setNewCustomerId] = useState('')
  const [newItems, setNewItems] = useState<NewLineItem[]>([
    { styleName: '', quantity: 1, unitPrice: 0, unitCost: 0, itemDiscountPercent: 0, sampleId: null },
  ])
  const [newValidUntil, setNewValidUntil] = useState('')
  const [newDiscount, setNewDiscount] = useState('0')
  const [newNotes, setNewNotes] = useState('')
  const [brokerName, setBrokerName] = useState('')
  const [brokerCommissionPercent, setBrokerCommissionPercent] = useState(0)

  // Detail dialog
  const [detailQuotation, setDetailQuotation] = useState<Quotation | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [editNotes, setEditNotes] = useState('')

  // --- Fetch Quotations ---

  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sort', sortField)
      params.set('order', sortOrder)

      const res = await fetch(`/api/quotations?${params}`)
      if (res.ok) {
        const data = await res.json()
        const rawList = Array.isArray(data.quotations) ? data.quotations : []
        const qList: Quotation[] = rawList.map((q: Record<string, unknown>) => ({
          ...q,
          customer: (q.customer && typeof q.customer === 'object' && q.customer.id)
            ? q.customer
            : { id: String(q.customerId || ''), companyName: 'Unknown', buyerName: null },
          totalAmount: typeof q.totalAmount === 'number' ? q.totalAmount : 0,
          totalCost: typeof q.totalCost === 'number' ? q.totalCost : 0,
          itemCount: typeof q.itemCount === 'number' ? q.itemCount : 0,
          brokerName: (q as Record<string, unknown>).brokerName as string | null || null,
          brokerCommissionPercent: typeof (q as Record<string, unknown>).brokerCommissionPercent === 'number' ? (q as Record<string, unknown>).brokerCommissionPercent as number : 0,
        })) as Quotation[]
        setQuotations(qList)
        setTotal(data.total || 0)
        const counts = data.statusCounts || {}
        setStatusCounts(counts)

        const totalVal = qList.reduce((s: number, q: Quotation) => s + (q.totalAmount || 0), 0)
        const pending = (counts['Draft'] || 0) + (counts['Sent'] || 0)
        const accCount = counts['Accepted'] || 0
        const convCount = counts['Converted'] || 0
        setKpiData({
          totalValue: totalVal,
          pendingCount: pending,
          acceptedCount: accCount,
          acceptedValue: 0,
          convertedCount: convCount,
        })
      } else {
        toast({ title: 'Failed to load quotations', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network error loading quotations', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page, limit, sortField, sortOrder])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  // --- Listen for Draft Items from Sample Catalog ---
  useEffect(() => {
    if (shouldOpenCreate && draftItems.length > 0) {
      // Pre-fill items from draft
      setNewItems(draftItems.map(d => ({
        styleName: d.styleName,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        unitCost: d.unitCost,
        itemDiscountPercent: d.itemDiscountPercent,
        sampleId: d.sampleId,
      })))
      // Pre-fill customer if available
      if (draftCustomerId) {
        setNewCustomerId(draftCustomerId)
      }
      // Open create dialog
      setCreateOpen(true)
      // Consume the signal
      consumeOpenSignal()
      toast({ title: `${draftItems.length} pieces loaded from Sample Catalog`, description: 'Fill in pricing and create quotation' })
    }
  }, [shouldOpenCreate, draftItems, draftCustomerId, consumeOpenSignal, toast])

  // --- Fetch Customers for Create Dialog ---

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers?limit=100')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data?.customers)) {
          setCustomers(data.customers.filter((c: Record<string, unknown>) => c && c.id && c.companyName))
          return
        }
        if (Array.isArray(data)) {
          setCustomers(data.filter((c: Record<string, unknown>) => c && c.id && c.companyName))
          return
        }
      }
    } catch { /* empty */ }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  useEffect(() => {
    if (customers.length === 0 && quotations.length > 0) {
      const uniqueCustomers = new Map<string, Customer>()
      quotations.forEach((q) => {
        if (!uniqueCustomers.has(q.customer.id)) {
          uniqueCustomers.set(q.customer.id, {
            id: q.customer.id,
            companyName: q.customer.companyName,
            buyerName: q.customer.buyerName,
            phone: null,
            email: null,
            status: 'Active',
          })
        }
      })
      if (uniqueCustomers.size > 0) setCustomers(Array.from(uniqueCustomers.values()))
    }
  }, [quotations.length, customers.length])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const handleCreateQuotation = async () => {
    if (!newCustomerId || newItems.some((i) => !i.styleName || i.quantity <= 0 || i.unitPrice <= 0)) {
      toast({ title: 'Please fill in customer and all required item fields', variant: 'destructive' })
      return
    }
    if (!newValidUntil) {
      toast({ title: 'Please select a valid-until date', variant: 'destructive' })
      return
    }
    const validDate = new Date(newValidUntil)
    if (isNaN(validDate.getTime())) {
      toast({ title: 'Invalid date selected', variant: 'destructive' })
      return
    }
    setCreateLoading(true)
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: newCustomerId,
          validUntil: validDate.toISOString(),
          items: newItems.map((i) => ({
            styleName: i.styleName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unitCost: i.unitCost,
            itemDiscountPercent: i.itemDiscountPercent || 0,
            sampleId: i.sampleId || null,
          })),
          discountPercent: 0,
          brokerName: brokerName || undefined,
          brokerCommissionPercent: brokerCommissionPercent || 0,
          notes: newNotes || undefined,
        }),
      })
      if (res.ok) {
        toast({ title: 'Quotation created successfully' })
        setCreateOpen(false)
        resetCreateForm()
        fetchQuotations()
      } else {
        const data = await res.json()
        toast({ title: data.error || 'Failed to create quotation', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network error — could not create quotation', variant: 'destructive' })
    } finally {
      setCreateLoading(false)
    }
  }

  const resetCreateForm = () => {
    setNewCustomerId('')
    setNewItems([{ styleName: '', quantity: 1, unitPrice: 0, unitCost: 0, itemDiscountPercent: 0, sampleId: null }])
    setNewValidUntil('')
    setNewDiscount('0')
    setNewNotes('')
    setBrokerName('')
    setBrokerCommissionPercent(0)
    clearDraft()
  }

  const addItemRow = () => {
    setNewItems([...newItems, { styleName: '', quantity: 1, unitPrice: 0, unitCost: 0, itemDiscountPercent: 0, sampleId: null }])
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

  // --- Updated Create Totals (per-item discount) ---

  const createTotals = newItems.reduce(
    (acc, item) => {
      const finalUnitPrice = item.unitPrice * (1 - (item.itemDiscountPercent || 0) / 100)
      const lineTotal = finalUnitPrice * item.quantity
      const lineCost = item.unitCost * item.quantity
      acc.amount += lineTotal
      acc.cost += lineCost
      return acc
    },
    { amount: 0, cost: 0 },
  )

  const brokerAmount = createTotals.amount * (brokerCommissionPercent || 0) / 100
  const netAmount = createTotals.amount - brokerAmount
  const netProfit = netAmount - createTotals.cost
  const netMargin = netAmount > 0 ? (netProfit / netAmount) * 100 : 0

  const openDetail = async (qt: Quotation) => {
    setDetailQuotation(qt)
    setDetailOpen(true)
    setEditNotes(qt.notes || '')
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/quotations/${qt.id}`)
      if (res.ok) {
        const data = await res.json()
        if (!data || (typeof data !== 'object')) {
          toast({ title: 'Invalid quotation data received', variant: 'destructive' })
          return
        }
        const qtData = data.quotation || data
        setDetailQuotation({
          ...qtData,
          customer: (qtData.customer && typeof qtData.customer === 'object' && qtData.customer.id)
            ? qtData.customer
            : { id: String(qtData.customerId || ''), companyName: 'Unknown', buyerName: null },
          itemCount: qtData.itemCount || (qtData.items?.length ?? qt.itemCount),
          totalAmount: typeof qtData.totalAmount === 'number' ? qtData.totalAmount : 0,
          totalCost: typeof qtData.totalCost === 'number' ? qtData.totalCost : 0,
          brokerName: qtData.brokerName || null,
          brokerCommissionPercent: typeof qtData.brokerCommissionPercent === 'number' ? qtData.brokerCommissionPercent : 0,
        } as Quotation)
        setEditNotes(qtData.notes || '')
      } else {
        toast({ title: 'Could not load full details — showing summary', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network error loading quotation details', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!detailQuotation) return
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/quotations/${detailQuotation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = data.quotation || data
        const qtData = {
          ...updated,
          itemCount: updated.itemCount || (updated.items?.length ?? detailQuotation.itemCount),
          convertedOrderNo: data.convertedOrder?.orderNo || updated.convertedOrderNo || null,
        }
        setDetailQuotation(qtData as Quotation)
        fetchQuotations()
        if (newStatus === 'Converted' && data.convertedOrder) {
          toast({ title: `Quotation converted! Order ${data.convertedOrder.orderNo} created.` })
        } else {
          toast({ title: `Status updated to ${newStatus}` })
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        toast({ title: (errData as Record<string, string>).error || 'Failed to update status', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network error — could not update status', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!detailQuotation) return
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/quotations/${detailQuotation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = data.quotation || data
        setDetailQuotation({
          ...updated,
          itemCount: updated.itemCount || (updated.items?.length ?? detailQuotation.itemCount),
        } as Quotation)
        fetchQuotations()
        toast({ title: 'Notes saved' })
      }
    } catch {
      toast({ title: 'Failed to save notes', variant: 'destructive' })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleDownloadPdf = (qt: Quotation) => {
    window.open(`/api/quotations/${qt.id}/pdf`, '_blank')
  }

  const totalPages = Math.ceil(total / limit)

  const filterTabs = [
    { key: '', label: 'All', count: total },
    { key: 'Draft', label: 'Draft', count: statusCounts['Draft'] || 0 },
    { key: 'Sent', label: 'Sent', count: statusCounts['Sent'] || 0 },
    { key: 'Accepted', label: 'Accepted', count: statusCounts['Accepted'] || 0 },
    { key: 'Rejected', label: 'Rejected', count: statusCounts['Rejected'] || 0 },
    { key: 'Converted', label: 'Converted', count: statusCounts['Converted'] || 0 },
  ]

  const getDaysRemaining = (validUntil: string) => {
    try {
      const d = new Date(validUntil)
      if (isNaN(d.getTime())) return -999
      return differenceInDays(d, new Date())
    } catch {
      return -999
    }
  }

  const getMargin = (qt: Quotation) => {
    if (!qt || qt.totalAmount <= 0) return 0
    return ((qt.totalAmount - qt.totalCost) / qt.totalAmount) * 100
  }

  return (
    <div className="space-y-4">
      {/* --- Header --- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Quotations</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{total} quotations</span>
              <span>·</span>
              <span className="text-emerald-400">{statusCounts['Accepted'] || 0} accepted</span>
              <span>·</span>
              <span className="text-primary">{statusCounts['Converted'] || 0} converted</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="quotations" />
          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New Quotation
          </Button>
        </div>
      </div>

      {/* --- Summary Cards --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4 border-l-4 border-l-primary">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Total Quotation Value</span>
            <IndianRupee className="h-4 w-4 text-primary/60" />
          </div>
          <p className="text-lg font-bold text-foreground">{formatINR(kpiData.totalValue)}</p>
          <p className="text-[11px] text-muted-foreground">{total} quotations</p>
        </div>

        <div className="glass-card rounded-xl p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Pending</span>
            <Clock className="h-4 w-4 text-amber-500/60" />
          </div>
          <p className="text-lg font-bold text-foreground">{kpiData.pendingCount}</p>
          <p className="text-[11px] text-muted-foreground">Draft + Sent</p>
        </div>

        <div className="glass-card rounded-xl p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Accepted</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
          </div>
          <p className="text-lg font-bold text-foreground">{kpiData.acceptedCount}</p>
          <p className="text-[11px] text-muted-foreground">Ready to convert</p>
        </div>

        <div className="glass-card rounded-xl p-4 border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Conversion Rate</span>
            <TrendingUp className="h-4 w-4 text-sky-500/60" />
          </div>
          <p className="text-lg font-bold text-foreground">
            {total > 0 ? ((kpiData.convertedCount / total) * 100).toFixed(1) : 0}%
          </p>
          <p className="text-[11px] text-muted-foreground">{kpiData.convertedCount} of {total} converted</p>
        </div>
      </div>

      {/* --- Status Filter Tabs --- */}
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

      {/* --- Search & Sort --- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by quotation no. or customer..."
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
              <SelectItem value="totalAmount-desc">Highest Value</SelectItem>
              <SelectItem value="totalAmount-asc">Lowest Value</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* --- Desktop Table --- */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead
                  className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort('quotationNo')}
                >
                  <span className="flex items-center gap-1">Quotation No <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Customer</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden lg:table-cell">Items</TableHead>
                <TableHead
                  className="text-xs font-medium text-muted-foreground text-right cursor-pointer select-none"
                  onClick={() => handleSort('totalAmount')}
                >
                  <span className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground text-right hidden xl:table-cell">Margin</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground hidden lg:table-cell">Valid Until</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="w-10 text-xs font-medium text-muted-foreground" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell colSpan={8}>
                      <div className="flex items-center gap-3 py-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-4 w-32" />
                        <div className="flex-1" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : quotations.length === 0 ? (
                <TableRow className="border-border/30">
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileSpreadsheet className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No quotations found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((qt) => {
                  const daysRem = getDaysRemaining(qt.validUntil)
                  const margin = getMargin(qt)
                  return (
                    <TableRow
                      key={qt.id}
                      className="border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => openDetail(qt)}
                    >
                      <TableCell>
                        <span className="text-sm font-semibold text-primary">{qt.quotationNo}</span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{qt.customer.companyName}</p>
                          {qt.customer.buyerName && (
                            <p className="text-[11px] text-muted-foreground">{qt.customer.buyerName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm hidden lg:table-cell">
                        {qt.itemCount}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatINR(qt.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right hidden xl:table-cell">
                        <span className={`text-sm font-medium ${margin >= 30 ? 'text-emerald-400' : margin >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{formatDate(qt.validUntil)}</span>
                          {qt.status !== 'Converted' && qt.status !== 'Rejected' && daysRem <= 7 && daysRem >= 0 && (
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                          )}
                          {qt.status !== 'Converted' && qt.status !== 'Rejected' && daysRem < 0 && (
                            <span className="text-[10px] text-red-400 font-medium">Expired</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={qt.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); openDetail(qt) }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) { pageNum = i + 1 }
                else if (page <= 3) { pageNum = i + 1 }
                else if (page >= totalPages - 2) { pageNum = totalPages - 4 + i }
                else { pageNum = page - 2 + i }
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
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* --- Mobile Cards --- */}
      <div className="md:hidden space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <div className="flex justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))
        ) : quotations.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No quotations found</p>
          </div>
        ) : (
          quotations.map((qt) => {
            const daysRem = getDaysRemaining(qt.validUntil)
            return (
              <div
                key={qt.id}
                className="glass-card rounded-xl p-4 space-y-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => openDetail(qt)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary">{qt.quotationNo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{qt.customer.companyName}</p>
                    {qt.customer.buyerName && (
                      <p className="text-[11px] text-muted-foreground/70">{qt.customer.buyerName}</p>
                    )}
                  </div>
                  <StatusBadge status={qt.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold">{formatINR(qt.totalAmount)}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(qt.validUntil)}
                    {qt.status !== 'Converted' && qt.status !== 'Rejected' && daysRem <= 7 && daysRem >= 0 && (
                      <AlertTriangle className="h-3 w-3 text-amber-400 ml-0.5" />
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 pt-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ============ CREATE QUOTATION DIALOG ============ */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm() }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Quotation
            </DialogTitle>
            <DialogDescription>Prepare a new quotation with line items for your customer</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Customer Select */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Customer *</Label>
              <Select value={newCustomerId || '__placeholder__'} onValueChange={(v) => setNewCustomerId(v === '__placeholder__' ? '' : v)}>
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

            {/* Broker Section */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <UserCircle className="h-3.5 w-3.5" />
                Broker (optional)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="e.g., Rajshree Enterprises"
                  className="h-8 text-sm bg-muted/50"
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                />
                <div className="relative">
                  <Percent className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    type="number"
                    placeholder="e.g., 5"
                    className="h-8 text-sm bg-muted/50 pr-8"
                    value={brokerCommissionPercent || ''}
                    onChange={(e) => setBrokerCommissionPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </div>
              </div>
            </div>

            {/* Valid Until */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Valid Until *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`h-8 w-full justify-start text-left text-sm font-normal bg-muted/50 ${!newValidUntil ? 'text-muted-foreground' : ''}`}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    {newValidUntil ? format(new Date(newValidUntil), 'dd/MM/yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newValidUntil ? new Date(newValidUntil) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const yyyy = date.getFullYear()
                        const mm = String(date.getMonth() + 1).padStart(2, '0')
                        const dd = String(date.getDate()).padStart(2, '0')
                        setNewValidUntil(`${yyyy}-${mm}-${dd}`)
                      }
                    }}
                    disabled={(date) => date < startOfDay(new Date())}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Line Items *</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" onClick={addItemRow}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {newItems.map((item, idx) => {
                  const lineBeforeDiscount = item.quantity * item.unitPrice
                  const finalUnitPrice = item.unitPrice * (1 - (item.itemDiscountPercent || 0) / 100)
                  const lineAfterDiscount = finalUnitPrice * item.quantity
                  const lineCost = item.unitCost * item.quantity
                  const itemProfit = lineAfterDiscount - lineCost
                  const itemMargin = lineAfterDiscount > 0 ? (itemProfit / lineAfterDiscount) * 100 : 0
                  return (
                    <div key={idx} className="glass-card rounded-lg p-3 space-y-2 border border-border/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                        {newItems.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItemRow(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="sm:col-span-2">
                          <Input
                            placeholder="Style / Product name *"
                            className="h-8 text-sm bg-muted/50"
                            value={item.styleName}
                            onChange={(e) => updateItem(idx, 'styleName', e.target.value)}
                          />
                        </div>
                        <Input
                          type="number"
                          placeholder="Qty"
                          className="h-8 text-sm bg-muted/50"
                          value={item.quantity || ''}
                          onChange={(e) => updateItem(idx, 'quantity', Math.max(0, parseInt(e.target.value) || 0))}
                          min={1}
                        />
                        <Input
                          type="number"
                          placeholder="Unit Price (₹)"
                          className="h-8 text-sm bg-muted/50"
                          value={item.unitPrice || ''}
                          onChange={(e) => updateItem(idx, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                          min={0}
                          step={0.01}
                        />
                        <Input
                          type="number"
                          placeholder="Unit Cost (₹)"
                          className="h-8 text-sm bg-muted/50"
                          value={item.unitCost || ''}
                          onChange={(e) => updateItem(idx, 'unitCost', Math.max(0, parseFloat(e.target.value) || 0))}
                          min={0}
                          step={0.01}
                        />
                        <div className="relative">
                          <Percent className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <Input
                            type="number"
                            placeholder="Discount %"
                            className="h-8 text-sm bg-muted/50 pr-8"
                            value={item.itemDiscountPercent || ''}
                            onChange={(e) => updateItem(idx, 'itemDiscountPercent', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                            min={0}
                            max={100}
                            step={0.5}
                          />
                        </div>
                      </div>
                      {item.quantity > 0 && item.unitPrice > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>Line: <span className="font-medium text-foreground">{formatINR(lineBeforeDiscount)}</span></span>
                          {(item.itemDiscountPercent || 0) > 0 && (
                            <span>After Disc: <span className="font-medium text-emerald-400">{formatINR(lineAfterDiscount)}</span></span>
                          )}
                          {item.unitCost > 0 && (
                            <span className="flex items-center gap-1">Margin: <span className={`inline-block h-1.5 w-1.5 rounded-full ${itemMargin >= 25 ? 'bg-emerald-400' : itemMargin >= 10 ? 'bg-amber-400' : 'bg-red-400'}`} /><span className={`font-semibold ${marginColor(itemMargin)}`}>{itemMargin.toFixed(1)}%</span></span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Overall Discount (de-emphasized) */}
            <div className="space-y-2 opacity-50">
              <Label className="text-xs font-medium">Overall Discount (%) — prefer per-item discounts above</Label>
              <Input
                type="number"
                className="h-8 text-sm bg-muted/50 w-32"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
                min={0}
                max={100}
                step={0.5}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea
                placeholder="Quotation notes or special terms..."
                className="min-h-[60px] text-sm bg-muted/50 resize-none"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>

            {/* Live Summary */}
            {createTotals.amount > 0 && (
              <div className="glass-card rounded-lg p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quotation Summary</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({newItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span>{formatINR(createTotals.amount)}</span>
                </div>
                {createTotals.cost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Cost</span>
                    <span>{formatINR(createTotals.cost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Profit</span>
                  <span className={createTotals.amount - createTotals.cost >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatINR(createTotals.amount - createTotals.cost)}
                  </span>
                </div>
                {brokerCommissionPercent > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Broker ({brokerCommissionPercent}%)</span>
                      <span className="text-red-400">-{formatINR(brokerAmount)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between text-sm font-medium">
                      <span>Net Amount (after broker)</span>
                      <span>{formatINR(netAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Net Profit (after broker)</span>
                      <span className={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatINR(netProfit)}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center gap-2">
                      <span className="text-muted-foreground">Net Margin (after broker)</span>
                      <span className={`font-semibold px-2 py-0.5 rounded border text-xs ${marginBgColor(netMargin)} ${marginColor(netMargin)}`}>
                        {netMargin.toFixed(1)}%
                      </span>
                    </div>
                  </>
                )}
                {brokerCommissionPercent <= 0 && createTotals.cost > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Profit</span>
                      <span className={createTotals.amount - createTotals.cost >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatINR(createTotals.amount - createTotals.cost)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm items-center gap-2">
                      <span className="text-muted-foreground">Margin</span>
                      <span className={`font-semibold px-2 py-0.5 rounded border text-xs ${marginBgColor(netMargin)} ${marginColor(netMargin)}`}>
                        {netMargin.toFixed(1)}%
                      </span>
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
              onClick={handleCreateQuotation}
              disabled={createLoading || !newCustomerId || !newValidUntil || newItems.some((i) => !i.styleName || i.quantity <= 0 || i.unitPrice <= 0)}
            >
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Quotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ QUOTATION DETAIL DIALOG ============ */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setDetailQuotation(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
          {detailLoading && !detailQuotation ? (
            <>
              <DialogHeader>
                <DialogTitle>Loading Quotation…</DialogTitle>
                <DialogDescription>Fetching quotation details</DialogDescription>
              </DialogHeader>
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            </>
          ) : detailQuotation ? (
            <>
              <DialogHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <DialogTitle className="text-primary flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      {detailQuotation.quotationNo}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      Created {formatDate(detailQuotation.quotationDate)} · {relativeTime(detailQuotation.createdAt)}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={detailQuotation.status} />
                    {detailQuotation.convertedOrderId && (
                      <Badge variant="outline" className="gap-1 text-[11px] bg-primary/10 text-primary border-primary/30">
                        <CheckCircle2 className="h-3 w-3" />
                        Order Created
                      </Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Customer Info */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Company</span>
                      <p className="font-medium">{detailQuotation.customer.companyName}</p>
                    </div>
                    {detailQuotation.customer.buyerName && (
                      <div>
                        <span className="text-muted-foreground text-xs">Buyer</span>
                        <p className="font-medium">{detailQuotation.customer.buyerName}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Broker Info Card */}
                {detailQuotation.brokerName && (
                  <div className="glass-card rounded-lg p-4 border border-primary/10">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <UserCircle className="h-3 w-3" />
                      Broker Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Broker Name</span>
                        <p className="font-medium">{detailQuotation.brokerName}</p>
                      </div>
                      {detailQuotation.brokerCommissionPercent > 0 && (
                        <div>
                          <span className="text-muted-foreground text-xs">Commission</span>
                          <p className="font-medium text-amber-400">{detailQuotation.brokerCommissionPercent}% of order value</p>
                          <p className="text-[11px] text-muted-foreground">
                            = {formatINR(detailQuotation.totalAmount * detailQuotation.brokerCommissionPercent / 100)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Validity Period */}
                <div className="glass-card rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Valid until</span>
                      <span className="text-sm font-medium">{formatDate(detailQuotation.validUntil)}</span>
                    </div>
                    {(() => {
                      const days = getDaysRemaining(detailQuotation.validUntil)
                      if (detailQuotation.status === 'Converted' || detailQuotation.status === 'Rejected') return null
                      if (days < 0) return <Badge variant="outline" className="text-[11px] bg-red-500/15 text-red-400 border-red-500/30">Expired</Badge>
                      if (days <= 7) return <Badge variant="outline" className="text-[11px] bg-amber-500/15 text-amber-400 border-amber-500/30">{days} day{days !== 1 ? 's' : ''} left</Badge>
                      return <Badge variant="outline" className="text-[11px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{days} days left</Badge>
                    })()}
                  </div>
                </div>

                {/* Items Table */}
                {detailQuotation.items && detailQuotation.items.length > 0 && (
                  <div className="glass-card rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/30">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items ({detailQuotation.items.length})</h4>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/30 hover:bg-transparent">
                          <TableHead className="text-xs font-medium text-muted-foreground w-12">Image</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground">Style</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right">Qty</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right hidden sm:table-cell">Unit Price</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right hidden sm:table-cell">Unit Cost</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right hidden md:table-cell">Disc %</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right hidden md:table-cell">Final Price</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right">Total</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-center hidden lg:table-cell">Health</TableHead>
                          <TableHead className="text-xs font-medium text-muted-foreground text-right hidden lg:table-cell">Profit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailQuotation.items.map((item) => {
                          const itemMargin = item.totalAmount > 0 ? ((item.totalAmount - item.totalCost) / item.totalAmount) * 100 : 0
                          const isHealthy = itemMargin >= 25
                          const isWarning = itemMargin >= 10 && itemMargin < 25
                          const isDanger = itemMargin < 10
                          return (
                            <TableRow key={item.id} className="border-border/20">
                              <TableCell>
                                {(item as any)._image ? (
                                  <img src={(item as any)._image} alt={item.styleName} className="h-8 w-8 rounded object-cover" />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                                    <Shirt className="h-4 w-4 text-muted-foreground/30" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm font-medium">{item.styleName}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{item.quantity}</TableCell>
                              <TableCell className="text-sm text-right hidden sm:table-cell">{formatINR(item.unitPrice)}</TableCell>
                              <TableCell className="text-sm text-right hidden sm:table-cell text-muted-foreground">{formatINR(item.unitCost)}</TableCell>
                              <TableCell className="text-sm text-right hidden md:table-cell">
                                {(item.itemDiscountPercent || 0) > 0 ? (
                                  <span className="text-emerald-400 font-medium">{item.itemDiscountPercent}%</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-right font-medium hidden md:table-cell">
                                {item.unitPrice > 0 && (item.itemDiscountPercent || 0) > 0 ? (
                                  <span className="text-emerald-400">{formatINR(item.unitPrice * (1 - item.itemDiscountPercent / 100))}</span>
                                ) : (
                                  <span>{formatINR(item.unitPrice)}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-right font-medium">{formatINR(item.totalAmount)}</TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex items-center justify-center gap-1.5">
                                  <div className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-emerald-400' : isWarning ? 'bg-amber-400' : 'bg-red-400'}`} />
                                  <span className={`text-xs font-semibold tabular-nums ${isHealthy ? 'text-emerald-400' : isWarning ? 'text-amber-400' : 'text-red-400'}`}>
                                    {itemMargin.toFixed(1)}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className={`text-sm text-right hidden lg:table-cell font-medium ${item.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatINR(item.profit)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Totals Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass-card rounded-lg p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount</p>
                    <p className="text-sm font-bold mt-1">{formatINR(detailQuotation.totalAmount)}</p>
                  </div>
                  <div className="glass-card rounded-lg p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cost</p>
                    <p className="text-sm font-bold mt-1">{formatINR(detailQuotation.totalCost)}</p>
                  </div>
                  <div className="glass-card rounded-lg p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Profit</p>
                    <p className={`text-sm font-bold mt-1 ${(detailQuotation.totalAmount - detailQuotation.totalCost) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatINR(detailQuotation.totalAmount - detailQuotation.totalCost)}
                    </p>
                  </div>
                  <div className="glass-card rounded-lg p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Margin</p>
                    <p className={`text-sm font-bold mt-1 ${marginColor(getMargin(detailQuotation))}`}>
                      {getMargin(detailQuotation).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Status Timeline */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Status Timeline</h4>
                  <div className="flex items-center gap-1">
                    {STATUS_STEPS.map((step, idx) => {
                      const isRejected = detailQuotation.status === 'Rejected'
                      const currentStepIdx = isRejected
                        ? STATUS_STEPS.indexOf('Sent')
                        : STATUS_STEPS.indexOf(detailQuotation.status)
                      const isCompleted = idx <= currentStepIdx && !isRejected
                      const isCurrent = step === detailQuotation.status
                      return (
                        <div key={step} className="flex items-center gap-1 flex-1">
                          <div className="flex flex-col items-center gap-1 flex-1">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                                isRejected && step === 'Sent'
                                  ? 'bg-red-500/20 text-red-400 ring-2 ring-red-500/30'
                                  : isCurrent
                                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-lg shadow-primary/20'
                                    : isCompleted
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {isCompleted && !isCurrent ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                            </div>
                            <span className={`text-[10px] font-medium ${
                              isCurrent ? 'text-primary' : isCompleted ? 'text-emerald-400' : 'text-muted-foreground'
                            }`}>
                              {isRejected && step === 'Accepted' ? 'Rejected' : step}
                            </span>
                          </div>
                          {idx < STATUS_STEPS.length - 1 && (
                            <div className={`h-0.5 w-full max-w-[40px] rounded ${
                              isCompleted ? 'bg-emerald-500/40' : 'bg-muted'
                            }`} />
                          )}
                        </div>
                      )
                    })}
                    {detailQuotation.status === 'Rejected' && (
                      <div className="flex items-center gap-1 flex-1">
                        <div className="h-0.5 w-full max-w-[40px] rounded bg-red-500/40" />
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-2 ring-red-500/30 text-[10px] font-bold">
                            <XCircle className="h-4 w-4" />
                          </div>
                          <span className="text-[10px] font-medium text-red-400">Rejected</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="glass-card rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                    {editNotes !== (detailQuotation.notes || '') && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={handleSaveNotes} disabled={updateLoading}>
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

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="gap-2 border-border/50 text-foreground hover:bg-muted/50"
                    onClick={() => handleDownloadPdf(detailQuotation!)}
                  >
                    <FileDown className="h-4 w-4" />
                    Download PDF
                  </Button>
                  {detailQuotation.status === 'Draft' && (
                    <Button className="gap-2 bg-sky-600 text-white hover:bg-sky-700" onClick={() => handleStatusChange('Sent')} disabled={updateLoading}>
                      {updateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send to Customer
                    </Button>
                  )}
                  {detailQuotation.status === 'Sent' && (
                    <>
                      <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleStatusChange('Accepted')} disabled={updateLoading}>
                        {updateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Accept
                      </Button>
                      <Button variant="outline" className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleStatusChange('Rejected')} disabled={updateLoading}>
                        {updateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        Reject
                      </Button>
                    </>
                  )}
                  {detailQuotation.status === 'Accepted' && (
                    <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20" onClick={() => handleStatusChange('Converted')} disabled={updateLoading}>
                      {updateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Convert to Order
                    </Button>
                  )}
                </div>

                {/* Converted Order Reference */}
                {detailQuotation.status === 'Converted' && detailQuotation.convertedOrderId && (
                  <div className="glass-card rounded-lg p-4 border border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-semibold text-primary">Converted to Sales Order</p>
                        <p className="text-xs text-muted-foreground">Order: {detailQuotation.convertedOrderNo || detailQuotation.convertedOrderId}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
