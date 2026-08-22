'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Handshake,
  Plus,
  Search,
  Phone,
  MapPin,
  Trash2,
  Pencil,
  Building2,
  User,
  IndianRupee,
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  ArrowDownLeft,
  X,
  Receipt,
  Banknote,
  TrendingDown,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Vendor {
  id: string
  vendorName: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  specialization: string
  paymentTerms: number
  status: string
  _count: { stageTrackings: number }
  _billSummary?: {
    totalBilled: number
    totalPaid: number
    outstanding: number
    overdue: number
  }
  createdAt: string
}

interface VendorBill {
  id: string
  billNo: string
  vendorId: string
  vendor: { id: string; vendorName: string; paymentTerms: number }
  stageTrackingId: string | null
  stageTracking: {
    stageName: string
    productionJob: { jobNo: string; styleName: string }
  } | null
  description: string
  totalQty: number
  perPieceRate: number
  totalAmount: number
  paidAmount: number
  billDate: string
  dueDate: string | null
  status: string
  notes: string | null
  payments: VendorPayment[]
  createdAt: string
}

interface VendorPayment {
  id: string
  paymentNo: string
  vendorBillId: string
  vendorId: string
  amount: number
  paymentDate: string
  paymentMethod: string
  referenceNo: string | null
  notes: string | null
  createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPhone = (phone: string) => {
  if (!phone) return '—'
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) return cleaned.replace(/(\d{5})(\d{5})/, '$1-$2')
  return phone
}

const formatCurrency = (amount: number): string => {
  if (amount === 0) return '₹0'
  const parts = Math.abs(amount).toString().split('.')
  let intPart = parts[0]
  const decPart = parts[1]

  // Indian numbering system: last 3 digits, then groups of 2
  if (intPart.length > 3) {
    const lastThree = intPart.slice(-3)
    const rest = intPart.slice(0, -3)
    intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
  }

  const formatted = (amount < 0 ? '-' : '') + '₹' + intPart
  return decPart !== undefined ? formatted + '.' + decPart : formatted
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`
}

const dueDateLabel = (dueDate: string | null): string => {
  if (!dueDate) return ''
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `in ${diffDays} days`
}

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const todayISO = (): string => new Date().toISOString().split('T')[0]

const SPECIALIZATION_COLORS: Record<string, string> = {
  embroidery: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  stitching: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  'hand work': 'border-purple-500/50 bg-purple-500/10 text-purple-400',
  handwork: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
  cutting: 'border-sky-500/50 bg-sky-500/10 text-sky-400',
  washing: 'border-teal-500/50 bg-teal-500/10 text-teal-400',
  printing: 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  dyeing: 'border-pink-500/50 bg-pink-500/10 text-pink-400',
  finishing: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  packing: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400',
  quality: 'border-lime-500/50 bg-lime-500/10 text-lime-400',
  'quality check': 'border-lime-500/50 bg-lime-500/10 text-lime-400',
  tailoring: 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-400',
  'button work': 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  'zip work': 'border-stone-500/50 bg-stone-500/10 text-stone-400',
  'label work': 'border-violet-500/50 bg-violet-500/10 text-violet-400',
  ironing: 'border-red-500/50 bg-red-500/10 text-red-400',
  pleating: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400',
}

function getSpecializationColor(spec: string): string {
  return (
    SPECIALIZATION_COLORS[spec.toLowerCase().trim()] ||
    'border-muted-foreground/50 bg-muted-foreground/10 text-muted-foreground'
  )
}

function parseSpecialization(spec: string): string[] {
  if (!spec) return []
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={
        status === 'Active'
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0'
          : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-2 py-0'
      }
    >
      {status}
    </Badge>
  )
}

function BillStatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    Pending: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
    'Partially Paid': 'border-sky-500/50 bg-sky-500/10 text-sky-400',
    Paid: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
    Overdue: 'border-red-500/50 bg-red-500/10 text-red-400',
    Cancelled: 'border-muted-foreground/50 bg-muted-foreground/10 text-muted-foreground',
  }
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-2 py-0 ${config[status] || config.Pending}`}
    >
      {status}
    </Badge>
  )
}

function OutstandingBadge({ vendor }: { vendor: Vendor }) {
  const summary = vendor._billSummary
  if (!summary) return null

  const { outstanding, overdue } = summary
  let colorClass = 'text-emerald-400'
  let bgClass = 'bg-emerald-500/10 border-emerald-500/30'
  if (overdue > 0) {
    colorClass = 'text-red-400'
    bgClass = 'bg-red-500/10 border-red-500/30'
  } else if (outstanding > 0) {
    colorClass = 'text-amber-400'
    bgClass = 'bg-amber-500/10 border-amber-500/30'
  }

  return (
    <div className={`flex items-center gap-1 rounded-md border px-2 py-1 ${bgClass}`}>
      <IndianRupee className={`h-3 w-3 ${colorClass}`} />
      <span className={`text-xs font-bold ${colorClass}`}>
        {formatCurrency(outstanding)}
      </span>
    </div>
  )
}

function BillSummaryCard({
  label,
  value,
  icon: Icon,
  colorClass,
  subtext,
}: {
  label: string
  value: string
  icon: React.ElementType
  colorClass: string
  subtext?: string
}) {
  return (
    <Card className="border-border bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">
              {label}
            </p>
            <p className={`mt-1 text-lg font-bold ${colorClass}`}>{value}</p>
            {subtext && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {subtext}
              </p>
            )}
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorClass.replace('text-', 'bg-').replace('-400', '-500/10')}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function BillRow({
  bill,
  onRecordPayment,
  onCancelBill,
  expandedBillId,
  onToggleExpand,
}: {
  bill: VendorBill
  onRecordPayment: (bill: VendorBill) => void
  onCancelBill: (bill: VendorBill) => void
  expandedBillId: string | null
  onToggleExpand: (id: string) => void
}) {
  const balance = bill.totalAmount - bill.paidAmount
  const isExpanded = expandedBillId === bill.id

  return (
    <>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_auto_auto_auto_auto_auto_1fr_auto] gap-x-4 gap-y-2 items-center px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => onToggleExpand(bill.id)}
      >
        {/* Bill No */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-mono font-semibold text-foreground truncate">
            {bill.billNo}
          </span>
        </div>

        {/* Vendor */}
        <div className="min-w-0 hidden lg:block">
          <p className="text-xs text-foreground truncate">{bill.vendor.vendorName}</p>
        </div>

        {/* Description */}
        <div className="min-w-0 hidden lg:block">
          <p className="text-xs text-muted-foreground truncate">{bill.description || '—'}</p>
        </div>

        {/* Amount */}
        <div className="hidden lg:block text-right">
          <p className="text-xs font-semibold text-foreground">{formatCurrency(bill.totalAmount)}</p>
        </div>

        {/* Paid */}
        <div className="hidden lg:block text-right">
          <p className="text-xs text-emerald-400">{formatCurrency(bill.paidAmount)}</p>
        </div>

        {/* Balance */}
        <div className="hidden lg:block text-right">
          <p className={`text-xs font-semibold ${balance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {formatCurrency(balance)}
          </p>
        </div>

        {/* Due Date */}
        <div className="hidden lg:block text-right">
          <p className="text-[11px] text-muted-foreground">{formatDate(bill.dueDate)}</p>
          {bill.dueDate && (
            <p className={`text-[10px] ${bill.status === 'Overdue' ? 'text-red-400' : 'text-muted-foreground'}`}>
              {dueDateLabel(bill.dueDate)}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <BillStatusBadge status={bill.status} />
          {isExpanded && bill.payments.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
              {bill.payments.length} payment{bill.payments.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {bill.status !== 'Paid' && bill.status !== 'Cancelled' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 px-2"
              onClick={() => onRecordPayment(bill)}
            >
              <Banknote className="h-3 w-3" />
              <span className="hidden sm:inline">Pay</span>
            </Button>
          )}
          {bill.status !== 'Paid' && bill.status !== 'Cancelled' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10 px-2"
              onClick={() => onCancelBill(bill)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onToggleExpand(bill.id)}
          >
            <ArrowDownLeft className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Mobile: show vendor + description inline */}
        <div className="sm:hidden col-span-1 flex flex-col gap-0.5 min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">
            {bill.vendor.vendorName} {bill.description ? `• ${bill.description}` : ''}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatCurrency(bill.totalAmount)} • {formatCurrency(bill.paidAmount)} paid • {formatCurrency(balance)} bal
          </p>
        </div>
      </div>

      {/* Expanded Payment History */}
      {isExpanded && (
        <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Receipt className="h-3 w-3" />
            Payment History
          </p>
          {bill.payments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {bill.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 rounded-md border border-border/50 bg-card/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="text-xs font-mono text-foreground truncate">
                      {payment.paymentNo}
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-muted/50">
                      {payment.paymentMethod}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 pl-5 sm:pl-0">
                    <span className="text-xs font-semibold text-emerald-400">
                      {formatCurrency(payment.amount)}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {formatDate(payment.paymentDate)}
                    </span>
                    {payment.referenceNo && (
                      <span className="text-[11px] text-muted-foreground">
                        Ref: {payment.referenceNo}
                      </span>
                    )}
                  </div>
                  {payment.notes && (
                    <p className="text-[10px] text-muted-foreground pl-5 sm:pl-0 truncate">
                      {payment.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function VendorsModule() {
  // ── Shared State ──
  const [activeTab, setActiveTab] = useState('vendors')

  // ── Vendor State ──
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Vendor dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)

  // Vendor form
  const [form, setForm] = useState({
    vendorName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    state: '',
    specialization: '',
    paymentTerms: '30',
    status: 'Active',
  })
  const [customPaymentTerms, setCustomPaymentTerms] = useState(false)

  // ── Bills State ──
  const [bills, setBills] = useState<VendorBill[]>([])
  const [billsLoading, setBillsLoading] = useState(false)
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null)

  // Bill summary
  const [billSummary, setBillSummary] = useState({
    totalBilled: 0,
    totalPaid: 0,
    outstanding: 0,
    overdue: 0,
  })

  // Create bill dialog
  const [createBillOpen, setCreateBillOpen] = useState(false)
  const [createBillSaving, setCreateBillSaving] = useState(false)
  const [billForm, setBillForm] = useState({
    vendorId: '',
    description: '',
    totalQty: '',
    perPieceRate: '',
    totalAmount: '',
    billDate: todayISO(),
    dueDate: '',
    notes: '',
  })

  // Record payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [billForPayment, setBillForPayment] = useState<VendorBill | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: todayISO(),
    paymentMethod: 'Cash',
    referenceNo: '',
    notes: '',
  })

  // ── Vendor Fetch ──
  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ includeBills: 'true' })
      if (search) params.set('search', search)

      const res = await fetch(`/api/vendors?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setVendors(data.vendors)
      setTotal(data.total ?? data.vendors?.length ?? 0)
    } catch {
      setVendors([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => fetchVendors(), 200)
    return () => clearTimeout(timer)
  }, [fetchVendors])

  // ── Bills Fetch ──
  const fetchBills = useCallback(async () => {
    try {
      setBillsLoading(true)
      const res = await fetch('/api/vendor-bills')
      if (!res.ok) throw new Error('Failed to fetch bills')
      const data = await res.json()
      const billList: VendorBill[] = data.bills ?? data ?? []
      setBills(billList)

      // Compute summary from bills
      const summary = billList.reduce(
        (acc, b) => ({
          totalBilled: acc.totalBilled + (b.status === 'Cancelled' ? 0 : b.totalAmount),
          totalPaid: acc.totalPaid + b.paidAmount,
          outstanding: acc.outstanding + (b.status === 'Cancelled' ? 0 : b.totalAmount - b.paidAmount),
          overdue: acc.overdue + (b.status === 'Overdue' ? 1 : 0),
        }),
        { totalBilled: 0, totalPaid: 0, outstanding: 0, overdue: 0 }
      )
      setBillSummary(summary)
    } catch {
      setBills([])
    } finally {
      setBillsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'bills') {
      fetchBills()
    }
  }, [activeTab, fetchBills])

  // ── Vendor Handlers ──
  const openAddDialog = () => {
    setEditingVendor(null)
    setForm({
      vendorName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      gstNumber: '',
      state: '',
      specialization: '',
      paymentTerms: '30',
      status: 'Active',
    })
    setCustomPaymentTerms(false)
    setDialogOpen(true)
  }

  const openEditDialog = (vendor: Vendor) => {
    setEditingVendor(vendor)
    const termsStr = String(vendor.paymentTerms)
    const isCustom = !['15', '30', '45', '60', '90'].includes(termsStr)
    setForm({
      vendorName: vendor.vendorName,
      contactPerson: vendor.contactPerson || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      gstNumber: (vendor as any).gstNumber || '',
      state: (vendor as any).state || '',
      specialization: vendor.specialization || '',
      paymentTerms: isCustom ? termsStr : termsStr,
      status: vendor.status,
    })
    setCustomPaymentTerms(isCustom)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.vendorName.trim()) return
    setSaving(true)
    try {
      const payload = {
        vendorName: form.vendorName.trim(),
        contactPerson: form.contactPerson.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        gstNumber: form.gstNumber.trim() || null,
        state: form.state.trim() || null,
        specialization: form.specialization.trim() || null,
        paymentTerms: parseInt(form.paymentTerms, 10) || 30,
        status: form.status,
      }

      const res = await fetch(
        editingVendor ? `/api/vendors?id=${editingVendor.id}` : '/api/vendors',
        {
          method: editingVendor ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (res.ok) {
        toast.success(
          editingVendor
            ? 'Vendor updated successfully'
            : 'Vendor created successfully'
        )
        setDialogOpen(false)
        fetchVendors()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to save vendor')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save vendor')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = (vendor: Vendor) => {
    setVendorToDelete(vendor)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!vendorToDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/vendors?id=${vendorToDelete.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Vendor deleted successfully')
        setDeleteDialogOpen(false)
        setVendorToDelete(null)
        fetchVendors()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(
          data.error ||
            'Cannot delete vendor — it may have active stage trackings'
        )
      }
    } catch {
      toast.error('Failed to delete vendor')
    } finally {
      setDeleting(false)
    }
  }

  // ── Bill Handlers ──
  const openCreateBillDialog = () => {
    setBillForm({
      vendorId: '',
      description: '',
      totalQty: '',
      perPieceRate: '',
      totalAmount: '',
      billDate: todayISO(),
      dueDate: '',
      notes: '',
    })
    setCreateBillOpen(true)
  }

  // Auto-calc total amount and due date
  const billQty = parseFloat(billForm.totalQty) || 0
  const billRate = parseFloat(billForm.perPieceRate) || 0
  const autoAmount = billQty * billRate
  const selectedVendorForBill = vendors.find((v) => v.id === billForm.vendorId)

  const effectiveBillAmount = billForm.totalAmount
    ? parseFloat(billForm.totalAmount) || 0
    : autoAmount

  // Auto-calc due date when vendor or bill date changes
  useEffect(() => {
    if (billForm.vendorId && billForm.billDate && !billForm.dueDate) {
      const vendor = vendors.find((v) => v.id === billForm.vendorId)
      if (vendor) {
        setBillForm((prev) => ({
          ...prev,
          dueDate: addDays(prev.billDate, vendor.paymentTerms || 30),
        }))
      }
    }
  }, [billForm.vendorId, billForm.billDate, vendors])

  // Reset due date when vendor changes
  const handleBillVendorChange = (vendorId: string) => {
    const vendor = vendors.find((v) => v.id === vendorId)
    const newDueDate = billForm.billDate && vendor
      ? addDays(billForm.billDate, vendor.paymentTerms || 30)
      : ''
    setBillForm((prev) => ({ ...prev, vendorId, dueDate: newDueDate }))
  }

  const handleBillDateChange = (date: string) => {
    const vendor = vendors.find((v) => v.id === billForm.vendorId)
    const newDueDate = vendor ? addDays(date, vendor.paymentTerms || 30) : ''
    setBillForm((prev) => ({ ...prev, billDate: date, dueDate: newDueDate }))
  }

  const handleCreateBill = async () => {
    if (!billForm.vendorId || !effectiveBillAmount) {
      toast.error('Please fill in vendor and amount')
      return
    }
    setCreateBillSaving(true)
    try {
      const payload = {
        vendorId: billForm.vendorId,
        description: billForm.description.trim() || null,
        totalQty: billQty || 0,
        perPieceRate: billRate || 0,
        totalAmount: effectiveBillAmount,
        billDate: billForm.billDate || todayISO(),
        dueDate: billForm.dueDate || null,
        notes: billForm.notes.trim() || null,
      }

      const res = await fetch('/api/vendor-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success('Bill created successfully')
        setCreateBillOpen(false)
        fetchBills()
        fetchVendors() // Update vendor bill summaries
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to create bill')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create bill')
    } finally {
      setCreateBillSaving(false)
    }
  }

  // ── Payment Handlers ──
  const openPaymentDialog = (bill: VendorBill) => {
    setBillForPayment(bill)
    setPaymentForm({
      amount: '',
      paymentDate: todayISO(),
      paymentMethod: 'Cash',
      referenceNo: '',
      notes: '',
    })
    setPaymentDialogOpen(true)
  }

  const handleRecordPayment = async () => {
    if (!billForPayment) return
    const amount = parseFloat(paymentForm.amount) || 0
    const remaining = billForPayment.totalAmount - billForPayment.paidAmount

    if (amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (amount > remaining) {
      toast.error(`Amount cannot exceed balance of ${formatCurrency(remaining)}`)
      return
    }

    setPaymentSaving(true)
    try {
      const payload = {
        vendorBillId: billForPayment.id,
        vendorId: billForPayment.vendorId,
        amount,
        paymentDate: paymentForm.paymentDate || todayISO(),
        paymentMethod: paymentForm.paymentMethod,
        referenceNo: paymentForm.referenceNo.trim() || null,
        notes: paymentForm.notes.trim() || null,
      }

      const res = await fetch('/api/vendor-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success('Payment recorded successfully')
        setPaymentDialogOpen(false)
        setBillForPayment(null)
        fetchBills()
        fetchVendors()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to record payment')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setPaymentSaving(false)
    }
  }

  const handleCancelBill = async (bill: VendorBill) => {
    try {
      const res = await fetch(`/api/vendor-bills?id=${bill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      })
      if (res.ok) {
        toast.success('Bill cancelled')
        fetchBills()
        fetchVendors()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to cancel bill')
      }
    } catch {
      toast.error('Failed to cancel bill')
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedBillId((prev) => (prev === id ? null : id))
  }

  // ── Computed ──
  const specializations = parseSpecialization(form.specialization)

  // ── Render ──
  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            <span className="text-primary">Vendors</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Outsourcing Partners & Billing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8">
              <TabsTrigger value="vendors" className="text-xs gap-1.5 px-3">
                <Building2 className="h-3.5 w-3.5" />
                Vendors
              </TabsTrigger>
              <TabsTrigger value="bills" className="text-xs gap-1.5 px-3">
                <Receipt className="h-3.5 w-3.5" />
                Bills & Payments
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          VENDORS TAB
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'vendors' && (
        <>
          {/* ─── Search Bar ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, contact, specialization..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-muted/50 border-border"
              />
            </div>
            <div className="flex items-center gap-2">
              {!loading && vendors.length > 0 && (
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {vendors.length} of {total} vendors
                </p>
              )}
                <div className="flex items-center gap-2">
                  <ExportButton module="vendors" />
                  <Button
                    onClick={openAddDialog}
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    Add Vendor
                  </Button>
                </div>
              </div>
            </div>

          {/* ─── Loading State ──────────────────────────────────── */}
          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card
                  key={i}
                  className="border-border bg-card/50 backdrop-blur-sm"
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-5 w-14" />
                    </div>
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-6 w-24" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-7 w-16" />
                      <Skeleton className="h-7 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ─── Empty State ────────────────────────────────────── */}
          {!loading && vendors.length === 0 && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Handshake className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No vendors found</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                {search
                  ? 'Try adjusting your search criteria.'
                  : 'Add your first outsourcing vendor to get started.'}
              </p>
              {!search && (
                <Button
                  onClick={openAddDialog}
                  className="mt-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Add Vendor
                </Button>
              )}
            </div>
          )}

          {/* ─── Vendor Card Grid ───────────────────────────────── */}
          {!loading && vendors.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((vendor) => {
                const specs = parseSpecialization(vendor.specialization)
                const activeJobs = vendor._count?.stageTrackings ?? 0
                const summary = vendor._billSummary

                return (
                  <Card
                    key={vendor.id}
                    className="border-border bg-card/50 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Header: Name + Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {vendor.vendorName}
                          </h3>
                          {vendor.contactPerson && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3 shrink-0" />
                              <span className="truncate">{vendor.contactPerson}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {activeJobs > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary"
                            >
                              {activeJobs} job{activeJobs !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          <StatusBadge status={vendor.status} />
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        {vendor.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {formatPhone(vendor.phone)}
                          </span>
                        )}
                        {vendor.address && (
                          <span className="flex items-center gap-1 truncate max-w-[200px]">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{vendor.address}</span>
                          </span>
                        )}
                      </div>

                      {/* Specialization Badges */}
                      {specs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {specs.map((spec) => (
                            <Badge
                              key={spec}
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${getSpecializationColor(spec)}`}
                            >
                              {spec}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Payment Terms Badge */}
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-orange-500/40 bg-orange-500/10 text-orange-400"
                        >
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          {vendor.paymentTerms || 30} Days
                        </Badge>
                        {summary && summary.overdue > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-red-500/40 bg-red-500/10 text-red-400"
                          >
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            {summary.overdue} overdue
                          </Badge>
                        )}
                        {summary && (summary.totalBilled > 0) && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-muted/50"
                          >
                            <FileText className="h-2.5 w-2.5 mr-0.5" />
                            {summary.totalBilled > 0
                              ? Math.round((summary.totalPaid / summary.totalBilled) * 100)
                              : 0}% paid
                          </Badge>
                        )}
                      </div>

                      {/* Outstanding Amount */}
                      {summary && (
                        <OutstandingBadge vendor={vendor} />
                      )}

                      <Separator className="bg-border" />

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-[11px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => openEditDialog(vendor)}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-[11px] gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                          onClick={() => confirmDelete(vendor)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          BILLS & PAYMENTS TAB
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'bills' && (
        <div className="space-y-4">
          {/* ─── Summary Cards ──────────────────────────────────── */}
          {billsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="border-border bg-card/50">
                  <CardContent className="p-4 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-28" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <BillSummaryCard
                label="Total Billed"
                value={formatCurrency(billSummary.totalBilled)}
                icon={FileText}
                colorClass="text-foreground"
              />
              <BillSummaryCard
                label="Total Paid"
                value={formatCurrency(billSummary.totalPaid)}
                icon={Banknote}
                colorClass="text-emerald-400"
              />
              <BillSummaryCard
                label="Outstanding"
                value={formatCurrency(billSummary.outstanding)}
                icon={TrendingDown}
                colorClass="text-amber-400"
                subtext={billSummary.outstanding > 0 ? 'Pending payments' : 'All cleared'}
              />
              <BillSummaryCard
                label="Overdue Bills"
                value={String(billSummary.overdue)}
                icon={AlertTriangle}
                colorClass="text-red-400"
                subtext={billSummary.overdue > 0 ? 'Require attention' : 'No overdue bills'}
              />
            </div>
          )}

          {/* ─── Bills Header ───────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              All Bills
            </h2>
            <Button
              onClick={openCreateBillDialog}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Create Bill
            </Button>
          </div>

          {/* ─── Bills Loading ──────────────────────────────────── */}
          {billsLoading && (
            <Card className="border-border bg-card/50">
              <CardContent className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ─── Bills Empty State ──────────────────────────────── */}
          {!billsLoading && bills.length === 0 && (
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Receipt className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No bills yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create your first vendor bill to start tracking payments.
              </p>
              <Button
                onClick={openCreateBillDialog}
                className="mt-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Create Bill
              </Button>
            </div>
          )}

          {/* ─── Bills Table ────────────────────────────────────── */}
          {!billsLoading && bills.length > 0 && (
            <Card className="border-border bg-card/50 overflow-hidden">
              {/* Table Header */}
              <div className="hidden lg:grid grid-cols-[auto_1fr_1fr_auto_auto_auto_auto_auto_1fr_auto] gap-x-4 items-center px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Bill No</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Vendor</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Description</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground text-right">Amount</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground text-right">Paid</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground text-right">Balance</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground text-right">Due Date</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Status</span>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground text-right">Actions</span>
              </div>

              {/* Bill Rows */}
              <div className="max-h-[60vh] overflow-y-auto">
                {bills.map((bill) => (
                  <BillRow
                    key={bill.id}
                    bill={bill}
                    onRecordPayment={openPaymentDialog}
                    onCancelBill={handleCancelBill}
                    expandedBillId={expandedBillId}
                    onToggleExpand={toggleExpand}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ADD/EDIT VENDOR DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-border bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Vendor Name */}
            <div className="space-y-2">
              <Label className="text-xs">
                Vendor Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Krishna Embroidery Works"
                value={form.vendorName}
                onChange={(e) =>
                  setForm({ ...form, vendorName: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
            </div>

            {/* Contact Person + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Contact Person</Label>
                <Input
                  placeholder="e.g. Suresh Kumar"
                  value={form.contactPerson}
                  onChange={(e) =>
                    setForm({ ...form, contactPerson: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Phone</Label>
                <Input
                  placeholder="9876543210"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="vendor@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label className="text-xs">Address</Label>
              <Input
                placeholder="e.g. 42, Industrial Area, Surat"
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
            </div>

            {/* GST Number + State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">GST Number <span className="text-muted-foreground">(GSTIN)</span></Label>
                <Input
                  placeholder="e.g. 24ABCDE1234F1Z5"
                  value={form.gstNumber}
                  onChange={(e) =>
                    setForm({ ...form, gstNumber: e.target.value.toUpperCase() })
                  }
                  className="bg-muted/50 border-border uppercase"
                  maxLength={15}
                />
                <p className="text-[10px] text-muted-foreground">
                  15-digit GSTIN — needed for GST-compliant purchase bills
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">State <span className="text-muted-foreground">(Place of Supply)</span></Label>
                <Input
                  placeholder="e.g. Gujarat"
                  value={form.state}
                  onChange={(e) =>
                    setForm({ ...form, state: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
                <p className="text-[10px] text-muted-foreground">
                  Determines CGST+SGST vs IGST on bills
                </p>
              </div>
            </div>

            {/* Specialization */}
            <div className="space-y-2">
              <Label className="text-xs">Specialization</Label>
              <Input
                placeholder="Embroidery, Hand Work, Stitching"
                value={form.specialization}
                onChange={(e) =>
                  setForm({ ...form, specialization: e.target.value })
                }
                className="bg-muted/50 border-border"
              />
              <p className="text-[10px] text-muted-foreground">
                Comma-separated skills (e.g. Embroidery, Stitching, Hand Work)
              </p>
              {specializations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {specializations.map((spec) => (
                    <Badge
                      key={spec}
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${getSpecializationColor(spec)}`}
                    >
                      {spec}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Payment Terms */}
            <div className="space-y-2">
              <Label className="text-xs">Payment Terms</Label>
              {customPaymentTerms ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Enter days"
                    value={form.paymentTerms}
                    onChange={(e) =>
                      setForm({ ...form, paymentTerms: e.target.value })
                    }
                    className="bg-muted/50 border-border"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-border text-xs"
                    onClick={() => {
                      setCustomPaymentTerms(false)
                      setForm({ ...form, paymentTerms: '30' })
                    }}
                  >
                    Preset
                  </Button>
                </div>
              ) : (
                <Select
                  value={form.paymentTerms}
                  onValueChange={(v) => {
                    if (v === 'custom') {
                      setCustomPaymentTerms(true)
                      setForm({ ...form, paymentTerms: '' })
                    } else {
                      setForm({ ...form, paymentTerms: v })
                    }
                  }}
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue placeholder="Select payment terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="45">45 Days</SelectItem>
                    <SelectItem value="60">60 Days</SelectItem>
                    <SelectItem value="90">90 Days</SelectItem>
                    <SelectItem value="custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-[10px] text-muted-foreground">
                Number of days before payment is due
              </p>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Live Preview */}
            {form.vendorName.trim() && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
                  Preview
                </p>
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">
                        {form.vendorName}
                      </p>
                      <StatusBadge status={form.status} />
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 border-orange-500/40 bg-orange-500/10 text-orange-400"
                      >
                        <Clock className="h-2 w-2 mr-0.5" />
                        {form.paymentTerms || '30'} Days
                      </Badge>
                    </div>
                    {form.contactPerson && (
                      <p className="text-[11px] text-muted-foreground">
                        {form.contactPerson}
                      </p>
                    )}
                    {specializations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {specializations.map((spec) => (
                          <Badge
                            key={spec}
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 ${getSpecializationColor(spec)}`}
                          >
                            {spec}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.vendorName.trim() || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving
                ? 'Saving...'
                : editingVendor
                  ? 'Update Vendor'
                  : 'Add Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          DELETE VENDOR DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm border-border bg-background">
          <DialogHeader>
            <DialogTitle className="text-base">Delete Vendor</DialogTitle>
          </DialogHeader>

          {vendorToDelete && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-foreground">
                  {vendorToDelete.vendorName}
                </span>
                ?
              </p>
              {vendorToDelete._count?.stageTrackings > 0 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-400">
                    ⚠ This vendor has{' '}
                    <span className="font-semibold">
                      {vendorToDelete._count.stageTrackings}
                    </span>{' '}
                    active job{vendorToDelete._count.stageTrackings !== 1 ? 's' : ''}.
                    You may not be able to delete it.
                  </p>
                </div>
              )}
              {vendorToDelete._billSummary && vendorToDelete._billSummary.outstanding > 0 && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                  <p className="text-xs text-red-400">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    This vendor has an outstanding balance of{' '}
                    <span className="font-semibold">
                      {formatCurrency(vendorToDelete._billSummary.outstanding)}
                    </span>
                    .
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This action cannot be undone.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          CREATE BILL DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog open={createBillOpen} onOpenChange={setCreateBillOpen}>
        <DialogContent className="sm:max-w-lg border-border bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Create New Bill
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Vendor */}
            <div className="space-y-2">
              <Label className="text-xs">
                Vendor <span className="text-destructive">*</span>
              </Label>
              <Select
                value={billForm.vendorId}
                onValueChange={handleBillVendorChange}
              >
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors
                    .filter((v) => v.status === 'Active')
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="flex items-center gap-2">
                          {v.vendorName}
                          <span className="text-[10px] text-muted-foreground">
                            ({v.paymentTerms || 30} days)
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="e.g. Embroidery work for Job #ABC-001"
                value={billForm.description}
                onChange={(e) =>
                  setBillForm({ ...billForm, description: e.target.value })
                }
                className="bg-muted/50 border-border min-h-[60px]"
              />
            </div>

            {/* Qty + Per Piece Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Total Qty</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 500"
                  value={billForm.totalQty}
                  onChange={(e) =>
                    setBillForm({ ...billForm, totalQty: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Per Piece Rate (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 25"
                  value={billForm.perPieceRate}
                  onChange={(e) =>
                    setBillForm({ ...billForm, perPieceRate: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>

            {/* Total Amount (auto-calc) */}
            <div className="space-y-2">
              <Label className="text-xs">Total Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Auto-calculated"
                  value={billForm.totalAmount || (autoAmount > 0 ? String(autoAmount) : '')}
                  onChange={(e) =>
                    setBillForm({ ...billForm, totalAmount: e.target.value })
                  }
                  className="pl-9 bg-muted/50 border-border font-semibold"
                />
              </div>
              {billQty > 0 && billRate > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Auto: {billQty} × {formatCurrency(billRate)} = {formatCurrency(autoAmount)}
                </p>
              )}
            </div>

            {/* Bill Date + Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Bill Date</Label>
                <Input
                  type="date"
                  value={billForm.billDate}
                  onChange={(e) => handleBillDateChange(e.target.value)}
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  value={billForm.dueDate}
                  onChange={(e) =>
                    setBillForm({ ...billForm, dueDate: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
                {selectedVendorForBill && billForm.dueDate && (
                  <p className="text-[10px] text-muted-foreground">
                    {selectedVendorForBill.paymentTerms || 30} days from bill date
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                value={billForm.notes}
                onChange={(e) =>
                  setBillForm({ ...billForm, notes: e.target.value })
                }
                className="bg-muted/50 border-border min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateBillOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBill}
              disabled={!billForm.vendorId || !effectiveBillAmount || createBillSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createBillSaving ? 'Creating...' : 'Create Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          RECORD PAYMENT DIALOG
         ═══════════════════════════════════════════════════════════ */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md border-border bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              Record Payment
            </DialogTitle>
          </DialogHeader>

          {billForPayment && (
            <div className="space-y-4 py-2">
              {/* Bill Info */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Bill
                  </span>
                  <BillStatusBadge status={billForPayment.status} />
                </div>
                <p className="text-sm font-semibold text-foreground font-mono">
                  {billForPayment.billNo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {billForPayment.vendor.vendorName}
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                    <p className="text-xs font-semibold text-foreground">
                      {formatCurrency(billForPayment.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Paid</p>
                    <p className="text-xs font-semibold text-emerald-400">
                      {formatCurrency(billForPayment.paidAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                    <p className="text-xs font-semibold text-amber-400">
                      {formatCurrency(billForPayment.totalAmount - billForPayment.paidAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label className="text-xs">
                  Amount to Pay (₹) <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0.01"
                    max={billForPayment.totalAmount - billForPayment.paidAmount}
                    step="0.01"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, amount: e.target.value })
                    }
                    className="pl-9 bg-muted/50 border-border font-semibold text-lg"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Max: {formatCurrency(billForPayment.totalAmount - billForPayment.paidAmount)}
                </p>
              </div>

              {/* Payment Date */}
              <div className="space-y-2">
                <Label className="text-xs">Payment Date</Label>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, paymentDate: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label className="text-xs">Payment Method</Label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(v) =>
                    setPaymentForm({ ...paymentForm, paymentMethod: v })
                  }
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reference No */}
              <div className="space-y-2">
                <Label className="text-xs">Reference No</Label>
                <Input
                  placeholder="e.g. UPI ref, Cheque no, Txn ID"
                  value={paymentForm.referenceNo}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, referenceNo: e.target.value })
                  }
                  className="bg-muted/50 border-border"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  placeholder="Optional notes..."
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  className="bg-muted/50 border-border min-h-[60px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={
                !paymentForm.amount ||
                parseFloat(paymentForm.amount) <= 0 ||
                paymentSaving
              }
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {paymentSaving ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}