import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateGrnNo, generateColorCode, generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── GET: List FG GRN notes ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.trim()
    const styleNo = searchParams.get('styleNo')?.trim()
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Build query
    let query = supabase.from('FGGrnNote').select('*', { count: 'exact' })
    if (status) query = query.eq('status', status)
    if (styleNo) query = query.eq('styleNo', styleNo)
    if (search) {
      query = query.or(`grnNo.ilike.%${search}%,styleNo.ilike.%${search}%,styleName.ilike.%${search}%,sourceName.ilike.%${search}%`)
    }
    query = query.order('createdAt', { ascending: false }).range(from, to)

    const { data: grns, error, count } = await query
    if (error) throw error

    // Fetch items for each GRN
    const grnIds = (grns || []).map((g: any) => g.id)
    let items: any[] = []
    if (grnIds.length > 0) {
      const { data: grnItems } = await supabase
        .from('FGGrnItem')
        .select('*')
        .in('fgGrnNoteId', grnIds)
        .order('createdAt', { ascending: true })
      items = grnItems || []
    }

    // Attach items to grns
    const grnsWithItems = (grns || []).map((g: any) => ({
      ...g,
      items: items.filter((i: any) => i.fgGrnNoteId === g.id),
    }))

    const total = count || 0

    return NextResponse.json({
      grns: grnsWithItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('[FG-GRN GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch GRN notes' }, { status: 500 })
  }
}

// ─── POST: Create FG GRN with items ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sourceType, sourceId, sourceNo, sourceName,
      styleNo, styleName, image: bodyImage, status = 'Draft',
      unitCost = 0, unitSellPrice = 0,
      notes, items, generateColorCodes = true,
    } = body

    if (!styleNo || !styleName || !sourceName) {
      return NextResponse.json({ error: 'styleNo, styleName, sourceName are required' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }

    const grnNo = generateGrnNo()

    // Generate colorCodes — same color across sizes gets same code
    const colorCodeCache: Record<string, string> = {}
    const processedItems = await Promise.all(
      items.map(async (item: any) => {
        let colorCode: string
        if (colorCodeCache[item.color]) {
          colorCode = colorCodeCache[item.color]
        } else {
          colorCode = generateColorCodes
            ? await generateColorCode(styleNo, item.color)
            : item.colorCode || ''
          colorCodeCache[item.color] = colorCode
        }
        return {
          ...item,
          colorCode,
          totalValue: (item.acceptedQty || item.receivedQty || 0) * (item.unitCost || unitCost),
        }
      })
    )

    const totalReceived = processedItems.reduce((s: number, i: any) => s + (i.receivedQty || 0), 0)
    const totalAccepted = processedItems.reduce((s: number, i: any) => s + (i.acceptedQty || 0), 0)
    const totalRejected = processedItems.reduce((s: number, i: any) => s + (i.rejectedQty || 0), 0)

    // Create GRN note
    const { data: grn, error: grnErr } = await supabase
      .from('FGGrnNote')
      .insert({
        grnNo,
        sourceType: sourceType || 'Vendor',
        sourceId: sourceId || null,
        sourceNo: sourceNo || null,
        sourceName,
        styleNo,
        styleName,
        image: bodyImage || null,
        status,
        totalReceivedQty: totalAccepted,
        totalAcceptedQty: totalAccepted,
        totalRejectedQty: totalRejected,
        unitCost,
        unitSellPrice,
        notes: notes || null,
      })
      .select()
      .single()
    if (grnErr) throw grnErr

    // Create GRN items
    if (processedItems.length > 0) {
      const itemsToInsert = processedItems.map((item: any) => ({
        fgGrnNoteId: grn.id,
        color: item.color,
        size: item.size,
        colorCode: item.colorCode,
        receivedQty: item.receivedQty || 0,
        acceptedQty: item.acceptedQty || 0,
        rejectedQty: item.rejectedQty || 0,
        defectNotes: item.defectNotes || null,
        unitCost: item.unitCost || unitCost,
        totalValue: item.totalValue,
      }))
      const { error: itemsErr } = await supabase.from('FGGrnItem').insert(itemsToInsert)
      if (itemsErr) throw itemsErr
    }

    // If not Draft, also create stock bins + movements
    let stockResults: any[] = []
    if (status !== 'Draft') {
      for (const item of processedItems) {
        const qty = item.acceptedQty || item.receivedQty || 0
        if (qty <= 0) continue

        // Find or create bin
        const { data: existingBin } = await supabase
          .from('FGStockBin')
          .select('*')
          .eq('styleNo', styleNo)
          .eq('color', item.color)
          .eq('size', item.size)
          .limit(1)
          .single()

        let bin = existingBin
        if (!bin) {
          const { data: newBin, error: createErr } = await supabase
            .from('FGStockBin')
            .insert({
              styleNo,
              styleName,
              colorCode: item.colorCode,
              color: item.color,
              size: item.size,
              availableQty: qty,
              unitCost: item.unitCost || unitCost,
              unitSellPrice: unitSellPrice,
              image: bodyImage || null,
              firstInDate: new Date().toISOString(),
              lastMovementDate: new Date().toISOString(),
            })
            .select()
            .single()
          if (createErr) throw createErr
          bin = newBin
        } else {
          const prevQty = bin.availableQty
          const { data: updatedBin, error: updErr } = await supabase
            .from('FGStockBin')
            .update({
              availableQty: prevQty + qty,
              lastMovementDate: new Date().toISOString(),
              unitCost: item.unitCost || unitCost || bin.unitCost,
            })
            .eq('id', bin.id)
            .select()
            .single()
          if (updErr) throw updErr
          bin = updatedBin
        }

        const prevQty = bin.availableQty - qty
        await supabase.from('FGStockMovement').insert({
          movementNo: generateMovementNo(),
          movementType: 'Inward',
          fgStockBinId: bin.id,
          styleNo,
          styleName,
          colorCode: bin.colorCode,
          color: bin.color,
          size: bin.size,
          quantity: qty,
          previousQty: prevQty,
          newQty: bin.availableQty,
          unitCost: bin.unitCost,
          referenceType: 'FGGrnNote',
          referenceId: grn.id,
          referenceNo: grnNo,
          movedBy: 'System',
        })

        stockResults.push(withComputedFields(bin))
      }
    }

    // Auto-resolve image from Sample if not provided
    if (!bodyImage || bodyImage === '') {
      const { data: samples } = await supabase
        .from('Sample')
        .select('id')
        .eq('styleNo', styleNo)
        .limit(1)

      if (samples && samples.length > 0) {
        const { data: photos } = await supabase
          .from('SamplePhoto')
          .select('imageUrl')
          .eq('sampleId', samples[0].id)
          .order('sortOrder', { ascending: true })
          .limit(1)
        if (photos && photos.length > 0 && photos[0].imageUrl) {
          const resolvedImage = photos[0].imageUrl
          await supabase.from('FGGrnNote').update({ image: resolvedImage }).eq('id', grn.id)
          // Also update any bins created in this GRN that have null image
          for (const stockBin of stockResults) {
            if (!stockBin.image) {
              await supabase.from('FGStockBin').update({ image: resolvedImage }).eq('id', stockBin.id)
            }
          }
        }
      }
    }

    return NextResponse.json({ grn: { ...grn, items: processedItems }, stockResults }, { status: 201 })
  } catch (error: any) {
    console.error('[FG-GRN POST]', error)
    return NextResponse.json({ error: error.message || 'Failed to create GRN' }, { status: 500 })
  }
}
