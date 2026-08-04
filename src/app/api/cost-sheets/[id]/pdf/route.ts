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
    const { data: raw, error: fetchErr } = await supabase
      .from('CostSheet')
      .select('*, customer:customerId(companyName, buyerName, gstNumber, phone, email, billingAddress), CostItem(*), CostSheetColor(*)')
      .eq('id', id)
      .single()

    if (!raw || fetchErr) return NextResponse.json({ error: 'Cost Sheet not found' }, { status: 404 })

    const costSheet = { ...raw } as any
    if (costSheet.CostItem) costSheet.CostItem.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (costSheet.CostSheetColor) costSheet.CostSheetColor.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    costSheet.costItems = costSheet.CostItem || []
    costSheet.colorBreakdown = costSheet.CostSheetColor || []
    delete costSheet.CostItem
    delete costSheet.CostSheetColor

    const fmtINR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
    const fmtDate = (d: string | null): string => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    const fmtNum = (n: number) => n.toFixed(2)

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = 210, margin = 15, contentW = pw - margin * 2
    let y = margin

    const DARK = [26, 26, 46] as [number, number, number]
    const GRAY = [102, 102, 102] as [number, number, number]
    const LIGHT = [153, 153, 153] as [number, number, number]
    const GREEN = [5, 150, 105] as [number, number, number]

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...DARK); doc.text('DHANYA LIFESTYLE LLP', margin, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY); doc.text('MANUFACTURING EXCELLENCE IN ETHNIC WEAR', margin, y); y += 5
    doc.setFontSize(8); doc.setTextColor(85, 85, 85); doc.text('Surat, Gujarat, India', margin, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...DARK); doc.text('COST SHEET', pw - margin, margin, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text('Product Costing Analysis', pw - margin, margin + 7, { align: 'right' })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(51, 51, 51); doc.text(costSheet.sheetNo, pw - margin, margin + 15, { align: 'right' })
    y = Math.max(y + 8, margin + 22)
    doc.setDrawColor(...DARK); doc.setLineWidth(0.8); doc.line(margin, y, pw - margin, y); y += 4

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...LIGHT); doc.text('STYLE & ORDER INFORMATION', margin, y)
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(margin, y + 1.5, margin + contentW, y + 1.5); y += 5
    const buyerName = costSheet.customer ? (costSheet.customer.buyerName || costSheet.customer.companyName) : '—'
    const infoPairs: [string, string][] = [
      ['Style No', costSheet.styleNo], ['Style Name', costSheet.styleName], ['Buyer', buyerName], ['Date', fmtDate(costSheet.createdAt)],
    ]
    if (costSheet.description) infoPairs.push(['Description', costSheet.description])
    if (costSheet.sizeRange) infoPairs.push(['Size Range', costSheet.sizeRange])
    if (costSheet.targetQty > 0) infoPairs.push(['Target Qty', String(costSheet.targetQty) + ' pcs'])
    infoPairs.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text(label, margin, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(value, pw - margin, y, { align: 'right' })
      doc.setDrawColor(230, 230, 230); doc.setLineDashPattern([1.5, 1.5], 0); doc.line(margin, y + 2, pw - margin, y + 2); doc.setLineDashPattern([], 0); y += 4.5
    })
    const statusColor: [number, number, number] = costSheet.status === 'Approved' ? GREEN : costSheet.status === 'Draft' ? [146, 64, 14] : costSheet.status === 'Rejected' ? [153, 27, 27] : GRAY
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text('Status', margin, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor); doc.text(costSheet.status, pw - margin, y, { align: 'right' }); y += 8

    if (costSheet.colorBreakdown.length > 0) {
      if (y > 230) { doc.addPage(); y = margin }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...LIGHT); doc.text('COLOR BREAKDOWN', margin, y)
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(margin, y + 1.5, margin + contentW, y + 1.5); y += 4
      const colorBody = costSheet.colorBreakdown.map((cb: any, idx: number) => [String(idx + 1), cb.color, String(cb.quantity)])
      autoTable(doc, { startY: y, margin: { left: margin, right: margin }, theme: 'grid', headStyles: { fillColor: [248, 249, 250], textColor: [85, 85, 85], fontSize: 6, fontStyle: 'bold', halign: 'left', cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 } }, bodyStyles: { fontSize: 7, textColor: DARK, cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 } }, alternateRowStyles: { fillColor: [252, 252, 252] }, columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 50 }, 2: { halign: 'right', cellWidth: 30 } }, head: [['#', 'Color', 'Quantity']], body: colorBody })
      y = (doc as unknown as Record<string, number>).lastAutoTable.finalY + 8
    }

    if (y > 220) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...LIGHT); doc.text('COST BREAKDOWN', margin, y)
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(margin, y + 1.5, margin + contentW, y + 1.5); y += 4
    const tableBody: (string | number)[][] = []
    costSheet.costItems.forEach((item: any, idx: number) => { tableBody.push([String(idx + 1), item.category, item.itemName, item.description || '', fmtNum(item.consumption), item.unit, fmtINR(item.unitRate), fmtNum(item.wastagePercent) + '%', fmtINR(item.itemCost)]) })
    autoTable(doc, { startY: y, margin: { left: margin, right: margin }, theme: 'grid', headStyles: { fillColor: [248, 249, 250], textColor: [85, 85, 85], fontSize: 6, fontStyle: 'bold', halign: 'left', cellPadding: { top: 2.5, bottom: 2.5, left: 1.5, right: 1.5 } }, bodyStyles: { fontSize: 6.5, textColor: DARK, cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 } }, alternateRowStyles: { fillColor: [252, 252, 252] }, columnStyles: { 0: { halign: 'center', cellWidth: 6 }, 1: { cellWidth: 22 }, 2: { cellWidth: 30 }, 3: { cellWidth: 28, fontSize: 5.5 }, 4: { halign: 'right', cellWidth: 14 }, 5: { halign: 'center', cellWidth: 10 }, 6: { halign: 'right', cellWidth: 18 }, 7: { halign: 'center', cellWidth: 12 }, 8: { halign: 'right', fontStyle: 'bold', cellWidth: 22 } }, head: [['#', 'Category', 'Item', 'Description', 'Consumption', 'Unit', 'Rate', 'Wastage', 'Cost (₹)']], body: tableBody })
    y = (doc as unknown as Record<string, number>).lastAutoTable.finalY + 8

    if (y > 210) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...LIGHT); doc.text('COST SUMMARY', margin, y)
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(margin, y + 1.5, margin + contentW, y + 1.5); y += 5
    const costSummary: [string, number][] = [['Fabric Cost', costSheet.fabricCost], ['Trim Cost', costSheet.trimCost], ['Labor Cost', costSheet.laborCost], ['Wash Cost', costSheet.washCost], ['Packaging Cost', costSheet.packagingCost], ['Overhead Cost', costSheet.overheadCost], ['Other Cost', costSheet.otherCost]]
    costSummary.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text(label, margin, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(fmtINR(value), pw - margin, y, { align: 'right' })
      doc.setDrawColor(230, 230, 230); doc.setLineDashPattern([1.5, 1.5], 0); doc.line(margin, y + 2, pw - margin, y + 2); doc.setLineDashPattern([], 0); y += 4.5
    })
    y += 1; const totalsX = pw - margin - 65
    doc.setFillColor(248, 249, 250); doc.rect(totalsX - 4, y - 3.5, pw - margin - totalsX + 4, 8, 'F')
    doc.setDrawColor(...DARK); doc.setLineWidth(0.5); doc.line(totalsX - 4, y - 3.5, pw - margin, y - 3.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DARK); doc.text('Total Cost', totalsX, y); doc.text(fmtINR(costSheet.totalCost), pw - margin, y, { align: 'right' }); y += 10

    if (y > 210) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...LIGHT); doc.text('PROFIT ANALYSIS', margin, y)
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(margin, y + 1.5, margin + contentW, y + 1.5); y += 5
    const profitLines: [string, string][] = [['Total Cost', fmtINR(costSheet.totalCost)], ['Profit Margin', costSheet.profitPercent.toFixed(1) + '%']]
    profitLines.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text(label, margin, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(value, pw - margin, y, { align: 'right' })
      doc.setDrawColor(230, 230, 230); doc.setLineDashPattern([1.5, 1.5], 0); doc.line(margin, y + 2, pw - margin, y + 2); doc.setLineDashPattern([], 0); y += 4.5
    })
    y += 1
    doc.setFillColor(240, 253, 244); doc.rect(margin, y - 3.5, contentW, 8, 'F')
    doc.setDrawColor(...GREEN); doc.setLineWidth(0.5); doc.line(margin, y - 3.5, pw - margin, y - 3.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...GREEN); doc.text('Selling Price (per piece)', margin + 2, y); doc.text(fmtINR(costSheet.sellingPrice), pw - margin, y, { align: 'right' }); y += 10

    if (costSheet.brokerCommissionPercent > 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text('Broker Commission', margin, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(`${costSheet.brokerCommissionPercent.toFixed(1)}% = ${fmtINR(costSheet.brokerCommissionAmount)}`, pw - margin, y, { align: 'right' })
      doc.setDrawColor(230, 230, 230); doc.setLineDashPattern([1.5, 1.5], 0); doc.line(margin, y + 2, pw - margin, y + 2); doc.setLineDashPattern([], 0); y += 4.5
    }
    if (costSheet.brokerCommissionPercent > 0) {
      const netSelling = costSheet.sellingPrice - costSheet.brokerCommissionAmount
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text('Net Selling Price (after commission)', margin, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(fmtINR(netSelling), pw - margin, y, { align: 'right' }); y += 6
    }

    if (costSheet.notes) {
      if (y > 250) { doc.addPage(); y = margin }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...LIGHT); doc.text('NOTES', margin, y)
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(margin, y + 1.5, margin + contentW, y + 1.5); y += 5
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(85, 85, 85)
      const lines = doc.splitTextToSize(costSheet.notes, contentW)
      lines.forEach((line: string) => { doc.text(line, margin, y); y += 4 }); y += 6
    }

    if (y > 255) { doc.addPage(); y = margin }
    doc.setDrawColor(...DARK); doc.setLineWidth(0.8); doc.line(margin, y, pw - margin, y); y += 6
    doc.setDrawColor(51, 51, 51); doc.setLineWidth(0.3)
    doc.line(margin, y + 14, margin + 60, y + 14); doc.line(margin + 70, y + 14, margin + 130, y + 14); doc.line(pw - margin - 60, y + 14, pw - margin, y + 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(85, 85, 85)
    doc.text('Prepared By', margin, y + 18, { width: 60, align: 'center' }); doc.text('Costing Dept', margin + 70, y + 18, { width: 60, align: 'center' }); doc.text('Approved By', pw - margin - 60, y + 18, { width: 60, align: 'center' })
    doc.setFontSize(6.5); doc.setTextColor(...LIGHT)
    const nowStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    doc.text('This is a computer-generated document.', pw - margin, y + 4, { align: 'right' })
    doc.text(`Generated on ${nowStr}`, pw - margin, y + 8, { align: 'right' })

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${costSheet.sheetNo}.pdf"` } })
  } catch (error) {
    console.error('Cost Sheet PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate Cost Sheet PDF' }, { status: 500 })
  }
}
