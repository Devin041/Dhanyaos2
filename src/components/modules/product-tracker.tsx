'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Search, Shirt, IndianRupee, Package, Factory, Truck, FileText, CheckCircle2,
  TrendingUp, ArrowRight, Circle, AlertCircle,
} from 'lucide-react'

interface LifecycleData {
  styleNo: string
  styleName: string
  image: string | null
  sample: any
  costing: any
  purchaseOrders: any[]
  samplings: any[]
  salesOrders: any[]
  productionJobs: any[]
  dispatches: any[]
  invoices: any[]
  payments: any[]
  profitAnalysis: any
  pipeline: Array<{ key: string; label: string; status: string; detail: string }>
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  sample: Shirt, costing: IndianRupee, po: Package, sampling: Shirt,
  sales: FileText, production: Factory, dispatch: Truck, invoice: FileText, payment: CheckCircle2,
}

export function ProductTrackerModule() {
  const [products, setProducts] = useState<Array<{ id: string; styleNo: string; styleName: string; photoCount: number }>>([])
  const [selectedStyleNo, setSelectedStyleNo] = useState('')
  const [data, setData] = useState<LifecycleData | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Load all products for dropdown
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch('/api/samples')
        const d = await res.json()
        if (Array.isArray(d)) {
          setProducts(d.map((s: any) => ({ id: s.id, styleNo: s.styleNo, styleName: s.styleName, photoCount: s.photoCount || 0 })))
        }
      } catch { /* ignore */ }
    }
    loadProducts()
  }, [])

  // Fetch lifecycle when product selected
  const fetchLifecycle = useCallback(async (styleNo: string) => {
    if (!styleNo) return
    setLoading(true)
    try {
      const res = await fetch(`/api/products/${styleNo}/lifecycle`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (selectedStyleNo) fetchLifecycle(selectedStyleNo)
  }, [selectedStyleNo, fetchLifecycle])

  const filteredProducts = products.filter(p =>
    p.styleNo.toLowerCase().includes(search.toLowerCase()) ||
    p.styleName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Product Lifecycle Tracker</h1>
          <p className="text-xs text-muted-foreground">Track a product from Sample → Costing → PO → Production → Dispatch → Invoice → Payment → Profit</p>
        </div>
      </div>

      {/* Product Selector */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <Select value={selectedStyleNo} onValueChange={setSelectedStyleNo}>
                <SelectTrigger className="bg-muted/50 border-border h-9">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.styleNo}>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{p.styleNo}</span>
                        <span className="text-muted-foreground text-[10px]">{p.styleName}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 bg-muted/50 border-border" />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {!loading && !data && !selectedStyleNo && (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shirt className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Select a product above to see its entire lifecycle journey</p>
          </CardContent>
        </Card>
      )}

      {!loading && data && (
        <>
          {/* Product Header */}
          <Card className="glass-card border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {data.image ? (
                  <img src={data.image} alt={data.styleName} className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                    <Shirt className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-bold">{data.styleNo}</h2>
                  <p className="text-sm text-muted-foreground">{data.styleName}</p>
                </div>
                {/* Profit Summary */}
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Profit</p>
                  <p className="text-xl font-bold text-emerald-400 tabular-nums">{formatINR(data.profitAnalysis.estimatedProfit)}</p>
                  <p className="text-[10px] text-muted-foreground">{data.profitAnalysis.totalQtySold} pcs sold · {data.profitAnalysis.estimatedMargin}% margin</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Visual */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                {data.pipeline.map((stage, idx) => {
                  const Icon = STAGE_ICONS[stage.key] || Circle
                  const isDone = stage.status === 'done'
                  return (
                    <div key={stage.key} className="flex items-center gap-2">
                      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isDone ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/40 bg-muted/20'}`}>
                        <Icon className={`h-4 w-4 ${isDone ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                        <div>
                          <p className={`text-xs font-medium ${isDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>{stage.label}</p>
                          <p className="text-[10px] text-muted-foreground">{stage.detail}</p>
                        </div>
                      </div>
                      {idx < data.pipeline.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Detail Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Costing */}
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium flex items-center gap-1.5"><IndianRupee className="h-3.5 w-3.5 text-primary" /> Costing</CardTitle></CardHeader>
              <CardContent>
                {data.costing ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Sheet No:</span><span className="font-medium">{data.costing.sheetNo}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Cost/piece:</span><span className="font-medium">{formatINR(data.costing.totalCost)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sell/piece:</span><span className="font-medium text-primary">{formatINR(data.costing.sellingPrice)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Margin:</span><span className="font-medium text-emerald-400">{data.costing.profitPercent}%</span></div>
                  </div>
                ) : <p className="text-xs text-muted-foreground">No cost sheet created</p>}
              </CardContent>
            </Card>

            {/* Sales Orders */}
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-primary" /> Sales Orders</CardTitle></CardHeader>
              <CardContent>
                {data.salesOrders.length > 0 ? (
                  <div className="space-y-2">
                    {data.salesOrders.slice(0, 3).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium">{o.orderNo}</span>
                          <span className="text-muted-foreground ml-2">{o.customer?.companyName || '?'}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{o.productQty} pcs</span>
                          <span className="text-muted-foreground ml-2">{formatINR(o.productRevenue)}</span>
                        </div>
                      </div>
                    ))}
                    {data.salesOrders.length > 3 && <p className="text-[10px] text-muted-foreground">+{data.salesOrders.length - 3} more</p>}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No orders yet</p>}
              </CardContent>
            </Card>

            {/* Production */}
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium flex items-center gap-1.5"><Factory className="h-3.5 w-3.5 text-primary" /> Production</CardTitle></CardHeader>
              <CardContent>
                {data.productionJobs.length > 0 ? (
                  <div className="space-y-2">
                    {data.productionJobs.slice(0, 3).map((j: any) => (
                      <div key={j.id} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium">{j.jobNo}</span>
                          <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">{j.status}</Badge>
                        </div>
                        <span className="text-muted-foreground">{j.completedQty}/{j.targetQty} pcs · {j.stage}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No production jobs</p>}
              </CardContent>
            </Card>

            {/* Purchase Orders */}
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-primary" /> Purchase Orders</CardTitle></CardHeader>
              <CardContent>
                {data.purchaseOrders.length > 0 ? (
                  <div className="space-y-2">
                    {data.purchaseOrders.slice(0, 3).map((po: any) => (
                      <div key={po.id} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium">{po.poNumber}</span>
                          <span className="text-muted-foreground ml-2">{po.fabricName}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{po.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No POs linked to this product</p>}
              </CardContent>
            </Card>
          </div>

          {/* Profit Analysis */}
          <Card className="glass-card border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" /> Profit Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue</p>
                  <p className="text-lg font-bold tabular-nums">{formatINR(data.profitAnalysis.totalRevenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{data.profitAnalysis.totalQtySold} pcs</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Collected</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-400">{formatINR(data.profitAnalysis.totalCollected)}</p>
                  <p className="text-[10px] text-amber-400">{formatINR(data.profitAnalysis.totalOutstanding)} outstanding</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Cost</p>
                  <p className="text-lg font-bold tabular-nums text-red-400">{formatINR(data.profitAnalysis.estimatedTotalCost)}</p>
                  <p className="text-[10px] text-muted-foreground">{formatINR(data.profitAnalysis.estimatedCostPerPiece)}/pc × {data.profitAnalysis.totalQtySold}</p>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Profit</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-400">{formatINR(data.profitAnalysis.estimatedProfit)}</p>
                  <p className="text-[10px] text-muted-foreground">{data.profitAnalysis.estimatedMargin}% margin</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
