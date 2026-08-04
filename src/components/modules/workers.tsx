'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Plus,
  Users,
  UserCheck,
  IndianRupee,
  Building2,
  Phone,
  MoreVertical,
  Pencil,
  Eye,
  Trash2,
  CalendarDays,
  Briefcase,
  Tag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Worker {
  id: string
  name: string
  phone: string | null
  department: string
  designation: string
  skills: string | null
  salary: number
  dailyWage: number | null
  joinDate: string
  status: string
  createdAt: string
  updatedAt: string
}

interface WorkersSummary {
  totalEmployees: number
  activeCount: number
  monthlyPayroll: number
  avgSalary: number
  departmentCount: number
  productionCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  'Production',
  'Quality',
  'Finance',
  'Sales',
  'Merchandising',
  'Design',
  'Admin',
]

const DEPARTMENT_COLORS: Record<string, string> = {
  Production: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  Quality: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  Finance: 'border-sky-500/50 bg-sky-500/10 text-sky-400',
  Sales: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
  Merchandising: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  Design: 'border-pink-500/50 bg-pink-500/10 text-pink-400',
  Admin: 'border-slate-500/50 bg-slate-500/10 text-slate-400',
}

const BAR_COLORS: Record<string, string> = {
  Production: 'bg-amber-500',
  Quality: 'bg-emerald-500',
  Finance: 'bg-sky-500',
  Sales: 'bg-purple-500',
  Merchandising: 'bg-rose-500',
  Design: 'bg-pink-500',
  Admin: 'bg-slate-400',
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

function getDepartmentBadgeClass(dept: string): string {
  return DEPARTMENT_COLORS[dept] || 'border-border bg-muted/50 text-muted-foreground'
}

function getBarColor(dept: string): string {
  return BAR_COLORS[dept] || 'bg-muted-foreground/30'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Workers() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const limit = 50

  const [summary, setSummary] = useState<WorkersSummary>({
    totalEmployees: 0,
    activeCount: 0,
    monthlyPayroll: 0,
    avgSalary: 0,
    departmentCount: 0,
    productionCount: 0,
  })
  const [departmentCounts, setDepartmentCounts] = useState<Record<string, number>>({})
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  // Detail panel
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: '',
    phone: '',
    department: '',
    designation: '',
    skills: '',
    salary: '',
    dailyWage: '',
  })

  const fetchWorkers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (departmentFilter !== 'All') params.set('department', departmentFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', String(limit))

      const res = await fetch(`/api/workers?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setWorkers(data.workers)
      setTotal(data.total)
      setSummary(data.summary)
      setDepartmentCounts(data.departmentCounts)
      setStatusCounts(data.statusCounts)
    } catch {
      setWorkers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search, departmentFilter, statusFilter, page])

  useEffect(() => {
    const timer = setTimeout(() => fetchWorkers(), 200)
    return () => clearTimeout(timer)
  }, [fetchWorkers])

  // Reset page on filter changes
  useEffect(() => {
    setPage(1)
  }, [search, departmentFilter, statusFilter])

  const openDetail = async (worker: Worker) => {
    setSelectedWorker(worker)
    setDetailOpen(true)
  }

  const openAddDialog = () => {
    setEditingWorker(null)
    setForm({
      name: '',
      phone: '',
      department: '',
      designation: '',
      skills: '',
      salary: '',
      dailyWage: '',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (worker: Worker) => {
    setEditingWorker(worker)
    setForm({
      name: worker.name,
      phone: worker.phone || '',
      department: worker.department,
      designation: worker.designation,
      skills: worker.skills || '',
      salary: String(worker.salary),
      dailyWage: worker.dailyWage ? String(worker.dailyWage) : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.department || !form.designation.trim() || !form.salary) return
    setSaving(true)
    try {
      if (editingWorker) {
        const res = await fetch(`/api/workers/${editingWorker.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            phone: form.phone || null,
            department: form.department,
            designation: form.designation,
            skills: form.skills || null,
            salary: Number(form.salary),
            dailyWage: form.dailyWage ? Number(form.dailyWage) : null,
          }),
        })
        if (res.ok) {
          toast.success('Worker updated successfully')
          setDialogOpen(false)
          fetchWorkers()
        }
      } else {
        const res = await fetch('/api/workers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            phone: form.phone || null,
            department: form.department,
            designation: form.designation,
            skills: form.skills || null,
            salary: Number(form.salary),
            dailyWage: form.dailyWage ? Number(form.dailyWage) : null,
          }),
        })
        if (res.ok) {
          toast.success('Worker created successfully')
          setDialogOpen(false)
          fetchWorkers()
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save worker')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/workers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Worker deactivated successfully')
        setDetailOpen(false)
        setSelectedWorker(null)
        fetchWorkers()
      }
    } catch {
      toast.error('Failed to deactivate worker')
    }
  }

  const handleToggleStatus = async (worker: Worker) => {
    try {
      const newStatus = worker.status === 'Active' ? 'Inactive' : 'Active'
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        fetchWorkers()
        if (selectedWorker?.id === worker.id) {
          setSelectedWorker({ ...worker, status: newStatus })
        }
        toast.success(`Worker ${newStatus === 'Active' ? 'activated' : 'deactivated'} successfully`)
      }
    } catch {
      toast.error('Failed to toggle worker status')
    }
  }

  const uniqueDepartments = Object.keys(departmentCounts).sort()

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">
            <Users className="mr-2 inline-block h-6 w-6 text-primary" />
            <span className="text-primary">Workers</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Workforce Management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="workers" />
          <Button
            onClick={openAddDialog}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Worker
          </Button>
        </div>
      </div>

      {/* ─── Summary KPI Cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Total Workers */}
        <div className="glass-card rounded-xl border-l-4 border-l-primary p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Workers
              </p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-12" />
              ) : (
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {summary.totalEmployees}
                </p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Active Workers */}
        <div className="glass-card rounded-xl border-l-4 border-l-emerald-500 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active Workers
              </p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-12" />
              ) : (
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
                  {summary.activeCount}
                </p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <UserCheck className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Monthly Payroll */}
        <div className="glass-card rounded-xl border-l-4 border-l-amber-500 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Monthly Payroll
              </p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-24" />
              ) : (
                <p className="mt-1 text-lg font-bold tabular-nums text-amber-400">
                  {formatINR(summary.monthlyPayroll)}
                </p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <IndianRupee className="h-5 w-5 text-amber-400" />
            </div>
          </div>
        </div>

        {/* Departments */}
        <div className="glass-card rounded-xl border-l-4 border-l-sky-500 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Departments
              </p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-8" />
              ) : (
                <p className="mt-1 text-2xl font-bold tabular-nums text-sky-400">
                  {summary.departmentCount}
                </p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10">
              <Building2 className="h-5 w-5 text-sky-400" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Department Distribution Bar ──────────────────────── */}
      {!loading && Object.keys(departmentCounts).length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Department Distribution
          </h3>
          <div className="flex h-8 w-full overflow-hidden rounded-lg">
            {Object.entries(departmentCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([dept, count]) => (
                <div
                  key={dept}
                  className={`${getBarColor(dept)} relative flex items-center justify-center transition-all`}
                  style={{
                    width: `${(count / summary.totalEmployees) * 100}%`,
                    minWidth: count > 0 ? '2rem' : '0',
                  }}
                  title={`${dept}: ${count}`}
                >
                  {(count / summary.totalEmployees) * 100 > 10 && (
                    <span className="text-[10px] font-semibold text-white drop-shadow-sm truncate px-1">
                      {dept}
                    </span>
                  )}
                </div>
              ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(departmentCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([dept, count]) => (
                <div key={dept} className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-sm ${getBarColor(dept)}`} />
                  <span className="text-[10px] text-muted-foreground">
                    {dept} <span className="font-medium text-foreground">{count}</span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ─── Filter Bar ───────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, department, designation, skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-border"
          />
        </div>
        <div className="flex gap-1.5">
          {['All', 'Active', 'Inactive'].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={
                statusFilter === s
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }
            >
              {s}
              {!loading && statusCounts[s] !== undefined && (
                <span className="ml-1 text-[10px] opacity-70">({statusCounts[s]})</span>
              )}
            </Button>
          ))}
        </div>
        <Select
          value={departmentFilter}
          onValueChange={setDepartmentFilter}
        >
          <SelectTrigger className="w-full sm:w-44 bg-muted/50 border-border">
            <Building2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Departments</SelectItem>
            {uniqueDepartments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Loading State (Mobile) ───────────────────────────── */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Loading State (Desktop) ──────────────────────────── */}
      {loading && (
        <div className="hidden lg:block glass-card rounded-xl p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty State ──────────────────────────────────────── */}
      {!loading && workers.length === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No workers found</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {search || departmentFilter !== 'All' || statusFilter !== 'All'
              ? 'Try adjusting your search or filter criteria.'
              : 'Add your first worker to get started.'}
          </p>
          {!search && departmentFilter === 'All' && statusFilter === 'All' && (
            <Button
              onClick={openAddDialog}
              className="mt-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Worker
            </Button>
          )}
        </div>
      )}

      {/* ─── Mobile: Card Grid ────────────────────────────────── */}
      {!loading && workers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {workers.map((worker) => (
            <div
              key={worker.id}
              className="glass-card rounded-xl p-4 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {worker.name}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {worker.designation}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={getDepartmentBadgeClass(worker.department) + ' text-[10px] px-1.5 py-0'}
                  >
                    {worker.department}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      worker.status === 'Active'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0'
                        : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0'
                    }
                  >
                    {worker.status}
                  </Badge>
                </div>
              </div>

              {worker.phone && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {worker.phone}
                </div>
              )}

              {worker.skills && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {worker.skills.split(',').map(
                    (skill, i) =>
                      skill.trim() && (
                        <span
                          key={i}
                          className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {skill.trim()}
                        </span>
                      )
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">Salary</p>
                  <p className="text-sm font-semibold tabular-nums text-primary">
                    {formatINR(worker.salary)}
                  </p>
                </div>
                {worker.dailyWage && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Daily Wage</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatINR(worker.dailyWage)}
                    </p>
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDetail(worker)}>
                      <Eye className="mr-2 h-4 w-4" /> View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEditDialog(worker)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    {worker.status === 'Active' ? (
                      <DropdownMenuItem onClick={() => handleToggleStatus(worker)}>
                        <UserCheck className="mr-2 h-4 w-4" /> Deactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleToggleStatus(worker)}>
                        <UserCheck className="mr-2 h-4 w-4" /> Activate
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Desktop: Table View ──────────────────────────────── */}
      {!loading && workers.length > 0 && (
        <div className="hidden lg:block glass-card rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Phone
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Department
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Designation
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Skills
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Salary
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  Daily Wage
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Join Date
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((worker) => (
                <TableRow
                  key={worker.id}
                  className="border-border cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => openDetail(worker)}
                >
                  <TableCell className="font-medium text-sm">
                    {worker.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {worker.phone || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getDepartmentBadgeClass(worker.department) + ' text-[10px] px-2 py-0'}
                    >
                      {worker.department}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {worker.designation}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[180px] flex-wrap gap-1">
                      {worker.skills
                        ? worker.skills.split(',').slice(0, 2).map(
                            (skill, i) =>
                              skill.trim() && (
                                <span
                                  key={i}
                                  className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {skill.trim()}
                                </span>
                              )
                          )
                        : '—'}
                      {worker.skills && worker.skills.split(',').filter((s) => s.trim()).length > 2 && (
                        <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          +{worker.skills.split(',').filter((s) => s.trim()).length - 2}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-primary">
                    {formatINR(worker.salary)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {worker.dailyWage ? formatINR(worker.dailyWage) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(worker.joinDate)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        worker.status === 'Active'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0'
                          : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-2 py-0'
                      }
                    >
                      {worker.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(worker)}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(worker)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        {worker.status === 'Active' ? (
                          <DropdownMenuItem onClick={() => handleToggleStatus(worker)}>
                            <UserCheck className="mr-2 h-4 w-4" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleToggleStatus(worker)}>
                            <UserCheck className="mr-2 h-4 w-4" /> Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeactivate(worker.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Pagination ───────────────────────────────────────── */}
      {!loading && workers.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-xs tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Worker Detail Sheet ──────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg border-border bg-background p-0 overflow-y-auto">
          {selectedWorker && (
            <>
              <SheetHeader className="p-4 pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                      {selectedWorker.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <SheetTitle className="text-base font-bold">
                        {selectedWorker.name}
                      </SheetTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedWorker.designation}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      selectedWorker.status === 'Active'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0'
                        : 'border-red-500/50 bg-red-500/10 text-red-400 text-[10px] px-2 py-0'
                    }
                  >
                    {selectedWorker.status}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="p-4 space-y-4">
                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => {
                      openEditDialog(selectedWorker)
                      setDetailOpen(false)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {selectedWorker.status === 'Active' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeactivate(selectedWorker.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => handleToggleStatus(selectedWorker)}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Activate
                    </Button>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Info Grid */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Worker Information
                  </h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2.5">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedWorker.phone || 'No phone'}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedWorker.department}</span>
                      <Badge
                        variant="outline"
                        className={getDepartmentBadgeClass(selectedWorker.department) + ' text-[10px] px-1.5 py-0'}
                      >
                        {selectedWorker.department}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedWorker.designation}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span>Joined {formatDate(selectedWorker.joinDate)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({formatDistanceToNow(new Date(selectedWorker.joinDate), { addSuffix: true })})
                      </span>
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Salary Card */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Compensation
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="glass-card rounded-lg p-3 text-center">
                      <IndianRupee className="mx-auto h-4 w-4 text-primary mb-1" />
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {formatINR(selectedWorker.salary)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Monthly Salary
                      </p>
                    </div>
                    <div className="glass-card rounded-lg p-3 text-center">
                      <IndianRupee className="mx-auto h-4 w-4 text-amber-400 mb-1" />
                      <p className="text-lg font-bold tabular-nums text-amber-400">
                        {selectedWorker.dailyWage ? formatINR(selectedWorker.dailyWage) : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Daily Wage
                      </p>
                    </div>
                  </div>
                </div>

                {/* Skills */}
                {selectedWorker.skills && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Skills
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedWorker.skills.split(',').map(
                          (skill, i) =>
                            skill.trim() && (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground"
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {skill.trim()}
                              </span>
                            )
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator className="bg-border" />

                {/* Tenure */}
                <div className="glass-card rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Tenure
                      </p>
                      <p className="text-sm font-medium mt-0.5">
                        {formatDistanceToNow(new Date(selectedWorker.joinDate), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Joined
                      </p>
                      <p className="text-sm font-medium mt-0.5">
                        {formatDate(selectedWorker.joinDate)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Add/Edit Dialog ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-border bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingWorker ? 'Edit Worker' : 'Add New Worker'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Rajesh Kumar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Phone</Label>
              <Input
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">
                  Department <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.department}
                  onValueChange={(v) => setForm({ ...form, department: v })}
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">
                  Designation <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g. Tailor Master"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Skills</Label>
              <Input
                placeholder="e.g. Cutting, Stitching, Finishing (comma-separated)"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">
                  Monthly Salary (₹) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  className="bg-muted/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Daily Wage (₹)</Label>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={form.dailyWage}
                  onChange={(e) => setForm({ ...form, dailyWage: e.target.value })}
                  className="bg-muted/50 border-border"
                />
              </div>
            </div>

            {/* Live Preview */}
            {(form.name || form.department || form.designation || form.salary) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                    {form.name ? form.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {form.name || 'Name'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {form.department && (
                        <Badge
                          variant="outline"
                          className={
                            getDepartmentBadgeClass(form.department) +
                            ' text-[10px] px-1.5 py-0'
                          }
                        >
                          {form.department}
                        </Badge>
                      )}
                      {form.designation && (
                        <span className="text-[10px] text-muted-foreground">
                          {form.designation}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {form.salary && (
                      <p className="text-sm font-bold tabular-nums text-primary">
                        {formatINR(Number(form.salary))}
                      </p>
                    )}
                    {form.dailyWage && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatINR(Number(form.dailyWage))}/day
                      </p>
                    )}
                  </div>
                </div>
                {form.skills && (
                  <div className="flex flex-wrap gap-1">
                    {form.skills.split(',').map(
                      (skill, i) =>
                        skill.trim() && (
                          <span
                            key={i}
                            className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {skill.trim()}
                          </span>
                        )
                    )}
                  </div>
                )}
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
              disabled={!form.name.trim() || !form.department || !form.designation.trim() || !form.salary || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving
                ? 'Saving...'
                : editingWorker
                  ? 'Update Worker'
                  : 'Add Worker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}