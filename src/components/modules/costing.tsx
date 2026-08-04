'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Plus,
  Search,
  Trash2,
  Eye,
  MoreHorizontal,
  Calculator,
  IndianRupee,
  Loader2,
  Copy,
  ChevronDown,
  ChevronRight,
  FileText,
  Printer,
  Sheet,
  Settings2,
  Palette,
  X,
  TrendingUp,
  ArrowLeft,
  ImagePlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDashboardStore } from '@/store/dashboard-store'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatINRDecimal(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

// ─── Types ───────────────────────────────────────────────────────────────────

const UNITS = ['meters', 'pcs', 'gms', 'kg', 'yards', 'sets', 'rolls', 'dozen'] as const
const STATUSES = ['Draft', 'Approved', 'Active', 'Archived'] as const

// 15-color palette indexed by CostCategory.colorIndex
const CATEGORY_PALETTE = [
  'bg-blue-500/10 text-blue-400 border-blue-500/20',     // 0
  'bg-sky-500/10 text-sky-400 border-sky-500/20',        // 1
  'bg-amber-500/10 text-amber-400 border-amber-500/20',   // 2
  'bg-pink-500/10 text-pink-400 border-pink-500/20',      // 3
  'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20', // 4
  'bg-violet-500/10 text-violet-400 border-violet-500/20',   // 5
  'bg-teal-500/10 text-teal-400 border-teal-500/20',      // 6
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', // 7
  'bg-lime-500/10 text-lime-400 border-lime-500/20',      // 8
  'bg-green-500/10 text-green-400 border-green-500/20',   // 9
  'bg-orange-500/10 text-orange-400 border-orange-500/20', // 10
  'bg-red-500/10 text-red-400 border-red-500/20',        // 11
  'bg-rose-500/10 text-rose-400 border-rose-500/20',      // 12
  'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',      // 13
  'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',      // 14
]

// Text-only versions for badges (no bg/border for inline use)
const CATEGORY_TEXT_COLORS = [
  'text-blue-400',    // 0
  'text-sky-400',     // 1
  'text-amber-400',   // 2
  'text-pink-400',    // 3
  'text-fuchsia-400', // 4
  'text-violet-400',  // 5
  'text-teal-400',    // 6
  'text-emerald-400', // 7
  'text-lime-400',    // 8
  'text-green-400',   // 9
  'text-orange-400',  // 10
  'text-red-400',     // 11
  'text-rose-400',    // 12
  'text-cyan-400',    // 13
  'text-zinc-400',    // 14
]

interface CostCategory {
  id: string
  name: string
  colorIndex: number
  sortOrder: number
  isSystem: boolean
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  Approved: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Archived: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

interface ColorRow {
  id: string
  color: string
  quantity: string
}

interface CostItemData {
  id?: string
  category: string
  itemName: string
  description?: string
  consumption: number
  unit: string
  unitRate: number
  wastagePercent: number
  itemCost: number
  notes?: string
}

interface CostSheet {
  id: string
  sheetNo: string
  styleNo: string
  styleName: string
  customerId: string | null
  customer: { id: string; companyName: string } | null
  description: string | null
  sizeRange: string | null
  targetQty: number
  fabricCost: number
  trimCost: number
  laborCost: number
  washCost: number
  packagingCost: number
  overheadCost: number
  otherCost: number
  totalCost: number
  profitPercent: number
  sellingPrice: number
  brokerCommissionPercent: number
  brokerCommissionAmount: number
  status: string
  notes: string | null
  itemCount: number
  colorCount: number
  lotQty: number
  image: string | null
  costItems?: CostItemData[]
  colorBreakdown?: { id: string; color: string; quantity: number }[]
  createdAt: string
  updatedAt: string
}

interface Customer {
  id: string
  companyName: string
}

interface KPIData {
  totalSheets: number
  avgCost: number
  avgMargin: number
  activeSheets: number
}

// ─── Print / PDF helper (uses dynamic categories from items) ────────────────

function printCostSheet(sheet: CostSheet, categoryColorMap: Record<string, string>) {
  // Build category subtotals dynamically from items
  const catTotals: Record<string, number> = {}
  for (const item of (sheet.costItems || [])) {
    catTotals[item.category] = (catTotals[item.category] || 0) + item.itemCost
  }
  const costRows = Object.entries(catTotals).sort(([a], [b]) => a.localeCompare(b))

  const itemRows = (sheet.costItems || []).sort((a, b) => a.category.localeCompare(b.category)).map((item) => [
    item.category,
    item.itemName,
    item.consumption.toString(),
    item.unit,
    item.unitRate.toFixed(2),
    `${item.wastagePercent}%`,
    item.itemCost.toFixed(2),
  ])

  const html = `<!DOCTYPE html>
<html><head><title>Cost Sheet - ${sheet.sheetNo}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 20px; font-weight: 700; } .sub { font-size: 12px; color: #666; }
  .sheet-no { font-size: 14px; font-weight: 600; } .date { font-size: 11px; color: #666; }
  h2 { font-size: 18px; margin-bottom: 16px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 24px; font-size: 13px; }
  .info-grid dt { color: #666; } .info-grid dd { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
  th { background: #f5f5f5; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row { font-weight: 700; border-top: 2px solid #1a1a1a; }
  .total-row td { border-bottom: none; }
  .selling { font-size: 20px; font-weight: 700; text-align: right; margin-top: 16px; }
  .broker { background: #f59e0b; color: #fff; padding: 10px 16px; border-radius: 8px; margin-top: 12px; font-size: 13px; font-weight: 600; }
  .footer { margin-top: 40px; font-size: 10px; color: #999; text-align: center; }
  .cat-badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <div><div class="brand">Dhanya Lifestyle LLP</div><div class="sub">Elysé by Dhanya · Ahmedabad, Gujarat</div></div>
  <div style="text-align:right"><div class="sheet-no">${sheet.sheetNo}</div><div class="date">Generated: ${new Date().toLocaleDateString('en-IN')}</div></div>
</div>
<h2>Product Cost Sheet</h2>
<dl class="info-grid">
  <div><dt>Style No</dt><dd>${sheet.styleNo}</dd></div>
  <div><dt>Style Name</dt><dd>${sheet.styleName}</dd></div>
  <div><dt>Size Range</dt><dd>${sheet.sizeRange || '—'}</dd></div>
  <div><dt>Customer</dt><dd>${sheet.customer?.companyName || '—'}</dd></div>
  <div><dt>Target Qty</dt><dd>${sheet.targetQty}</dd></div>
  <div><dt>Status</dt><dd>${sheet.status}</dd></div>
</dl>
${costRows.length > 0 ? `
<h3>Cost Summary by Category</h3>
<table>
  <thead><tr><th>Category</th><th class="num">Amount (₹)</th></tr></thead>
  <tbody>
    ${costRows.map(([label, val]) => `<tr><td>${label}</td><td class="num">${val.toFixed(2)}</td></tr>`).join('')}
    <tr class="total-row"><td><strong>Total Cost / Piece</strong></td><td class="num"><strong>₹${sheet.totalCost.toFixed(2)}</strong></td></tr>
  </tbody>
</table>` : `<table><tr class="total-row"><td><strong>Total Cost / Piece</strong></td><td class="num"><strong>₹${sheet.totalCost.toFixed(2)}</strong></td></tr></table>`}
${itemRows.length > 0 ? `
<h3>Item-wise Breakdown</h3>
<table>
  <thead><tr><th>Category</th><th>Item</th><th class="num">Consumption</th><th>Unit</th><th class="num">Rate</th><th class="num">Waste%</th><th class="num">Cost</th></tr></thead>
  <tbody>
    ${itemRows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td>${r[3]}</td><td class="num">${r[4]}</td><td class="num">${r[5]}</td><td class="num">${r[6]}</td></tr>`).join('')}
  </tbody>
</table>` : ''}
<div class="selling">Selling Price: ₹${sheet.sellingPrice.toFixed(2)} <span style="font-size:14px;color:#666">(incl. ${sheet.profitPercent}% margin)</span></div>
${sheet.brokerCommissionPercent > 0 ? `
<div class="broker">
  <strong>Broker Commission: ${sheet.brokerCommissionPercent}%</strong> = ₹${sheet.brokerCommissionAmount.toFixed(2)}/pc
  ${sheet.targetQty > 0 ? ` | Total: ₹${(sheet.brokerCommissionAmount * sheet.targetQty).toFixed(2)} (${sheet.targetQty} pcs) | Net Profit/Piece: ₹${(sheet.sellingPrice - sheet.totalCost - sheet.brokerCommissionAmount).toFixed(2)}` : ''}
</div>` : ''}
${sheet.notes ? `<p style="margin-top:16px;font-size:12px;color:#666"><strong>Notes:</strong> ${sheet.notes}</p>` : ''}
<div class="footer">Dhanya OS v1.0 · Generated on ${new Date().toLocaleString('en-IN')}</div>
<script>window.onload = () => window.print();</script>
</body></html>`
  const w = window.open('', '_blank', 'width=800,height=600')
  if (w) { w.document.write(html); w.document.close() }
}

// ─── Module ──────────────────────────────────────────────────────────────────

export function CostingModule() {
  const { pendingCosting, setPendingCosting } = useDashboardStore()

  const [costSheets, setCostSheets] = useState<CostSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [kpi, setKpi] = useState<KPIData>({ totalSheets: 0, avgCost: 0, avgMargin: 0, activeSheets: 0 })

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formStyleNo, setFormStyleNo] = useState('')
  const [formStyleName, setFormStyleName] = useState('')
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formSizeRange, setFormSizeRange] = useState('')
  const [formTargetQty, setFormTargetQty] = useState('0')
  const [formDescription, setFormDescription] = useState('')
  const [formFabricCost, setFormFabricCost] = useState('0')
  const [formTrimCost, setFormTrimCost] = useState('0')
  const [formLaborCost, setFormLaborCost] = useState('0')
  const [formWashCost, setFormWashCost] = useState('0')
  const [formPackagingCost, setFormPackagingCost] = useState('0')
  const [formOverheadCost, setFormOverheadCost] = useState('0')
  const [formOtherCost, setFormOtherCost] = useState('0')
  const [formQuickCost, setFormQuickCost] = useState('0')
  const [formProfitPercent, setFormProfitPercent] = useState('30')
  const [formBrokerCommission, setFormBrokerCommission] = useState('0')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<CostItemData[]>([])
  const [formColors, setFormColors] = useState<ColorRow[]>([])
  const [itemsOpen, setItemsOpen] = useState(false)
  const [colorsOpen, setColorsOpen] = useState(true)
  const [formImage, setFormImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSheet, setSelectedSheet] = useState<CostSheet | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Customers
  const [customers, setCustomers] = useState<Customer[]>([])

  // Dynamic categories
  const [categories, setCategories] = useState<CostCategory[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [showNewCatInput, setShowNewCatInput] = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const [manageCatsOpen, setManageCatsOpen] = useState(false)

  // Helper: get color class for a category name
  const getCategoryColor = (catName: string): string => {
    const cat = categories.find((c) => c.name === catName)
    if (cat) return CATEGORY_PALETTE[cat.colorIndex % CATEGORY_PALETTE.length]
    return CATEGORY_PALETTE[14] // zinc fallback
  }

  const getCategoryTextColor = (catName: string): string => {
    const cat = categories.find((c) => c.name === catName)
    if (cat) return CATEGORY_TEXT_COLORS[cat.colorIndex % CATEGORY_TEXT_COLORS.length]
    return CATEGORY_TEXT_COLORS[14]
  }

  // Build a name→colorClass map for passing to print helper
  const buildCategoryColorMap = (): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const cat of categories) {
      map[cat.name] = getCategoryColor(cat.name)
    }
    return map
  }

  // ─── Fetch categories ─────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/cost-categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch {
      // silently fail — will use empty list
    }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  // ─── Add new category ─────────────────────────────────────────────────
  const handleAddCategory = async () => {
    const trimmed = newCatName.trim()
    if (!trimmed) return
    setAddingCat(true)
    try {
      const res = await fetch('/api/cost-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const newCat = await res.json()
        setCategories((prev) => [...prev, newCat].sort((a, b) => a.sortOrder - b.sortOrder))
        setNewCatName('')
        setShowNewCatInput(false)
        toast.success(`Category "${newCat.name}" added`)
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to add category')
      }
    } catch {
      toast.error('Failed to add category')
    } finally {
      setAddingCat(false)
    }
  }

  // ─── Delete custom category ───────────────────────────────────────────
  const handleDeleteCategory = async (id: string) => {
    try {
      const res = await fetch(`/api/cost-categories?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => c.id !== id))
        toast.success('Category deleted')
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete category')
    }
  }

  // ─── Fetch cost sheets ────────────────────────────────────────────────
  const fetchCostSheets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeStatus) params.set('status', activeStatus)
      const res = await fetch(`/api/cost-sheets?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setCostSheets(data.costSheets || [])
      setStatusCounts(data.statusCounts || {})

      // Compute KPIs from all sheets
      const all = data.costSheets || []
      const totalSheets = all.length
      const avgCost = totalSheets > 0 ? all.reduce((s: number, c: CostSheet) => s + c.totalCost, 0) / totalSheets : 0
      const avgMargin = totalSheets > 0 ? all.reduce((s: number, c: CostSheet) => s + c.profitPercent, 0) / totalSheets : 0
      setKpi({ totalSheets, avgCost, avgMargin, activeSheets: statusCounts['Active'] || 0 })
    } catch {
      toast.error('Failed to load cost sheets')
    } finally {
      setLoading(false)
    }
  }, [search, activeStatus])

  useEffect(() => {
    fetchCostSheets()
  }, [fetchCostSheets])

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((data) => setCustomers(data.customers || data || []))
      .catch(() => {})
  }, [])

  // ─── Auto-calc from items ─────────────────────────────────────────────
  const recalcFromItems = useCallback((_items: CostItemData[]) => {
    // Legacy fields are computed server-side via mapCategoryToLegacy.
    // Frontend no longer dumps totals into legacy fields.
    setFormQuickCost('0')
    setFormFabricCost('0')
    setFormTrimCost('0')
    setFormLaborCost('0')
    setFormWashCost('0')
    setFormPackagingCost('0')
    setFormOverheadCost('0')
    setFormOtherCost('0')
  }, [])

  // ─── Computed form values ─────────────────────────────────────────────
  const itemsTotalCost = formItems.reduce((s, i) => s + i.itemCost, 0)
  const formTotalCost = formItems.length > 0
    ? itemsTotalCost
    : (parseFloat(formQuickCost) || 0)
  const formSellingPrice = formTotalCost * (1 + parseFloat(formProfitPercent) / 100)

  // ─── Item management ──────────────────────────────────────────────────
  const addItem = () => {
    setFormItems([...formItems, {
      category: categories.length > 0 ? categories[0].name : 'Other',
      itemName: '',
      consumption: 0,
      unit: 'pcs',
      unitRate: 0,
      wastagePercent: 5,
      itemCost: 0,
    }])
    setItemsOpen(true)
  }

  const updateItem = (index: number, field: keyof CostItemData, value: string | number) => {
    const updated = [...formItems]
    updated[index] = { ...updated[index], [field]: value }
    // Auto-calc itemCost
    const consumption = parseFloat(String(updated[index].consumption)) || 0
    const unitRate = parseFloat(String(updated[index].unitRate)) || 0
    const wastage = parseFloat(String(updated[index].wastagePercent)) || 0
    updated[index].itemCost = consumption * unitRate * (1 + wastage / 100)
    setFormItems(updated)
    recalcFromItems(updated)
  }

  const removeItem = (index: number) => {
    const updated = formItems.filter((_, i) => i !== index)
    setFormItems(updated)
    recalcFromItems(updated)
  }

  // ─── Open create ──────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null)
    setFormStyleNo('')
    setFormStyleName('')
    setFormCustomerId('')
    setFormSizeRange('')
    setFormTargetQty('0')
    setFormDescription('')
    setFormFabricCost('0')
    setFormTrimCost('0')
    setFormLaborCost('0')
    setFormWashCost('0')
    setFormPackagingCost('0')
    setFormOverheadCost('0')
    setFormOtherCost('0')
    setFormQuickCost('0')
    setFormProfitPercent('30')
    setFormBrokerCommission('0')
    setFormNotes('')
    setFormItems([])
    setFormColors([])
    setFormImage(null)
    setItemsOpen(false)
    setColorsOpen(true)
    setDialogOpen(true)
  }

  // ─── Auto-fill from Client Catalog (pendingCosting) ──────────────
  useEffect(() => {
    if (pendingCosting) {
      setEditingId(null)
      setFormStyleNo(pendingCosting.styleNo)
      setFormStyleName(pendingCosting.styleName)
      setFormCustomerId('')
      setFormSizeRange('')
      setFormTargetQty('0')
      setFormDescription('')
      setFormFabricCost('0')
      setFormTrimCost('0')
      setFormLaborCost('0')
      setFormWashCost('0')
      setFormPackagingCost('0')
      setFormOverheadCost('0')
      setFormOtherCost('0')
      setFormQuickCost('0')
      setFormProfitPercent('30')
      setFormBrokerCommission('0')
      setFormNotes('')
      setFormItems([])
      setFormColors([])
      setFormImage(pendingCosting.image)
      setItemsOpen(false)
      setColorsOpen(true)
      // Open dialog after a tiny delay so state settles
      setTimeout(() => setDialogOpen(true), 100)
      // Clear pending so it doesn't re-trigger
      setPendingCosting(null)
    }
  }, [pendingCosting, setPendingCosting])

  // ─── Open edit ────────────────────────────────────────────────────────
  const openEdit = async (sheet: CostSheet) => {
    setEditingId(sheet.id)
    setFormStyleNo(sheet.styleNo)
    setFormStyleName(sheet.styleName)
    setFormCustomerId(sheet.customerId || '')
    setFormSizeRange(sheet.sizeRange || '')
    setFormTargetQty(String(sheet.targetQty))
    setFormDescription(sheet.description || '')
    setFormFabricCost(String(sheet.fabricCost))
    setFormTrimCost(String(sheet.trimCost))
    setFormLaborCost(String(sheet.laborCost))
    setFormWashCost(String(sheet.washCost))
    setFormPackagingCost(String(sheet.packagingCost))
    setFormOverheadCost(String(sheet.overheadCost))
    setFormOtherCost(String(sheet.otherCost))
    setFormQuickCost(String(sheet.totalCost))
    setFormProfitPercent(String(sheet.profitPercent))
    setFormBrokerCommission(String(sheet.brokerCommissionPercent || 0))
    setFormNotes(sheet.notes || '')
    setFormImage(sheet.image || null)

    // Fetch items
    try {
      const res = await fetch(`/api/cost-sheets/${sheet.id}`)
      if (res.ok) {
        const data = await res.json()
        setFormItems(data.costItems || [])
        setFormColors((data.colorBreakdown || []).map((c: { id: string; color: string; quantity: number }) => ({
          id: c.id,
          color: c.color,
          quantity: String(c.quantity),
        })))
      }
    } catch {
      setFormItems([])
      setFormColors([])
    }
    setItemsOpen(false)
    setColorsOpen(true)
    setDialogOpen(true)
  }

  // ─── Save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formStyleNo.trim() || !formStyleName.trim()) {
      toast.error('Style No and Style Name are required')
      return
    }

    setSaving(true)
    try {
      // When no detailed items, synthesize a single item from Quick Cost so the API
      // can compute totalCost via calcItemsSummary (API ignores legacy field values)
      const quickCostVal = parseFloat(formQuickCost) || 0
      const itemsToSend = formItems.length > 0
        ? formItems
        : quickCostVal > 0
          ? [{ category: 'Other', itemName: 'Quick Cost Entry', consumption: 1, unit: 'pcs', unitRate: quickCostVal, wastagePercent: 0, itemCost: quickCostVal }]
          : undefined

      const payload = {
        styleNo: formStyleNo,
        styleName: formStyleName,
        customerId: formCustomerId || null,
        description: formDescription || null,
        sizeRange: formSizeRange || null,
        targetQty: parseInt(formTargetQty) || 0,
        profitPercent: parseFloat(formProfitPercent) || 30,
        brokerCommissionPercent: parseFloat(formBrokerCommission) || 0,
        notes: formNotes || null,
        image: formImage || null,
        items: itemsToSend,
        colorBreakdown: formColors.filter(c => c.color.trim()).map(c => ({
          color: c.color.trim(),
          quantity: parseInt(c.quantity) || 0,
        })),
      }

      const url = editingId ? `/api/cost-sheets/${editingId}` : '/api/cost-sheets'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(editingId ? 'Cost sheet updated' : 'Cost sheet created')
        setDialogOpen(false)
        fetchCostSheets()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save cost sheet')
    } finally {
      setSaving(false)
    }
  }

  // ─── Open detail ──────────────────────────────────────────────────────
  const openDetail = async (sheet: CostSheet) => {
    setSelectedSheet(sheet)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/cost-sheets/${sheet.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedSheet(data)
      }
    } catch {
      // use the card data
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────
  const confirmDelete = (id: string) => {
    setDeletingId(id)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/cost-sheets/${deletingId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Cost sheet deleted')
        setDeleteOpen(false)
        setDetailOpen(false)
        fetchCostSheets()
      } else {
        toast.error('Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  // ─── Duplicate ────────────────────────────────────────────────────────
  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/cost-sheets/${id}/duplicate`, { method: 'POST' })
      if (res.ok) {
        toast.success('Cost sheet duplicated')
        setDetailOpen(false)
        fetchCostSheets()
      } else {
        toast.error('Failed to duplicate')
      }
    } catch {
      toast.error('Failed to duplicate')
    }
  }

  // ─── Status change ────────────────────────────────────────────────────
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/cost-sheets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        toast.success(`Status changed to ${newStatus}`)
        setDetailOpen(false)
        fetchCostSheets()
      } else {
        toast.error('Failed to change status')
      }
    } catch {
      toast.error('Failed to change status')
    }
  }

  // ─── Category subtotals from form items (dynamic) ──────────────────
  const getItemCategorySubtotals = () => {
    const totals: Record<string, number> = {}
    for (const item of formItems) {
      totals[item.category] = (totals[item.category] || 0) + item.itemCost
    }
    return totals
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Product Costing</h1>
            <p className="text-sm text-muted-foreground">Cost sheet management for garment production</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="cost-sheets" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setManageCatsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Manage Categories
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Cost Sheet
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <FileText className="h-3.5 w-3.5" />
            Total Cost Sheets
          </div>
          <p className="text-2xl font-bold">{kpi.totalSheets}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <IndianRupee className="h-3.5 w-3.5" />
            Avg Cost/Piece
          </div>
          <p className="text-2xl font-bold">{formatINR(kpi.avgCost)}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <Sheet className="h-3.5 w-3.5" />
            Avg Margin
          </div>
          <p className="text-2xl font-bold">{kpi.avgMargin.toFixed(1)}%</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <Calculator className="h-3.5 w-3.5" />
            Active Sheets
          </div>
          <p className="text-2xl font-bold text-emerald-400">{kpi.activeSheets}</p>
        </div>
      </div>

      {/* ─── Status Tabs + Search ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeStatus === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveStatus(null)}
          >
            All ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})
          </Button>
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={activeStatus === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveStatus(activeStatus === s ? null : s)}
            >
              {s} ({statusCounts[s] || 0})
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sheets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* ─── Cost Sheet List ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card rounded-xl p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : costSheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Calculator className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No Cost Sheets</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search || activeStatus ? 'No matching cost sheets found.' : 'Create your first cost sheet to get started.'}
          </p>
          {!search && !activeStatus && (
            <Button className="mt-4 gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New Cost Sheet
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {costSheets.map((sheet) => (
            <div
              key={sheet.id}
              className="glass-card rounded-xl overflow-hidden transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 cursor-pointer"
              onClick={() => openDetail(sheet)}
            >
              {/* Photo Thumbnail */}
              <div className="h-32 w-full bg-muted/30 relative">
                {sheet.image ? (
                  <img src={sheet.image} alt={sheet.styleName} className="h-32 w-full object-cover" />
                ) : (
                  <div className="h-32 w-full flex items-center justify-center text-muted-foreground/40">
                    <ImagePlus className="h-8 w-8" />
                  </div>
                )}
              </div>

              <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-muted-foreground">{sheet.sheetNo}</p>
                  <p className="font-semibold truncate">{sheet.styleName}</p>
                  <p className="text-sm text-muted-foreground">{sheet.styleNo}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(sheet) }}>
                      <Eye className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(sheet) }}>
                      <FileText className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(sheet.id) }}>
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-400"
                      onClick={(e) => { e.stopPropagation(); confirmDelete(sheet.id) }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-2 mb-3">
                {sheet.customer && (
                  <span className="text-xs text-muted-foreground">{sheet.customer.companyName}</span>
                )}
                {sheet.sizeRange && (
                  <Badge variant="outline" className="text-xs h-5">{sheet.sizeRange}</Badge>
                )}
                <Badge className={`text-xs h-5 border ${STATUS_COLORS[sheet.status] || ''}`}>
                  {sheet.status}
                </Badge>
              </div>

              {/* Cost breakdown mini — dynamic vs legacy */}
              {sheet.itemCount > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge variant="secondary" className="text-xs h-5 gap-1">
                    <Calculator className="h-3 w-3" />
                    {sheet.itemCount} {sheet.itemCount === 1 ? 'item' : 'items'}
                  </Badge>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-3">
                  {sheet.fabricCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fabric</span>
                      <span className="text-blue-400">{formatINR(sheet.fabricCost)}</span>
                    </div>
                  )}
                  {sheet.trimCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trims</span>
                      <span className="text-amber-400">{formatINR(sheet.trimCost)}</span>
                    </div>
                  )}
                  {sheet.laborCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Labor</span>
                      <span className="text-emerald-400">{formatINR(sheet.laborCost)}</span>
                    </div>
                  )}
                  {sheet.washCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Wash</span>
                      <span className="text-cyan-400">{formatINR(sheet.washCost)}</span>
                    </div>
                  )}
                  {sheet.packagingCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Packaging</span>
                      <span className="text-purple-400">{formatINR(sheet.packagingCost)}</span>
                    </div>
                  )}
                  {sheet.overheadCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Overhead</span>
                      <span className="text-rose-400">{formatINR(sheet.overheadCost)}</span>
                    </div>
                  )}
                  {sheet.otherCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Other</span>
                      <span className="text-gray-400">{formatINR(sheet.otherCost)}</span>
                    </div>
                  )}
                </div>
              )}

              <Separator className="my-2" />

              {/* Totals */}
              <div className="space-y-1.5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost/Piece</p>
                    <p className="text-lg font-bold">{formatINR(sheet.totalCost)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Margin {sheet.profitPercent}%</p>
                    <p className="text-sm font-semibold text-primary">{formatINR(sheet.sellingPrice)}</p>
                  </div>
                </div>
                {/* Profit display with health indicator */}
                {sheet.totalCost > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Profit/Piece</span>
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                      sheet.profitPercent < 15 ? 'text-red-400' :
                      sheet.profitPercent <= 25 ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                        sheet.profitPercent < 15 ? 'bg-red-400' :
                        sheet.profitPercent <= 25 ? 'bg-amber-400' :
                        'bg-emerald-400'
                      }`} />
                      {formatINR(sheet.sellingPrice - sheet.totalCost - sheet.brokerCommissionAmount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Broker Commission — Bold, high-contrast display */}
              {sheet.brokerCommissionPercent > 0 && (
                <div className="mt-3 rounded-lg bg-amber-500 px-3.5 py-2.5 text-white shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4 opacity-90" />
                      <span className="text-sm font-bold">Broker {sheet.brokerCommissionPercent}%</span>
                    </div>
                    <span className="text-sm font-extrabold tracking-tight">{formatINR(-sheet.brokerCommissionAmount)}/pc</span>
                  </div>
                  {sheet.targetQty > 0 && (
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/25">
                      <span className="text-xs opacity-90">Total ({sheet.targetQty.toLocaleString('en-IN')} pcs)</span>
                      <span className="text-sm font-extrabold tracking-tight">{formatINR(-(sheet.brokerCommissionAmount * sheet.targetQty))}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>Qty: {sheet.targetQty.toLocaleString('en-IN')}</span>
                {sheet.itemCount > 0 && <span>{sheet.itemCount} {sheet.itemCount === 1 ? 'item' : 'items'}</span>}
              </div>
              </div>{/* end p-4 */}
            </div>
          ))}
        </div>
      )}

      {/* ─── Create/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton={false} fullscreen className="flex flex-col">
          {/* Custom Header */}
          <div className="h-14 border-b bg-background px-4 lg:px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setDialogOpen(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">
                  {editingId ? 'Edit Cost Sheet' : 'New Cost Sheet'}
                </h2>
                {editingId && (
                  <p className="text-xs text-muted-foreground truncate">{formStyleNo}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {/* Section 1 — Product Details */}
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Sheet className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Product Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Style No <span className="text-red-400">*</span></Label>
                    <Input value={formStyleNo} onChange={(e) => setFormStyleNo(e.target.value)} placeholder="e.g. ELY-2026-001" />
                  </div>
                  <div className="space-y-2">
                    <Label>Style Name <span className="text-red-400">*</span></Label>
                    <Input value={formStyleName} onChange={(e) => setFormStyleName(e.target.value)} placeholder="e.g. Anarkali Kurta" />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Size Range</Label>
                    <Input value={formSizeRange} onChange={(e) => setFormSizeRange(e.target.value)} placeholder="S-XXL" />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Qty</Label>
                    <Input type="number" value={formTargetQty} onChange={(e) => setFormTargetQty(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Brief description..." rows={2} />
                  </div>
                  {/* Photo Upload */}
                  <div className="space-y-2">
                    <Label>Design Photo</Label>
                    <div className="flex items-center gap-3">
                      {formImage ? (
                        <div className="relative h-16 w-16 rounded-lg overflow-hidden border shrink-0">
                          <img src={formImage} alt="Preview" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]"
                            onClick={() => setFormImage(null)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        {formImage ? 'Change Photo' : 'Upload Photo'}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2 * 1024 * 1024) {
                            toast.error('Image must be under 2MB')
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = () => setFormImage(reader.result as string)
                          reader.readAsDataURL(file)
                          e.target.value = ''
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Max 2MB, image/* only</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 — Cost Breakdown */}
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Cost Breakdown (per piece)</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left column — 60% (3/5) */}
                <div className="lg:col-span-3 space-y-3">
                  {formItems.length > 0 ? (
                    /* ── Dynamic category subtotals (when items exist) ── */
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(getItemCategorySubtotals())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([cat, total]) => (
                            <div key={cat} className={`rounded-lg border p-2.5 min-w-[100px] ${getCategoryColor(cat)}`}>
                              <p className="text-xs opacity-70">{cat}</p>
                              <p className="text-sm font-bold">{formatINRDecimal(total)}</p>
                            </div>
                          ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 mt-1"
                        onClick={() => setItemsOpen(!itemsOpen)}
                      >
                        {itemsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {itemsOpen ? 'Hide' : 'Edit'} Cost Items ({formItems.length})
                      </Button>
                    </div>
                  ) : (
                    /* ── Quick Cost input (when no items) ── */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="w-28 text-xs text-muted-foreground">Quick Cost</Label>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            className="pl-7 text-right"
                            placeholder="0"
                            value={formQuickCost}
                            onChange={(e) => setFormQuickCost(e.target.value)}
                          />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 border-dashed"
                        onClick={() => {
                          addItem()
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Add Cost Items for detailed breakdown
                      </Button>
                    </div>
                  )}

                  {/* Cost Items Table — only shown when items exist */}
                  {formItems.length > 0 && (
                  <Collapsible open={itemsOpen} onOpenChange={setItemsOpen}>
                    <CollapsibleContent>
                      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-28">Category</TableHead>
                              <TableHead>Item Name</TableHead>
                              <TableHead className="w-24">Consumption</TableHead>
                              <TableHead className="w-20">Unit</TableHead>
                              <TableHead className="w-24">Rate/Unit</TableHead>
                              <TableHead className="w-20">Waste%</TableHead>
                              <TableHead className="w-24 text-right">Item Cost</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {formItems.map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>
                                    <Select
                                      value={item.category}
                                      onValueChange={(v) => {
                                        if (v === '__add_new__') {
                                          setShowNewCatInput(true)
                                          return
                                        }
                                        updateItem(idx, 'category', v)
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categories.map((c) => (
                                          <SelectItem key={c.id} value={c.name}>
                                            <span className="flex items-center gap-2">
                                              <span className={`inline-block w-2 h-2 rounded-full ${CATEGORY_PALETTE[c.colorIndex % CATEGORY_PALETTE.length].split(' ')[2]}`} />
                                              {c.name}
                                            </span>
                                          </SelectItem>
                                        ))}
                                        <SelectItem value="__add_new__" className="text-primary font-medium">
                                          <span className="flex items-center gap-1.5">
                                            <Plus className="h-3 w-3" />
                                            Add New Category...
                                          </span>
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {showNewCatInput && (
                                      <div className="flex gap-1 mt-1">
                                        <Input
                                          className="h-7 text-xs"
                                          placeholder="Category name..."
                                          value={newCatName}
                                          onChange={(e) => setNewCatName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAddCategory()
                                            if (e.key === 'Escape') { setShowNewCatInput(false); setNewCatName('') }
                                          }}
                                          autoFocus
                                        />
                                        <Button
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          disabled={addingCat || !newCatName.trim()}
                                          onClick={handleAddCategory}
                                        >
                                          {addingCat ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                                        </Button>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      className="h-8 text-xs"
                                      value={item.itemName}
                                      onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                                      placeholder="Item name"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      className="h-8 text-xs text-right"
                                      value={item.consumption || ''}
                                      onChange={(e) => updateItem(idx, 'consumption', parseFloat(e.target.value) || 0)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={item.unit}
                                      onValueChange={(v) => updateItem(idx, 'unit', v)}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {UNITS.map((u) => (
                                          <SelectItem key={u} value={u}>{u}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      className="h-8 text-xs text-right"
                                      value={item.unitRate || ''}
                                      onChange={(e) => updateItem(idx, 'unitRate', parseFloat(e.target.value) || 0)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      className="h-8 text-xs text-right"
                                      value={item.wastagePercent || ''}
                                      onChange={(e) => updateItem(idx, 'wastagePercent', parseFloat(e.target.value) || 0)}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-medium">
                                    {formatINRDecimal(item.itemCost)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-400 hover:text-red-300"
                                      onClick={() => removeItem(idx)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Add Item + subtotals row */}
                      <div className="flex items-center justify-between mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={addItem}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Item
                        </Button>
                        <div className="flex flex-wrap gap-2 justify-end">
                          {Object.entries(getItemCategorySubtotals())
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([cat, total]) => (
                              <span key={cat} className={`text-xs px-2 py-1 rounded-md border ${getCategoryColor(cat)}`}>
                                {cat}: {formatINRDecimal(total)}
                              </span>
                            ))}
                          <span className="text-xs px-2 py-1 rounded-md border bg-primary/10 text-primary border-primary/20 font-semibold">
                            Total: {formatINRDecimal(formItems.reduce((s, i) => s + i.itemCost, 0))}
                          </span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  )}
                </div>

                {/* Right column — 40% (2/5) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Total Cost</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                        <Input
                          type="text"
                          className="pl-7 text-right font-bold bg-primary/5 border-primary/20"
                          value={formTotalCost.toFixed(2)}
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Profit %</Label>
                      <Input
                        type="number"
                        className="text-right"
                        value={formProfitPercent}
                        onChange={(e) => setFormProfitPercent(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-primary">Selling Price</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-primary">₹</span>
                        <Input
                          type="text"
                          className="pl-7 text-right font-bold bg-primary/10 border-primary/30 text-primary"
                          value={formSellingPrice.toFixed(2)}
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Broker Commission — full width below columns */}
              <div className={`mt-4 rounded-xl border-2 p-5 space-y-3 transition-all ${
                parseFloat(formBrokerCommission) > 0
                  ? 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/30'
                  : 'border-dashed border-muted-foreground/25 bg-muted/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${parseFloat(formBrokerCommission) > 0 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
                    <Label className="text-sm font-semibold text-foreground">Broker Commission</Label>
                  </div>
                  {parseFloat(formBrokerCommission) > 0 && (
                    <span className="text-xs font-bold text-white bg-amber-500 px-2.5 py-0.5 rounded-full">ACTIVE</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Commission %</p>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        className={`text-right text-base font-bold pr-8 h-10 ${parseFloat(formBrokerCommission) > 0 ? 'border-amber-500 bg-white dark:bg-amber-950/40' : ''}`}
                        value={formBrokerCommission}
                        onChange={(e) => setFormBrokerCommission(e.target.value)}
                        placeholder="0"
                      />
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold ${parseFloat(formBrokerCommission) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>%</span>
                    </div>
                  </div>
                </div>

                {parseFloat(formBrokerCommission) > 0 && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-200 dark:border-amber-700/40">
                    <div className="rounded-lg bg-white dark:bg-black/20 p-3 shadow-sm border border-amber-200/60 dark:border-amber-700/30">
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Per Piece Deduction</p>
                      <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                        -₹{((formSellingPrice * parseFloat(formBrokerCommission)) / 100).toFixed(2)}
                      </p>
                    </div>
                    {parseInt(formTargetQty) > 0 && (
                      <div className="rounded-lg bg-white dark:bg-black/20 p-3 shadow-sm border border-amber-200/60 dark:border-amber-700/30">
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">Total ({parseInt(formTargetQty).toLocaleString('en-IN')} pcs)</p>
                        <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                          {formatINR(-((formSellingPrice * parseFloat(formBrokerCommission) / 100) * parseInt(formTargetQty)))}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Section 3 — Color × Quantity + Profit Analysis */}
            <section>
              <div className="rounded-xl border-2 border-violet-400 dark:border-violet-500 bg-violet-50/60 dark:bg-violet-950/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-violet-500 flex items-center justify-center">
                      <Palette className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <Label className="text-base font-bold text-violet-700 dark:text-violet-300">Color × Quantity</Label>
                      <p className="text-xs text-muted-foreground">Add colors with quantities to see actual order size & profit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {formColors.length > 0 && (
                      <span className="text-sm font-extrabold text-white bg-violet-500 px-3 py-1 rounded-full">
                        Lot: {formColors.reduce((s, c) => s + (parseInt(c.quantity) || 0), 0).toLocaleString('en-IN')} pcs
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-violet-600 border-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950 font-medium"
                      onClick={() => setFormColors([...formColors, { id: crypto.randomUUID(), color: '', quantity: '' }])}
                    >
                      <Plus className="h-4 w-4" /> Add Color
                    </Button>
                  </div>
                </div>

                {formColors.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-violet-300/60 rounded-lg">
                    <Palette className="h-8 w-8 text-violet-300 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">No colors added yet</p>
                    <p className="text-xs text-muted-foreground">Click <strong>"Add Color"</strong> to define color-wise quantities</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                      {formColors.map((c, idx) => (
                        <div key={c.id} className="flex items-center gap-2 rounded-lg border border-violet-200/60 dark:border-violet-700/40 bg-white dark:bg-black/20 px-3 py-2">
                          <span className="text-xs text-muted-foreground w-5 text-right font-medium">{idx + 1}</span>
                          <Input
                            className="h-8 text-sm flex-1 border-0 shadow-none focus-visible:ring-0 p-0"
                            placeholder="Color name"
                            value={c.color}
                            onChange={(e) => {
                              const updated = [...formColors]
                              updated[idx] = { ...updated[idx], color: e.target.value }
                              setFormColors(updated)
                            }}
                          />
                          <Input
                            type="number"
                            className="h-8 text-sm text-right w-24 border-0 shadow-none focus-visible:ring-0 p-0 font-bold"
                            placeholder="Qty"
                            value={c.quantity}
                            onChange={(e) => {
                              const updated = [...formColors]
                              updated[idx] = { ...updated[idx], quantity: e.target.value }
                              setFormColors(updated)
                            }}
                          />
                          <span className="text-xs text-muted-foreground">pcs</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                            onClick={() => setFormColors(formColors.filter((_, i) => i !== idx))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* ── Profit Analysis ── */}
                    {(() => {
                      const lotQty = formColors.reduce((s, c) => s + (parseInt(c.quantity) || 0), 0)
                      const sp = formSellingPrice
                      const tc = formTotalCost
                      const brokerPct = parseFloat(formBrokerCommission) || 0
                      const brokerAmt = sp > 0 ? sp * brokerPct / 100 : 0
                      const grossProfitPc = sp - tc
                      const netProfitPc = sp - tc - brokerAmt
                      const grossProfitPctOfSp = sp > 0 ? (grossProfitPc / sp) * 100 : 0
                      const netProfitPctOfSp = sp > 0 ? (netProfitPc / sp) * 100 : 0
                      const lotValue = sp * lotQty
                      const lotCost = tc * lotQty
                      const lotGrossProfit = grossProfitPc * lotQty
                      const lotBroker = brokerAmt * lotQty
                      const lotNetProfit = netProfitPc * lotQty
                      const lotNetPctOfValue = lotValue > 0 ? (lotNetProfit / lotValue) * 100 : 0

                      return (
                        <div className="rounded-xl bg-violet-600 p-5 text-white shadow-lg">
                          <p className="text-sm font-bold mb-1 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Profit Analysis — {lotQty.toLocaleString('en-IN')} pcs lot
                          </p>
                          <p className="text-xs text-white/60 mb-3">SP: ₹{sp.toFixed(2)} × {lotQty} = ₹{lotValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>

                          {/* Per Piece Row */}
                          <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-1.5">Per Piece</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Selling Price</p>
                              <p className="text-base font-extrabold">₹{sp.toFixed(2)}</p>
                            </div>
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Total Cost</p>
                              <p className="text-base font-extrabold">₹{tc.toFixed(2)}</p>
                            </div>
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Gross Profit</p>
                              <p className="text-base font-extrabold text-emerald-300">₹{grossProfitPc.toFixed(2)}</p>
                              <p className="text-[10px] text-white/50">{grossProfitPctOfSp.toFixed(1)}%</p>
                            </div>
                            {brokerPct > 0 && (
                              <div className="rounded-lg bg-amber-500/80 backdrop-blur-sm p-2.5">
                                <p className="text-[10px] text-white/80">Broker {brokerPct}%</p>
                                <p className="text-base font-extrabold">-₹{brokerAmt.toFixed(2)}</p>
                              </div>
                            )}
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Net Profit {brokerPct > 0 ? '(after broker)' : ''}</p>
                              <p className="text-base font-extrabold text-emerald-300">₹{netProfitPc.toFixed(2)}</p>
                              <p className="text-[10px] text-white/50">{netProfitPctOfSp.toFixed(1)}%</p>
                            </div>
                          </div>

                          {/* Total Lot Row */}
                          <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-1.5">Total Lot ({lotQty.toLocaleString('en-IN')} pcs)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Lot Value</p>
                              <p className="text-base font-extrabold">{formatINR(lotValue)}</p>
                            </div>
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Lot Cost</p>
                              <p className="text-base font-extrabold">{formatINR(lotCost)}</p>
                            </div>
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Lot Gross Profit</p>
                              <p className="text-base font-extrabold text-emerald-300">{formatINR(lotGrossProfit)}</p>
                            </div>
                            {brokerPct > 0 && (
                              <div className="rounded-lg bg-amber-500/80 backdrop-blur-sm p-2.5">
                                <p className="text-[10px] text-white/80">Total Broker</p>
                                <p className="text-base font-extrabold">{formatINR(-lotBroker)}</p>
                              </div>
                            )}
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-2.5">
                              <p className="text-[10px] text-white/60">Lot Net Profit</p>
                              <p className="text-base font-extrabold text-emerald-300">{formatINR(lotNetProfit)}</p>
                              <p className="text-[10px] text-white/50">{lotNetPctOfValue.toFixed(1)}%</p>
                            </div>
                          </div>

                          {brokerPct > 0 && (
                            <div className="mt-2.5 pt-2.5 border-t border-white/20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                              <span className="text-white/70">You keep: <strong className="text-white">{(100 - brokerPct).toFixed(1)}%</strong> of margin</span>
                              <span className="text-white/30">|</span>
                              <span className="text-white/70">Broker: <strong className="text-amber-300">{brokerPct}%</strong> = {formatINR(lotBroker)}</span>
                              <span className="text-white/30">|</span>
                              <span className="text-white/70">Your net: <strong className="text-emerald-300">{formatINR(lotNetProfit)}</strong></span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ──────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent showCloseButton={false} fullscreen className="flex flex-col">
          {selectedSheet && (
            <>
              {/* Custom Header */}
              <div className="h-14 border-b bg-background px-4 lg:px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setDetailOpen(false)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold truncate">{selectedSheet.sheetNo}</h2>
                      <Badge className={`border shrink-0 ${STATUS_COLORS[selectedSheet.status] || ''}`}>
                        {selectedSheet.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedSheet.styleName} — {selectedSheet.styleNo}
                      {selectedSheet.customer && <> · {selectedSheet.customer.companyName}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={selectedSheet.status}
                    onValueChange={(v) => handleStatusChange(selectedSheet.id, v)}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { setDetailOpen(false); openEdit(selectedSheet) }}>
                    <FileText className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleDuplicate(selectedSheet.id)}>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Duplicate</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => printCostSheet(selectedSheet!, buildCategoryColorMap())}>
                    <Printer className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-red-400 hover:text-red-300" onClick={() => { setDetailOpen(false); confirmDelete(selectedSheet.id) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-6">

              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Meta info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Size Range</p>
                      <p className="font-medium">{selectedSheet.sizeRange || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Target Qty</p>
                      <p className="font-medium">{selectedSheet.targetQty.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Customer</p>
                      <p className="font-medium">{selectedSheet.customer?.companyName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Description</p>
                      <p className="font-medium">{selectedSheet.description || '—'}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Cost breakdown — dynamic from items */}
                  {selectedSheet.costItems && selectedSheet.costItems.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Cost Breakdown by Category</h3>
                      {(() => {
                        const catTotals: Record<string, number> = {}
                        for (const item of selectedSheet.costItems) {
                          catTotals[item.category] = (catTotals[item.category] || 0) + item.itemCost
                        }
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-2">
                            {Object.entries(catTotals).sort(([a], [b]) => a.localeCompare(b)).map(([cat, total]) => (
                              <div key={cat} className={`rounded-lg border p-2.5 ${getCategoryColor(cat)}`}>
                                <p className="text-xs opacity-70">{cat}</p>
                                <p className="text-sm font-bold">{formatINR(total)}</p>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Cost Breakdown (per piece)</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Fabric', value: selectedSheet.fabricCost, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                          { label: 'Trims', value: selectedSheet.trimCost, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                          { label: 'Labor', value: selectedSheet.laborCost, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                          { label: 'Wash/Finish', value: selectedSheet.washCost, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                          { label: 'Packaging', value: selectedSheet.packagingCost, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                          { label: 'Overhead', value: selectedSheet.overheadCost, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
                          { label: 'Other', value: selectedSheet.otherCost, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
                        ].map((item) => (
                          <div key={item.label} className={`rounded-lg border p-3 ${item.bg}`}>
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <p className={`text-lg font-bold ${item.color}`}>{formatINR(item.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Total, Selling Price, Broker Commission */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground">Total Cost/Piece</p>
                      <p className="text-2xl font-bold">{formatINR(selectedSheet.totalCost)}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground">Profit Margin</p>
                      <p className="text-2xl font-bold">{selectedSheet.profitPercent}%</p>
                    </div>
                    <div className="rounded-xl border bg-primary/10 border-primary/20 p-4 md:col-span-1 col-span-2 md:col-span-1">
                      <p className="text-xs text-primary/70">Selling Price</p>
                      <p className="text-2xl font-bold text-primary">{formatINR(selectedSheet.sellingPrice)}</p>
                    </div>
                  </div>

                  {/* Broker Commission Breakdown — Bold & Clean */}
                  {selectedSheet.brokerCommissionPercent > 0 && (
                    <div className="mt-4 rounded-xl bg-amber-500 p-5 text-white shadow-md">
                      <div className="flex items-center gap-2 mb-4">
                        <IndianRupee className="h-4 w-4" />
                        <p className="text-base font-bold">Broker Commission — {selectedSheet.brokerCommissionPercent}%</p>
                        <span className="text-xs font-bold bg-white/25 px-2.5 py-0.5 rounded-full ml-1">ACTIVE</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                          <p className="text-xs text-white/80 mb-0.5">Per Piece</p>
                          <p className="text-xl font-extrabold">{formatINR(-selectedSheet.brokerCommissionAmount)}</p>
                        </div>
                        <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                          <p className="text-xs text-white/80 mb-0.5">Net Profit/Pc</p>
                          <p className="text-xl font-extrabold">{formatINR(selectedSheet.sellingPrice - selectedSheet.totalCost - selectedSheet.brokerCommissionAmount)}</p>
                        </div>
                        {selectedSheet.targetQty > 0 && (
                          <>
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                              <p className="text-xs text-white/80 mb-0.5">Order Value</p>
                              <p className="text-xl font-extrabold">{formatINR(selectedSheet.sellingPrice * selectedSheet.targetQty)}</p>
                            </div>
                            <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                              <p className="text-xs text-white/80 mb-0.5">Total Payable</p>
                              <p className="text-xl font-extrabold">{formatINR(selectedSheet.brokerCommissionAmount * selectedSheet.targetQty)}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ─── Color × Quantity + Profit Analysis ─── */}
                  {(() => {
                    const colors = (selectedSheet.colorBreakdown || []) as { color: string; quantity: number }[]
                    const hasColors = colors.length > 0
                    const lotQty = hasColors ? colors.reduce((s, c) => s + (c.quantity || 0), 0) : selectedSheet.targetQty
                    const sp = selectedSheet.sellingPrice
                    const tc = selectedSheet.totalCost
                    const bp = selectedSheet.brokerCommissionPercent || 0
                    const ba = selectedSheet.brokerCommissionAmount || 0
                    const grossProfitPc = sp - tc
                    const netProfitPc = sp - tc - ba
                    const grossProfitPctOfSp = sp > 0 ? (grossProfitPc / sp) * 100 : 0
                    const netProfitPctOfSp = sp > 0 ? (netProfitPc / sp) * 100 : 0
                    const lotValue = sp * lotQty
                    const lotCost = tc * lotQty
                    const lotGrossProfit = grossProfitPc * lotQty
                    const lotBroker = ba * lotQty
                    const lotNetProfit = netProfitPc * lotQty
                    const lotNetPctOfValue = lotValue > 0 ? (lotNetProfit / lotValue) * 100 : 0

                    return (
                      <>
                        <Separator />
                        <div className="rounded-xl border-2 border-violet-400 dark:border-violet-500 bg-violet-50/60 dark:bg-violet-950/20 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-lg bg-violet-500 flex items-center justify-center">
                                <Palette className="h-4 w-4 text-white" />
                              </div>
                              <div>
                                <h3 className="text-base font-bold text-violet-700 dark:text-violet-300">
                                  Color × Quantity{hasColors ? ` (${colors.length} colors)` : ''}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  {hasColors
                                    ? `Actual lot size: ${lotQty.toLocaleString('en-IN')} pcs`
                                    : `Using Target Qty: ${lotQty.toLocaleString('en-IN')} pcs (add colors in Edit for accurate lot sizing)`}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-extrabold text-white bg-violet-500 px-3 py-1 rounded-full">
                              Lot: {lotQty.toLocaleString('en-IN')} pcs
                            </span>
                          </div>

                          {/* Color grid */}
                          {hasColors && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 mb-4">
                              {colors.map((c, i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg border border-violet-200/60 dark:border-violet-700/40 bg-white dark:bg-black/20 px-3 py-2.5">
                                  <span className="text-sm font-medium truncate mr-2">{c.color}</span>
                                  <span className="text-sm font-bold tabular-nums">{c.quantity.toLocaleString('en-IN')} <span className="text-xs text-muted-foreground font-normal">pcs</span></span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Profit Analysis — ALWAYS shown */}
                          <div className="rounded-xl bg-violet-600 p-5 text-white shadow-lg">
                            <p className="text-sm font-bold mb-1 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4" />
                              Profit Analysis — {lotQty.toLocaleString('en-IN')} pcs
                            </p>
                            <p className="text-xs text-white/60 mb-4">SP: ₹{sp.toFixed(2)} × {lotQty.toLocaleString('en-IN')} = ₹{lotValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>

                            <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-2">Per Piece</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-4">
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Selling Price</p>
                                <p className="text-lg font-extrabold">₹{sp.toFixed(2)}</p>
                              </div>
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Total Cost</p>
                                <p className="text-lg font-extrabold">₹{tc.toFixed(2)}</p>
                              </div>
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Gross Profit</p>
                                <p className="text-lg font-extrabold text-emerald-300">₹{grossProfitPc.toFixed(2)}</p>
                                <p className="text-[10px] text-white/50">{grossProfitPctOfSp.toFixed(1)}% margin</p>
                              </div>
                              {bp > 0 && (
                                <div className="rounded-lg bg-amber-500/80 backdrop-blur-sm p-3">
                                  <p className="text-[10px] text-white/80">Broker {bp}%</p>
                                  <p className="text-lg font-extrabold">-₹{ba.toFixed(2)}</p>
                                </div>
                              )}
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Net Profit {bp > 0 ? '(after broker)' : ''}</p>
                                <p className="text-lg font-extrabold text-emerald-300">₹{netProfitPc.toFixed(2)}</p>
                                <p className="text-[10px] text-white/50">{netProfitPctOfSp.toFixed(1)}% margin</p>
                              </div>
                            </div>

                            <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-2">Total Lot ({lotQty.toLocaleString('en-IN')} pcs)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Lot Value</p>
                                <p className="text-lg font-extrabold">{formatINR(lotValue)}</p>
                              </div>
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Lot Cost</p>
                                <p className="text-lg font-extrabold">{formatINR(lotCost)}</p>
                              </div>
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Lot Gross Profit</p>
                                <p className="text-lg font-extrabold text-emerald-300">{formatINR(lotGrossProfit)}</p>
                              </div>
                              {bp > 0 && (
                                <div className="rounded-lg bg-amber-500/80 backdrop-blur-sm p-3">
                                  <p className="text-[10px] text-white/80">Total Broker</p>
                                  <p className="text-lg font-extrabold">{formatINR(-lotBroker)}</p>
                                </div>
                              )}
                              <div className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                                <p className="text-[10px] text-white/60">Lot Net Profit</p>
                                <p className="text-lg font-extrabold text-emerald-300">{formatINR(lotNetProfit)}</p>
                                <p className="text-[10px] text-white/50">{lotNetPctOfValue.toFixed(1)}% of lot</p>
                              </div>
                            </div>

                            {bp > 0 && (
                              <div className="mt-3 pt-3 border-t border-white/20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                                <span className="text-white/70">You keep: <strong className="text-white">{(100 - bp).toFixed(1)}%</strong> of margin</span>
                                <span className="text-white/30">|</span>
                                <span className="text-white/70">Broker: <strong className="text-amber-300">{bp}%</strong> = {formatINR(lotBroker)}</span>
                                <span className="text-white/30">|</span>
                                <span className="text-white/70">Your net: <strong className="text-emerald-300">{formatINR(lotNetProfit)}</strong></span>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )
                  })()}

                  {/* Cost Items Table */}
                  {selectedSheet.costItems && selectedSheet.costItems.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Cost Items ({selectedSheet.costItems.length})</h3>
                        <div className="max-h-[500px] overflow-y-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Category</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Consumption</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead className="text-right">Rate/Unit</TableHead>
                                <TableHead className="text-right">Waste%</TableHead>
                                <TableHead className="text-right">Item Cost</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedSheet.costItems.map((item, idx) => (
                                <TableRow key={item.id || idx}>
                                  <TableCell>
                                    <Badge className={`border ${getCategoryColor(item.category)} text-xs h-5`}>
                                      {item.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <p className="text-sm font-medium">{item.itemName}</p>
                                      {item.description && (
                                        <p className="text-xs text-muted-foreground">{item.description}</p>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {item.consumption}
                                  </TableCell>
                                  <TableCell className="text-sm">{item.unit}</TableCell>
                                  <TableCell className="text-right text-sm">{formatINR(item.unitRate)}</TableCell>
                                  <TableCell className="text-right text-sm">{item.wastagePercent}%</TableCell>
                                  <TableCell className="text-right text-sm font-medium">{formatINR(item.itemCost)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Notes */}
                  {selectedSheet.notes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{selectedSheet.notes}</p>
                      </div>
                    </>
                  )}

                </>
              )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Manage Categories Dialog ────────────────────────────────────── */}
      <Dialog open={manageCatsOpen} onOpenChange={setManageCatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Cost Categories</DialogTitle>
            <DialogDescription>
              Add, view, or remove custom cost categories. Pre-seeded categories (system) cannot be deleted but can be renamed.
            </DialogDescription>
          </DialogHeader>

          {/* Add new category */}
          <div className="flex gap-2">
            <Input
              placeholder="New category name..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCategory()
              }}
            />
            <Button
              className="gap-1.5 shrink-0"
              disabled={addingCat || !newCatName.trim()}
              onClick={handleAddCategory}
            >
              {addingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>

          {/* Categories list */}
          <div className="max-h-80 overflow-y-auto space-y-1">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`flex items-center justify-between rounded-lg border p-2.5 ${CATEGORY_PALETTE[cat.colorIndex % CATEGORY_PALETTE.length]}`}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full border border-current/30" />
                  <span className="text-sm font-medium">{cat.name}</span>
                  {cat.isSystem && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">System</Badge>
                  )}
                </div>
                {!cat.isSystem && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => handleDeleteCategory(cat.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setManageCatsOpen(false); setNewCatName('') }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Sheet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this cost sheet? This action cannot be undone and all associated cost items will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}