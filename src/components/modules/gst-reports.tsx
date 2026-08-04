'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/export-button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  Download,
  FileText,
  Calculator,
  BookOpen,
  Search,
  CalendarDays,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  IndianRupee,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportTab = 'gstr1' | 'gstr3b' | 'itc'

interface B2BInvoice {
  customerGSTIN: string
  customerName: string
  invoiceNo: string
  date: string
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
}

interface B2CSummary {
  count: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
}

interface GSTR1Data {
  report: string
  b2b: B2BInvoice[]
  b2cSummary: B2CSummary
  totals: {
    totalOrders: number
    b2bCount: number
    b2cCount: number
    taxableAmount: number
    cgstAmount: number
    sgstAmount: number
    igstAmount: number
    totalTax: number
    totalAmount: number
  }
}

interface TaxSummary {
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
}

interface GSTR3BData {
  report: string
  outward: TaxSummary & { orderCount: number }
  inward: TaxSummary & { poCount: number }
  netTaxPayable: {
    cgst: number
    sgst: number
    igst: number
    total: number
  }
}

interface ITCEntry {
  date: string
  supplierName: string
  billNo: string
  source: string
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
  eligibleITC: number
}

interface ITCData {
  report: string
  entries: ITCEntry[]
  totals: {
    entryCount: number
    poCount: number
    vbCount: number
    taxableAmount: number
    cgstAmount: number
    sgstAmount: number
    igstAmount: number
    totalTax: number
    totalAmount: number
    eligibleITC: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

function downloadCSV(rows: Record<string, string | number>[], filename: string) {
  if (rows.length === 0) {
    toast.error('No data to export')
    return
  }
  const headers = Object.keys(rows[0])
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = String(r[h])
          return val.includes(',') ? `"${val}"` : val
        })
        .join(',')
    ),
  ]
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success('CSV exported successfully')
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GstReports() {
  const { from: initFrom, to: initTo } = getMonthRange()
  const [fromDate, setFromDate] = useState(initFrom)
  const [toDate, setToDate] = useState(initTo)
  const [activeTab, setActiveTab] = useState<ReportTab>('gstr1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [gstr1Data, setGstr1Data] = useState<GSTR1Data | null>(null)
  const [gstr3bData, setGstr3bData] = useState<GSTR3BData | null>(null)
  const [itcData, setItcData] = useState<ITCData | null>(null)

  const fetchReport = useCallback(
    async (tab: ReportTab) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/reports/gst?report=${tab}&from=${fromDate}&to=${toDate}`
        )
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || 'Failed to fetch report')
        }
        const data = await res.json()
        if (tab === 'gstr1') setGstr1Data(data)
        else if (tab === 'gstr3b') setGstr3bData(data)
        else setItcData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [fromDate, toDate]
  )

  // Fetch on mount and when dates change
  useEffect(() => {
    fetchReport(activeTab)
  }, [activeTab, fromDate, toDate, fetchReport])

  const handleApply = () => {
    fetchReport(activeTab)
  }

  // ─── CSV Export handlers ───────────────────────────────────────────────

  const exportGSTR1 = () => {
    if (!gstr1Data) return
    const rows: Record<string, string | number>[] = []
    gstr1Data.b2b.forEach((b) => {
      rows.push({
        Type: 'B2B',
        'Customer GSTIN': b.customerGSTIN,
        'Customer Name': b.customerName,
        'Invoice No': b.invoiceNo,
        Date: b.date,
        'Taxable Amount': b.taxableAmount,
        CGST: b.cgstAmount,
        SGST: b.sgstAmount,
        IGST: b.igstAmount,
        'Total Tax': b.totalTax,
        'Total Amount': b.totalAmount,
      })
    })
    if (gstr1Data.b2cSummary.count > 0) {
      rows.push({
        Type: 'B2C (Aggregate)',
        'Customer GSTIN': '-',
        'Customer Name': `${gstr1Data.b2cSummary.count} invoices`,
        'Invoice No': '-',
        Date: '-',
        'Taxable Amount': gstr1Data.b2cSummary.taxableAmount,
        CGST: gstr1Data.b2cSummary.cgstAmount,
        SGST: gstr1Data.b2cSummary.sgstAmount,
        IGST: gstr1Data.b2cSummary.igstAmount,
        'Total Tax': gstr1Data.b2cSummary.totalTax,
        'Total Amount': gstr1Data.b2cSummary.totalAmount,
      })
    }
    rows.push({
      Type: 'TOTAL',
      'Customer GSTIN': '',
      'Customer Name': '',
      'Invoice No': '',
      Date: '',
      'Taxable Amount': gstr1Data.totals.taxableAmount,
      CGST: gstr1Data.totals.cgstAmount,
      SGST: gstr1Data.totals.sgstAmount,
      IGST: gstr1Data.totals.igstAmount,
      'Total Tax': gstr1Data.totals.totalTax,
      'Total Amount': gstr1Data.totals.totalAmount,
    })
    downloadCSV(rows, `GSTR1_${fromDate}_to_${toDate}.csv`)
  }

  const exportGSTR3B = () => {
    if (!gstr3bData) return
    const rows: Record<string, string | number>[] = [
      {
        Section: 'Table 3.1 - Outward Supplies',
        Description: `Sales Orders (${gstr3bData.outward.orderCount})`,
        'Taxable Amount': gstr3bData.outward.taxableAmount,
        CGST: gstr3bData.outward.cgstAmount,
        SGST: gstr3bData.outward.sgstAmount,
        IGST: gstr3bData.outward.igstAmount,
        'Total Tax': gstr3bData.outward.totalTax,
      },
      {
        Section: 'Table 4 - Inward Supplies (ITC)',
        Description: `Purchase Orders (${gstr3bData.inward.poCount})`,
        'Taxable Amount': gstr3bData.inward.taxableAmount,
        CGST: gstr3bData.inward.cgstAmount,
        SGST: gstr3bData.inward.sgstAmount,
        IGST: gstr3bData.inward.igstAmount,
        'Total Tax': gstr3bData.inward.totalTax,
      },
      {
        Section: 'Net Tax Payable',
        Description: 'Outward - ITC',
        'Taxable Amount': '-',
        CGST: gstr3bData.netTaxPayable.cgst,
        SGST: gstr3bData.netTaxPayable.sgst,
        IGST: gstr3bData.netTaxPayable.igst,
        'Total Tax': gstr3bData.netTaxPayable.total,
      },
    ]
    downloadCSV(rows, `GSTR3B_${fromDate}_to_${toDate}.csv`)
  }

  const exportITC = () => {
    if (!itcData) return
    const rows: Record<string, string | number>[] = itcData.entries.map((e) => ({
      Date: e.date,
      'Supplier Name': e.supplierName,
      'Bill No': e.billNo,
      Source: e.source,
      'Taxable Amount': e.taxableAmount,
      CGST: e.cgstAmount,
      SGST: e.sgstAmount,
      IGST: e.igstAmount,
      'Total Tax': e.totalTax,
      'Total Amount': e.totalAmount,
      'Eligible ITC': e.eligibleITC,
    }))
    rows.push({
      Date: 'TOTAL',
      'Supplier Name': '',
      'Bill No': '',
      Source: `${itcData.totals.poCount} POs + ${itcData.totals.vbCount} VBs`,
      'Taxable Amount': itcData.totals.taxableAmount,
      CGST: itcData.totals.cgstAmount,
      SGST: itcData.totals.sgstAmount,
      IGST: itcData.totals.igstAmount,
      'Total Tax': itcData.totals.totalTax,
      'Total Amount': itcData.totals.totalAmount,
      'Eligible ITC': itcData.totals.eligibleITC,
    })
    downloadCSV(rows, `ITC_Register_${fromDate}_to_${toDate}.csv`)
  }

  const handleExport = () => {
    if (activeTab === 'gstr1') exportGSTR1()
    else if (activeTab === 'gstr3b') exportGSTR3B()
    else exportITC()
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  const isEmpty =
    (activeTab === 'gstr1' && gstr1Data && gstr1Data.totals.totalOrders === 0) ||
    (activeTab === 'gstr3b' && gstr3bData && gstr3bData.outward.orderCount === 0 && gstr3bData.inward.poCount === 0) ||
    (activeTab === 'itc' && itcData && itcData.totals.entryCount === 0)

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">GST Reports</h1>
            <p className="text-sm text-muted-foreground">
              GST compliance reports for Dhanya OS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="gst-reports" />
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
            onClick={handleExport}
            disabled={loading || isEmpty}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ─── Date Range ──────────────────────────────────────────────────── */}
      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          <span className="font-medium">Period:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <span className="mb-0.5 text-muted-foreground">to</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <Button size="sm" onClick={handleApply} disabled={loading} className="mb-0.5 gap-2">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Apply
          </Button>
        </div>
      </div>

      {/* ─── Error State ─────────────────────────────────────────────────── */}
      {error && (
        <div className="glass-card flex items-center gap-3 border-red-500/30 bg-red-500/5 p-4">
          <AlertCircle className="size-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ─── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="gstr1" className="gap-2 text-xs sm:text-sm">
            <FileText className="size-4" />
            <span className="hidden sm:inline">GSTR-1</span>
            <span className="sm:hidden">GSTR-1</span>
          </TabsTrigger>
          <TabsTrigger value="gstr3b" className="gap-2 text-xs sm:text-sm">
            <Calculator className="size-4" />
            <span className="hidden sm:inline">GSTR-3B</span>
            <span className="sm:hidden">GSTR-3B</span>
          </TabsTrigger>
          <TabsTrigger value="itc" className="gap-2 text-xs sm:text-sm">
            <BookOpen className="size-4" />
            <span className="hidden sm:inline">ITC Register</span>
            <span className="sm:hidden">ITC</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── GSTR-1 Tab ───────────────────────────────────────────────── */}
        <TabsContent value="gstr1" className="mt-4 space-y-4">
          {loading && !gstr1Data ? (
            <GSTR1Skeleton />
          ) : gstr1Data && gstr1Data.totals.totalOrders === 0 ? (
            <EmptyState
              icon={<FileText className="size-10" />}
              title="No outward supplies found"
              description="No sales orders with GST data for the selected period."
            />
          ) : (
            gstr1Data && (
              <>
                {/* B2B Invoices */}
                <div className="glass-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                        B2B
                      </Badge>
                      <h3 className="font-semibold">B2B Invoices</h3>
                      <span className="text-xs text-muted-foreground">
                        ({gstr1Data.totals.b2bCount} invoices)
                      </span>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto custom-scrollbar rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">Customer GSTIN</TableHead>
                          <TableHead className="text-xs">Invoice No</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs text-right">Taxable Amt</TableHead>
                          <TableHead className="text-xs text-right text-blue-400">CGST</TableHead>
                          <TableHead className="text-xs text-right text-emerald-400">SGST</TableHead>
                          <TableHead className="text-xs text-right text-amber-400">IGST</TableHead>
                          <TableHead className="text-xs text-right font-semibold">Total Tax</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1Data.b2b.map((inv, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">
                              {inv.customerGSTIN}
                            </TableCell>
                            <TableCell className="font-medium text-sm">
                              {inv.invoiceNo}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtDate(inv.date)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {inr(inv.taxableAmount)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-blue-400">
                              {inv.cgstAmount > 0 ? inr(inv.cgstAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-emerald-400">
                              {inv.sgstAmount > 0 ? inr(inv.sgstAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-amber-400">
                              {inv.igstAmount > 0 ? inr(inv.igstAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums font-semibold">
                              {inr(inv.totalTax)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {gstr1Data.b2b.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                              No B2B invoices in this period
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* B2C Summary */}
                <div className="glass-card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      B2C
                    </Badge>
                    <h3 className="font-semibold">B2C Supplies</h3>
                    <span className="text-xs text-muted-foreground">
                      (No GSTIN — {gstr1Data.totals.b2cCount} invoices)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SummaryCard
                      label="Taxable Amount"
                      value={inr(gstr1Data.b2cSummary.taxableAmount)}
                    />
                    <SummaryCard
                      label="Total Tax"
                      value={inr(gstr1Data.b2cSummary.totalTax)}
                      highlight
                    />
                    <SummaryCard
                      label="Invoices"
                      value={String(gstr1Data.b2cSummary.count)}
                    />
                    <SummaryCard
                      label="Total Amount"
                      value={inr(gstr1Data.b2cSummary.totalAmount)}
                    />
                  </div>
                </div>

                {/* Grand Totals */}
                <div className="glass-card border-primary/20 bg-primary/5 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold">
                    <IndianRupee className="size-4 text-primary" />
                    Grand Totals — All Outward Supplies
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <SummaryCard label="Total Orders" value={String(gstr1Data.totals.totalOrders)} />
                    <SummaryCard
                      label="Taxable Amount"
                      value={inr(gstr1Data.totals.taxableAmount)}
                    />
                    <SummaryCard
                      label="Total CGST"
                      value={inr(gstr1Data.totals.cgstAmount)}
                      color="text-blue-400"
                    />
                    <SummaryCard
                      label="Total SGST"
                      value={inr(gstr1Data.totals.sgstAmount)}
                      color="text-emerald-400"
                    />
                    <SummaryCard
                      label="Total IGST"
                      value={inr(gstr1Data.totals.igstAmount)}
                      color="text-amber-400"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-background/60 px-4 py-2.5">
                    <span className="font-medium">Total Tax Collected</span>
                    <span className="text-lg font-bold tabular-nums text-primary">
                      {inr(gstr1Data.totals.totalTax)}
                    </span>
                  </div>
                </div>
              </>
            )
          )}
        </TabsContent>

        {/* ─── GSTR-3B Tab ──────────────────────────────────────────────── */}
        <TabsContent value="gstr3b" className="mt-4 space-y-4">
          {loading && !gstr3bData ? (
            <GSTR3BSkeleton />
          ) : gstr3bData && gstr3bData.outward.orderCount === 0 && gstr3bData.inward.poCount === 0 ? (
            <EmptyState
              icon={<Calculator className="size-10" />}
              title="No GST data found"
              description="No sales or purchase orders with GST data for the selected period."
            />
          ) : (
            gstr3bData && (
              <>
                {/* Table 3.1: Outward Supplies */}
                <div className="glass-card p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <ArrowUpRight className="size-4 text-emerald-400" />
                    <h3 className="font-semibold">Table 3.1 — Outward Supplies</h3>
                    <Badge variant="outline" className="text-xs">
                      {gstr3bData.outward.orderCount} orders
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <SummaryCard
                      label="Taxable Amount"
                      value={inr(gstr3bData.outward.taxableAmount)}
                    />
                    <SummaryCard
                      label="CGST"
                      value={inr(gstr3bData.outward.cgstAmount)}
                      color="text-blue-400"
                    />
                    <SummaryCard
                      label="SGST"
                      value={inr(gstr3bData.outward.sgstAmount)}
                      color="text-emerald-400"
                    />
                    <SummaryCard
                      label="IGST"
                      value={inr(gstr3bData.outward.igstAmount)}
                      color="text-amber-400"
                    />
                    <SummaryCard
                      label="Total Tax"
                      value={inr(gstr3bData.outward.totalTax)}
                      highlight
                    />
                  </div>
                </div>

                {/* Table 4: Inward Supplies / ITC */}
                <div className="glass-card p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <ArrowDownRight className="size-4 text-blue-400" />
                    <h3 className="font-semibold">Table 4 — Inward Supplies (ITC)</h3>
                    <Badge variant="outline" className="text-xs">
                      {gstr3bData.inward.poCount} purchase orders
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <SummaryCard
                      label="Taxable Amount"
                      value={inr(gstr3bData.inward.taxableAmount)}
                    />
                    <SummaryCard
                      label="CGST"
                      value={inr(gstr3bData.inward.cgstAmount)}
                      color="text-blue-400"
                    />
                    <SummaryCard
                      label="SGST"
                      value={inr(gstr3bData.inward.sgstAmount)}
                      color="text-emerald-400"
                    />
                    <SummaryCard
                      label="IGST"
                      value={inr(gstr3bData.inward.igstAmount)}
                      color="text-amber-400"
                    />
                    <SummaryCard
                      label="Total ITC"
                      value={inr(gstr3bData.inward.totalTax)}
                      highlight
                    />
                  </div>
                </div>

                {/* Net Tax Payable */}
                <div className="glass-card border-primary/30 bg-primary/5 p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                    <TrendingDown className="size-5 text-primary" />
                    Net Tax Payable
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-xs ml-1">
                      Outward − ITC
                    </Badge>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <TaxPayableCard
                      label="CGST Payable"
                      value={gstr3bData.netTaxPayable.cgst}
                      color="text-blue-400"
                    />
                    <TaxPayableCard
                      label="SGST Payable"
                      value={gstr3bData.netTaxPayable.sgst}
                      color="text-emerald-400"
                    />
                    <TaxPayableCard
                      label="IGST Payable"
                      value={gstr3bData.netTaxPayable.igst}
                      color="text-amber-400"
                    />
                    <TaxPayableCard
                      label="Total Payable"
                      value={gstr3bData.netTaxPayable.total}
                      color="text-primary"
                      large
                    />
                  </div>
                </div>
              </>
            )
          )}
        </TabsContent>

        {/* ─── ITC Register Tab ─────────────────────────────────────────── */}
        <TabsContent value="itc" className="mt-4 space-y-4">
          {loading && !itcData ? (
            <ITCSkeleton />
          ) : itcData && itcData.totals.entryCount === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-10" />}
              title="No ITC entries found"
              description="No purchase orders or vendor bills with GST data for the selected period."
            />
          ) : (
            itcData && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryCard
                    label="Total Entries"
                    value={String(itcData.totals.entryCount)}
                  />
                  <SummaryCard
                    label="Taxable Amount"
                    value={inr(itcData.totals.taxableAmount)}
                  />
                  <SummaryCard
                    label="Total Tax"
                    value={inr(itcData.totals.totalTax)}
                  />
                  <SummaryCard
                    label="Eligible ITC"
                    value={inr(itcData.totals.eligibleITC)}
                    highlight
                  />
                </div>

                {/* ITC Table */}
                <div className="glass-card p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">ITC Register</h3>
                      <span className="text-xs text-muted-foreground">
                        ({itcData.totals.poCount} POs + {itcData.totals.vbCount} Vendor Bills)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={exportITC}
                    >
                      <Download className="size-3.5" />
                      Export
                    </Button>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto custom-scrollbar rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs">Bill No</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="text-xs text-right">Taxable</TableHead>
                          <TableHead className="text-xs text-right text-blue-400">CGST</TableHead>
                          <TableHead className="text-xs text-right text-emerald-400">SGST</TableHead>
                          <TableHead className="text-xs text-right text-amber-400">IGST</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs text-right font-semibold">Eligible ITC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itcData.entries.map((entry, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {fmtDate(entry.date)}
                            </TableCell>
                            <TableCell className="text-sm">{entry.supplierName}</TableCell>
                            <TableCell className="font-mono text-xs">{entry.billNo}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  entry.source === 'Vendor Bill'
                                    ? 'text-purple-400 border-purple-500/20 bg-purple-500/5'
                                    : 'text-sky-400 border-sky-500/20 bg-sky-500/5'
                                }
                              >
                                {entry.source === 'Vendor Bill' ? 'VB' : 'PO'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {inr(entry.taxableAmount)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-blue-400">
                              {entry.cgstAmount > 0 ? inr(entry.cgstAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-emerald-400">
                              {entry.sgstAmount > 0 ? inr(entry.sgstAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-amber-400">
                              {entry.igstAmount > 0 ? inr(entry.igstAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {inr(entry.totalAmount)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums font-semibold text-emerald-400">
                              {inr(entry.eligibleITC)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="bg-primary/5 font-semibold">
                          <TableCell className="text-xs">TOTAL</TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell className="text-right text-sm tabular-nums">
                            {inr(itcData.totals.taxableAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-blue-400">
                            {inr(itcData.totals.cgstAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-emerald-400">
                            {inr(itcData.totals.sgstAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-amber-400">
                            {inr(itcData.totals.igstAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {inr(itcData.totals.totalAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-emerald-400">
                            {inr(itcData.totals.eligibleITC)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
              </>
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
  highlight,
}: {
  label: string
  value: string
  color?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-primary/20 bg-primary/5' : 'bg-muted/30'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${color || (highlight ? 'text-primary' : '')}`}>
        {value}
      </p>
    </div>
  )
}

function TaxPayableCard({
  label,
  value,
  color,
  large,
}: {
  label: string
  value: number
  color?: string
  large?: boolean
}) {
  const isNegative = value < 0
  return (
    <div className="rounded-lg border border-primary/20 bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 tabular-nums font-bold ${color || 'text-primary'} ${
          large ? 'text-lg' : 'text-sm'
        } ${isNegative ? 'text-emerald-400' : ''}`}
      >
        {isNegative ? '(' : ''}
        {inr(Math.abs(value))}
        {isNegative ? ')' : ''}
        {isNegative && <span className="ml-1 text-xs font-normal">Credit</span>}
      </p>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="glass-card flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground/60">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

// ─── Skeletons ──────────────────────────────────────────────────────────────

function GSTR1Skeleton() {
  return (
    <div className="space-y-4">
      <div className="glass-card p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="glass-card p-4 space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

function GSTR3BSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="glass-card p-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, j) => (
              <Skeleton key={j} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ITCSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
      <div className="glass-card p-4 space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}