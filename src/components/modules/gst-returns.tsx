'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FileText, RefreshCw, IndianRupee, TrendingUp, TrendingDown, Calendar, Building2, Scale,
} from 'lucide-react'
import { toast } from 'sonner'

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

export function GSTReturnsModule() {
  const [activeTab, setActiveTab] = useState('gstr3b')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7))

  const fetchData = useCallback(async (tab: string, m: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/gst-returns?type=${tab === 'gstr1' ? 'gstr1' : 'gstr3b'}&month=${m}`)
      if (res.ok) setData(await res.json())
    } catch { toast.error('Failed to load GST data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData(activeTab, month) }, [activeTab, month, fetchData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
          <div><h1 className="text-lg font-bold">GST Returns</h1><p className="text-xs text-muted-foreground">GSTR-1 and GSTR-3B preparation</p></div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-md border border-border bg-muted/50 px-2 text-xs" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fetchData(activeTab, month)}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList><TabsTrigger value="gstr3b">GSTR-3B (Summary)</TabsTrigger><TabsTrigger value="gstr1">GSTR-1 (Outward)</TabsTrigger></TabsList>

        {loading ? (
          <div className="space-y-4 mt-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
        ) : (
          <>
            {/* GSTR-3B */}
            <TabsContent value="gstr3b" className="space-y-4">
              {data && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="glass-card border-l-2 border-l-emerald-500/40"><CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Output GST</span></div>
                      <p className="text-xl font-bold tabular-nums text-emerald-400">{formatINR(data.outputGST?.totalOutputGST || 0)}</p>
                      <p className="text-[10px] text-muted-foreground">{data.outputGST?.invoiceCount || 0} invoices</p>
                    </CardContent></Card>
                    <Card className="glass-card border-l-2 border-l-amber-500/40"><CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-3.5 w-3.5 text-amber-400" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Input Tax Credit</span></div>
                      <p className="text-xl font-bold tabular-nums text-amber-400">{formatINR(data.inputTaxCredit?.totalInputGST || 0)}</p>
                      <p className="text-[10px] text-muted-foreground">{data.inputTaxCredit?.poCount || 0} POs</p>
                    </CardContent></Card>
                    <Card className="glass-card border-l-2 border-l-primary/40"><CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1"><IndianRupee className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Net Payable</span></div>
                      <p className="text-xl font-bold tabular-nums text-primary">{formatINR(data.netPayable?.totalNetPayable || 0)}</p>
                      <p className="text-[10px] text-muted-foreground">{data.netPayable?.status}</p>
                    </CardContent></Card>
                    <Card className="glass-card"><CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span></div>
                      <p className="text-lg font-bold">{data.month}</p>
                    </CardContent></Card>
                  </div>

                  <Card className="glass-card">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">GST Breakup</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow className="border-border/30"><TableHead className="text-xs">Component</TableHead><TableHead className="text-xs text-right">Output (Sales)</TableHead><TableHead className="text-xs text-right">Input (Purchase)</TableHead><TableHead className="text-xs text-right">Net Payable</TableHead></TableRow></TableHeader>
                        <TableBody>
                          <TableRow className="border-border/20"><TableCell className="text-xs py-2.5">CGST</TableCell><TableCell className="text-xs text-right tabular-nums text-emerald-400 py-2.5">{formatINR(data.outputGST?.outputCGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums text-amber-400 py-2.5">{formatINR(data.inputTaxCredit?.inputCGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums font-bold py-2.5">{formatINR(data.netPayable?.netCGST || 0)}</TableCell></TableRow>
                          <TableRow className="border-border/20"><TableCell className="text-xs py-2.5">SGST</TableCell><TableCell className="text-xs text-right tabular-nums text-emerald-400 py-2.5">{formatINR(data.outputGST?.outputSGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums text-amber-400 py-2.5">{formatINR(data.inputTaxCredit?.inputSGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums font-bold py-2.5">{formatINR(data.netPayable?.netSGST || 0)}</TableCell></TableRow>
                          <TableRow className="border-border/20"><TableCell className="text-xs py-2.5">IGST</TableCell><TableCell className="text-xs text-right tabular-nums text-emerald-400 py-2.5">{formatINR(data.outputGST?.outputIGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums text-amber-400 py-2.5">{formatINR(data.inputTaxCredit?.inputIGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums font-bold py-2.5">{formatINR(data.netPayable?.netIGST || 0)}</TableCell></TableRow>
                          <TableRow className="border-border/30"><TableCell className="text-xs font-bold py-2.5">Total</TableCell><TableCell className="text-xs text-right tabular-nums font-bold text-emerald-400 py-2.5">{formatINR(data.outputGST?.totalOutputGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums font-bold text-amber-400 py-2.5">{formatINR(data.inputTaxCredit?.totalInputGST || 0)}</TableCell><TableCell className="text-xs text-right tabular-nums font-bold text-primary py-2.5">{formatINR(data.netPayable?.totalNetPayable || 0)}</TableCell></TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* GSTR-1 */}
            <TabsContent value="gstr1" className="space-y-4">
              {data && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="glass-card"><CardContent className="p-4"><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Invoices</span><p className="text-xl font-bold tabular-nums">{data.summary?.totalInvoices || 0}</p></CardContent></Card>
                    <Card className="glass-card"><CardContent className="p-4"><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Taxable Amount</span><p className="text-xl font-bold tabular-nums">{formatINR(data.summary?.totalTaxableAmount || 0)}</p></CardContent></Card>
                    <Card className="glass-card"><CardContent className="p-4"><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total GST</span><p className="text-xl font-bold tabular-nums text-primary">{formatINR(data.summary?.totalGST || 0)}</p></CardContent></Card>
                    <Card className="glass-card"><CardContent className="p-4"><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Invoice Value</span><p className="text-xl font-bold tabular-nums">{formatINR(data.summary?.totalInvoiceValue || 0)}</p></CardContent></Card>
                  </div>

                  <Card className="glass-card">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">HSN-wise Summary</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow className="border-border/30"><TableHead className="text-xs">HSN</TableHead><TableHead className="text-xs text-right">Qty</TableHead><TableHead className="text-xs text-right">Taxable</TableHead><TableHead className="text-xs text-right">GST</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.hsnSummary || []).map((h: any) => (
                            <TableRow key={h.hsn} className="border-border/20"><TableCell className="text-xs py-2.5 font-medium">{h.hsn}</TableCell><TableCell className="text-xs text-right tabular-nums py-2.5">{h.qty}</TableCell><TableCell className="text-xs text-right tabular-nums py-2.5">{formatINR(h.taxable)}</TableCell><TableCell className="text-xs text-right tabular-nums py-2.5">{formatINR(h.gst)}</TableCell></TableRow>
                          ))}
                          {(data.hsnSummary || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground text-center py-4">No HSN data</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Invoice-wise Details</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow className="border-border/30"><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Customer</TableHead><TableHead className="text-xs">GST Type</TableHead><TableHead className="text-xs text-right">Taxable</TableHead><TableHead className="text-xs text-right">GST</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.outwardSupplies || []).map((s: any) => (
                            <TableRow key={s.invoiceNo} className="border-border/20"><TableCell className="text-xs py-2.5 font-medium">{s.invoiceNo}</TableCell><TableCell className="text-xs py-2.5">{s.customerName}</TableCell><TableCell className="text-xs py-2.5"><Badge variant="outline" className="text-[9px] px-1.5 py-0">{s.gstType}</Badge></TableCell><TableCell className="text-xs text-right tabular-nums py-2.5">{formatINR(s.taxableAmount)}</TableCell><TableCell className="text-xs text-right tabular-nums py-2.5">{formatINR(s.totalGst)}</TableCell><TableCell className="text-xs text-right tabular-nums font-bold py-2.5">{formatINR(s.totalAmount)}</TableCell></TableRow>
                          ))}
                          {(data.outwardSupplies || []).length === 0 && <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground text-center py-4">No invoices for this period</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
