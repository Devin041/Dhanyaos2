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
  Eye,
  Trash2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Package,
  UserRound,
  AlertCircle,
  IndianRupee,
  Shirt,
  PackageSearch,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDashboardStore } from '@/store/dashboard-store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReturnItemRow {
  id?: string
  itemName: string
  styleNo: string
  quantity: number
  unitValue: number
  totalValue: number
  reason: string
}

interface ReturnRecord {
  id: string
  returnNo: string
  returnType: string
  referenceId: string
  referenceNo: string
  partyName: string
  reason: string
  status: string
  totalQty: number
  totalValue: number
  refundAmount: number
  notes: string | null
  returnItems: ReturnItemRow[]
  _count?: { returnItems: number }
  createdAt: string
  updatedAt: string
}

interface ReferenceOption {
  id: string
  no: string
  partyName: string
  items?: { itemName: string; styleNo: string | null; quantity: number; unitPrice: number }[]
}

const typeTabs = ['All', 'Customer', 'Supplier'] as const
const statusTabs = ['All', 'Requested', 'Approved', 'Processed', 'Rejected'] as const

const typeBadgeClass: Record<string, string> = {
  Customer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Supplier: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

const statusBadgeClass: Record<string, string> = {
  Requested: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  Approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Processed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

// ─── Format currency ─────────────────────────────────────────────────────────

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Empty item row ──────────────────────────────────────────────────────────

function emptyItem(): ReturnItemRow {
  return { itemName: '', styleNo: '', quantity: 1, unitValue: 0, totalValue: 0, reason: '' }
}

// ─── Module ──────────────────────────────────────────────────────────────────

export function ReturnsModule() {
  const { setActiveView } = useDashboardStore()

  // Data
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeType, setActiveType] = useState<string>('All')
  const [activeStatus, setActiveStatus] = useState<string>('All')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Detail sheet
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(null)
  const [refundInput, setRefundInput] = useState<string>('')
  const [updatingRefund, setUpdatingRefund] = useState(false)

  // Create form state
  const [formType, setFormType] = useState<string>('Customer')
  const [formReferenceId, setFormReferenceId] = useState<string>('')
  const [formReferenceNo, setFormReferenceNo] = useState<string>('')
  const [formPartyName, setFormPartyName] = useState<string>('')
  const [formReason, setFormReason] = useState<string>('')
  const [formNotes, setFormNotes] = useState<string>('')
  const [formItems, setFormItems] = useState<ReturnItemRow[]>([emptyItem()])

  // Reference options
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>([])
  const [loadingRefs, setLoadingRefs] = useState(false)

  // ─── Fetch returns ────────────────────────────────────────────────────────
  const fetchReturns = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeType !== 'All') params.set('returnType', activeType)
      if (activeStatus !== 'All') params.set('status', activeStatus)
      if (search) params.set('search', search)

      const res = await fetch(`/api/returns?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setReturns(data.returns)
      setTotalCount(data.totalCount ?? 0)
      setStatusCounts(data.statusCounts || {})
      setTypeCounts(data.typeCounts || {})
    } catch {
      toast.error('Failed to fetch returns')
    } finally {
      setLoading(false)
    }
  }, [activeType, activeStatus, search])

  useEffect(() => {
    setLoading(true)
    fetchReturns()
  }, [fetchReturns])

  // ─── Fetch references ─────────────────────────────────────────────────────
  const fetchReferences = useCallback(async (type: string) => {
    setLoadingRefs(true)
    setFormReferenceId('')
    setFormReferenceNo('')
    setFormPartyName('')
    setFormItems([emptyItem()])
    try {
      let endpoint = ''
      if (type === 'Customer') {
        endpoint = '/api/orders?limit=100'
      } else {
        // Supplier: fetch both POs and VendorBills
        endpoint = '/api/purchase-orders?limit=100'
      }
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const list = type === 'Customer'
        ? (data.orders || []).map((o: { id: string; orderNo: string; customer: { companyName: string }; items: { styleName: string; style: { styleNo: string } | null; quantity: number; unitPrice: number }[] }) => ({
            id: o.id,
            no: o.orderNo,
            partyName: o.customer.companyName,
            items: o.items.map((it: { styleName: string; style: { styleNo: string } | null; quantity: number; unitPrice: number }) => ({
              itemName: it.styleName,
              styleNo: it.style?.styleNo || '',
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            })),
          }))
        : (data.purchaseOrders || []).map((o: { id: string; poNumber: string; supplier: { name: string }; fabricName: string; quantity: number; ratePerUnit: number }) => ({
            id: o.id,
            no: o.poNumber,
            partyName: o.supplier.name,
            items: [{ itemName: o.fabricName, styleNo: '', quantity: o.quantity, unitPrice: o.ratePerUnit }],
          }))
      setReferenceOptions(list)
    } catch {
      toast.error('Failed to load references')
    } finally {
      setLoadingRefs(false)
    }
  }, [])

  useEffect(() => {
    if (createOpen) {
      fetchReferences(formType)
    }
  }, [createOpen, formType, fetchReferences])

  // ─── Handle reference selection ───────────────────────────────────────────
  const handleReferenceSelect = (refId: string) => {
    const ref = referenceOptions.find(r => r.id === refId)
    if (ref) {
      setFormReferenceId(ref.id)
      setFormReferenceNo(ref.no)
      setFormPartyName(ref.partyName)
      if (ref.items && ref.items.length > 0) {
        setFormItems(ref.items.map(it => ({
          itemName: it.itemName,
          styleNo: it.styleNo || '',
          quantity: it.quantity,
          unitValue: it.unitPrice,
          totalValue: it.quantity * it.unitPrice,
          reason: '',
        })))
      }
    }
  }

  // ─── Item management ──────────────────────────────────────────────────────
  const updateItem = (index: number, field: keyof ReturnItemRow, value: string | number) => {
    setFormItems(prev => {
      const updated = [...prev]
      const item = { ...updated[index] }
      ;(item as Record<string, string | number>)[field] = value
      if (field === 'quantity' || field === 'unitValue') {
        item.totalValue = (Number(item.quantity) || 0) * (Number(item.unitValue) || 0)
      }
      updated[index] = item
      return updated
    })
  }

  const addItem = () => setFormItems(prev => [...prev, emptyItem()])
  const removeItem = (index: number) => {
    if (formItems.length <= 1) return
    setFormItems(prev => prev.filter((_, i) => i !== index))
  }

  // ─── Create return ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formReferenceId || !formPartyName || !formReason.trim()) {
      toast.error('Please fill in reference, party, and reason')
      return
    }
    const validItems = formItems.filter(it => it.itemName.trim() && it.quantity > 0)
    if (validItems.length === 0) {
      toast.error('At least one valid item is required')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnType: formType,
          referenceId: formReferenceId,
          referenceNo: formReferenceNo,
          partyName: formPartyName,
          reason: formReason,
          notes: formNotes || null,
          items: validItems,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create return')
      }
      toast.success('Return created successfully')
      setCreateOpen(false)
      resetForm()
      fetchReturns()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create return')
    } finally {
      setSaving(false)
    }
  }

  // ─── Status changes ───────────────────────────────────────────────────────
  const handleStatusChange = async (ret: ReturnRecord, newStatus: string) => {
    try {
      const res = await fetch(`/api/returns/${ret.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update status')
      }
      toast.success(`Return ${ret.returnNo} → ${newStatus}`)
      fetchReturns()
      if (selectedReturn?.id === ret.id) {
        const updated = await fetch(`/api/returns/${ret.id}`).then(r => r.json())
        setSelectedReturn(updated)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  // ─── Update refund amount ───────────────────────────────────────────────
  const handleRefundUpdate = async () => {
    if (!selectedReturn) return
    const value = parseFloat(refundInput)
    if (isNaN(value) || value < 0) {
      toast.error('Please enter a valid refund amount')
      return
    }
    setUpdatingRefund(true)
    try {
      const res = await fetch(`/api/returns/${selectedReturn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refundAmount: value }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update refund amount')
      }
      toast.success(`Refund amount updated to ${formatCurrency(value)}`)
      fetchReturns()
      const updated = await fetch(`/api/returns/${selectedReturn.id}`).then(r => r.json())
      setSelectedReturn(updated)
      setRefundInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update refund amount')
    } finally {
      setUpdatingRefund(false)
    }
  }

  // ─── Delete return ────────────────────────────────────────────────────────
  const handleDelete = async (ret: ReturnRecord) => {
    if (!confirm(`Delete return ${ret.returnNo}? This can only be done for "Requested" returns.`)) return
    try {
      const res = await fetch(`/api/returns/${ret.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      toast.success('Return deleted')
      fetchReturns()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete return')
    }
  }

  // ─── View detail ──────────────────────────────────────────────────────────
  const handleViewDetail = async (ret: ReturnRecord) => {
    try {
      const res = await fetch(`/api/returns/${ret.id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedReturn(data)
      setDetailOpen(true)
    } catch {
      toast.error('Failed to load return details')
    }
  }

  // ─── Reset form ───────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormType('Customer')
    setFormReferenceId('')
    setFormReferenceNo('')
    setFormPartyName('')
    setFormReason('')
    setFormNotes('')
    setFormItems([emptyItem()])
  }

  // ─── Search debounce ──────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // ─── Computed KPIs ────────────────────────────────────────────────────────
  const totalReturns = totalCount
  const pendingApproval = statusCounts['Requested'] || 0
  const customerReturns = typeCounts['Customer'] || 0
  const supplierReturns = typeCounts['Supplier'] || 0

  // ─── Reference navigation ─────────────────────────────────────────────────
  const getReferenceView = (ret: ReturnRecord) => {
    if (ret.returnType === 'Customer') return 'orders'
    return 'pos'
  }

  const formTotalValue = formItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitValue) || 0), 0)

  return (
    <div className="space-y-6">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <span>↩️</span> Returns Management
          </h1>
          <p className="text-sm text-muted-foreground">Track and manage customer & supplier returns</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="returns" />
          <Button onClick={() => { resetForm(); setCreateOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            New Return
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <RotateCcw className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Returns</p>
                <p className="text-xl font-bold">{totalReturns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
                <p className="text-xl font-bold">{pendingApproval}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <UserRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer Returns</p>
                <p className="text-xl font-bold">{customerReturns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Supplier Returns</p>
                <p className="text-xl font-bold">{supplierReturns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Type tabs */}
          {typeTabs.map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeType === t
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {t}
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-border" />
          {/* Status tabs */}
          {statusTabs.map(s => (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeStatus === s
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {s}
              {statusCounts[s] !== undefined && (
                <span className="ml-1 opacity-70">({statusCounts[s]})</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search returns..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* ─── Table ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : returns.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <RotateCcw className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No returns found</h3>
          <p className="text-sm text-muted-foreground">
            {search || activeType !== 'All' || activeStatus !== 'All'
              ? 'Try adjusting your filters'
              : 'Create your first return to get started'}
          </p>
          {!search && activeType === 'All' && activeStatus === 'All' && (
            <Button variant="outline" onClick={() => { resetForm(); setCreateOpen(true) }} className="mt-2 gap-2">
              <Plus className="h-4 w-4" />
              New Return
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return No</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead className="hidden sm:table-cell">Party</TableHead>
                <TableHead className="text-center hidden lg:table-cell">Items</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map(ret => (
                <TableRow key={ret.id} className="group">
                  <TableCell className="font-mono text-sm font-medium">{ret.returnNo}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass[ret.returnType] || ''}`}>
                      {ret.returnType}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <button
                      onClick={() => setActiveView(getReferenceView(ret))}
                      className="font-mono text-sm text-primary hover:underline"
                    >
                      {ret.referenceNo}
                    </button>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell max-w-[160px] truncate">{ret.partyName}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">
                    {ret._count?.returnItems || ret.returnItems?.length || 0}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(ret.totalValue)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass[ret.status] || ''}`}>
                      {ret.status}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatDate(ret.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetail(ret)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {ret.status === 'Requested' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(ret)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Create Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Return</DialogTitle>
            <DialogDescription>Record a customer or supplier return</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            {/* Return Type */}
            <div className="space-y-2">
              <Label>Return Type</Label>
              <div className="flex gap-3">
                {['Customer', 'Supplier'].map(t => (
                  <button
                    key={t}
                    onClick={() => setFormType(t)}
                    className={`flex items-center gap-2 rounded-lg border-2 px-5 py-3 text-sm font-medium transition-colors ${
                      formType === t
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    {t === 'Customer' ? <UserRound className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    {t} Return
                  </button>
                ))}
              </div>
            </div>

            {/* Reference */}
            <div className="grid gap-2">
              <Label>Reference {formType === 'Customer' ? 'Sales Order' : 'Purchase Order'}</Label>
              <Select onValueChange={handleReferenceSelect} value={formReferenceId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingRefs ? 'Loading...' : 'Select a reference document'} />
                </SelectTrigger>
                <SelectContent>
                  {referenceOptions.map(ref => (
                    <SelectItem key={ref.id} value={ref.id}>
                      {ref.no} — {ref.partyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Party Name */}
            <div className="grid gap-2">
              <Label>Party Name</Label>
              <Input value={formPartyName} onChange={e => setFormPartyName(e.target.value)} placeholder="Auto-filled from reference" />
            </div>

            {/* Reason */}
            <div className="grid gap-2">
              <Label>Reason *</Label>
              <Textarea
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                placeholder="e.g., Defective fabric, wrong size, quality issues..."
                rows={2}
              />
            </div>

            {/* Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Return Items</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" />
                  Add Item
                </Button>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item Name</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Style No</TableHead>
                      <TableHead className="text-xs text-center w-20">Qty</TableHead>
                      <TableHead className="text-xs text-right w-28">Unit Value</TableHead>
                      <TableHead className="text-xs text-right w-28">Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            className="h-8 text-sm"
                            placeholder="Item name"
                            value={item.itemName}
                            onChange={e => updateItem(idx, 'itemName', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Input
                            className="h-8 text-sm"
                            placeholder="Optional"
                            value={item.styleNo}
                            onChange={e => updateItem(idx, 'styleNo', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 text-sm text-center"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 text-sm text-right"
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unitValue}
                            onChange={e => updateItem(idx, 'unitValue', parseFloat(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(item.totalValue)}
                        </TableCell>
                        <TableCell>
                          {formItems.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeItem(idx)}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-right text-sm font-medium">
                Total Return Value: {formatCurrency(formTotalValue)}
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Additional notes (optional)"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              {saving ? 'Creating...' : <><Plus className="h-4 w-4" /> Create Return</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Sheet ──────────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedReturn && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-mono text-base">{selectedReturn.returnNo}</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass[selectedReturn.status] || ''}`}>
                    {selectedReturn.status}
                  </span>
                </SheetTitle>
                <SheetDescription>
                  {selectedReturn.returnType} Return · {formatDate(selectedReturn.createdAt)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Reference</p>
                    <button
                      onClick={() => { setDetailOpen(false); setActiveView(getReferenceView(selectedReturn)) }}
                      className="font-mono text-primary hover:underline"
                    >
                      {selectedReturn.referenceNo}
                    </button>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Party</p>
                    <p className="font-medium">{selectedReturn.partyName}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Reason</p>
                    <p>{selectedReturn.reason}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total Quantity</p>
                    <p className="font-medium">{selectedReturn.totalQty} pcs</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total Value</p>
                    <p className="font-medium">{formatCurrency(selectedReturn.totalValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Refund Amount</p>
                    <p className="font-medium flex items-center gap-1">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {formatCurrency(selectedReturn.refundAmount)}
                    </p>
                  </div>
                  {selectedReturn.notes && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Notes</p>
                      <p className="text-sm">{selectedReturn.notes}</p>
                    </div>
                  )}
                </div>

                {/* Update Refund Amount */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Update Refund</h4>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <IndianRupee className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        placeholder={String(selectedReturn.refundAmount)}
                        value={refundInput}
                        onChange={(e) => setRefundInput(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleRefundUpdate}
                      disabled={updatingRefund || !refundInput}
                    >
                      {updatingRefund ? 'Updating...' : 'Update Refund'}
                    </Button>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Return Items</h4>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-12">Img</TableHead>
                          <TableHead className="text-xs">Item</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Style</TableHead>
                          <TableHead className="text-xs text-center">Qty</TableHead>
                          <TableHead className="text-xs text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedReturn.returnItems?.map((item, idx) => (
                          <TableRow key={item.id || idx}>
                            <TableCell>
                              {(item as any)._image ? (
                                <img src={(item as any)._image} alt={item.itemName} className="h-8 w-8 rounded object-cover" />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                                  <Shirt className="h-4 w-4 text-muted-foreground/30" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm font-medium">{item.itemName}</TableCell>
                            <TableCell className="hidden sm:table-cell text-sm font-mono">{item.styleNo || '—'}</TableCell>
                            <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(item.totalValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Status Actions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedReturn.status === 'Requested' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(selectedReturn, 'Approved')}
                          className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(selectedReturn, 'Rejected')}
                          className="gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(selectedReturn)}
                          className="gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </>
                    )}
                    {selectedReturn.status === 'Approved' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(selectedReturn, 'Processed')}
                        className="gap-2"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Mark as Processed
                      </Button>
                    )}
                    {/* Return to FG Stock */}
                    {selectedReturn.returnItems?.some((i: any) => i.styleNo) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const items = selectedReturn.returnItems
                            .filter((i: any) => i.styleNo)
                            .map((i: any) => ({
                              styleNo: i.styleNo,
                              styleName: i.itemName,
                              color: '',
                              size: '',
                              quantity: i.quantity,
                              referenceNo: selectedReturn.returnNo,
                              partyName: selectedReturn.partyName,
                              reason: 'Customer Return',
                            }))
                          if (items.length === 0) {
                            toast.error('No items with style numbers to return')
                            return
                          }
                          try {
                            const res = await fetch('/api/fg-stock/return-qc', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ items }),
                            })
                            if (res.ok) {
                              toast.success('Items sent to FG Stock QC Pending')
                            } else {
                              const data = await res.json().catch(() => null)
                              toast.error(data?.error || 'Failed to return to FG Stock')
                            }
                          } catch {
                            toast.error('Failed to return to FG Stock')
                          }
                        }}
                        className="gap-2"
                      >
                        <PackageSearch className="h-4 w-4" />
                        Return to FG Stock
                      </Button>
                    )}
                    {(selectedReturn.status === 'Processed' || selectedReturn.status === 'Rejected') && (
                      <p className="text-xs text-muted-foreground">This return is {selectedReturn.status.toLowerCase()}. No further actions available.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}