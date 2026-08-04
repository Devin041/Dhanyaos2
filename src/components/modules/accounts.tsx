'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileX,
  X,
  IndianRupee,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Transaction {
  id: string
  type: string
  category: string
  amount: number
  description: string
  referenceNo: string | null
  date: string
  createdAt: string
  updatedAt: string
}

interface Summary {
  totalCredits: number
  totalDebits: number
  netCashFlow: number
  thisMonthCredits: number
  thisMonthDebits: number
  uniqueCategories: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inr = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}/${mm}/${yy}`
}

const toLocalDate = (iso: string) => {
  const d = new Date(iso)
  return d.toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountsModule() {
  const { toast } = useToast()

  // ─── State ─────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('All')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const limit = 20

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formType, setFormType] = useState<'Credit' | 'Debit'>('Credit')
  const [formCategory, setFormCategory] = useState('')
  const [formCategoryCustom, setFormCategoryCustom] = useState(false)
  const [formAmount, setFormAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formReference, setFormReference] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0])

  // ─── Fetch ─────────────────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'All') params.set('type', typeFilter)
      if (categoryFilter !== 'All') params.set('category', categoryFilter)
      if (search.trim()) params.set('search', search.trim())
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/accounts?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setTransactions(data.transactions)
        setTotal(data.total)
        setSummary(data.summary)
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to load transactions', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [typeFilter, categoryFilter, search, fromDate, toDate, page, toast])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [typeFilter, categoryFilter, search, fromDate, toDate])

  const totalPages = Math.ceil(total / limit)

  // ─── Form helpers ──────────────────────────────────────────────────────
  const resetForm = () => {
    setFormType('Credit')
    setFormCategory('')
    setFormCategoryCustom(false)
    setFormAmount('')
    setFormDescription('')
    setFormReference('')
    setFormDate(new Date().toISOString().split('T')[0])
  }

  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setSelectedTx(tx)
    setFormType(tx.type as 'Credit' | 'Debit')
    const cats = summary?.uniqueCategories || []
    if (cats.includes(tx.category)) {
      setFormCategory(tx.category)
      setFormCategoryCustom(false)
    } else {
      setFormCategory(tx.category)
      setFormCategoryCustom(true)
    }
    setFormAmount(String(tx.amount))
    setFormDescription(tx.description)
    setFormReference(tx.referenceNo || '')
    setFormDate(toLocalDate(tx.date))
    setEditOpen(true)
  }

  const openDelete = (tx: Transaction) => {
    setSelectedTx(tx)
    setDeleteOpen(true)
  }

  // ─── Create ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formCategory.trim()) {
      toast({ title: 'Validation', description: 'Category is required', variant: 'destructive' })
      return
    }
    if (!formAmount || parseFloat(formAmount) <= 0) {
      toast({ title: 'Validation', description: 'Amount must be a positive number', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          category: formCategory.trim(),
          amount: parseFloat(formAmount),
          description: formDescription.trim(),
          referenceNo: formReference.trim() || null,
          date: formDate || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: 'Created', description: 'Transaction added successfully' })
        setCreateOpen(false)
        fetchTransactions()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to create', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!selectedTx) return
    if (!formCategory.trim()) {
      toast({ title: 'Validation', description: 'Category is required', variant: 'destructive' })
      return
    }
    if (!formAmount || parseFloat(formAmount) <= 0) {
      toast({ title: 'Validation', description: 'Amount must be a positive number', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/accounts/${selectedTx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          category: formCategory.trim(),
          amount: parseFloat(formAmount),
          description: formDescription.trim(),
          referenceNo: formReference.trim() || null,
          date: formDate || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: 'Updated', description: 'Transaction updated successfully' })
        setEditOpen(false)
        fetchTransactions()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedTx) return
    setSaving(true)
    try {
      const res = await fetch(`/api/accounts/${selectedTx.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        toast({ title: 'Deleted', description: 'Transaction removed' })
        setDeleteOpen(false)
        fetchTransactions()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to delete', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Pagination component ──────────────────────────────────────────────
  const Pagination = () => {
    if (totalPages <= 1) return null
    const pages: (number | '...')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push('...')
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i)
      }
      if (page < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }

    return (
      <div className="flex items-center justify-between px-1 pt-4">
        <p className="text-xs text-muted-foreground">
          Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8 text-xs"
                onClick={() => setPage(p as number)}
              >
                {p}
              </Button>
            )
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ─── Form Dialog Content (shared between Create & Edit) ─────────────────
  const TransactionForm = ({ mode }: { mode: 'create' | 'edit' }) => (
    <div className="grid gap-4 py-2">
      {/* Type Radio */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Transaction Type</Label>
        <RadioGroup value={formType} onValueChange={(v) => setFormType(v as 'Credit' | 'Debit')} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="Credit" id={`${mode}-credit`} />
            <Label htmlFor={`${mode}-credit`} className="text-emerald-400 font-medium cursor-pointer">Credit (Inflow)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="Debit" id={`${mode}-debit`} />
            <Label htmlFor={`${mode}-debit`} className="text-red-400 font-medium cursor-pointer">Debit (Outflow)</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Category</Label>
        {!formCategoryCustom ? (
          <div className="flex gap-2">
            <Select value={formCategory} onValueChange={setFormCategory}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {(summary?.uniqueCategories || []).map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => { setFormCategoryCustom(true); setFormCategory('') }}>
              Custom
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input placeholder="Enter category name" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
            <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => { setFormCategoryCustom(false); setFormCategory('') }}>
              Pick
            </Button>
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Amount (₹)</Label>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="number" min="1" step="0.01" placeholder="0.00" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Description</Label>
        <Input placeholder="Transaction details..." value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
      </div>

      {/* Reference No */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Reference No.</Label>
        <Input placeholder="e.g. INV-001, CHQ-4521" value={formReference} onChange={(e) => setFormReference(e.target.value)} className="font-mono" />
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Date</Label>
        <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
      </div>
    </div>
  )

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Accounts</h1>
            <p className="text-xs text-muted-foreground">Track all financial transactions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="accounts" />
          <Button onClick={openCreate} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            New Transaction
          </Button>
        </div>
      </div>

      {/* ─── Summary Cards ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-7 w-36" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Credits */}
          <div className="glass-card rounded-xl border-l-4 border-l-emerald-500 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
              Total Credits
            </div>
            <p className="text-lg font-bold text-emerald-400">{inr(summary.totalCredits)}</p>
          </div>
          {/* Total Debits */}
          <div className="glass-card rounded-xl border-l-4 border-l-red-500 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
              Total Debits
            </div>
            <p className="text-lg font-bold text-red-400">{inr(summary.totalDebits)}</p>
          </div>
          {/* Net Cash Flow */}
          <div className="glass-card rounded-xl border-l-4 border-l-primary p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {summary.netCashFlow >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              )}
              Net Cash Flow
            </div>
            <p className={`text-lg font-bold ${summary.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {inr(summary.netCashFlow)}
            </p>
          </div>
          {/* This Month Net */}
          <div className="glass-card rounded-xl border-l-4 border-l-sky-500 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5 text-sky-500" />
              This Month Net
            </div>
            <p className={`text-lg font-bold ${summary.thisMonthCredits - summary.thisMonthDebits >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {inr(summary.thisMonthCredits - summary.thisMonthDebits)}
            </p>
          </div>
        </div>
      ) : null}

      {/* ─── Filter Bar ─────────────────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search description or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Types</SelectItem>
              <SelectItem value="Credit">Credit</SelectItem>
              <SelectItem value="Debit">Debit</SelectItem>
            </SelectContent>
          </Select>
          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              {(summary?.uniqueCategories || []).map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Date range - from/to on one row */}
          <div className="flex gap-2 lg:col-span-1">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1" placeholder="From" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto sm:w-44" placeholder="To" />
          {(fromDate || toDate || search || typeFilter !== 'All' || categoryFilter !== 'All') && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(''); setTypeFilter('All'); setCategoryFilter('All'); setFromDate(''); setToDate('') }}
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* ─── Transactions Table (Desktop) ───────────────────────────────── */}
      {loading ? (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 flex-1 max-w-[200px]" />
                <Skeleton className="h-4 w-24 font-mono" />
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="glass-card rounded-xl flex flex-col items-center justify-center py-16 gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <FileX className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No transactions found</p>
          <p className="text-xs text-muted-foreground">Try adjusting your filters or add a new transaction</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block glass-card rounded-xl overflow-hidden">
            <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-xs w-[100px]">Date</TableHead>
                    <TableHead className="text-xs w-[90px]">Type</TableHead>
                    <TableHead className="text-xs w-[120px]">Category</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-[140px]">Reference No</TableHead>
                    <TableHead className="text-xs text-right w-[120px]">Amount</TableHead>
                    <TableHead className="text-xs text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} className="border-border/30">
                      <TableCell className="text-xs font-mono text-muted-foreground py-3">
                        {formatDate(tx.date)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-semibold px-2 py-0.5 ${
                            tx.type === 'Credit'
                              ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                              : 'border-red-500/30 text-red-400 bg-red-500/10'
                          }`}
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="secondary" className="text-[11px] font-medium bg-muted/80 text-muted-foreground">
                          {tx.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm py-3 max-w-[200px] truncate">
                        {tx.description || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground py-3">
                        {tx.referenceNo || '—'}
                      </TableCell>
                      <TableCell className={`text-sm font-semibold text-right py-3 ${tx.type === 'Credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tx.type === 'Credit' ? '+' : '−'}{inr(tx.amount)}
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tx)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => openDelete(tx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination />
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-semibold px-2 py-0.5 ${
                        tx.type === 'Credit'
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : 'border-red-500/30 text-red-400 bg-red-500/10'
                      }`}
                    >
                      {tx.type}
                    </Badge>
                    <Badge variant="secondary" className="text-[11px] font-medium bg-muted/80 text-muted-foreground">
                      {tx.category}
                    </Badge>
                  </div>
                  <p className={`text-sm font-bold ${tx.type === 'Credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.type === 'Credit' ? '+' : '−'}{inr(tx.amount)}
                  </p>
                </div>
                <p className="text-sm text-foreground/80 truncate">{tx.description || '—'}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(tx.date)}</span>
                  {tx.referenceNo && <span className="font-mono">{tx.referenceNo}</span>}
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(tx)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-400 border-red-500/20 hover:bg-red-500/10" onClick={() => openDelete(tx)}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            ))}
            <Pagination />
          </div>
        </>
      )}

      {/* ─── Create Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              New Transaction
            </DialogTitle>
            <DialogDescription>Add a new credit or debit transaction to the accounts ledger.</DialogDescription>
          </DialogHeader>
          <TransactionForm mode="create" />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Pencil className="h-4 w-4 text-primary" />
              </div>
              Edit Transaction
            </DialogTitle>
            <DialogDescription>Modify the details of this transaction.</DialogDescription>
          </DialogHeader>
          <TransactionForm mode="edit" />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Dialog ──────────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </div>
              Delete Transaction
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedTx && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className={selectedTx.type === 'Credit' ? 'text-emerald-400' : 'text-red-400'}>{selectedTx.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{selectedTx.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{inr(selectedTx.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="truncate max-w-[200px]">{selectedTx.description || '—'}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}