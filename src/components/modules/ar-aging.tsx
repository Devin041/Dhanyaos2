'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  RefreshCw, AlertTriangle, Clock, IndianRupee, TrendingDown,
  CheckCircle2, Users, ChevronDown, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface ARAgingCustomer {
  customerId: string
  customerName: string
  phone: string | null
  email: string | null
  creditLimit: number
  bucket30: number
  bucket60: number
  bucket90: number
  bucket90Plus: number
  total: number
  invoiceCount: number
  creditUtilization: number
  creditExceeded: boolean
  overdueInvoices: Array<{ invoiceNo: string; outstanding: number; dueDate: string; daysOverdue: number; paymentTerms: number }>
}

interface ARAgingSummary {
  totalOutstanding: number
  customerCount: number
  overdueCount: number
  bucket30Total: number
  bucket60Total: number
  bucket90Total: number
  bucket90PlusTotal: number
  creditExceededCount: number
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export function ARAgingModule() {
  const [customers, setCustomers] = useState<ARAgingCustomer[]>([])
  const [summary, setSummary] = useState<ARAgingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/accounts/ar-aging')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
        setSummary(data.summary || null)
      }
    } catch { toast.error('Failed to load AR aging') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const totalBucket = summary ? summary.bucket30Total + summary.bucket60Total + summary.bucket90Total + summary.bucket90PlusTotal : 0
  const pct30 = totalBucket > 0 ? (summary?.bucket30Total || 0) / totalBucket * 100 : 0
  const pct60 = totalBucket > 0 ? (summary?.bucket60Total || 0) / totalBucket * 100 : 0
  const pct90 = totalBucket > 0 ? (summary?.bucket90Total || 0) / totalBucket * 100 : 0
  const pct90P = totalBucket > 0 ? (summary?.bucket90PlusTotal || 0) / totalBucket * 100 : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Accounts Receivable — Aging</h1>
            <p className="text-xs text-muted-foreground">Customer-wise outstanding by age buckets</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchData}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="glass-card border-l-2 border-l-amber-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="h-3.5 w-3.5 text-amber-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Outstanding</span></div>
            <p className="text-xl font-bold tabular-nums text-amber-400">{formatINR(summary.totalOutstanding)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.customerCount} customers</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-red-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-3.5 w-3.5 text-red-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overdue Invoices</span></div>
            <p className="text-xl font-bold tabular-nums text-red-400">{summary.overdueCount}</p>
            <p className="text-[10px] text-muted-foreground">Need follow-up</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-red-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-3.5 w-3.5 text-red-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Credit Exceeded</span></div>
            <p className="text-xl font-bold tabular-nums text-red-400">{summary.creditExceededCount}</p>
            <p className="text-[10px] text-muted-foreground">Customers over limit</p>
          </CardContent></Card>
          <Card className="glass-card border-l-2 border-l-emerald-500/40"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Current (0-30d)</span></div>
            <p className="text-xl font-bold tabular-nums text-emerald-400">{formatINR(summary.bucket30Total)}</p>
            <p className="text-[10px] text-muted-foreground">{pct30.toFixed(0)}% of total</p>
          </CardContent></Card>
        </div>
      )}

      {/* Aging Bucket Visual */}
      {summary && totalBucket > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Aging Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-8 rounded-lg overflow-hidden">
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct30}%`, backgroundColor: 'oklch(0.72 0.18 145)' }}>
                {pct30 > 10 ? `0-30d` : ''}
              </div>
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct60}%`, backgroundColor: 'oklch(0.8 0.15 75)' }}>
                {pct60 > 10 ? `31-60d` : ''}
              </div>
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct90}%`, backgroundColor: 'oklch(0.75 0.15 65)' }}>
                {pct90 > 10 ? `61-90d` : ''}
              </div>
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct90P}%`, backgroundColor: 'oklch(0.65 0.22 25)' }}>
                {pct90P > 10 ? `90+d` : ''}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>0-30d: {formatINR(summary.bucket30Total)}</span>
              <span>31-60d: {formatINR(summary.bucket60Total)}</span>
              <span>61-90d: {formatINR(summary.bucket90Total)}</span>
              <span>90+d: {formatINR(summary.bucket90PlusTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer-wise AR Table */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Customer-wise Outstanding</CardTitle></CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400/40 mb-2" />
              <p className="text-sm text-muted-foreground">No outstanding receivables — all clear!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">0-30d</TableHead>
                  <TableHead className="text-xs text-right">31-60d</TableHead>
                  <TableHead className="text-xs text-right">61-90d</TableHead>
                  <TableHead className="text-xs text-right">90+d</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-center">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <>
                    <TableRow key={c.customerId} className="border-border/20 cursor-pointer hover:bg-muted/30" onClick={() => setExpandedRow(expandedRow === c.customerId ? null : c.customerId)}>
                      <TableCell className="py-2.5">
                        {c.overdueInvoices.length > 0 ? (
                          expandedRow === c.customerId ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{c.customerName}</span>
                          <span className="text-[10px] text-muted-foreground">{c.invoiceCount} invoice(s)</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5 text-emerald-400">{c.bucket30 > 0 ? formatINR(c.bucket30) : '—'}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5 text-amber-400">{c.bucket60 > 0 ? formatINR(c.bucket60) : '—'}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5 text-orange-400">{c.bucket90 > 0 ? formatINR(c.bucket90) : '—'}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-2.5 text-red-400">{c.bucket90Plus > 0 ? formatINR(c.bucket90Plus) : '—'}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-bold py-2.5">{formatINR(c.total)}</TableCell>
                      <TableCell className="text-xs text-center py-2.5">
                        {c.creditExceeded ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/15 text-red-400 border-red-500/20">EXCEEDED</Badge>
                        ) : c.creditUtilization > 80 ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">{c.creditUtilization}%</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/20">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {/* Expanded overdue invoices */}
                    {expandedRow === c.customerId && c.overdueInvoices.length > 0 && (
                      <TableRow key={`${c.customerId}-detail`} className="border-border/10 bg-muted/10">
                        <TableCell colSpan={8} className="py-3">
                          <div className="pl-8 space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Overdue Invoices — Follow-up Required</p>
                            {c.overdueInvoices.map((inv) => (
                              <div key={inv.invoiceNo} className="flex items-center justify-between rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-medium">{inv.invoiceNo}</span>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/15 text-red-400 border-red-500/20">
                                    {inv.daysOverdue}d overdue
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">Due: {new Date(inv.dueDate).toLocaleDateString('en-IN')}</span>
                                  <span className="text-[10px] text-muted-foreground">Terms: {inv.paymentTerms}d credit</span>
                                </div>
                                <span className="text-xs font-bold tabular-nums text-red-400">{formatINR(inv.outstanding)}</span>
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => toast.info(`Follow-up logged for ${c.customerName}`)}>
                                <RefreshCw className="h-2.5 w-2.5" /> Log Follow-up
                              </Button>
                              <span className="text-[10px] text-muted-foreground">Credit Limit: {formatINR(c.creditLimit)} · Utilization: {c.creditUtilization}%</span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
