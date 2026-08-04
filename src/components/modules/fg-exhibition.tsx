'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Warehouse,
  ArrowRightLeft,
  Package,
  IndianRupee,
  Send,
  RotateCcw,
  Search,
  Shirt,
  Palette,
  MapPin,
  History,
  Plus,
  X,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ExhibitionBin {
  binId: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  exhibitionQty: number
  unitCost: number
  unitSellPrice: number
  image: string | null
  location: string
  lastMovementDate: string | null
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

interface ExhibitionMovement {
  id: string
  movementNo: string
  movementType: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  quantity: number
  fromLocation: string | null
  toLocation: string | null
  partyName: string | null
  reason: string | null
  movedBy: string | null
  movedAt: string
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

export function FGExhibitionModule() {
  // ── Data State ──
  const [exhibitions, setExhibitions] = useState<ExhibitionBin[]>([])
  const [movements, setMovements] = useState<ExhibitionMovement[]>([])
  const [allBins, setAllBins] = useState<StockBin[]>([])
  const [totalPieces, setTotalPieces] = useState(0)
  const [totalValue, setTotalValue] = useState(0)
  const [uniqueStyles, setUniqueStyles] = useState(0)
  const [uniqueColors, setUniqueColors] = useState(0)

  // ── UI State ──
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('current')

  // ── Dialog States ──
  const [sendOpen, setSendOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // ── Return to Warehouse ──
  const [selectedBins, setSelectedBins] = useState<Set<string>>(new Set())
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({})
  const [returnReason, setReturnReason] = useState('')
  const [submittingReturn, setSubmittingReturn] = useState(false)

  // ── Send to Exhibition ──
  const [sendSearch, setSendSearch] = useState('')
  const [sendItems, setSendItems] = useState<{
    binId: string; styleNo: string; styleName: string; colorCode: string; color: string; size: string; availableQty: number; quantity: number
  }[]>([])
  const [sendPartyName, setSendPartyName] = useState('')
  const [sendReason, setSendReason] = useState('')
  const [submittingSend, setSubmittingSend] = useState(false)

  // ── Fetch exhibition data ──
  const fetchExhibitions = useCallback(async () => {
    try {
      const res = await fetch('/api/fg-exhibition')
      if (!res.ok) throw new Error('Failed to fetch exhibition data')
      const data = await res.json()
      setExhibitions(data.exhibitions || [])
      setTotalPieces(data.totalPieces || 0)
      setTotalValue(data.totalValue || 0)
      setUniqueStyles(data.uniqueStyles || 0)
      setUniqueColors(data.uniqueColors || 0)
    } catch (err) {
      console.error('Fetch exhibitions error:', err)
      toast.error('Failed to load exhibition data')
    }
  }, [])

  // ── Fetch all bins (for send dialog) ──
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

  // ── Fetch exhibition movement history ──
  const fetchMovements = useCallback(async () => {
    try {
      const res = await fetch('/api/fg-stock/movements?movementType=ExhibitionMove,ExhibitionReturn&limit=100')
      if (!res.ok) throw new Error('Failed to fetch movements')
      const data = await res.json()
      setMovements(data.movements || [])
    } catch (err) {
      console.error('Fetch movements error:', err)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchExhibitions(), fetchBins(), fetchMovements()])
      setLoading(false)
    }
    load()
  }, [fetchExhibitions, fetchBins, fetchMovements])

  // ── Filtered exhibitions ──
  const filteredExhibitions = exhibitions.filter((b) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      b.styleNo.toLowerCase().includes(q) ||
      b.styleName.toLowerCase().includes(q) ||
      b.colorCode.toLowerCase().includes(q) ||
      b.color.toLowerCase().includes(q) ||
      b.size.toLowerCase().includes(q)
    )
  })

  // ── Available bins for send dialog (with available > 0) ──
  const sendSearchBins = sendSearch.length >= 1
    ? allBins.filter((b) =>
        b.availableQty > 0 && (
          b.styleNo.toLowerCase().includes(sendSearch.toLowerCase()) ||
          b.styleName.toLowerCase().includes(sendSearch.toLowerCase()) ||
          b.colorCode.toLowerCase().includes(sendSearch.toLowerCase()) ||
          b.color.toLowerCase().includes(sendSearch.toLowerCase())
        )
      ).slice(0, 10)
    : []

  // ── Handlers ──
  const addSendItem = (bin: StockBin) => {
    if (sendItems.find((s) => s.binId === bin.id)) return
    setSendItems((prev) => [
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

  const removeSendItem = (binId: string) => {
    setSendItems((prev) => prev.filter((s) => s.binId !== binId))
  }

  const updateSendQty = (binId: string, qty: number) => {
 setSendItems((prev) =>
      prev.map((s) => (s.binId === binId ? { ...s, quantity: Math.max(1, Math.min(qty, s.availableQty)) } : s))
    )
  }

  const handleSend = async () => {
    if (sendItems.length === 0) {
      toast.error('Add at least one item to send')
      return
    }
    const items = sendItems.map((s) => ({
      binId: s.binId,
      quantity: s.quantity,
      partyName: sendPartyName || undefined,
      reason: sendReason || undefined,
    }))
    setSubmittingSend(true)
    try {
      const res = await fetch('/api/fg-exhibition/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move_out', items }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to send')
      }
      const data = await res.json()
      const failed = data.results?.filter((r: any) => !r.success)
      const succeeded = data.results?.filter((r: any) => r.success)
      if (failed?.length > 0) {
        toast.error(`${failed.length} item(s) failed. ${succeeded?.length || 0} succeeded.`)
      } else {
        toast.success(`${succeeded?.length || 0} item(s) sent to exhibition!`)
      }
      setSendOpen(false)
      setSendItems([])
      setSendPartyName('')
      setSendReason('')
      fetchExhibitions()
      fetchMovements()
      fetchBins()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmittingSend(false)
    }
  }

  const toggleBinSelection = (binId: string) => {
    setSelectedBins((prev) => {
      const next = new Set(prev)
      if (next.has(binId)) next.delete(binId)
      else next.add(binId)
      return next
    })
  }

  const handleReturn = async () => {
    if (selectedBins.size === 0) {
      toast.error('Select at least one bin to return')
      return
    }
    const items: Array<{ binId: string; quantity: number; reason: string }> = []
    for (const binId of selectedBins) {
      const qty = returnQtys[binId] || exhibitions.find((e) => e.binId === binId)?.exhibitionQty || 0
      if (qty <= 0) continue
      items.push({ binId, quantity: qty, reason: returnReason || 'Returned from exhibition' })
    }
    if (items.length === 0) {
      toast.error('No valid items to return')
      return
    }
    setSubmittingReturn(true)
    try {
      const res = await fetch('/api/fg-exhibition/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move_back', items }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to return')
      }
      const data = await res.json()
      const succeeded = data.results?.filter((r: any) => r.success)
      toast.success(`${succeeded?.length || 0} item(s) returned to warehouse!`)
      setReturnOpen(false)
      setSelectedBins(new Set())
      setReturnQtys({})
      setReturnReason('')
      fetchExhibitions()
      fetchMovements()
      fetchBins()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmittingReturn(false)
    }
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
            <Warehouse className="h-7 w-7 text-primary" />
            Exhibition Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage stock at exhibitions and events
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="mr-1.5 h-4 w-4" />
            Movement History
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Return to Warehouse
          </Button>
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="mr-1.5 h-4 w-4" />
            Send to Exhibition
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium">Pieces at Exhibition</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatQty(totalPieces)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span className="text-xs font-medium">Cost Value at Exhibition</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatINR(totalValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shirt className="h-4 w-4" />
              <span className="text-xs font-medium">Styles at Exhibition</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{uniqueStyles}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-pink-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Palette className="h-4 w-4" />
              <span className="text-xs font-medium">Unique Colors</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{uniqueColors}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Exhibition Stock Table ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Current Exhibition Stock</h2>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search style, color, size..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredExhibitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Warehouse className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">No stock currently at exhibition</p>
            </div>
          ) : (
            <div className="mt-4 max-h-[500px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background">Style No</TableHead>
                    <TableHead className="sticky top-0 bg-background">Style Name</TableHead>
                    <TableHead className="sticky top-0 bg-background">Color Code</TableHead>
                    <TableHead className="sticky top-0 bg-background">Color</TableHead>
                    <TableHead className="sticky top-0 bg-background">Size</TableHead>
                    <TableHead className="sticky top-0 bg-background text-right">Qty</TableHead>
                    <TableHead className="sticky top-0 bg-background text-right">Unit Cost</TableHead>
                    <TableHead className="sticky top-0 bg-background text-right">Value</TableHead>
                    <TableHead className="sticky top-0 bg-background">Location</TableHead>
                    <TableHead className="sticky top-0 bg-background">Last Movement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExhibitions.map((bin) => (
                    <TableRow key={bin.binId}>
                      <TableCell className="font-medium">{bin.styleNo}</TableCell>
                      <TableCell>{bin.styleName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">{bin.colorCode}</Badge>
                      </TableCell>
                      <TableCell>{bin.color}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{bin.size}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatQty(bin.exhibitionQty)}</TableCell>
                      <TableCell className="text-right">{formatINR(bin.unitCost)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(bin.exhibitionQty * bin.unitCost)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {bin.location}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {bin.lastMovementDate ? format(new Date(bin.lastMovementDate), 'dd MMM yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Send to Exhibition                                        */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Stock to Exhibition
            </DialogTitle>
            <DialogDescription>
              Search for stock bins and specify quantities to send to exhibition.
            </DialogDescription>
          </DialogHeader>

          {/* Search bins */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by style, color code, color..."
                className="pl-8"
                value={sendSearch}
                onChange={(e) => setSendSearch(e.target.value)}
              />
            </div>
            {sendSearchBins.length > 0 && (
              <div className="rounded-md border max-h-48 overflow-y-auto">
                {sendSearchBins.map((bin) => (
                  <button
                    key={bin.id}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0"
                    onClick={() => addSendItem(bin)}
                    disabled={sendItems.some((s) => s.binId === bin.id)}
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

            {/* Party & Reason */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Party / Exhibition Name</Label>
                <Input
                  placeholder="e.g., India Fashion Expo"
                  value={sendPartyName}
                  onChange={(e) => setSendPartyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason</Label>
                <Input
                  placeholder="Optional reason"
                  value={sendReason}
                  onChange={(e) => setSendReason(e.target.value)}
                />
              </div>
            </div>

            {/* Items list */}
            {sendItems.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Style</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sendItems.map((item) => (
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
                            onChange={(e) => updateSendQty(item.binId, parseInt(e.target.value) || 1)}
                            className="w-20 text-right h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSendItem(item.binId)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={submittingSend || sendItems.length === 0}>
              {submittingSend && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Send {sendItems.length > 0 ? `(${sendItems.length} items)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Return to Warehouse                                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Return Stock to Warehouse
            </DialogTitle>
            <DialogDescription>
              Select bins and specify quantities to return from exhibition.
            </DialogDescription>
          </DialogHeader>

          {exhibitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Warehouse className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No exhibition stock to return</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Exhibition Qty</TableHead>
                      <TableHead className="text-right">Return Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exhibitions.map((bin) => (
                      <TableRow key={bin.binId}>
                        <TableCell>
                          <Checkbox
                            checked={selectedBins.has(bin.binId)}
                            onCheckedChange={() => toggleBinSelection(bin.binId)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-medium">{bin.styleNo} — {bin.styleName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">{bin.colorCode}</Badge>{' '}
                          {bin.color}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{bin.size}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatQty(bin.exhibitionQty)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            max={bin.exhibitionQty}
                            value={returnQtys[bin.binId] ?? bin.exhibitionQty}
                            disabled={!selectedBins.has(bin.binId)}
                            onChange={(e) =>
                              setReturnQtys((prev) => ({
                                ...prev,
                                [bin.binId]: Math.min(parseInt(e.target.value) || 0, bin.exhibitionQty),
                              }))
                            }
                            className="w-20 text-right h-8"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reason for Return</Label>
                <Textarea
                  placeholder="Optional reason for returning stock"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button
              onClick={handleReturn}
              disabled={submittingReturn || selectedBins.size === 0}
              variant="destructive"
            >
              {submittingReturn && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Return {selectedBins.size > 0 ? `(${selectedBins.size} bins)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Movement History                                        */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Exhibition Movement History
            </DialogTitle>
            <DialogDescription>
              All exhibition send and return movements.
            </DialogDescription>
          </DialogHeader>

          {movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowRightLeft className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No exhibition movements recorded</p>
            </div>
          ) : (
            <div className="rounded-md border max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background">Date</TableHead>
                    <TableHead className="sticky top-0 bg-background">Type</TableHead>
                    <TableHead className="sticky top-0 bg-background">Style</TableHead>
                    <TableHead className="sticky top-0 bg-background">Color</TableHead>
                    <TableHead className="sticky top-0 bg-background">Size</TableHead>
                    <TableHead className="sticky top-0 bg-background text-right">Qty</TableHead>
                    <TableHead className="sticky top-0 bg-background">Party</TableHead>
                    <TableHead className="sticky top-0 bg-background">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((mvt) => (
                    <TableRow key={mvt.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(mvt.movedAt), 'dd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Badge className={mvt.movementType === 'ExhibitionMove'
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-cyan-100 text-cyan-700'
                        }>
                          {mvt.movementType === 'ExhibitionMove' ? 'Sent Out' : 'Returned'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs">{mvt.styleNo}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="font-mono text-xs">{mvt.colorCode}</Badge>{' '}
                        {mvt.color}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{mvt.size}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{formatQty(mvt.quantity)}</TableCell>
                      <TableCell className="text-xs">{mvt.partyName || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{mvt.reason || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
