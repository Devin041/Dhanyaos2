import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, generateColorCode, withComputedFields } from '@/lib/fg-color-code'

// ─── POST /api/fg-stock/return-qc ──────────────────────────────────────────
// Called when a customer return is processed to add stock back as QC Pending.
// Body: { items: [{ styleNo, styleName, color, size, quantity, referenceNo, partyName, reason }] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'items array is required' },
        { status: 400 },
      )
    }

    if (items.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 items per return batch' },
        { status: 400 },
      )
    }

    const processed: Array<{
      styleNo: string
      color: string
      size: string
      success: boolean
      binId?: string
      addedQty?: number
      colorCode?: string
      error?: string
    }> = []

    for (const item of items) {
      const { styleNo, styleName, color, size, quantity, referenceNo, partyName, reason } = item

      if (!styleNo || !color || !size || !quantity) {
        processed.push({
          styleNo: styleNo || 'unknown',
          color: color || 'unknown',
          size: size || 'unknown',
          success: false,
          error: 'Missing required fields (styleNo, color, size, quantity)',
        })
        continue
      }

      if (quantity <= 0) {
        processed.push({
          styleNo,
          color,
          size,
          success: false,
          error: 'Quantity must be positive',
        })
        continue
      }

      // Find or create bin
      const { data: existingBin } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('styleNo', styleNo)
        .eq('color', color)
        .eq('size', size)
        .limit(1)
        .single()

      let bin = existingBin
      if (!bin) {
        const colorCode = await generateColorCode(styleNo, color)
        const { data: newBin, error: createErr } = await supabase
          .from('FGStockBin')
          .insert({
            styleNo,
            styleName: styleName || styleNo,
            colorCode,
            color,
            size,
            lastMovementDate: new Date().toISOString(),
          })
          .select()
          .single()
        if (createErr) {
          processed.push({ styleNo, color, size, success: false, error: createErr.message })
          continue
        }
        bin = newBin
      }

      // Add quantity to qcPendingQty
      const prevQc = bin.qcPendingQty
      const newQc = prevQc + quantity

      const { error: updErr } = await supabase
        .from('FGStockBin')
        .update({
          qcPendingQty: newQc,
          lastMovementDate: new Date().toISOString(),
        })
        .eq('id', bin.id)
      if (updErr) {
        processed.push({ styleNo, color, size, success: false, error: updErr.message })
        continue
      }

      // Create movement record
      const mvtNo = generateMovementNo()
      const { error: mvtErr } = await supabase.from('FGStockMovement').insert({
        movementNo: mvtNo,
        movementType: 'Return',
        fgStockBinId: bin.id,
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        quantity,
        previousQty: prevQc,
        newQty: newQc,
        unitCost: bin.unitCost,
        fromStatus: null,
        toStatus: 'QCPending',
        referenceType: 'Return',
        referenceNo: referenceNo || null,
        partyName: partyName || null,
        reason: reason || 'Customer return',
        movedBy: 'System',
      })
      if (mvtErr) {
        processed.push({ styleNo, color, size, success: false, error: mvtErr.message })
        continue
      }

      processed.push({
        styleNo,
        color,
        size,
        success: true,
        binId: bin.id,
        addedQty: quantity,
        colorCode: bin.colorCode,
      })
    }

    const successResults = processed.filter((r) => r.success)

    return NextResponse.json({
      results: processed,
      successCount: successResults.length,
      errorCount: processed.length - successResults.length,
    })
  } catch (error: any) {
    console.error('[FG-Stock Return QC POST]', error)
    return NextResponse.json(
      { error: error.message || 'Return QC processing failed' },
      { status: 500 },
    )
  }
}
