import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /api/quotations/[id]/pdf ─────────────────────────────────────────
// Generates a professional client-facing quotation PDF

type RGB = [number, number, number]

const BRAND_DARK: RGB  = [18, 52, 28]
const GOLD: RGB         = [185, 155, 80]
const GOLD_LIGHT: RGB   = [210, 185, 120]
const BODY_TEXT: RGB    = [55, 55, 60]
const MUTED: RGB        = [140, 140, 145]
const GREEN: RGB        = [16, 185, 129]
const RED: RGB          = [239, 68, 68]

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15
const CONTENT_W = PAGE_W - MARGIN * 2

// ─── Helpers ───────────────────────────────────────────────────────────────

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

    let format: string
    let base64Data: string

    if (imageUrl.startsWith('http')) {
      const res = await fetch(imageUrl)
      if (!res.ok) return null
      const arrayBuf = await res.arrayBuffer()
      const imgBuf = Buffer.from(arrayBuf)
      base64Data = imgBuf.toString('base64')
      // Detect format from content-type header or buffer magic bytes
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('png')) {
        format = 'PNG'
      } else if (ct.includes('webp')) {
        format = 'WEBP'
      } else {
        format = 'JPEG'
      }
    } else {
      return null
    }

    return { base64Data, format }
  } catch {
    return null
  }
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Fetch quotation with customer and items
    const { data: quotation, error } = await supabase
      .from('Quotation')
      .select('*, customer:customerId(id, companyName, buyerName, phone, email)')
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Fetch quotation items
    const { data: rawItems, error: itemsError } = await supabase
      .from('QuotationItem')
      .select('*')
      .eq('quotationId', id)
      .order('createdAt', { ascending: true })

    if (itemsError) throw itemsError

    const items = rawItems || []

    // Fetch images for each item that has a sampleId
    const itemImages = new Map<string, ItemImageData | null>()

    for (const item of items) {
      if (!item.sampleId) {
        itemImages.set(item.id, null)
        continue
      }

      // Fetch first photo from SamplePhoto
      const { data: photos } = await supabase
        .from('SamplePhoto')
        .select('*')
        .eq('sampleId', item.sampleId)
        .order('sortOrder', { ascending: true })
        .limit(1)

      if (photos && photos.length > 0 && photos[0].imageUrl) {
        const imgData = await fetchItemImage(photos[0].imageUrl)
        itemImages.set(item.id, imgData)
      } else {
        itemImages.set(item.id, null)
      }
    }

    // ─── PDF Generation ─────────────────────────────────────────────────────

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER / HEADER SECTION
    // ═══════════════════════════════════════════════════════════════════════

    // Dark green header (top 40%)
    const headerH = PAGE_H * 0.40
    doc.setFillColor(...BRAND_DARK)
    doc.rect(0, 0, PAGE_W, headerH, 'F')

    // Gold line separator at bottom of header
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1.2)
    doc.line(0, headerH, PAGE_W, headerH)
    doc.setLineWidth(0.3)
    doc.line(0, headerH + 3, PAGE_W, headerH + 3)

    // Brand name
    let y = headerH * 0.38
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(255, 255, 255)
    doc.text('Elysé', PAGE_W / 2, y, { align: 'center' })

    // Subtitle
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

    // QUOTATION text
    y = dotY + 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text('QUOTATION', PAGE_W / 2, y, { align: 'center' })

    // Below header — customer info
    y = headerH + 22
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text('Prepared for', PAGE_W / 2, y, { align: 'center' })

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...BRAND_DARK)
    doc.text(quotation.customer?.companyName || '', PAGE_W / 2, y, { align: 'center' })

    y += 7
    if (quotation.customer?.buyerName) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...BODY_TEXT)
      doc.text(`Buyer: ${quotation.customer.buyerName}`, PAGE_W / 2, y, { align: 'center' })
      y += 6
    }

    if (quotation.brokerName) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...BODY_TEXT)
      doc.text(`Through: ${quotation.brokerName}`, PAGE_W / 2, y, { align: 'center' })
      y += 6
    }

    y += 4
    // Gold line separator
    doc.setDrawColor(...GOLD_LIGHT)
    doc.setLineWidth(0.3)
    doc.line(PAGE_W / 2 - 30, y, PAGE_W / 2 + 30, y)
    y += 8

    // Quotation details
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Quotation No: ${quotation.quotationNo}`, PAGE_W / 2, y, { align: 'center' })
    y += 5
    doc.text(`Date: ${fmtDate(quotation.quotationDate)}`, PAGE_W / 2, y, { align: 'center' })
    y += 5
    if (quotation.validUntil) {
      doc.text(`Valid Until: ${fmtDate(quotation.validUntil)}`, PAGE_W / 2, y, { align: 'center' })
      y += 5
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ITEMS SECTION
    // ═══════════════════════════════════════════════════════════════════════

    const MAX_IMG_SIZE = 60 // max 60mm x 60mm for photo
    const ITEM_HEIGHT = 38 // approximate height per item (35-40mm)
    const ITEM_GAP = 6
    const TOTAL_ITEM_BLOCK = ITEM_HEIGHT + ITEM_GAP
    const FOOTER_RESERVE = 30 // space needed for totals at bottom

    // Calculate subtotal and grand total
    const subtotal = items.reduce((sum, item) => sum + (item.totalAmount || 0), 0)
    const grandTotal = quotation.totalAmount || subtotal

    // Start items on page 1 if space allows, otherwise new page
    if (y + TOTAL_ITEM_BLOCK + FOOTER_RESERVE > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    } else {
      y += 6
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      // Check if we need a new page
      if (y + ITEM_HEIGHT > PAGE_H - MARGIN - FOOTER_RESERVE) {
        // But don't add a page for the last item if totals can fit
        const isLast = i === items.length - 1
        if (!isLast || y + ITEM_HEIGHT + 40 > PAGE_H - MARGIN) {
          doc.addPage()
          y = MARGIN
        }
      }

      // ─── Item block ───
      const itemStartY = y
      const imgData = itemImages.get(item.id) || null

      // Light background for the entire item row
      doc.setFillColor(252, 252, 250)
      doc.setDrawColor(235, 235, 230)
      doc.setLineWidth(0.3)
      doc.roundedRect(MARGIN, itemStartY, CONTENT_W, ITEM_HEIGHT, 2, 2, 'FD')

      // ─── Photo thumbnail (left side) ───
      const photoX = MARGIN + 3
      const photoY = itemStartY + 3
      const photoAvailable = imgData !== null

      if (photoAvailable && imgData) {
        try {
          // Detect actual image size from base64
          const buf = Buffer.from(imgData.base64Data, 'base64')
          const size = getImageSize(buf)

          if (size) {
            const ratio = size.w / size.h
            let drawW: number, drawH: number

            if (ratio >= 1) {
              // Landscape or square
              drawW = Math.min(MAX_IMG_SIZE, ITEM_HEIGHT - 6)
              drawH = drawW / ratio
              if (drawH > MAX_IMG_SIZE) {
                drawH = MAX_IMG_SIZE
                drawW = drawH * ratio
              }
            } else {
              // Portrait
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

      // ─── Right side: details ───
      const detailsX = MARGIN + MAX_IMG_SIZE + 10
      const detailsW = CONTENT_W - (MAX_IMG_SIZE + 10)
      let detailY = itemStartY + 7

      // Item number badge
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.setTextColor(...GOLD)
      doc.text(`#${String(i + 1).padStart(2, '0')}`, detailsX, detailY - 3)

      // Style Name
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...BRAND_DARK)
      const nameLines = doc.splitTextToSize(item.styleName || 'Unnamed Style', detailsW - 40)
      doc.text(nameLines[0], detailsX, detailY)
      detailY += nameLines.length > 1 ? 6 : 5

      // Pricing details in a compact row
      const unitPrice = item.unitPrice || 0
      const discount = item.itemDiscountPercent || 0
      const finalUnitPrice = discount > 0 ? unitPrice * (1 - discount / 100) : unitPrice
      const lineTotal = item.totalAmount || (item.quantity * finalUnitPrice)

      // Quantity
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...BODY_TEXT)
      doc.text(`Qty: `, detailsX, detailY)
      doc.setFont('helvetica', 'bold')
      doc.text(`${item.quantity}`, detailsX + doc.getTextWidth('Qty: '), detailY)

      // Unit Price
      const priceX = detailsX + 32
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(`Unit Price: `, priceX, detailY)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BODY_TEXT)
      doc.text(formatINR(unitPrice), priceX + doc.getTextWidth('Unit Price: '), detailY)
      detailY += 5

      // Discount and Final Unit Price on same line
      if (discount > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...MUTED)
        doc.text(`Discount: `, detailsX, detailY)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...RED)
        doc.text(`${discount}%`, detailsX + doc.getTextWidth('Discount: '), detailY)

        // Strikethrough on original price — show small
        const discX = detailsX + 32
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...MUTED)
        const origPriceStr = formatINR(unitPrice) + '/pc'
        const tw = doc.getTextWidth(origPriceStr)
        doc.text(origPriceStr, discX, detailY)
        doc.setDrawColor(...MUTED)
        doc.setLineWidth(0.25)
        doc.line(discX, detailY - 0.8, discX + tw, detailY - 0.8)

        // Final price
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...GREEN)
        doc.text(`  ${formatINR(finalUnitPrice)}/pc`, discX + tw + 2, detailY)
        detailY += 5
      }

      // Line Total — right-aligned, prominent
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...BRAND_DARK)
      doc.text('Line Total:', detailsX, detailY)
      doc.setFontSize(11)
      doc.text(formatINR(lineTotal), PAGE_W - MARGIN - 3, detailY, { align: 'right' })

      y = itemStartY + ITEM_HEIGHT + ITEM_GAP
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TOTALS SECTION
    // ═══════════════════════════════════════════════════════════════════════

    if (y + 30 > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }

    y += 4

    // Divider line
    doc.setDrawColor(...BRAND_DARK)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 6

    // Subtotal
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...BODY_TEXT)
    doc.text('Subtotal', PAGE_W - MARGIN - 50, y)
    doc.setFont('helvetica', 'bold')
    doc.text(formatINR(subtotal), PAGE_W - MARGIN - 3, y, { align: 'right' })
    y += 6

    // Grand Total — highlighted
    const totalBoxX = PAGE_W - MARGIN - 60
    const totalBoxW = 60
    doc.setFillColor(...BRAND_DARK)
    doc.roundedRect(totalBoxX, y - 3.5, totalBoxW, 10, 2, 2, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('Grand Total', totalBoxX + 4, y + 1.5)
    doc.setFontSize(11)
    doc.text(formatINR(grandTotal), PAGE_W - MARGIN - 4, y + 1.5, { align: 'right' })

    // ═══════════════════════════════════════════════════════════════════════
    // LAST PAGE — THANK YOU
    // ═══════════════════════════════════════════════════════════════════════
    doc.addPage()

    // Dark green bottom section
    const backDarkTop = PAGE_H * 0.55
    doc.setFillColor(...BRAND_DARK)
    doc.rect(0, backDarkTop, PAGE_W, PAGE_H - backDarkTop, 'F')

    // Gold lines
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1.2)
    doc.line(0, backDarkTop, PAGE_W, backDarkTop)
    doc.setLineWidth(0.3)
    doc.line(0, backDarkTop - 3, PAGE_W, backDarkTop - 3)

    // Gold decorative dots
    const backDotY = backDarkTop - 25
    doc.setFillColor(...GOLD)
    doc.circle(PAGE_W / 2 - 12, backDotY, 1.2, 'F')
    doc.circle(PAGE_W / 2, backDotY, 1.2, 'F')
    doc.circle(PAGE_W / 2 + 12, backDotY, 1.2, 'F')

    // Thank You text
    const tyY = backDarkTop + 35
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(255, 255, 255)
    doc.text('Thank You', PAGE_W / 2, tyY, { align: 'center' })

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...GOLD_LIGHT)
    doc.text('for your business', PAGE_W / 2, tyY + 9, { align: 'center' })

    // Company details in dark section
    const contactY = tyY + 28
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('Dhanya Lifestyle LLP', PAGE_W / 2, contactY, { align: 'center' })
    doc.text('Surat, Gujarat, India', PAGE_W / 2, contactY + 5, { align: 'center' })

    // Brand name in white area (top of page)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...BRAND_DARK)
    doc.text('Elysé', PAGE_W / 2, PAGE_H * 0.3, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GOLD)
    doc.text('by Dhanya Lifestyle', PAGE_W / 2, PAGE_H * 0.3 + 7, { align: 'center' })

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN PDF
    // ═══════════════════════════════════════════════════════════════════════

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="QUOTATION-${quotation.quotationNo}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Quotation PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate quotation PDF' }, { status: 500 })
  }
}

// ─── Draw placeholder box for missing images ───────────────────────────────

function drawPlaceholder(doc: any, x: number, y: number, w: number, h: number) {
  doc.setFillColor(240, 240, 238)
  doc.setDrawColor(220, 220, 215)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD')

  // Image icon placeholder
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(20)
  doc.setTextColor(200, 200, 195)
  doc.text('\u25A3', x + w / 2, y + h / 2 - 1, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(185, 185, 180)
  doc.text('No Photo', x + w / 2, y + h / 2 + 4, { align: 'center' })
}
