import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /api/sample-catalogs/[id]/pdf ────────────────────────────────────────
// Auto-Fit Layout Engine — images appear exactly as they are

type RGB = [number, number, number]

const BRAND_DARK: RGB  = [18, 52, 28]
const GOLD: RGB         = [185, 155, 80]
const GOLD_LIGHT: RGB   = [210, 185, 120]
const BODY_TEXT: RGB    = [55, 55, 60]
const MUTED: RGB        = [140, 140, 145]

const PAGE_W = 210
const PAGE_H = 297

interface ImageData {
  base64Data: string
  format: string
  w: number
  h: number
  ratio: number
  styleNo: string
  styleName: string
  caption: string | null
}

function getImageSize(base64Str: string): { w: number; h: number } | null {
  const buf = Buffer.from(base64Str, 'base64')

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

function fitImage(imgW: number, imgH: number): { w: number; h: number; x: number; y: number } {
  const scale = Math.min(PAGE_W / imgW, PAGE_H / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return { w, h, x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2 }
}

function layoutEngine(images: ImageData[]): { x: number; y: number; w: number; h: number; imageData: ImageData }[] {
  return images.map(img => {
    const fit = fitImage(img.w, img.h)
    return { x: fit.x, y: fit.y, w: fit.w, h: fit.h, imageData: img }
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const { data: catalog } = await supabase
      .from('SampleCatalog')
      .select('*, customer:customerId(*)')
      .eq('id', id)
      .single()

    if (!catalog) {
      return NextResponse.json({ error: 'Catalog not found' }, { status: 404 })
    }

    // Fetch items with sample and photos
    const { data: items } = await supabase
      .from('SampleCatalogItem')
      .select('*')
      .eq('catalogId', id)
      .order('createdAt', { ascending: true })

    const { default: jsPDF } = await import('jspdf')

    // Parse image URL — supports both base64 data URIs and HTTP/HTTPS URLs (Cloudinary)
    async function resolveImageData(imageUrl: string): Promise<{ format: string; data: string; w: number; h: number } | null> {
      if (!imageUrl) return null

      // Case 1: base64 data URI
      const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/s)
      if (base64Match) {
        const format = base64Match[1].toUpperCase()
        const data = base64Match[2]
        const size = getImageSize(data)
        if (!size) return null
        return { format: format === 'PNG' ? 'PNG' : 'JPEG', data, ...size }
      }

      // Case 2: HTTP/HTTPS URL (Cloudinary, etc.)
      if (imageUrl.startsWith('http')) {
        try {
          const res = await fetch(imageUrl)
          if (!res.ok) return null
          const arrayBuf = await res.arrayBuffer()
          const imgBuf = Buffer.from(arrayBuf)
          const data = imgBuf.toString('base64')
          const ct = res.headers.get('content-type') || ''
          const format = ct.includes('png') ? 'PNG' : 'JPEG'
          const size = getImageSize(data)
          if (!size) return null
          return { format, data, ...size }
        } catch {
          return null
        }
      }

      return null
    }

    const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

    const images: ImageData[] = []

    for (const item of (items || [])) {
      const { data: sample } = await supabase
        .from('Sample')
        .select('*')
        .eq('id', item.sampleId)
        .single()

      if (!sample) continue

      const { data: photos } = await supabase
        .from('SamplePhoto')
        .select('*')
        .eq('sampleId', sample.id)
        .order('sortOrder', { ascending: true })

      if (!photos || photos.length === 0) continue

      for (const photo of photos) {
        const resolved = await resolveImageData(photo.imageUrl)
        if (!resolved) continue

        images.push({
          base64Data: resolved.data,
          format: resolved.format,
          w: resolved.w,
          h: resolved.h,
          ratio: resolved.w / resolved.h,
          styleNo: sample.styleNo,
          styleName: sample.styleName,
          caption: photo.caption,
        })
      }
    }

    const photoSlots = layoutEngine(images)
    const totalPages = 2 + photoSlots.length
    let pageCounter = 0

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // PAGE 1 — COVER PAGE
    pageCounter++

    doc.setFillColor(...BRAND_DARK)
    doc.rect(0, 0, PAGE_W, PAGE_H * 0.42, 'F')

    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1.2)
    doc.line(0, PAGE_H * 0.42, PAGE_W, PAGE_H * 0.42)
    doc.setLineWidth(0.3)
    doc.line(0, PAGE_H * 0.42 + 3, PAGE_W, PAGE_H * 0.42 + 3)

    let y = PAGE_H * 0.18
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(26)
    doc.setTextColor(255, 255, 255)
    doc.text('Dhanya Lifestyle LLP', PAGE_W / 2, y, { align: 'center' })

    const dotY = y + 10
    doc.setFillColor(...GOLD)
    doc.circle(PAGE_W / 2 - 12, dotY, 1.2, 'F')
    doc.circle(PAGE_W / 2, dotY, 1.2, 'F')
    doc.circle(PAGE_W / 2 + 12, dotY, 1.2, 'F')

    y = dotY + 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text('SAMPLE COLLECTION', PAGE_W / 2, y, { align: 'center' })

    y = PAGE_H * 0.42 + 30
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text('Prepared exclusively for', PAGE_W / 2, y, { align: 'center' })

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...BRAND_DARK)
    doc.text(catalog.customer?.companyName || '', PAGE_W / 2, y, { align: 'center' })

    y += 7
    if (catalog.customer?.buyerName) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...BODY_TEXT)
      doc.text(catalog.customer.buyerName, PAGE_W / 2, y, { align: 'center' })
      y += 6
    }

    y += 6
    doc.setDrawColor(...GOLD_LIGHT)
    doc.setLineWidth(0.3)
    doc.line(PAGE_W / 2 - 25, y, PAGE_W / 2 + 25, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    const sentDate = catalog.sentDate ? fmtDate(catalog.sentDate) : ''
    doc.text(`Catalog No: ${catalog.catalogNo}`, PAGE_W / 2, y, { align: 'center' })
    y += 5
    doc.text(`Date: ${sentDate}`, PAGE_W / 2, y, { align: 'center' })
    y += 5
    doc.text(`${images.length} ${images.length === 1 ? 'piece' : 'pieces'} in this collection`, PAGE_W / 2, y, { align: 'center' })

    // PHOTO PAGES
    for (const slot of photoSlots) {
      doc.addPage()
      pageCounter++

      try {
        doc.addImage(slot.imageData.base64Data, slot.imageData.format, slot.x, slot.y, slot.w, slot.h)
      } catch {
        doc.setFillColor(240, 240, 238)
        doc.rect(slot.x, slot.y, slot.w, slot.h, 'F')
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(...MUTED)
        doc.text('Photo', slot.x + slot.w / 2, slot.y + slot.h / 2, { align: 'center' })
      }

      const infoY = PAGE_H - 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(...MUTED)
      doc.text(`${slot.imageData.styleNo}  •  ${slot.imageData.styleName}`, PAGE_W / 2, infoY, { align: 'center' })
    }

    // LAST PAGE — Thank You
    doc.addPage()
    pageCounter++

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
    doc.text('for your interest in our collection', PAGE_W / 2, tyY + 9, { align: 'center' })

    const contactY = tyY + 28
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('Dhanya Lifestyle LLP', PAGE_W / 2, contactY, { align: 'center' })
    doc.text('Surat, Gujarat, India', PAGE_W / 2, contactY + 5, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...BRAND_DARK)
    doc.text('Dhanya Lifestyle LLP', PAGE_W / 2, PAGE_H * 0.3, { align: 'center' })

    // "by Dhanya Lifestyle" removed — only "Dhanya Lifestyle LLP" branding as requested

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="SAMPLE-${catalog.catalogNo}-${(catalog.customer?.companyName || '').replace(/\s+/g, '_')}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Sample Catalog PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate catalog PDF' }, { status: 500 })
  }
}
