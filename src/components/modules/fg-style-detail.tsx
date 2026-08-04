'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Shirt,
  Layers,
  Package,
  IndianRupee,
  TrendingUp,
  Clock,
  Eye,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
  Box,
} from 'lucide-react'
import { format } from 'date-fns'
import { FGMovementTimeline } from './fg-movement-timeline'

// ─── Types ─────────────────────────────────────────────────────────────────

interface SizeRow {
  size: string
  binId: string
  availableQty: number
  reservedQty: number
  qcPendingQty: number
  underRepairQty: number
  defectiveQty: number
  scrappedQty: number
  exhibitionQty: number
  totalPieces: number
  unitCost: number
  unitSellPrice: number
  health: string
}

interface ColorTotal {
  available: number
  reserved: number
  qcPending: number
  underRepair: number
  defective: number
  scrapped: number
  exhibition: number
  stockValue: number
  sellValue: number
}

interface ColorSection {
  color: string
  colorCode: string
  sizes: SizeRow[]
  fullSets: number
  orphanPieces: number
  colorTotal: ColorTotal
}

interface StyleTotal {
  totalPieces: number
  availablePieces: number
  reservedPieces: number
  fullSets: number
  orphanPieces: number
  totalStockValue: number
  totalSellValue: number
}

interface StyleDetailData {
  style: {
    styleNo: string
    styleName: string
    image: string | null
    firstInDate: string | null
  }
  colors: ColorSection[]
  styleTotal: StyleTotal
  recentMovements: FGMovement[]
  activeReservations: FGReservation[]
}

interface FGMovement {
  id: string
  movementNo: string
  movementType: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  quantity: number
  previousQty: number
  newQty: number
  referenceType: string | null
  referenceId: string | null
  referenceNo: string | null
  fromStatus: string | null
  toStatus: string | null
  fromLocation: string | null
  toLocation: string | null
  partyName: string | null
  reason: string | null
  movedBy: string | null
  movedAt: string
  fgStockBin?: { colorCode: string; color: string; size: string }
}

interface FGReservation {
  id: string
  reservationNo: string
  salesOrderNo: string
  customerName: string | null
  colorCode: string
  color: string
  size: string
  reservedQty: number
  dispatchedQty: number
  status: string
  reservedDate: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(num: number): string {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`
  if (num >= 1000) return `₹${new Intl.NumberFormat('en-IN').format(num)}`
  return `₹${num}`
}

const healthConfig: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  Healthy:   { label: 'Healthy',   icon: '🟢', color: 'text-emerald-600',  bg: 'bg-emerald-50' },
  LowStock:  { label: 'Low Stock', icon: '🟡', color: 'text-amber-600',    bg: 'bg-amber-50' },
  Critical:  { label: 'Critical',  icon: '🔴', color: 'text-red-600',      bg: 'bg-red-50' },
  Empty:     { label: 'Empty',     icon: '⬜', color: 'text-slate-400',    bg: 'bg-slate-50' },
  DeadStock: { label: 'Dead Stock', icon: '💀', color: 'text-red-800',      bg: 'bg-red-100' },
}

function HealthBadge({ health }: { health: string }) {
  const cfg = healthConfig[health] || healthConfig.Empty
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function getMovementBadgeColor(type: string): string {
  switch (type) {
    case 'Inward': return 'bg-emerald-100 text-emerald-700'
    case 'Outward': return 'bg-red-100 text-red-700'
    case 'Return': return 'bg-amber-100 text-amber-700'
    case 'Exchange': return 'bg-purple-100 text-purple-700'
    case 'Reservation': return 'bg-blue-100 text-blue-700'
    case 'Unreservation': return 'bg-sky-100 text-sky-700'
    case 'Adjustment': return 'bg-slate-100 text-slate-700'
    case 'QCStatusChange': return 'bg-orange-100 text-orange-700'
    case 'Scrapping': return 'bg-red-200 text-red-800'
    case 'PromotionalIssue': return 'bg-pink-100 text-pink-700'
    case 'ExhibitionMove': return 'bg-teal-100 text-teal-700'
    case 'ExhibitionReturn': return 'bg-cyan-100 text-cyan-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'Active': return 'bg-emerald-100 text-emerald-700'
    case 'PartiallyDispatched': return 'bg-amber-100 text-amber-700'
    case 'FullyDispatched': return 'bg-slate-100 text-slate-600'
    case 'Released': return 'bg-sky-100 text-sky-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FGStyleDetailProps {
  styleNo: string
  open: boolean
  onClose: () => void
}

export function FGStyleDetail({ styleNo, open, onClose }: FGStyleDetailProps) {
  const [data, setData] = useState<StyleDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'colors' | 'movements' | 'reservations'>('colors')
  const [selectedBinForTimeline, setSelectedBinForTimeline] = useState<{ binId: string; binLabel: string } | null>(null)

  const fetchStyleDetail = useCallback(async () => {
    if (!styleNo) return
    setLoading(true)
    try {
      const res = await fetch(`/api/fg-stock/style-detail?styleNo=${encodeURIComponent(styleNo)}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
      // Expand first color by default
      if (json.colors?.length > 0) {
        setExpandedColors(new Set([json.colors[0].color]))
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [styleNo])

  useEffect(() => {
    if (open) fetchStyleDetail()
  }, [open, fetchStyleDetail])

  const toggleColor = (color: string) => {
    setExpandedColors(prev => {
      const next = new Set(prev)
      if (next.has(color)) next.delete(color)
      else next.add(color)
      return next
    })
  }

  const expandAll = () => {
    if (!data) return
    setExpandedColors(new Set(data.colors.map(c => c.color)))
  }

  const collapseAll = () => {
    setExpandedColors(new Set())
  }

  const handleClose = () => {
    setSelectedBinForTimeline(null)
    setActiveTab('colors')
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 overflow-hidden flex flex-col">
        {/* ── Header ── */}
        <SheetHeader className="p-6 pb-4 shrink-0">
          <div className="flex items-start gap-4">
            {data?.style.image ? (
              <img
                src={data.style.image}
                alt={data.style.styleName}
                className="w-14 h-14 rounded-lg object-cover border"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                <Shirt className="w-7 h-7 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight">
                {loading ? <Skeleton className="h-5 w-40" /> : `${styleNo}`}
              </SheetTitle>
              <SheetDescription className="text-sm mt-0.5">
                {loading ? <Skeleton className="h-4 w-56 mt-1" /> : data?.style.styleName}
              </SheetDescription>
              {!loading && data?.style.firstInDate && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  First in: {format(new Date(data.style.firstInDate), 'dd MMM yyyy')}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        <Separator />

        {/* ── Style Summary ── */}
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ) : data ? (
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStatCard
                icon={<Package className="w-4 h-4" />}
                label="Total Pieces"
                value={data.styleTotal.totalPieces.toLocaleString('en-IN')}
                color="text-slate-600"
              />
              <MiniStatCard
                icon={<Eye className="w-4 h-4" />}
                label="Available"
                value={data.styleTotal.availablePieces.toLocaleString('en-IN')}
                color="text-emerald-600"
              />
              <MiniStatCard
                icon={<Layers className="w-4 h-4" />}
                label="Full Sets"
                value={data.styleTotal.fullSets.toLocaleString('en-IN')}
                color="text-violet-600"
              />
              <MiniStatCard
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Orphan Pieces"
                value={data.styleTotal.orphanPieces.toLocaleString('en-IN')}
                color={data.styleTotal.orphanPieces > 0 ? 'text-amber-600' : 'text-slate-400'}
              />
              <MiniStatCard
                icon={<Box className="w-4 h-4" />}
                label="Reserved"
                value={data.styleTotal.reservedPieces.toLocaleString('en-IN')}
                color="text-blue-600"
              />
              <MiniStatCard
                icon={<IndianRupee className="w-4 h-4" />}
                label="Stock Value"
                value={formatINR(data.styleTotal.totalStockValue)}
                color="text-slate-700"
              />
              <MiniStatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Sell Value"
                value={formatINR(data.styleTotal.totalSellValue)}
                color="text-emerald-700"
              />
            </div>
          </div>
        ) : null}

        <Separator className="mt-2" />

        {/* ── Tabs ── */}
        <div className="px-6 pt-3 shrink-0">
          <div className="flex gap-1 border-b">
            {(['colors', 'movements', 'reservations'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedBinForTimeline(null) }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'colors' && 'Colors & Sizes'}
                {tab === 'movements' && 'Movements'}
                {tab === 'reservations' && 'Reservations'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <ScrollArea className="flex-1">
          <div className="p-6 pt-4">
            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
            ) : !data ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data found for this style.</p>
            ) : (
              <>
                {/* ── Colors Tab ── */}
                {activeTab === 'colors' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {data.colors.length} color{data.colors.length !== 1 ? 's' : ''}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={expandAll}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Expand all
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <button
                          onClick={collapseAll}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Collapse all
                        </button>
                      </div>
                    </div>

                    {data.colors.map(colorSection => (
                      <ColorSectionCard
                        key={colorSection.colorCode}
                        section={colorSection}
                        isExpanded={expandedColors.has(colorSection.color)}
                        onToggle={() => toggleColor(colorSection.color)}
                        onViewBinTimeline={(binId, binLabel) => {
                          setSelectedBinForTimeline({ binId, binLabel })
                          setActiveTab('movements')
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* ── Movements Tab ── */}
                {activeTab === 'movements' && (
                  <div className="space-y-4">
                    {selectedBinForTimeline ? (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedBinForTimeline(null)}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            ← All movements
                          </button>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-sm font-medium">{selectedBinForTimeline.binLabel}</span>
                        </div>
                        <FGMovementTimeline
                          binId={selectedBinForTimeline.binId}
                          binLabel={selectedBinForTimeline.binLabel}
                        />
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Last 10 movements for {styleNo}
                        </p>
                        {data.recentMovements.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No movements recorded.</p>
                        ) : (
                          <Card>
                            <CardContent className="p-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Type</TableHead>
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Color / Size</TableHead>
                                    <TableHead className="text-xs text-right">Qty</TableHead>
                                    <TableHead className="text-xs">Before → After</TableHead>
                                    <TableHead className="text-xs">Ref</TableHead>
                                    <TableHead className="text-xs">By</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {data.recentMovements.map(m => (
                                    <TableRow key={m.id}>
                                      <TableCell>
                                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getMovementBadgeColor(m.movementType)}`}>
                                          {m.movementType}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {format(new Date(m.movedAt), 'dd MMM yyyy HH:mm')}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {m.color} / {m.size}
                                      </TableCell>
                                      <TableCell className="text-xs text-right font-mono">
                                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                                      </TableCell>
                                      <TableCell className="text-xs font-mono text-muted-foreground">
                                        {m.previousQty} → {m.newQty}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {m.referenceNo || m.referenceType || '—'}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {m.movedBy || '—'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── Reservations Tab ── */}
                {activeTab === 'reservations' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Active reservations for {styleNo}
                    </p>
                    {data.activeReservations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No active reservations.</p>
                    ) : (
                      <Card>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Res. No</TableHead>
                                <TableHead className="text-xs">SO No</TableHead>
                                <TableHead className="text-xs">Customer</TableHead>
                                <TableHead className="text-xs">Color / Size</TableHead>
                                <TableHead className="text-xs text-right">Qty</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.activeReservations.map(r => (
                                <TableRow key={r.id}>
                                  <TableCell className="text-xs font-mono">{r.reservationNo}</TableCell>
                                  <TableCell className="text-xs font-mono">{r.salesOrderNo}</TableCell>
                                  <TableCell className="text-xs">{r.customerName || '—'}</TableCell>
                                  <TableCell className="text-xs">{r.color} / {r.size}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{r.reservedQty}</TableCell>
                                  <TableCell>
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeColor(r.status)}`}>
                                      {r.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {format(new Date(r.reservedDate), 'dd MMM yyyy')}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MiniStatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-start gap-2.5">
      <div className={`${color} mt-0.5`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none">{label}</p>
        <p className={`text-sm font-semibold mt-1 ${color}`}>{value}</p>
      </div>
    </div>
  )
}

function ColorSectionCard({ section, isExpanded, onToggle, onViewBinTimeline }: {
  section: ColorSection
  isExpanded: boolean
  onToggle: () => void
  onViewBinTimeline: (binId: string, binLabel: string) => void
}) {
  const totalPieces = section.colorTotal.available + section.colorTotal.reserved + section.colorTotal.qcPending +
    section.colorTotal.underRepair + section.colorTotal.defective + section.colorTotal.scrapped + section.colorTotal.exhibition
  const totalAvailable = section.colorTotal.available
  const totalSizes = section.sizes.length
  const setPct = totalSizes > 0 && totalAvailable > 0
      ? Math.round((section.fullSets * totalSizes / totalAvailable) * 100)
      : 0

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                  {section.color.charAt(0).toUpperCase()}
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">{section.color}</CardTitle>
                  <p className="text-xs text-muted-foreground">{section.colorCode}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="text-sm font-semibold text-emerald-600">{totalAvailable.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Sets / Orphans</p>
                  <p className="text-sm font-semibold">
                    <span className="text-violet-600">{section.fullSets}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className={section.orphanPieces > 0 ? 'text-amber-600' : 'text-slate-400'}>{section.orphanPieces}</span>
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="px-4 pb-4 space-y-4">
            {/* ── Set Analysis Card ── */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-medium text-muted-foreground">Set Analysis</span>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-lg font-bold text-violet-700">{section.fullSets}</span>
                  <span className="text-xs text-muted-foreground ml-1">Full Sets</span>
                </div>
                <div className="h-6 w-px bg-border" />
                <div>
                  <span className={`text-lg font-bold ${section.orphanPieces > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {section.orphanPieces}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">Orphan Pieces</span>
                </div>
              </div>
              {totalAvailable > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Set completion</span>
                    <span>{setPct}%</span>
                  </div>
                  <Progress value={setPct} className="h-1.5" />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                {totalSizes} size{totalSizes !== 1 ? 's' : ''} per set · {totalAvailable} total available pieces
              </p>
            </div>

            {/* ── Value Summary ── */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-md bg-slate-50 border px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Stock Value</p>
                <p className="text-sm font-semibold text-slate-700">{formatINR(section.colorTotal.stockValue)}</p>
              </div>
              <div className="flex-1 rounded-md bg-emerald-50 border px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Sell Value</p>
                <p className="text-sm font-semibold text-emerald-700">{formatINR(section.colorTotal.sellValue)}</p>
              </div>
            </div>

            {/* ── Size Breakdown Table ── */}
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs h-8">Size</TableHead>
                    <TableHead className="text-xs h-8 text-right">Avail</TableHead>
                    <TableHead className="text-xs h-8 text-right hidden sm:table-cell">Reserved</TableHead>
                    <TableHead className="text-xs h-8 text-right hidden md:table-cell">QC</TableHead>
                    <TableHead className="text-xs h-8 text-right hidden md:table-cell">Repair</TableHead>
                    <TableHead className="text-xs h-8 text-right hidden lg:table-cell">Defect</TableHead>
                    <TableHead className="text-xs h-8 text-right">Total</TableHead>
                    <TableHead className="text-xs h-8 text-center">Health</TableHead>
                    <TableHead className="text-xs h-8 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.sizes.map(sz => (
                    <TableRow key={sz.binId} className="h-9">
                      <TableCell className="text-xs font-medium py-1.5">{sz.size}</TableCell>
                      <TableCell className="text-xs text-right font-mono py-1.5 text-emerald-600 font-medium">
                        {sz.availableQty}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono py-1.5 hidden sm:table-cell">
                        {sz.reservedQty || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono py-1.5 hidden md:table-cell">
                        {sz.qcPendingQty || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono py-1.5 hidden md:table-cell">
                        {sz.underRepairQty || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono py-1.5 hidden lg:table-cell">
                        {sz.defectiveQty || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono py-1.5 font-medium">
                        {sz.totalPieces}
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        <HealthBadge health={sz.health} />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewBinTimeline(sz.binId, `${section.color} / ${sz.size}`)
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="View movement timeline"
                        >
                          <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}