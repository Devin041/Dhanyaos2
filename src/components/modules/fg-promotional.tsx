'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Gift,
  Package,
  IndianRupee,
  Users,
  Search,
  Plus,
  X,
  Loader2,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────

interface PromotionalMovement {
  id: string
  movementNo: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  quantity: number
  unitCost: number
  partyName: string | null
  reason: string | null
  movedBy: string | null
  movedAt: string
}

interface StockBin {
  id: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  availableQty: number
  unitCost: number
  unitSellPrice: number
  image: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(num: number): string {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`
  if (num >= 1000) return `₹${new Intl.NumberFormat('en-IN').format(num)}`
  return `₹${num}`
}

function formatQty(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FGPromotionalModule() {
  // ── Data State ──
  const [promotions, setPromotions] = useState<PromotionalMovement[]>([])
  const [allBins, setAllBins] = useState<StockBin[]>([])
  const [totalPieces, setTotalPieces] = useState(0)
  const [totalCostValue, setTotalCostValue] = useState(0)

  // ── UI State ──
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [styleFilter, setStyleFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // ── Dialog State ──
  const [issueOpen, setIssueOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ── Issue Form ──
  const [sendSearch, setSendSearch] = useState('')
  const [issueItems, setIssueItems] = useState<{
    binId: string; styleNo: string; styleName: string; colorCode: string; color: string; size: string; availableQty: number; quantity: number
  }[]>([])
  const [issuePartyName, setIssuePartyName] = useState('')
  const [issueReason, setIssueReason] = useState('')

  // ── Fetch promotional issues ──
  const fetchPromotions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (styleFilter) params.set('styleNo', styleFilter)
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)
      params.set('page', String(page))
      params.set('limit', '50')

      const res = await fetch(`/api/fg-promotional?${params}`)
      if (!res.ok) throw new Error('Failed to fetch promotional issues')
      const data = await res.json()
      setPromotions(data.promotions || [])
      setTotalPieces(data.totalPieces || 0)
      setTotalCostValue(data.totalCostValue || 0)
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (err) {
      console.error('Fetch promotions error:', err)
      toast.error('Failed to load promotional issues')
    }
  }, [styleFilter, fromDate, toDate, page])

  // ── Fetch all bins (for issue dialog) ──
  const fetchBins = useCallback(async () => {
    try {
      const res = await fetch('/api/fg-stock?limit=500')
      if (!res.ok) throw new Error('Failed to fetch bins')
      const data = await res.json()
      setAllBins(data.bins || [])
    } catch (err) {
      console.error('Fetch bins error:', err)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchPromotions(), fetchBins()])
      setLoading(false)
    }
    load()
  }, [fetchPromotions, fetchBins])

  // ── Filtered promotions (client-side search) ──
  const filteredPromotions = promotions.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.movementNo.toLowerCase().includes(q) ||
      p.styleNo.toLowerCase().includes(q) ||
      p.styleName.toLowerCase().includes(q) ||
      p.colorCode.toLowerCase().includes(q) ||
      p.color.toLowerCase().includes(q) ||
      (p.partyName || '').toLowerCase().includes(q) ||
      (p.reason || '').toLowerCase().includes(q)
    )
  })

  // ── Available bins for issue dialog ──
  const issueSearchBins = sendSearch.length >= 1
    ? allBins.filter((b) =>
        b.availableQty > 0 && (
          b.styleNo.toLowerCase().includes(sendSearch.toLowerCase()) ||
          b.styleName.toLowerCase().includes(sendSearch.toLowerCase()) ||
          b.colorCode.toLowerCase().includes(sendSearch.toLowerCase()) ||
          b.color.toLowerCase().includes(sendSearch.toLowerCase())
        )
      ).slice(0, 10)
    : []

  // ── Style options for filter ──
  const styleOptions = Array.from(new Set(allBins.map((b) => b.styleNo))).sort()

  // ── Handlers ──
  const addIssueItem = (bin: StockBin) => {
    if (issueItems.find((s) => s.binId === bin.id)) return
    setIssueItems((prev) => [
      ...prev,
      {
        binId: bin.id,
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        availableQty: bin.availableQty,
        quantity: 1,
      },
    ])
    setSendSearch('')
  }

  const removeIssueItem = (binId: string) => {
    setIssueItems((prev) => prev.filter((s) => s.binId !== binId))
  }

  const updateIssueQty = (binId: string, qty: number) => {
    setIssueItems((prev) =>
      prev.map((s) => (s.binId === binId ? { ...s, quantity: Math.max(1, Math.min(qty, s.availableQty)) } : s))
    )
  }

  const handleIssue = async () => {
    if (issueItems.length === 0) {
      toast.error('Add at least one item to issue')
      return
    }
    if (!issuePartyName.trim()) {
      toast.error('Party name is required')
      return
    }
    const items = issueItems.map((s) => ({
      binId: s.binId,
      quantity: s.quantity,
      partyName: issuePartyName,
      reason: issueReason || undefined,
    }))
    setSubmitting(true)
    try {
      const res = await fetch('/api/fg-promotional/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to issue promotional stock')
      }
      const data = await res.json()
      const failed = data.results?.filter((r: any) => !r.success)
      const succeeded = data.results?.filter((r: any) => r.success)
      if (failed?.length > 0) {
        toast.error(`${failed.length} item(s) failed. ${succeeded?.length || 0} succeeded.`)
      } else {
        toast.success(`${succeeded?.length || 0} promotional item(s) issued!`)
      }
      setIssueOpen(false)
      setIssueItems([])
      setIssuePartyName('')
      setIssueReason('')
      fetchPromotions()
      fetchBins()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Gift className="h-7 w-7 text-primary" />
            Promotional Issues
          </h1>
          <p className="text-sm text-muted-foreground">
            Track stock issued for promotions, samples, and marketing
          </p>
        </div>
        <Button size="sm" onClick={() => setIssueOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Issue Promotional Stock
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-pink-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium">Total Pieces Issued</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatQty(totalPieces)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span className="text-xs font-medium">Total Cost Value</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatINR(totalCostValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gift className="h-4 w-4" />
              <span className="text-xs font-medium">Issues on Page</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{filteredPromotions.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Avg Cost / Piece</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{totalPieces > 0 ? formatINR(totalCostValue / totalPieces) : '₹0'}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search movements..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={styleFilter}
                onChange={(e) => { setStyleFilter(e.target.value); setPage(1) }}
              >
                <option value="">All Styles</option>
                {styleOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="w-[140px] h-9"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="w-[140px] h-9"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setPage(1) }}
                />
              </div>
              {(styleFilter || fromDate || toDate || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStyleFilter(''); setFromDate(''); setToDate(''); setSearch(''); setPage(1) }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Promotional Issues Table ── */}
      <Card>
        <CardContent className="p-4">
          {filteredPromotions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Gift className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">No promotional issues found</p>
              <p className="text-xs mt-1">Click "Issue Promotional Stock" to create one</p>
            </div>
          ) : (
            <div className="rounded-md border max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background">Date</TableHead>
                    <TableHead className="sticky top-0 bg-background">Movement No</TableHead>
                    <TableHead className="sticky top-0 bg-background">Style No</TableHead>
                    <TableHead className="sticky top-0 bg-background">Color</TableHead>
                    <TableHead className="sticky top-0 bg-background">Size</TableHead>
                    <TableHead className="sticky top-0 bg-background text-right">Qty</TableHead>
                    <TableHead className="sticky top-0 bg-background text-right">Cost Value</TableHead>
                    <TableHead className="sticky top-0 bg-background">Party</TableHead>
                    <TableHead className="sticky top-0 bg-background">Reason</TableHead>
                    <TableHead className="sticky top-0 bg-background">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPromotions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(p.movedAt), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.movementNo}</TableCell>
                      <TableCell className="font-medium text-xs">{p.styleNo} — {p.styleName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">{p.colorCode}</Badge>{' '}
                        {p.color}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.size}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{formatQty(p.quantity)}</TableCell>
                      <TableCell className="text-right">{formatINR(p.quantity * p.unitCost)}</TableCell>
                      <TableCell className="text-xs">{p.partyName || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{p.reason || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.movedBy || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Issue Promotional Stock                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Issue Promotional Stock
            </DialogTitle>
            <DialogDescription>
              Search for stock bins and specify quantities for promotional issue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Party Name (required) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Party / Recipient Name *</Label>
              <Input
                placeholder="e.g., Influencer Priya Sharma"
                value={issuePartyName}
                onChange={(e) => setIssuePartyName(e.target.value)}
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs">Purpose / Reason</Label>
              <Input
                placeholder="e.g., Instagram promotion, Trade show samples"
                value={issueReason}
                onChange={(e) => setIssueReason(e.target.value)}
              />
            </div>

            {/* Search bins */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by style, color code, color..."
                className="pl-8"
                value={sendSearch}
                onChange={(e) => setSendSearch(e.target.value)}
              />
            </div>
            {issueSearchBins.length > 0 && (
              <div className="rounded-md border max-h-48 overflow-y-auto">
                {issueSearchBins.map((bin) => (
                  <button
                    key={bin.id}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0"
                    onClick={() => addIssueItem(bin)}
                    disabled={issueItems.some((s) => s.binId === bin.id)}
                  >
                    <span>
                      <span className="font-medium">{bin.styleNo}</span>{' '}
                      <span className="text-muted-foreground">{bin.styleName}</span>{' '}
                      <Badge variant="secondary" className="font-mono text-xs ml-1">{bin.colorCode}</Badge>{' '}
                      <Badge variant="outline" className="text-xs">{bin.color}</Badge>{' '}
                      <Badge variant="outline" className="text-xs">{bin.size}</Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">Avail: {formatQty(bin.availableQty)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Items list */}
            {issueItems.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Style</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issueItems.map((item) => (
                      <TableRow key={item.binId}>
                        <TableCell className="font-medium text-xs">{item.styleNo} — {item.styleName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">{item.colorCode}</Badge>{' '}
                          {item.color}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{item.size}</Badge></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{formatQty(item.availableQty)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            max={item.availableQty}
                            value={item.quantity}
                            onChange={(e) => updateIssueQty(item.binId, parseInt(e.target.value) || 1)}
                            className="w-20 text-right h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {formatINR(item.quantity * (allBins.find(b => b.id === item.binId)?.unitCost || 0))}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeIssueItem(item.binId)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-semibold text-sm">Total</TableCell>
                      <TableCell className="text-right font-bold">
                        {formatINR(issueItems.reduce((s, item) => {
                          const bin = allBins.find(b => b.id === item.binId)
                          return s + item.quantity * (bin?.unitCost || 0)
                        }, 0))}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button onClick={handleIssue} disabled={submitting || issueItems.length === 0 || !issuePartyName.trim()}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Issue {issueItems.length > 0 ? `(${issueItems.length} items)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
