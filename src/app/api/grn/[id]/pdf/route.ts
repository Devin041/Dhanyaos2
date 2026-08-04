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
    const { data: grn, error } = await supabase
      .from('GrnNote')
      .select()
      .eq('id', id)
      .single()

    if (error || !grn) {
      return NextResponse.json({ error: 'GRN not found' }, { status: 404 })
    }

    // Fetch PO + supplier + items
    const [poRes, supplierRes, itemsRes] = await Promise.all([
      grn.poId
        ? supabase.from('PurchaseOrder').select('id, poNumber, fabricName').eq('id', grn.poId).single()
        : Promise.resolve({ data: null }),
      grn.supplierId
        ? supabase.from('Supplier').select('id, name, supplierType, gstNumber, contactPerson, phone, email').eq('id', grn.supplierId).single()
        : Promise.resolve({ data: null }),
      supabase.from('GrnItem').select('*').eq('grnId', id).order('createdAt', { ascending: true }),
    ])

    const po = poRes.data || null
    const supplier = supplierRes.data || { name: grn.supplierName, supplierType: '', gstNumber: '', contactPerson: '', phone: '', email: '' }
    const items = itemsRes.data || []

    // ─── Helpers ───
    const fmtINR = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

    const fmtDate = (d: string | null): string => {
      if (!d) return '—'
      const date = new Date(d)
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const fmtNum = (n: number) => n.toFixed(2)

    // ─── Create PDF ───
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = 210
    const margin = 15
    const contentW = pw - margin * 2
    let y = margin

    const DARK = [26, 26, 46] as [number, number, number]
    const GRAY = [102, 102, 102] as [number, number, number]
    const LIGHT = [153, 153, 153] as [number, number, number]
    const GREEN = [5, 150, 105] as [number, number, number]

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════════
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

    // GRN title (right side)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...DARK)
    doc.text('GOODS RECEIPT NOTE', pw - margin, margin, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Gate Entry & Quality Verification', pw - margin, margin + 7, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(51, 51, 51)
    doc.text(grn.grnNo, pw - margin, margin + 15, { align: 'right' })

    y = Math.max(y + 8, margin + 22)

    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pw - margin, y)
    y += 4

    // ═══════════════════════════════════════════════════════════════════════
    // SUPPLIER & PO INFO
    // ═══════════════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('SUPPLIER & ORDER INFORMATION', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 5

    const infoPairs: [string, string][] = [
      ['Supplier', supplier.name || grn.supplierName || '—'],
      ['PO Number', po?.poNumber || '—'],
      ['GRN Date', fmtDate(grn.receivedDate)],
    ]

    infoPairs.forEach(([label, value]) => {
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

    // Condition & QC Status — defaults
    const condition = 'Good'
    const gateQcStatus = 'Passed'
    const condColor: [number, number, number] = GREEN
    const qcColor: [number, number, number] = GREEN

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Condition', margin, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...condColor)
    doc.text(condition, pw - margin, y, { align: 'right' })
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Gate QC Status', margin, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...qcColor)
    doc.text(gateQcStatus, pw - margin, y, { align: 'right' })
    y += 5

    // GRN Status
    const statusColor: [number, number, number] =
      grn.status === 'Approved' ? GREEN :
      grn.status === 'Rejected' ? [153, 27, 27] :
      grn.status === 'Inspected' ? [30, 64, 175] :
      [146, 64, 14]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('GRN Status', margin, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...statusColor)
    doc.text(grn.status, pw - margin, y, { align: 'right' })
    y += 8

    if (grn.qualityRemarks) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...GRAY)
      doc.text(`QC Remarks: ${grn.qualityRemarks}`, margin, y)
      y += 6
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ITEMS TABLE
    // ═══════════════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('RECEIVED ITEMS', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 4

    const tableBody: (string | number)[][] = []
    let grandTotal = 0

    items.forEach((item: any, idx: number) => {
      grandTotal += item.totalValue || 0
      const varianceQty = (item.receivedQty || 0) - (item.orderedQty || 0)

      const varianceStr = varianceQty === 0
        ? '—'
        : varianceQty > 0
          ? `+${fmtNum(varianceQty)}`
          : fmtNum(varianceQty)

      tableBody.push([
        String(idx + 1),
        item.fabricName,
        '—',
        'meters',
        fmtNum(item.orderedQty || 0),
        fmtNum(item.receivedQty || 0),
        varianceStr,
        fmtNum(item.acceptedQty || 0),
        fmtNum(item.rejectedQty || 0),
        fmtINR(item.ratePerUnit || 0),
        fmtINR(item.totalValue || 0),
      ])
    })

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [248, 249, 250],
        textColor: [85, 85, 85],
        fontSize: 6,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: { top: 2.5, bottom: 2.5, left: 1.5, right: 1.5 },
      },
      bodyStyles: {
        fontSize: 6.5,
        textColor: DARK,
        cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
      },
      alternateRowStyles: {
        fillColor: [252, 252, 252],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 6 },
        1: { cellWidth: 24 },
        2: { cellWidth: 38, fontSize: 5.5 },
        3: { halign: 'center', cellWidth: 10 },
        4: { halign: 'right', cellWidth: 13 },
        5: { halign: 'right', cellWidth: 13 },
        6: { halign: 'right', cellWidth: 13 },
        7: { halign: 'right', cellWidth: 13 },
        8: { halign: 'right', cellWidth: 13 },
        9: { halign: 'right', cellWidth: 15 },
        10: { halign: 'right', fontStyle: 'bold', cellWidth: 17 },
      },
      head: [['#', 'Item', 'Colors', 'Unit', 'Ordered', 'Received', 'Variance', 'Accepted', 'Rejected', 'Rate', 'Value (₹)']],
      body: tableBody,
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 6) {
          const val = String(data.cell.raw)
          if (val.startsWith('+')) {
            data.cell.styles.textColor = [30, 64, 175]
          } else if (val.startsWith('-')) {
            data.cell.styles.textColor = [153, 27, 27]
          }
        }
      },
    })

    y = (doc as unknown as Record<string, number>).lastAutoTable.finalY + 8

    // ═══════════════════════════════════════════════════════════════════════
    // TOTALS
    // ═══════════════════════════════════════════════════════════════════════
    const totalsX = pw - margin - 65

    doc.setFillColor(248, 249, 250)
    doc.rect(totalsX - 4, y - 3.5, pw - margin - totalsX + 4, 8, 'F')
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.5)
    doc.line(totalsX - 4, y - 3.5, pw - margin, y - 3.5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text('Total Value', totalsX, y)
    doc.text(fmtINR(grandTotal), pw - margin, y, { align: 'right' })
    y += 14

    // ═══════════════════════════════════════════════════════════════════════
    // NOTES
    // ═══════════════════════════════════════════════════════════════════════
    if (grn.notes) {
      if (y > 250) { doc.addPage(); y = margin }
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
      const lines = doc.splitTextToSize(grn.notes, contentW)
      lines.forEach((line: string) => {
        doc.text(line, margin, y)
        y += 4
      })
      y += 6
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════════════════
    if (y > 255) { doc.addPage(); y = margin }

    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pw - margin, y)
    y += 6

    doc.setDrawColor(51, 51, 51)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 14, margin + 60, y + 14)
    doc.line(margin + 70, y + 14, margin + 130, y + 14)
    doc.line(pw - margin - 60, y + 14, pw - margin, y + 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(85, 85, 85)
    doc.text('Prepared By', margin, y + 18, { width: 60, align: 'center' })
    doc.text('Verified By', margin + 70, y + 18, { width: 60, align: 'center' })
    doc.text('Store Manager', pw - margin - 60, y + 18, { width: 60, align: 'center' })

    doc.setFontSize(6.5)
    doc.setTextColor(...LIGHT)
    const now = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    doc.text('This is a computer-generated document.', pw - margin, y + 4, { align: 'right' })
    doc.text(`Generated on ${now}`, pw - margin, y + 8, { align: 'right' })

    // Return PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${grn.grnNo}.pdf"`,
      },
    })
  } catch (error) {
    console.error('GRN PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate GRN PDF' }, { status: 500 })
  }
}
