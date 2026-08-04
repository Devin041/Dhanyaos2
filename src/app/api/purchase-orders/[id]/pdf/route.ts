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
    const { data: po, error } = await supabase
      .from('PurchaseOrder')
      .select()
      .eq('id', id)
      .single()

    if (error || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // Fetch supplier details
    let supplier: any = { name: '', supplierType: '', gstNumber: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: 15 }
    if (po.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('name, supplierType, gstNumber, contactPerson, phone, email, paymentTerms')
        .eq('id', po.supplierId)
        .single()
      if (s) supplier = s
    }

    // Items (if any — PurchaseOrder in schema has no items relation, but PDF template references them)
    const items: any[] = []

    // ─── Helpers ───
    const fmtINR = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

    const fmtDate = (d: string | null): string => {
      if (!d) return '—'
      const date = new Date(d)
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    // ─── Create PDF ───
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = 210 // A4 width in mm
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

    // Company name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...DARK)
    doc.text('DHANYA LIFESTYLE LLP', margin, y)
    y += 6

    // Tagline
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text('MANUFACTURING EXCELLENCE IN ETHNIC WEAR', margin, y)
    y += 5

    // Address
    doc.setFontSize(8)
    doc.setTextColor(85, 85, 85)
    doc.text('Surat, Gujarat, India', margin, y)

    // PO title (right side)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...DARK)
    doc.text('PURCHASE ORDER', pw - margin, margin, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Document for Supply of Goods', pw - margin, margin + 7, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(51, 51, 51)
    doc.text(po.poNumber, pw - margin, margin + 15, { align: 'right' })

    y = Math.max(y + 8, margin + 22)

    // Header divider
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pw - margin, y)
    y += 4

    // ═══════════════════════════════════════════════════════════════════════
    // SUPPLIER INFO
    // ═══════════════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('SUPPLIER INFORMATION', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 5

    const supplierInfo: [string, string][] = [
      ['Supplier Name', supplier.name || '—'],
      ['Type', supplier.supplierType || '—'],
    ]
    if (supplier.gstNumber) supplierInfo.push(['GST Number', supplier.gstNumber])
    if (supplier.contactPerson) supplierInfo.push(['Contact Person', supplier.contactPerson])
    if (supplier.phone) supplierInfo.push(['Phone', supplier.phone])
    if (supplier.email) supplierInfo.push(['Email', supplier.email])

    supplierInfo.forEach(([label, value]) => {
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

    // ═══════════════════════════════════════════════════════════════════════
    // ORDER INFO
    // ═══════════════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('ORDER INFORMATION', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 5

    const orderInfo: [string, string][] = [
      ['PO Number', po.poNumber],
      ['Order Date', fmtDate(po.createdAt)],
      ['Expected Delivery', fmtDate(po.expectedDelivery)],
      ['Payment Terms', `${supplier.paymentTerms || 15} Days`],
    ]

    orderInfo.forEach(([label, value]) => {
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

    // Status
    const statusColor: [number, number, number] =
      po.status === 'Received' ? [6, 95, 70] :
      po.status === 'Cancelled' ? [153, 27, 27] :
      po.status === 'Pending' ? [146, 64, 14] : [30, 64, 175]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Status', margin, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...statusColor)
    doc.text(po.status, pw - margin, y, { align: 'right' })
    y += 8

    // ═══════════════════════════════════════════════════════════════════════
    // ITEMS TABLE — simple PO-level item row
    // ═══════════════════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('ORDER DETAILS', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 4

    const tableBody: (string | number)[][] = [
      ['1', po.fabricName, String(po.quantity), po.unit || 'meters', fmtINR(po.ratePerUnit), fmtINR(po.totalAmount)],
    ]

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
      head: [['#', 'Fabric Name', 'Quantity', 'Unit', 'Rate', 'Total (₹)']],
      body: tableBody,
    })

    y = (doc as unknown as Record<string, number>).lastAutoTable.finalY + 8

    // ═══════════════════════════════════════════════════════════════════════
    // TOTALS
    // ═══════════════════════════════════════════════════════════════════════
    const totalsX = pw - margin - 75

    doc.setFillColor(248, 249, 250)
    doc.rect(totalsX - 4, y - 3.5, pw - margin - totalsX + 4, 8, 'F')
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.5)
    doc.line(totalsX - 4, y - 3.5, pw - margin, y - 3.5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text('Grand Total', totalsX, y)
    doc.text(fmtINR(po.totalAmount), pw - margin, y, { align: 'right' })
    y += 6

    // Paid / Balance
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRAY)
    doc.text('Paid Amount', totalsX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GREEN)
    doc.text(fmtINR(po.paidAmount), pw - margin, y, { align: 'right' })
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text('Balance Due', totalsX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(fmtINR(po.totalAmount - po.paidAmount), pw - margin, y, { align: 'right' })
    y += 10

    // Amount in words
    doc.setFillColor(248, 249, 250)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, contentW, 10, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...DARK)
    doc.text('Amount in Words:', margin + 4, y + 6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(`${numberToWords(Math.round(po.totalAmount))} Only`, margin + 38, y + 6.5)
    y += 14

    // ═══════════════════════════════════════════════════════════════════════
    // TERMS & CONDITIONS
    // ═══════════════════════════════════════════════════════════════════════
    if (y > 240) {
      doc.addPage()
      y = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('TERMS & CONDITIONS', margin, y)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5)
    y += 5

    const terms = [
      '1. Goods must be delivered as per the specifications mentioned above.',
      `2. Payment will be made within ${supplier.paymentTerms || 15} days from the date of delivery/invoice.`,
      '3. Payment due date will be calculated from the date of goods receipt.',
      '4. Any defective or damaged goods must be reported within 48 hours of delivery.',
      '5. This PO is valid for 30 days from the date of issue unless otherwise stated.',
      '6. GST as applicable will be charged as per the rates mentioned above.',
      '7. Subject to Surat, Gujarat jurisdiction.',
    ]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(85, 85, 85)
    terms.forEach((term) => {
      doc.text(term, margin, y, { maxWidth: contentW })
      y += 4.5
    })

    y += 6

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════════════════
    if (y > 250) {
      doc.addPage()
      y = margin
    }

    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pw - margin, y)
    y += 6

    // Signature lines
    doc.setDrawColor(51, 51, 51)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 14, margin + 60, y + 14)
    doc.line(pw - margin - 60, y + 14, pw - margin, y + 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(85, 85, 85)
    doc.text('Authorized Signatory', margin, y + 18, { width: 60, align: 'center' })
    doc.text('Dhanya Lifestyle LLP', margin, y + 23, { width: 60, align: 'center' })

    doc.text('Received By', pw - margin - 60, y + 18, { width: 60, align: 'center' })
    doc.text(supplier.name || '—', pw - margin - 60, y + 23, { width: 60, align: 'center' })

    // Computer generated note
    doc.setFontSize(6.5)
    doc.setTextColor(...LIGHT)
    const now = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    doc.text(`This is a computer-generated document.`, pw - margin, y + 4, { align: 'right' })
    doc.text(`Generated on ${now}`, pw - margin, y + 8, { align: 'right' })

    // Return PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${po.poNumber}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PO PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate PO PDF' }, { status: 500 })
  }
}

// ─── Number to Words (Indian numbering system) ──────────────────────────
function numberToWords(num: number): string {
  if (num === 0) return 'Zero'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertBelowThousand(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertBelowThousand(n % 100) : '')
  }

  if (num < 1000) return convertBelowThousand(num)

  const parts: string[] = []
  let remaining = num

  if (remaining >= 10000000) {
    parts.push(convertBelowThousand(Math.floor(remaining / 10000000)) + ' Crore')
    remaining %= 10000000
  }
  if (remaining >= 100000) {
    parts.push(convertBelowThousand(Math.floor(remaining / 100000)) + ' Lakh')
    remaining %= 100000
  }
  if (remaining >= 1000) {
    parts.push(convertBelowThousand(Math.floor(remaining / 1000)) + ' Thousand')
    remaining %= 1000
  }
  if (remaining > 0) {
    parts.push(convertBelowThousand(remaining))
  }

  return 'Rupees ' + parts.join(' ')
}
