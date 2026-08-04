import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, generateColorCode, withComputedFields } from '@/lib/fg-color-code'

// ─── POST: Batch movements (e.g., GRN approval) ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { movements, generateColorCodes, referenceType, referenceId, referenceNo, movedBy } = body

    if (!Array.isArray(movements) || movements.length === 0) {
      return NextResponse.json({ error: 'movements array is required' }, { status: 400 })
    }
    if (movements.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 movements per batch' }, { status: 400 })
    }

    const processed: any[] = []

    for (const mvt of movements) {
      const {
        styleNo, styleName, color, size, quantity,
        movementType = 'Inward', colorCode: providedColorCode,
        unitCost, unitSellPrice, image,
        reason,
      } = mvt

      if (!styleNo || !color || !size || !quantity) {
        processed.push({ error: 'Missing required fields', movement: mvt })
        continue
      }

      const mvtNo = generateMovementNo()

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
        const code = generateColorCodes
          ? await generateColorCode(styleNo, color)
          : providedColorCode || await generateColorCode(styleNo, color)

        const { data: newBin, error: createErr } = await supabase
          .from('FGStockBin')
          .insert({
            styleNo,
            styleName: styleName || styleNo,
            colorCode: code,
            color,
            size,
            unitCost: unitCost || 0,
            unitSellPrice: unitSellPrice || 0,
            image: image || null,
            firstInDate: new Date().toISOString(),
            lastMovementDate: new Date().toISOString(),
          })
          .select()
          .single()
        if (createErr) {
          processed.push({ error: createErr.message, movement: mvt })
          continue
        }
        bin = newBin
      }

      // Apply movement based on type
      let prevQty = 0
      let newQty = 0
      const binUpdate: any = { lastMovementDate: new Date().toISOString() }

      switch (movementType) {
        case 'Inward':
          prevQty = bin.availableQty
          newQty = prevQty + quantity
          binUpdate.availableQty = newQty
          break
        case 'Outward':
          if (bin.availableQty < quantity) {
            processed.push({ error: `Insufficient stock (${bin.availableQty} < ${quantity})`, movement: mvt })
            continue
          }
          prevQty = bin.availableQty
          newQty = prevQty - quantity
          binUpdate.availableQty = newQty
          break
        case 'Return':
          prevQty = bin.qcPendingQty
          newQty = prevQty + quantity
          binUpdate.qcPendingQty = newQty
          break
        default:
          prevQty = bin.availableQty
          newQty = prevQty + quantity
          binUpdate.availableQty = newQty
      }

      const { data: updatedBin, error: updErr } = await supabase
        .from('FGStockBin')
        .update(binUpdate)
        .eq('id', bin.id)
        .select()
        .single()
      if (updErr) {
        processed.push({ error: updErr.message, movement: mvt })
        continue
      }

      const { data: movement, error: mvtErr } = await supabase
        .from('FGStockMovement')
        .insert({
          movementNo: mvtNo,
          movementType,
          fgStockBinId: bin.id,
          styleNo: bin.styleNo,
          styleName: bin.styleName,
          colorCode: bin.colorCode,
          color: bin.color,
          size: bin.size,
          quantity,
          previousQty: prevQty,
          newQty,
          unitCost: bin.unitCost,
          referenceType: referenceType || null,
          referenceId: referenceId || null,
          referenceNo: referenceNo || null,
          reason: reason || null,
          movedBy: movedBy || 'System',
        })
        .select()
        .single()
      if (mvtErr) {
        processed.push({ error: mvtErr.message, movement: mvt })
        continue
      }

      processed.push({
        success: true,
        movement,
        bin: withComputedFields(updatedBin),
      })
    }

    const successCount = processed.filter(r => r.success).length
    const errorCount = processed.filter(r => r.error).length

    return NextResponse.json({
      results: processed,
      summary: { total: movements.length, success: successCount, errors: errorCount },
    })
  } catch (error: any) {
    console.error('[FG-Stock BulkMovement POST]', error)
    return NextResponse.json({ error: error.message || 'Bulk movement failed' }, { status: 500 })
  }
}
