import { NextRequest, NextResponse } from 'next/server'

// ─── POST /api/sample-catalogs/negotiation-pdf ───────────────────────
// Generates a client-facing negotiation PDF

type RGB = [number, number, number]

const BRAND_DARK: RGB  = [18, 52, 28]
const GOLD: RGB         = [185, 155, 80]
const GOLD_LIGHT: RGB   = [210, 185, 120]
const BODY_TEXT: RGB    = [55, 55, 60]
const MUTED: RGB        = [140, 140, 145]
const GREEN: RGB        = [16, 185, 129]

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15
const CONTENT_W = PAGE_W - MARGIN * 2

// ─── Helpers ───────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

function getImageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  if (buf.length > 10 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2
    while (i < buf.length - 8) {
      if (buf[i] === 0xFF) {
        const marker = buf[i + 1]
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
        }
        const segLen = buf.readUInt16BE(i + 2)
        i += 2 + segLen
      } else {
        i++
      }
    }
  }
  return null
}

interface ItemImageData {
  base64Data: string
  format: string
}

async function fetchItemImage(imageUrl: string): Promise<ItemImageData | null> {
  try {
    if (!imageUrl) return null
    if (!imageUrl.startsWith('http')) return null

    const res = await fetch(imageUrl)
    if (!res.ok) return null
    const arrayBuf = await res.arrayBuffer()
    const imgBuf = Buffer.from(arrayBuf)
    const base64Data = imgBuf.toString('base64')

    const ct = res.headers.get('content-type') || ''
    let format: string
    if (ct.includes('png')) {
      format = 'PNG'
    } else if (ct.includes('webp')) {
      format = 'WEBP'
    } else {
      format = 'JPEG'
    }

    return { base64Data, format }
  } catch {
    return null
  }
}

function drawPlaceholder(doc: any, x: number, y: number, w: number, h: number) {
  doc.setFillColor(240, 240, 238)
  doc.setDrawColor(220, 220, 215)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(20)
  doc.setTextColor(200, 200, 195)
  doc.text('\u25A3', x + w / 2, y + h / 2 - 1, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(185, 185, 180)
  doc.text('No Photo', x + w / 2, y + h / 2 + 4, { align: 'center' })
}

// ─── Types ───────────────────────────────────────────────────────

interface PdfItem {
  styleNo: string
  styleName: string
  firstPhotoUrl: string | null
  sellingPrice: number
  discountPercent: number
  finalPrice: number
}

interface PdfRequestBody {
  items: PdfItem[]
  brokerName: string
  customerName: string
  generatedAt: string
  summary: {
    totalFinal: number
  }
}

// ─── Route Handler ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: PdfRequestBody = await req.json()
    const { items, brokerName, customerName, generatedAt, summary } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    // Fetch images for all items
    const itemImages: (ItemImageData | null)[] = []
    for (const item of items) {
      const imgData = await fetchItemImage(item.firstPhotoUrl || '')
      itemImages.push(imgData)
    }

    // ─── PDF Generation ───────────────────────────────────────

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // ═══════════════════════════════════════════════════════
    // PAGE 1 — HEADER
    // ═══════════════════════════════════════════════════════

    const headerH = PAGE_H * 0.32
    doc.setFillColor(...BRAND_DARK)
    doc.rect(0, 0, PAGE_W, headerH, 'F')

    // Gold line separator
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1.2)
    doc.line(0, headerH, PAGE_W, headerH)
    doc.setLineWidth(0.3)
    doc.line(0, headerH + 3, PAGE_W, headerH + 3)

    // Brand name
    let y = headerH * 0.35
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(255, 255, 255)
    doc.text('Elysé', PAGE_W / 2, y, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...GOLD)
    doc.text('by Dhanya Lifestyle', PAGE_W / 2, y + 8, { align: 'center' })

    // Gold decorative dots
    const dotY = y + 16
    doc.setFillColor(...GOLD)
    doc.circle(PAGE_W / 2 - 12, dotY, 1.2, 'F')
    doc.circle(PAGE_W / 2, dotY, 1.2, 'F')
    doc.circle(PAGE_W / 2 + 12, dotY, 1.2, 'F')

    // PRODUCT LIST text
    y = dotY + 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text('PRODUCT LIST', PAGE_W / 2, y, { align: 'center' })

    // Below header — customer info
    y = headerH + 20
    if (customerName) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text('Prepared for', PAGE_W / 2, y, { align: 'center' })
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(...BRAND_DARK)
      doc.text(customerName, PAGE_W / 2, y, { align: 'center' })
      y += 6
    }

    if (brokerName) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...BODY_TEXT)
      doc.text(`Through: ${brokerName}`, PAGE_W / 2, y, { align: 'center' })
      y += 6
    }

    // Gold line separator
    doc.setDrawColor(...GOLD_LIGHT)
    doc.setLineWidth(0.3)
    doc.line(PAGE_W / 2 - 30, y, PAGE_W / 2 + 30, y)
    y += 6

    // Date
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Date: ${fmtDate(generatedAt)}`, PAGE_W / 2, y, { align: 'center' })
    y += 8

    // ═══════════════════════════════════════════════════════
    // ITEMS SECTION
    // ═══════════════════════════════════════════════════════

    const MAX_IMG_SIZE = 50
    const ITEM_HEIGHT = 32
    const ITEM_GAP = 5
    const FOOTER_RESERVE = 35

    // Check if we need new page
    if (y + ITEM_HEIGHT + FOOTER_RESERVE > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const isLast = i === items.length - 1

      if (y + ITEM_HEIGHT > PAGE_H - MARGIN - FOOTER_RESERVE) {
        if (!isLast || y + ITEM_HEIGHT + 40 > PAGE_H - MARGIN) {
          doc.addPage()
          y = MARGIN
        }
      }

      const itemStartY = y
      const imgData = itemImages[i] || null

      // Light background
      doc.setFillColor(252, 252, 250)
      doc.setDrawColor(235, 235, 230)
      doc.setLineWidth(0.3)
      doc.roundedRect(MARGIN, itemStartY, CONTENT_W, ITEM_HEIGHT, 2, 2, 'FD')

      // Photo thumbnail
      const photoX = MARGIN + 3
      const photoY = itemStartY + 3

      if (imgData) {
        try {
          const buf = Buffer.from(imgData.base64Data, 'base64')
          const size = getImageSize(buf)

          if (size) {
            const ratio = size.w / size.h
            let drawW: number, drawH: number

            if (ratio >= 1) {
              drawW = Math.min(MAX_IMG_SIZE, ITEM_HEIGHT - 6)
              drawH = drawW / ratio
              if (drawH > MAX_IMG_SIZE) {
                drawH = MAX_IMG_SIZE
                drawW = drawH * ratio
              }
            } else {
              drawH = Math.min(MAX_IMG_SIZE, ITEM_HEIGHT - 6)
              drawW = drawH * ratio
              if (drawW > MAX_IMG_SIZE) {
                drawW = MAX_IMG_SIZE
                drawH = drawW / ratio
              }
            }

            const imgPosX = photoX + (MAX_IMG_SIZE - drawW) / 2
            const imgPosY = photoY + (ITEM_HEIGHT - 6 - drawH) / 2

            doc.addImage(imgData.base64Data, imgData.format, imgPosX, imgPosY, drawW, drawH)
          } else {
            drawPlaceholder(doc, photoX, photoY, MAX_IMG_SIZE, ITEM_HEIGHT - 6)
          }
        } catch {
          drawPlaceholder(doc, photoX, photoY, MAX_IMG_SIZE, ITEM_HEIGHT - 6)
        }
      } else {
        drawPlaceholder(doc, photoX, photoY, MAX_IMG_SIZE, ITEM_HEIGHT - 6)
      }

      // Details on the right
      const detailsX = MARGIN + MAX_IMG_SIZE + 10
      const detailsW = CONTENT_W - (MAX_IMG_SIZE + 10)
      let detailY = itemStartY + 6

      // Item number
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.setTextColor(...GOLD)
      doc.text(`#${String(i + 1).padStart(2, '0')}`, detailsX, detailY - 2)

      // Style Name
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...BRAND_DARK)
      doc.text(item.styleName || 'Unnamed Style', detailsX, detailY)
      detailY += 5

      // Style No
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(item.styleNo, detailsX, detailY)
      detailY += 5

      // Selling Price
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...BODY_TEXT)
      doc.text('Price: ', detailsX, detailY)
      doc.setFont('helvetica', 'bold')
      doc.text(formatINR(item.sellingPrice), detailsX + doc.getTextWidth('Price: '), detailY)

      // Discount
      if (item.discountPercent > 0) {
        const priceX = detailsX + 40
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...MUTED)
        doc.text('Discount: ', priceX, detailY)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(239, 68, 68)
        doc.text(`${item.discountPercent}%`, priceX + doc.getTextWidth('Discount: '), detailY)
      }
      detailY += 5

      // Final Price — right-aligned, prominent
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...BRAND_DARK)
      doc.text('Final Price:', detailsX, detailY)
      doc.setFontSize(11)
      doc.setTextColor(...GREEN)
      doc.text(formatINR(item.finalPrice), PAGE_W - MARGIN - 3, detailY, { align: 'right' })

      y = itemStartY + ITEM_HEIGHT + ITEM_GAP
    }

    // ═══════════════════════════════════════════════════════
    // TOTALS
    // ═══════════════════════════════════════════════════════

    if (y + 30 > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }

    y += 4

    // Divider
    doc.setDrawColor(...BRAND_DARK)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 8

    // Grand Total
    const totalBoxX = PAGE_W - MARGIN - 65
    const totalBoxW = 65
    doc.setFillColor(...BRAND_DARK)
    doc.roundedRect(totalBoxX, y - 4, totalBoxW, 12, 2, 2, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('Total', totalBoxX + 5, y + 2)
    doc.setFontSize(12)
    doc.text(formatINR(summary.totalFinal || 0), PAGE_W - MARGIN - 4, y + 2, { align: 'right' })

    // ═══════════════════════════════════════════════════════
    // LAST PAGE — THANK YOU
    // ═══════════════════════════════════════════════════════
    doc.addPage()

    const backDarkTop = PAGE_H * 0.55
    doc.setFillColor(...BRAND_DARK)
    doc.rect(0, backDarkTop, PAGE_W, PAGE_H - backDarkTop, 'F')

    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1.2)
    doc.line(0, backDarkTop, PAGE_W, backDarkTop)
    doc.setLineWidth(0.3)
    doc.line(0, backDarkTop - 3, PAGE_W, backDarkTop - 3)

    const backDotY = backDarkTop - 25
    doc.setFillColor(...GOLD)
    doc.circle(PAGE_W / 2 - 12, backDotY, 1.2, 'F')
    doc.circle(PAGE_W / 2, backDotY, 1.2, 'F')
    doc.circle(PAGE_W / 2 + 12, backDotY, 1.2, 'F')

    const tyY = backDarkTop + 35
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(255, 255, 255)
    doc.text('Thank You', PAGE_W / 2, tyY, { align: 'center' })

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...GOLD_LIGHT)
    doc.text('for your business', PAGE_W / 2, tyY + 9, { align: 'center' })

    const contactY = tyY + 28
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('Dhanya Lifestyle LLP', PAGE_W / 2, contactY, { align: 'center' })
    doc.text('Surat, Gujarat, India', PAGE_W / 2, contactY + 5, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...BRAND_DARK)
    doc.text('Elysé', PAGE_W / 2, PAGE_H * 0.3, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GOLD)
    doc.text('by Dhanya Lifestyle', PAGE_W / 2, PAGE_H * 0.3 + 7, { align: 'center' })

    // ─── RETURN PDF ───

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Negotiation-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Negotiation PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate negotiation PDF' }, { status: 500 })
  }
}
