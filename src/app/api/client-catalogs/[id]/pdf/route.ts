import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'

// ─── GET /api/client-catalogs/[id]/pdf ────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: catalog } = await supabase
      .from('ClientCatalog')
      .select('*, customer:customerId(companyName, buyerName, phone, email, billingAddress), broker:brokerId(name)')
      .eq('id', id)
      .single()

    if (!catalog) {
      return NextResponse.json({ error: 'Catalog not found' }, { status: 404 })
    }

    // Fetch items with costSheet, costItems, colorBreakdown
    const { data: catalogItems } = await supabase
      .from('ClientCatalogItem')
      .select('*')
      .eq('catalogId', id)
      .order('createdAt', { ascending: true })

    // Enrich items with costSheet details
    const items = await Promise.all((catalogItems || []).map(async (item) => {
      const { data: costSheet } = await supabase
        .from('CostSheet')
        .select('*')
        .eq('id', item.costSheetId)
        .single()

      let costItems: any[] = []
      let colorBreakdown: any[] = []

      if (costSheet) {
        const { data: ci } = await supabase
          .from('CostItem')
          .select('*')
          .eq('costSheetId', costSheet.id)
          .order('createdAt', { ascending: true })
        costItems = ci || []

        const { data: cb } = await supabase
          .from('CostSheetColor')
          .select('*')
          .eq('costSheetId', costSheet.id)
          .order('createdAt', { ascending: true })
        colorBreakdown = cb || []
      }

      return {
        ...item,
        costSheet: costSheet ? { ...costSheet, costItems, colorBreakdown } : null,
      }
    }))

    // ─── Helpers ─────────────────────────────────────────────────────────────
    const fmtINR = (n: number) =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(n)

    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })

    const isFabricItem = (category: string) =>
      /fabric|lining/i.test(category)

    function cleanFabricName(fi: { itemName: string; description: string | null }): string {
      let name = fi.itemName.trim()
      if (fi.description) {
        name += ` — ${fi.description.trim()}`
      }
      return name
    }

    // ─── PDF Setup ───────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = 210
    const ph = 297
    const m = 15
    const contentW = pw - m * 2

    const colGap = 8
    const leftColW = 100
    const rightColW = contentW - leftColW - colGap
    const leftX = m
    const rightX = m + leftColW + colGap

    const imgW = rightColW
    const imgH = 95

    const footerY = ph - 22

    let y = 0

    // ─── Color palette ───────────────────────────────────────────────────────
    const DARK = [25, 25, 45] as [number, number, number]
    const BODY = [50, 50, 60] as [number, number, number]
    const MUTED = [140, 140, 150] as [number, number, number]
    const ACCENT = [0, 128, 90] as [number, number, number]
    const GOLD = [180, 140, 60] as [number, number, number]
    const DIVIDER = [230, 230, 235] as [number, number, number]
    const CARD_BG = [250, 250, 252] as [number, number, number]

    function roundedRect(x: number, yy: number, w: number, h: number, r: number, style: 'S' | 'F' | 'FD', fillColor?: [number, number, number]) {
      if (style === 'F' || style === 'FD') {
        doc.setFillColor(...(fillColor || CARD_BG))
        doc.roundedRect(x, yy, w, h, r, r, 'F')
      }
      if (style === 'S' || style === 'FD') {
        doc.setDrawColor(...DIVIDER)
        doc.setLineWidth(0.3)
        doc.roundedRect(x, yy, w, h, r, r, 'S')
      }
    }

    function colDivider(topY: number, bottomY: number) {
      const divX = rightX - colGap / 2
      doc.setDrawColor(...DIVIDER)
      doc.setLineWidth(0.2)
      doc.setLineDashPattern([], 0)
      doc.line(divX, topY, divX, bottomY)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — LETTERHEAD HEADER
    // ═══════════════════════════════════════════════════════════════════════════
    y = m

    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.8)
    doc.line(m, y, pw - m, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...DARK)
    doc.text('DHANYA LIFESTYLE LLP', leftX, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text('Manufacturing Excellence in Ethnic Wear', leftX, y + 5.5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...DARK)
    doc.text('CATALOG', pw - m, y + 1, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(catalog.catalogNo, pw - m, y + 7, { align: 'right' })
    doc.text(fmtDate(catalog.date), pw - m, y + 12, { align: 'right' })

    y += 18

    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.6)
    doc.line(m, y, pw - m, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...BODY)

    let clientLine = `Prepared for: ${catalog.customer?.companyName || ''}`
    if (catalog.customer?.buyerName) clientLine += `  ·  ${catalog.customer.buyerName}`
    if (catalog.customer?.phone) clientLine += `  ·  ${catalog.customer.phone}`
    doc.text(clientLine, leftX, y)

    y += 3.5
    doc.setDrawColor(...DIVIDER)
    doc.setLineWidth(0.2)
    doc.line(m, y, pw - m, y)
    y += 8

    // ═══════════════════════════════════════════════════════════════════════════
    // PER-DESIGN SECTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    const totalItems = items.length

    for (let i = 0; i < totalItems; i++) {
      const item = items[i]
      const cs = item.costSheet
      if (!cs) continue

      if (y + 105 > footerY) {
        doc.addPage()
        y = m
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(...MUTED)
      doc.text(`— Design ${i + 1} of ${totalItems} —`, leftX, y)
      y += 6

      const sectionStartY = y

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...GOLD)
      doc.text(cs.styleNo, leftX, y)
      y += 5.5

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.setTextColor(...DARK)
      doc.text(cs.styleName, leftX, y)
      y += 8

      if (cs.description) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...BODY)
        const descLines = doc.splitTextToSize(cs.description, leftColW - 2)
        doc.text(descLines, leftX, y)
        y += descLines.length * 3.8 + 2
      }

      const fabricItems = (cs.costItems || []).filter((ci: { category: string }) => isFabricItem(ci.category))

      if (fabricItems.length > 0) {
        y += 2

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...MUTED)
        doc.text('FABRIC', leftX, y)
        doc.setDrawColor(...DIVIDER)
        doc.setLineWidth(0.2)
        doc.line(leftX, y + 1, leftX + 20, y + 1)
        y += 5

        fabricItems.forEach((fi: { itemName: string; description: string | null }) => {
          const name = cleanFabricName(fi)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8.5)
          doc.setTextColor(...BODY)
          doc.text(`›  ${name}`, leftX + 3, y)
          y += 4.5
        })

        y += 2
      }

      if ((cs.colorBreakdown || []).length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...MUTED)
        doc.text('AVAILABLE IN', leftX, y)
        doc.setDrawColor(...DIVIDER)
        doc.setLineWidth(0.2)
        doc.line(leftX, y + 1, leftX + 28, y + 1)
        y += 5

        const colorNames = cs.colorBreakdown.map((cb: { color: string }) => cb.color)
        const colorLine = colorNames.join('  ·  ')

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...BODY)

        if (doc.getTextWidth(colorLine) <= leftColW - 4) {
          doc.text(colorLine, leftX + 3, y)
          y += 5
        } else {
          const wrapped = doc.splitTextToSize(colorLine, leftColW - 4)
          doc.text(wrapped, leftX + 3, y)
          y += wrapped.length * 4 + 1
        }

        y += 2
      }

      if (cs.sizeRange) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...MUTED)
        doc.text(`Sizes: ${cs.sizeRange}`, leftX, y)
        y += 5
      }

      const discount = item.discountPercent
      const sellingPrice = cs.sellingPrice
      const discountedPrice = discount > 0 ? sellingPrice * (1 - discount / 100) : sellingPrice

      y += 3

      if (discount > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...MUTED)
        const origPriceStr = fmtINR(sellingPrice) + '/piece'
        doc.text(origPriceStr, leftX, y)
        const tw = doc.getTextWidth(origPriceStr)
        doc.setDrawColor(...MUTED)
        doc.setLineWidth(0.3)
        doc.line(leftX, y - 0.8, leftX + tw, y - 0.8)
        y += 6.5
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(...ACCENT)
      doc.text(`${fmtINR(discountedPrice)}/piece`, leftX, y)
      y += 6.5

      if (discount > 0) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        doc.setTextColor(...GOLD)
        doc.text(`${discount}% special discount applied`, leftX, y)
      } else {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        doc.setTextColor(...MUTED)
        doc.text('standard catalogue rate', leftX, y)
      }

      const detailEndY = y

      // RIGHT COLUMN: Photo
      const photoY = sectionStartY - 2

      if (cs.image) {
        try {
          const matches = cs.image.match(/^data:(image\/\w+);base64,(.+)$/)
          if (matches && matches[2]) {
            const format = matches[1].replace('image/', '').toUpperCase() as 'JPEG' | 'PNG' | 'WEBP'
            const imgData = matches[2]

            roundedRect(rightX, photoY, imgW, imgH, 3, 'F', [245, 245, 248])

            const inset = 2
            doc.addImage(imgData, format, rightX + inset, photoY + inset, imgW - inset * 2, imgH - inset * 2)

            doc.setDrawColor(...DIVIDER)
            doc.setLineWidth(0.4)
            doc.roundedRect(rightX, photoY, imgW, imgH, 3, 3, 'S')
          } else {
            roundedRect(rightX, photoY, imgW, imgH, 3, 'FD', [245, 245, 248])
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(8)
            doc.setTextColor(...MUTED)
            doc.text('No Image', rightX + imgW / 2, photoY + imgH / 2, { align: 'center' })
          }
        } catch {
          roundedRect(rightX, photoY, imgW, imgH, 3, 'FD', [245, 245, 248])
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(8)
          doc.setTextColor(...MUTED)
          doc.text('No Image', rightX + imgW / 2, photoY + imgH / 2, { align: 'center' })
        }
      } else {
        roundedRect(rightX, photoY, imgW, imgH, 3, 'FD', [245, 245, 248])
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(...MUTED)
        doc.text('No Image', rightX + imgW / 2, photoY + imgH / 2, { align: 'center' })
      }

      const divTop = sectionStartY - 2
      const divBottom = Math.max(detailEndY, photoY + imgH) + 2
      colDivider(divTop, divBottom)

      y = Math.max(detailEndY, photoY + imgH) + 10

      if (i < totalItems - 1) {
        if (y > footerY - 5) {
          doc.addPage()
          y = m
        }

        const sepLen = 40
        const sepX = pw / 2 - sepLen / 2
        doc.setDrawColor(...GOLD)
        doc.setLineWidth(0.3)
        doc.setLineDashPattern([1, 2.5], 0)
        doc.line(sepX, y, sepX + sepLen, y)
        doc.setLineDashPattern([], 0)
        y += 10
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════════════════════
    if (y > footerY - 15) {
      doc.addPage()
      y = m
    }

    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.5)
    doc.line(m, y, pw - m, y)
    y += 6

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.5)
    doc.setTextColor(...MUTED)
    doc.text(
      `This catalogue is prepared exclusively for ${catalog.customer?.companyName || ''}.`,
      pw / 2, y, { align: 'center' }
    )
    y += 4

    doc.setFont('helvetica', 'normal')
    doc.text(
      'Prices are valid for 30 days from the date of issue.',
      pw / 2, y, { align: 'center' }
    )
    y += 5

    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.5)
    doc.line(pw / 2 - 15, y, pw / 2 + 15, y)
    y += 5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...DARK)
    doc.text(
      'DHANYA LIFESTYLE LLP  ·  Surat, Gujarat, India',
      pw / 2, y, { align: 'center' }
    )

    const totalPages = doc.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...MUTED)
      doc.text(`${p} / ${totalPages}`, pw / 2, ph - 8, { align: 'center' })
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="CATALOG-${catalog.catalogNo}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Client Catalog PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate catalog PDF' },
      { status: 500 }
    )
  }
}
