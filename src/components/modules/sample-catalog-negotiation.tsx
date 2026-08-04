'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Download, Loader2, Package,
  User, Percent, AlertTriangle,
  Calculator, FileText, IndianRupee
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────

interface Broker {
  id: string
  name: string
  phone: string | null
  commissionPercent: number
  status: string
}

export interface NegotiationSample {
  id: string
  sampleNo: string
  styleNo: string
  styleName: string
  customerId: string | null
  customer: { id: string; companyName: string } | null
  photoCount: number
  status: string
  costSheet: {
    id: string
    sheetNo: string
    totalCost: number
    sellingPrice: number
    profitPercent: number
    image: string | null
    status: string
  } | null
}

interface NegotiationItem {
  sampleId: string
  styleNo: string
  styleName: string
  firstPhotoUrl: string | null
  totalCost: number           // Fixed — from costing
  profitMarginPercent: number  // EDITABLE — from costing, user can change (markup on cost)
  discountPercent: number     // EDITABLE — discount given to client
}

interface NegotiationViewProps {
  selectedSamples: NegotiationSample[]
  onBack: () => void
  onComplete: () => void
}

// ─── Component ──────────────────────────────────────────────────────

export function SampleCatalogNegotiation({ selectedSamples, onBack, onComplete }: NegotiationViewProps) {
  const [items, setItems] = useState<NegotiationItem[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('')
  const [brokerCommissionPercent, setBrokerCommissionPercent] = useState<number>(0)
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; companyName: string } | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [loading, setLoading] = useState(true)

  // ─── Initialize items from selected samples ──────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true)

      // Fetch brokers
      try {
        const res = await fetch('/api/brokers?status=Active')
        if (res.ok) {
          const data = await res.json()
          setBrokers(data)
        }
      } catch { /* ignore */ }

      // Build items from selected samples
      const initItems: NegotiationItem[] = []
      for (const sample of selectedSamples) {
        let photoUrl = null
        if (sample.costSheet?.image) {
          photoUrl = sample.costSheet.image
        } else {
          try {
            const res = await fetch(`/api/samples/${sample.id}`)
            if (res.ok) {
              const data = await res.json()
              if (data.photos && data.photos.length > 0) {
                photoUrl = data.photos.sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)[0].imageUrl
              }
            }
          } catch { /* ignore */ }
        }

        initItems.push({
          sampleId: sample.id,
          styleNo: sample.styleNo,
          styleName: sample.styleName,
          firstPhotoUrl: photoUrl,
          totalCost: sample.costSheet?.totalCost || 0,
          // profitPercent from costing — this is the markup on cost (e.g., 35%)
          profitMarginPercent: sample.costSheet?.profitPercent || 0,
          discountPercent: 0,
        })
      }
      setItems(initItems)

      // Determine common customer
      const customersWithCost = selectedSamples.filter(s => s.costSheet !== null)
      const customerIds = new Set(customersWithCost.map(s => s.customer?.id).filter(Boolean))
      if (customerIds.size === 1) {
        const c = customersWithCost.find(s => s.customer)
        if (c?.customer) setSelectedCustomer(c.customer)
      }

      setLoading(false)
    }
    init()
  }, [selectedSamples])

  // ─── Handlers ────────────────────────────────────────────────────

  const updateItemProfitMargin = (sampleId: string, value: number) => {
    setItems(prev => prev.map(item =>
      item.sampleId === sampleId
        ? { ...item, profitMarginPercent: Math.max(0, Math.min(999, value)) }
        : item
    ))
  }

  const updateItemDiscount = (sampleId: string, value: number) => {
    setItems(prev => prev.map(item =>
      item.sampleId === sampleId
        ? { ...item, discountPercent: Math.max(0, Math.min(100, value)) }
        : item
    ))
  }

  const handleBrokerSelect = (brokerId: string) => {
    setSelectedBrokerId(brokerId)
    const broker = brokers.find(b => b.id === brokerId)
    setBrokerCommissionPercent(broker?.commissionPercent || 0)
  }

  // ─── Core Calculation ─────────────────────────────────────────────
  // Selling Price = Cost × (1 + Profit Margin %)  ← same formula as costing module
  // Then discount and broker are applied on top

  const calcItemMetrics = useCallback((item: NegotiationItem) => {
    const sellingPrice = item.totalCost * (1 + item.profitMarginPercent / 100)
    const discountedPrice = sellingPrice * (1 - item.discountPercent / 100)
    const brokerAmount = discountedPrice * brokerCommissionPercent / 100
    const finalPrice = discountedPrice - brokerAmount
    const profit = finalPrice - item.totalCost
    const effectiveMargin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0
    return { sellingPrice, discountedPrice, brokerAmount, finalPrice, profit, effectiveMargin }
  }, [brokerCommissionPercent])

  // ─── Summary ──────────────────────────────────────────────────────

  const summary = items.reduce((acc, item) => {
    const m = calcItemMetrics(item)
    acc.totalCost += item.totalCost
    acc.totalSelling += m.sellingPrice
    acc.totalFinal += m.finalPrice
    acc.totalProfit += m.profit
    return acc
  }, { totalCost: 0, totalSelling: 0, totalFinal: 0, totalProfit: 0 })

  const overallEffectiveMargin = summary.totalFinal > 0 ? (summary.totalProfit / summary.totalFinal) * 100 : 0

  // ─── Health — based on effective margin (after discount + broker) ─
  const getHealthInfo = (effectiveMargin: number) => {
    if (effectiveMargin >= 25) return { color: 'bg-emerald-400', textColor: 'text-emerald-400', label: 'Healthy' }
    if (effectiveMargin >= 10) return { color: 'bg-amber-400', textColor: 'text-amber-400', label: 'Warning' }
    return { color: 'bg-red-400', textColor: 'text-red-400', label: 'Danger' }
  }

  // ─── PDF Generation ──────────────────────────────────────────────

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true)
    try {
      const selectedBroker = brokers.find(b => b.id === selectedBrokerId)

      const pdfData = {
        items: items.map(item => {
          const m = calcItemMetrics(item)
          return {
            styleNo: item.styleNo,
            styleName: item.styleName,
            firstPhotoUrl: item.firstPhotoUrl,
            totalCost: item.totalCost,
            profitMarginPercent: item.profitMarginPercent,
            sellingPrice: m.sellingPrice,
            discountPercent: item.discountPercent,
            finalPrice: m.finalPrice,
          }
        }),
        brokerName: selectedBroker?.name || '',
        brokerCommissionPercent,
        customerName: selectedCustomer?.companyName || '',
        summary: {
          totalCost: summary.totalCost,
          totalSelling: summary.totalSelling,
          totalFinal: summary.totalFinal,
          totalProfit: summary.totalProfit,
          overallEffectiveMargin,
        },
        generatedAt: new Date().toISOString(),
      }

      const res = await fetch('/api/sample-catalogs/negotiation-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdfData),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Negotiation-${new Date().toISOString().slice(0, 10)}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('PDF generated successfully!')
      } else {
        const err = await res.json().catch(() => ({ error: 'PDF generation failed' }))
        toast.error(err.error || 'Failed to generate PDF')
      }
    } catch {
      toast.error('Failed to generate PDF')
    }
    setGeneratingPdf(false)
  }

  // ─── Format ──────────────────────────────────────────────────────

  const fmtINR = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

  // ─── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const itemsWithoutCosting = items.filter(i => i.totalCost === 0)

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Negotiation</h1>
            <p className="text-sm text-muted-foreground">
              {items.length} product{items.length !== 1 ? 's' : ''} selected — Adjust margin, discount & broker
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleGeneratePdf}
            disabled={generatingPdf || itemsWithoutCosting.length > 0}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
          >
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate PDF
          </Button>
        </div>
      </div>

      {/* ─── Warning: Items without costing ──────────────────── */}
      {itemsWithoutCosting.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {itemsWithoutCosting.length} product{itemsWithoutCosting.length > 1 ? 's' : ''} without costing data
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              Create cost sheets first: {itemsWithoutCosting.map(i => i.styleName).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ─── Broker & Summary Cards ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Broker Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-muted-foreground" />
              Broker Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Broker Name</label>
              <Select value={selectedBrokerId} onValueChange={handleBrokerSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select broker..." />
                </SelectTrigger>
                <SelectContent>
                  {brokers.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} (Default: {b.commissionPercent}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Commission %</label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={brokerCommissionPercent}
                  onChange={e => setBrokerCommissionPercent(parseFloat(e.target.value) || 0)}
                  className="pr-8"
                />
                <Percent className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              Live Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] text-muted-foreground">Total Cost Price</p>
                <p className="text-lg font-bold tabular-nums">{fmtINR(summary.totalCost)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] text-muted-foreground">Total Sell Price</p>
                <p className="text-lg font-bold tabular-nums">{fmtINR(summary.totalSelling)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] text-muted-foreground">After Discount & Broker</p>
                <p className="text-lg font-bold tabular-nums">{fmtINR(summary.totalFinal)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] text-muted-foreground">Net Profit</p>
                <div className="flex items-center gap-2">
                  <p className={`text-lg font-bold tabular-nums ${summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtINR(summary.totalProfit)}
                  </p>
                  <div className="flex items-center gap-1">
                    <div className={`h-2 w-2 rounded-full ${getHealthInfo(overallEffectiveMargin).color}`} />
                    <span className={`text-xs font-semibold tabular-nums ${getHealthInfo(overallEffectiveMargin).textColor}`}>
                      {overallEffectiveMargin.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Items Table ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Selected Products ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {/* ─── Desktop Table ─────────────────────────────── */}
            <div className="hidden lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2.5 text-left w-9">#</th>
                    <th className="px-3 py-2.5 text-left">Product</th>
                    <th className="px-3 py-2.5 text-right">Cost Price</th>
                    <th className="px-3 py-2.5 text-center w-24">Profit %</th>
                    <th className="px-3 py-2.5 text-right">Sell Price</th>
                    <th className="px-3 py-2.5 text-center w-24">Discount %</th>
                    <th className="px-3 py-2.5 text-right">Broker Amt</th>
                    <th className="px-3 py-2.5 text-right">Final Price</th>
                    <th className="px-3 py-2.5 text-right">Profit</th>
                    <th className="px-3 py-2.5 text-center w-20">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const m = calcItemMetrics(item)
                    const health = getHealthInfo(m.effectiveMargin)
                    return (
                      <tr key={item.sampleId} className="border-b transition-colors hover:bg-muted/20">
                        <td className="px-3 py-3 text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            {item.firstPhotoUrl ? (
                              <img src={item.firstPhotoUrl} alt="" className="h-10 w-10 rounded-md object-cover border" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium">{item.styleName}</p>
                              <p className="text-xs text-muted-foreground">{item.styleNo}</p>
                            </div>
                          </div>
                        </td>
                        {/* Cost Price — fixed */}
                        <td className="px-3 py-3 text-right text-sm tabular-nums text-muted-foreground">{fmtINR(item.totalCost)}</td>
                        {/* Profit Margin % — EDITABLE */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center">
                            <div className="relative w-20">
                              <Input
                                type="number"
                                min={0}
                                max={999}
                                step={1}
                                value={item.profitMarginPercent}
                                onChange={e => updateItemProfitMargin(item.sampleId, parseFloat(e.target.value) || 0)}
                                className="h-8 pr-7 text-center text-sm font-medium"
                              />
                              <Percent className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                            </div>
                          </div>
                        </td>
                        {/* Sell Price — AUTO: Cost × (1 + Profit %) */}
                        <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums">{fmtINR(m.sellingPrice)}</td>
                        {/* Discount % — EDITABLE */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center">
                            <div className="relative w-20">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={item.discountPercent}
                                onChange={e => updateItemDiscount(item.sampleId, parseFloat(e.target.value) || 0)}
                                className="h-8 pr-7 text-center text-sm"
                              />
                              <Percent className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                            </div>
                          </div>
                        </td>
                        {/* Broker Amount */}
                        <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                          {m.brokerAmount > 0 ? fmtINR(m.brokerAmount) : '—'}
                        </td>
                        {/* Final Price */}
                        <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{fmtINR(m.finalPrice)}</td>
                        {/* Profit */}
                        <td className="px-3 py-3 text-right">
                          <span className={`text-sm font-semibold tabular-nums ${m.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {fmtINR(m.profit)}
                          </span>
                        </td>
                        {/* Health indicator */}
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <div className={`h-2 w-2 rounded-full ${health.color}`} />
                              <span className={`text-[11px] font-semibold tabular-nums ${health.textColor}`}>
                                {m.effectiveMargin.toFixed(1)}%
                              </span>
                            </div>
                            <span className={`text-[9px] ${health.textColor}`}>{health.label}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ─── Tablet/Mobile Cards ─────────────────────────── */}
            <div className="lg:hidden space-y-3 p-4">
              {items.map((item, idx) => {
                const m = calcItemMetrics(item)
                const health = getHealthInfo(m.effectiveMargin)
                return (
                  <div key={item.sampleId} className="rounded-lg border p-3 space-y-3">
                    {/* Header: Photo + Name + Health */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground w-5">{idx + 1}</span>
                      {item.firstPhotoUrl ? (
                        <img src={item.firstPhotoUrl} alt="" className="h-12 w-12 rounded-md object-cover border" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.styleName}</p>
                        <p className="text-xs text-muted-foreground">{item.styleNo}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1">
                          <div className={`h-2.5 w-2.5 rounded-full ${health.color}`} />
                          <span className={`text-xs font-bold tabular-nums ${health.textColor}`}>
                            {m.effectiveMargin.toFixed(1)}%
                          </span>
                        </div>
                        <span className={`text-[9px] ${health.textColor}`}>{health.label}</span>
                      </div>
                    </div>

                    {/* Pricing Row */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-muted/50 p-2">
                        <span className="text-muted-foreground">Cost</span>
                        <p className="font-semibold tabular-nums">{fmtINR(item.totalCost)}</p>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <span className="text-muted-foreground">Profit %</span>
                        <div className="relative mt-0.5">
                          <Input
                            type="number" min={0} max={999} step={1}
                            value={item.profitMarginPercent}
                            onChange={e => updateItemProfitMargin(item.sampleId, parseFloat(e.target.value) || 0)}
                            className="h-7 pr-6 text-xs font-medium"
                          />
                          <Percent className="absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <span className="text-muted-foreground">Sell</span>
                        <p className="font-bold tabular-nums">{fmtINR(m.sellingPrice)}</p>
                      </div>
                    </div>

                    {/* Discount + Profit Row */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-muted/50 p-2">
                        <span className="text-muted-foreground">Discount %</span>
                        <div className="relative mt-0.5">
                          <Input
                            type="number" min={0} max={100} step={0.5}
                            value={item.discountPercent}
                            onChange={e => updateItemDiscount(item.sampleId, parseFloat(e.target.value) || 0)}
                            className="h-7 pr-6 text-xs"
                          />
                          <Percent className="absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <span className="text-muted-foreground">Final Price</span>
                        <p className="font-bold tabular-nums">{fmtINR(m.finalPrice)}</p>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <span className="text-muted-foreground">Profit</span>
                        <p className={`font-bold tabular-nums ${m.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {fmtINR(m.profit)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Bottom Actions ───────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Net Margin (after all deductions):</span>
          <div className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${getHealthInfo(overallEffectiveMargin).color}`} />
            <span className={`font-bold tabular-nums ${getHealthInfo(overallEffectiveMargin).textColor}`}>
              {overallEffectiveMargin.toFixed(1)}%
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {getHealthInfo(overallEffectiveMargin).label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack}>Back to Gallery</Button>
          <Button
            onClick={handleGeneratePdf}
            disabled={generatingPdf || itemsWithoutCosting.length > 0}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Generate PDF
          </Button>
        </div>
      </div>
    </div>
  )
}
