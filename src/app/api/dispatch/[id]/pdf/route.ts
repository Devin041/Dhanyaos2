import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: dc, error } = await supabase
      .from('DeliveryChallan')
      .select('*, salesOrder:salesOrderId(*, customer:customerId(companyName,buyerName,gstNumber,phone,email,billingAddress,shippingAddress)), items:DeliveryChallanItem(*)')
      .eq('id', id)
      .single()

    if (error || !dc) {
      return NextResponse.json({ error: 'Delivery challan not found' }, { status: 404 })
    }

    // ─── Helpers ───
    const fmtINR = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

    const fmtDate = (d: string | null): string =>
      d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

    // ─── Create PDF ───
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = 210
    const margin = 15
    const contentW = pw - margin * 2
    let y = margin

    const DARK = [26, 26, 46] as [number, number, number]
    const GRAY = [102, 102, 102] as [number, number, number]
    const LIGHT = [153, 153, 153] as [number, number, number]
    const TEAL = [13, 148, 136] as [number, number, number]

    // ═══════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...DARK)
    doc.text('DHANYA LIFESTYLE LLP', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text('MANUFACTURING EXCELLENCE IN ETHNIC WEAR', margin, y)
    y += 5

    doc.setFontSize(8)
    doc.setTextColor(85, 85, 85)
    doc.text('Surat, Gujarat, India', margin, y)

    // DC title (right side)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...DARK)
    doc.text('DELIVERY CHALLAN', pw - margin, margin, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Dispatch of Finished Goods', pw - margin, margin + 7, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(51, 51, 51)
    doc.text(dc.challanNo, pw - margin, margin + 15, { align: 'right' })

    y = Math.max(y + 8, margin + 22)

    // Header divider
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pw - margin, y)
    y += 4

    // ═══════════════════════════════════════════════════════════════
    // CUSTOMER / SHIP-TO INFO (two columns)
    // ═══════════════════════════════════════════════════════════════
    const halfW = contentW / 2 - 5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('SHIP TO', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + halfW, y + 1.5)

    doc.text('CHALLAN DETAILS', margin + halfW + 10, y)
    doc.line(margin + halfW + 10, y + 1.5, pw - margin, y + 1.5)
    y += 5

    const customer = dc.salesOrder?.customer

    const leftInfo: [string, string][] = [
      ['Customer', customer?.companyName ?? '—'],
    ]
    if (customer?.buyerName) leftInfo.push(['Buyer', customer.buyerName])
    if (customer?.gstNumber) leftInfo.push(['GST Number', customer.gstNumber])
    if (customer?.shippingAddress) leftInfo.push(['Ship Address', customer.shippingAddress])
    else if (customer?.billingAddress) leftInfo.push(['Billing Address', customer.billingAddress])

    const rightInfo: [string, string][] = [
      ['DC Number', dc.challanNo],
      ['Sales Order', dc.salesOrder?.orderNo ?? '—'],
      ['Dispatch Date', fmtDate(dc.dispatchDate)],
      ['Dispatch Type', dc.dispatchType],
    ]

    const maxRows = Math.max(leftInfo.length, rightInfo.length)

    for (let i = 0; i < maxRows; i++) {
      if (leftInfo[i]) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...GRAY)
        doc.text(leftInfo[i][0], margin, y)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...DARK)
        const valLines = doc.splitTextToSize(leftInfo[i][1], halfW - 28)
        doc.text(valLines[0], margin + halfW, y, { align: 'right' })
      }
      if (rightInfo[i]) {
        const rx = margin + halfW + 10
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...GRAY)
        doc.text(rightInfo[i][0], rx, y)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...DARK)
        doc.text(rightInfo[i][1], pw - margin, y, { align: 'right' })
      }

      doc.setDrawColor(230, 230, 230)
      doc.setLineDashPattern([1.5, 1.5], 0)
      doc.line(margin, y + 2, pw - margin, y + 2)
      doc.setLineDashPattern([], 0)
      y += 4.5
    }

    // Status
    const statusColor: [number, number, number] =
      dc.status === 'Delivered' ? [6, 95, 70] :
      dc.status === 'Cancelled' ? [153, 27, 27] :
      dc.status === 'In Transit' ? [30, 64, 175] :
      [146, 64, 14]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Status', margin, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...statusColor)
    doc.text(dc.status, margin + halfW, y, { align: 'right' })
    y += 8

    // ═══════════════════════════════════════════════════════════════
    // ITEMS TABLE
    // ═══════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('DISPATCH ITEMS', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 4

    const tableBody: (string | number)[][] = []
    ;(dc.items ?? []).forEach((item: any, idx: number) => {
      tableBody.push([
        String(idx + 1),
        item.styleName,
        String(item.orderedQty),
        String(item.previouslySent),
        String(item.dispatchedQty),
        fmtINR(item.ratePerUnit),
        fmtINR(item.amount),
      ])
    })

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [248, 249, 250],
        textColor: [85, 85, 85],
        fontSize: 6.5,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: DARK,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 48 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
      },
      head: [['#', 'Style', 'Ordered', 'Previously Sent', 'This Dispatch', 'Rate/Unit', 'Amount (₹)']],
      body: tableBody,
    })

    y = (doc as unknown as Record<string, number>).lastAutoTable.finalY + 6

    // ═══════════════════════════════════════════════════════════════
    // TOTALS
    // ═══════════════════════════════════════════════════════════════
    const totalsX = pw - margin - 75

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text('Total Items', totalsX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(String(dc.totalItems), pw - margin, y, { align: 'right' })
    y += 5.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text('Total Quantity', totalsX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(String(dc.totalQty), pw - margin, y, { align: 'right' })
    y += 5.5

    // Grand total highlighted
    doc.setFillColor(248, 249, 250)
    doc.rect(totalsX - 4, y - 3.5, pw - margin - totalsX + 4, 8, 'F')
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.5)
    doc.line(totalsX - 4, y - 3.5, pw - margin, y - 3.5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text('Total Amount', totalsX, y)
    doc.text(fmtINR(dc.totalAmount), pw - margin, y, { align: 'right' })
    y += 10

    // ═══════════════════════════════════════════════════════════════
    // TRANSPORT INFO
    // ═══════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('TRANSPORT INFORMATION', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 5

    const transportInfo: [string, string][] = [
      ['Transporter', dc.transporterName || '—'],
      ['LR / Consignment No', dc.lrNumber || '—'],
      ['Vehicle Number', dc.vehicleNumber || '—'],
      ['Driver Name', dc.driverName || '—'],
      ['Driver Phone', dc.driverPhone || '—'],
    ]

    transportInfo.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text(label, margin, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      doc.text(value, pw - margin, y, { align: 'right' })
      doc.setDrawColor(230, 230, 230)
      doc.setLineDashPattern([1.5, 1.5], 0)
      doc.line(margin, y + 2, pw - margin, y + 2)
      doc.setLineDashPattern([], 0)
      y += 4.5
    })
    y += 3

    // ═══════════════════════════════════════════════════════════════
    // E-WAY BILL INFO
    // ═══════════════════════════════════════════════════════════════
    if (dc.eWayBillNo) {
      if (y > 235) { doc.addPage(); y = margin }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...LIGHT)
      doc.text('E-WAY BILL', margin, y)
      doc.setDrawColor(220, 220, 220)
      doc.setLineWidth(0.3)
      doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
      y += 5

      const ewayInfo: [string, string][] = [
        ['E-Way Bill No', dc.eWayBillNo],
        ['E-Way Bill Expiry', fmtDate(dc.eWayBillExpiry)],
      ]

      ewayInfo.forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...GRAY)
        doc.text(label, margin, y)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...TEAL)
        doc.text(value, pw - margin, y, { align: 'right' })
        doc.setDrawColor(230, 230, 230)
        doc.setLineDashPattern([1.5, 1.5], 0)
        doc.line(margin, y + 2, pw - margin, y + 2)
        doc.setLineDashPattern([], 0)
        y += 4.5
      })
      y += 3
    }

    // ═══════════════════════════════════════════════════════════════
    // NOTES
    // ═══════════════════════════════════════════════════════════════
    if (dc.notes) {
      if (y > 245) { doc.addPage(); y = margin }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...LIGHT)
      doc.text('NOTES', margin, y)
      doc.setDrawColor(220, 220, 220)
      doc.setLineWidth(0.3)
      doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
      y += 5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(85, 85, 85)
      const lines = doc.splitTextToSize(dc.notes, contentW)
      lines.forEach((line: string) => {
        doc.text(line, margin, y)
        y += 4
      })
      y += 4
    }

    // ═══════════════════════════════════════════════════════════════
    // FOOTER + SIGNATURES
    // ═══════════════════════════════════════════════════════════════
    if (y > 250) { doc.addPage(); y = margin }

    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pw - margin, y)
    y += 6

    // Signature lines
    doc.setDrawColor(51, 51, 51)
    doc.setLineWidth(0.3)
    const sigW = 55
    const sigGap = (contentW - sigW * 3) / 2

    doc.line(margin, y + 14, margin + sigW, y + 14)
    doc.line(margin + sigW + sigGap, y + 14, margin + sigW * 2 + sigGap, y + 14)
    doc.line(pw - margin - sigW, y + 14, pw - margin, y + 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(85, 85, 85)
    doc.text('Prepared By', margin, y + 18, { width: sigW, align: 'center' })
    doc.text('Authorized Signatory', margin + sigW + sigGap, y + 18, { width: sigW, align: 'center' })
    doc.text('Received By', pw - margin - sigW, y + 18, { width: sigW, align: 'center' })

    doc.text('Dhanya Lifestyle LLP', margin + sigW + sigGap, y + 23, { width: sigW, align: 'center' })
    doc.text(customer?.companyName ?? '', pw - margin - sigW, y + 23, { width: sigW, align: 'center' })

    // Computer generated note
    doc.setFontSize(6.5)
    doc.setTextColor(...LIGHT)
    const now = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    doc.text('This is a computer-generated document.', pw - margin, y + 4, { align: 'right' })
    doc.text(`Generated on ${now}`, pw - margin, y + 8, { align: 'right' })

    // Return PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${dc.challanNo}.pdf"`,
      },
    })
  } catch (error) {
    console.error('DC PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate Delivery Challan PDF' }, { status: 500 })
  }
}
