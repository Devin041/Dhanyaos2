import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { startOfMonth, endOfMonth, format } from 'date-fns'

/**
 * GET /api/gst-returns?type=gstr1&month=2026-08
 * GET /api/gst-returns?type=gstr3b&month=2026-08
 *
 * GSTR-1: Outward supplies (sales) — all invoices with GST for the month
 * GSTR-3B: Summary return — output GST (from sales) - input tax credit (from purchases)
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'gstr3b'
    const monthParam = searchParams.get('month') // format: "2026-08"

    // Parse month
    let monthStart: Date, monthEnd: Date, monthLabel: string
    if (monthParam) {
      const [year, mon] = monthParam.split('-').map(Number)
      monthStart = startOfMonth(new Date(year, mon - 1))
      monthEnd = endOfMonth(new Date(year, mon - 1))
      monthLabel = format(monthStart, 'MMM yyyy')
    } else {
      monthStart = startOfMonth(new Date())
      monthEnd = endOfMonth(new Date())
      monthLabel = format(monthStart, 'MMM yyyy')
    }

    // ─── Fetch all invoices for the month ───
    const { data: invoices, error: invErr } = await supabase
      .from('Invoice')
      .select('id, invoiceNo, invoiceDate, customerName, customerGstNumber, placeOfSupply, gstType, gstPercent, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount, status')
      .gte('invoiceDate', monthStart.toISOString())
      .lte('invoiceDate', monthEnd.toISOString())

    if (invErr && !isMissingTableError(invErr)) throw invErr

    // Fetch invoice items for HSN summary
    const invoiceIds = (invoices || []).map((i: any) => i.id)
    let itemsMap: Record<string, any[]> = {}
    if (invoiceIds.length > 0) {
      const { data: items } = await supabase
        .from('InvoiceItem')
        .select('invoiceId, hsnCode, quantity, taxableAmount, gstAmount, gstPercent')
        .in('invoiceId', invoiceIds)
      for (const item of (items || [])) {
        if (!itemsMap[item.invoiceId]) itemsMap[item.invoiceId] = []
        itemsMap[item.invoiceId].push(item)
      }
    }

    // ─── Fetch all purchase orders for the month (for ITC) ───
    const { data: pos, error: poErr } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, createdAt, totalAmount, supplier:supplierId(name), gstType, gstPercent, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst')
      .gte('createdAt', monthStart.toISOString())
      .lte('createdAt', monthEnd.toISOString())

    if (poErr && !isMissingTableError(poErr)) throw poErr

    // ─── GSTR-1: Outward Supplies ───
    if (type === 'gstr1') {
      const outwardSupplies = (invoices || []).map((inv: any) => ({
        invoiceNo: inv.invoiceNo,
        date: inv.invoiceDate,
        customerName: inv.customerName || '—',
        customerGstNumber: inv.customerGstNumber || '—',
        placeOfSupply: inv.placeOfSupply || '—',
        gstType: inv.gstType || 'IntraState',
        taxableAmount: inv.taxableAmount || 0,
        cgst: inv.cgstAmount || 0,
        sgst: inv.sgstAmount || 0,
        igst: inv.igstAmount || 0,
        totalGst: inv.totalGst || 0,
        totalAmount: inv.totalAmount || 0,
        items: itemsMap[inv.id] || [],
      }))

      // HSN-wise summary
      const hsnMap: Record<string, { hsn: string; qty: number; taxable: number; gst: number }> = {}
      for (const inv of outwardSupplies) {
        for (const item of (inv.items || [])) {
          const hsn = item.hsnCode || '6104'
          if (!hsnMap[hsn]) hsnMap[hsn] = { hsn, qty: 0, taxable: 0, gst: 0 }
          hsnMap[hsn].qty += item.quantity || 0
          hsnMap[hsn].taxable += item.taxableAmount || 0
          hsnMap[hsn].gst += item.gstAmount || 0
        }
      }

      return NextResponse.json({
        type: 'GSTR-1',
        month: monthLabel,
        period: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
        outwardSupplies,
        hsnSummary: Object.values(hsnMap).map((h: any) => ({
          ...h,
          taxable: Math.round(h.taxable),
          gst: Math.round(h.gst),
        })),
        summary: {
          totalInvoices: outwardSupplies.length,
          totalTaxableAmount: Math.round(outwardSupplies.reduce((s: number, i: any) => s + i.taxableAmount, 0)),
          totalCGST: Math.round(outwardSupplies.reduce((s: number, i: any) => s + i.cgst, 0)),
          totalSGST: Math.round(outwardSupplies.reduce((s: number, i: any) => s + i.sgst, 0)),
          totalIGST: Math.round(outwardSupplies.reduce((s: number, i: any) => s + i.igst, 0)),
          totalGST: Math.round(outwardSupplies.reduce((s: number, i: any) => s + i.totalGst, 0)),
          totalInvoiceValue: Math.round(outwardSupplies.reduce((s: number, i: any) => s + i.totalAmount, 0)),
        },
      })
    }

    // ─── GSTR-3B: Summary Return ───
    const outputGST = (invoices || []).reduce((s: number, i: any) => s + (i.totalGst || 0), 0)
    const outputCGST = (invoices || []).reduce((s: number, i: any) => s + (i.cgstAmount || 0), 0)
    const outputSGST = (invoices || []).reduce((s: number, i: any) => s + (i.sgstAmount || 0), 0)
    const outputIGST = (invoices || []).reduce((s: number, i: any) => s + (i.igstAmount || 0), 0)

    // ITC (Input Tax Credit) from purchase orders
    const inputGST = (pos || []).reduce((s: number, p: any) => s + (p.totalGst || 0), 0)
    const inputCGST = (pos || []).reduce((s: number, p: any) => s + (p.cgstAmount || 0), 0)
    const inputSGST = (pos || []).reduce((s: number, p: any) => s + (p.sgstAmount || 0), 0)
    const inputIGST = (pos || []).reduce((s: number, p: any) => s + (p.igstAmount || 0), 0)

    // Net GST payable — with statutory CROSS-UTILIZATION of credits
    // (Sec 49(5) + Rule 88A). Utilization order:
    //   IGST liability ← IGST credit, then CGST credit, then SGST credit
    //   CGST liability ← CGST credit, then IGST credit
    //   SGST liability ← SGST credit, then IGST credit
    // The old same-head-only math (netIGST = outIGST − inIGST) overstated
    // payable when e.g. intra-state purchases (CGST+SGST credit) offset an
    // inter-state sale (IGST liability) — E2E case: 1,57,338.48 IGST vs
    // 11,700+11,700 CGST/SGST credit → correct net = 1,33,938.48, not 1,57,338.
    let creditIgst = inputIGST, creditCgst = inputCGST, creditSgst = inputSGST

    // 1. IGST liability: IGST credit → CGST credit → SGST credit
    let liabIgst = Math.max(0, outputIGST)
    let use = Math.min(liabIgst, creditIgst); liabIgst -= use; creditIgst -= use
    use = Math.min(liabIgst, creditCgst); liabIgst -= use; creditCgst -= use
    use = Math.min(liabIgst, creditSgst); liabIgst -= use; creditSgst -= use

    // 2. CGST liability: CGST credit → IGST credit
    let liabCgst = Math.max(0, outputCGST)
    use = Math.min(liabCgst, creditCgst); liabCgst -= use; creditCgst -= use
    use = Math.min(liabCgst, creditIgst); liabCgst -= use; creditIgst -= use

    // 3. SGST liability: SGST credit → IGST credit
    let liabSgst = Math.max(0, outputSGST)
    use = Math.min(liabSgst, creditSgst); liabSgst -= use; creditSgst -= use
    use = Math.min(liabSgst, creditIgst); liabSgst -= use; creditIgst -= use

    const netIGST = liabIgst
    const netCGST = liabCgst
    const netSGST = liabSgst
    const totalNetPayable = netCGST + netSGST + netIGST

    return NextResponse.json({
      type: 'GSTR-3B',
      month: monthLabel,
      period: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
      outputGST: {
        totalTaxableSales: Math.round((invoices || []).reduce((s: number, i: any) => s + (i.taxableAmount || 0), 0)),
        outputCGST: Math.round(outputCGST),
        outputSGST: Math.round(outputSGST),
        outputIGST: Math.round(outputIGST),
        totalOutputGST: Math.round(outputGST),
        invoiceCount: (invoices || []).length,
      },
      inputTaxCredit: {
        totalPurchases: Math.round((pos || []).reduce((s: number, p: any) => s + (p.totalAmount || 0), 0)),
        inputCGST: Math.round(inputCGST),
        inputSGST: Math.round(inputSGST),
        inputIGST: Math.round(inputIGST),
        totalInputGST: Math.round(inputGST),
        poCount: (pos || []).length,
      },
      netPayable: {
        netCGST: Math.round(netCGST),
        netSGST: Math.round(netSGST),
        netIGST: Math.round(netIGST),
        totalNetPayable: Math.round(totalNetPayable),
        status: totalNetPayable > 0 ? 'GST Payable' : 'Refund/Carry Forward',
      },
    })
  } catch (error) {
    console.error('GST Returns API error:', error)
    return NextResponse.json({ error: 'Failed to generate GST return' }, { status: 500 })
  }
}
