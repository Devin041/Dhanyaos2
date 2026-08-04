import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── POST /api/fg-stock/dispatch-deduct ────────────────────────────────────
// Called when a dispatch is created to deduct FG stock.
// Body: { items: [{ styleNo, color, size, quantity, referenceNo, partyName }] }
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
        { error: 'Maximum 100 items per dispatch deduction' },
        { status: 400 },
      )
    }

    const processed: Array<{
      styleNo: string
      color: string
      size: string
      success: boolean
      binId?: string
      deductedQty?: number
      error?: string
    }> = []

    for (const item of items) {
      const { styleNo, color, size, quantity, referenceNo, partyName } = item

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

      // Find the stock bin
      const { data: bin, error: binErr } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('styleNo', styleNo)
        .eq('color', color)
        .eq('size', size)
        .limit(1)
        .single()

      if (binErr || !bin) {
        processed.push({
          styleNo,
          color,
          size,
          success: false,
          error: `Stock bin not found for ${styleNo}/${color}/${size}`,
        })
        continue
      }

      // Check available stock (availableQty + reservedQty for dispatch)
      const totalDeductible = bin.availableQty + bin.reservedQty
      if (totalDeductible < quantity) {
        processed.push({
          styleNo,
          color,
          size,
          success: false,
          binId: bin.id,
          deductedQty: 0,
          error: `Insufficient stock. Available: ${bin.availableQty}, Reserved: ${bin.reservedQty}, Requested: ${quantity}`,
        })
        continue
      }

      // Deduct: first from availableQty, then from reservedQty if needed
      let fromAvailable = Math.min(bin.availableQty, quantity)
      let fromReserved = quantity - fromAvailable

      const binUpdate: any = { lastMovementDate: new Date().toISOString() }
      binUpdate.availableQty = bin.availableQty - fromAvailable
      binUpdate.reservedQty = bin.reservedQty - fromReserved

      await supabase
        .from('FGStockBin')
        .update(binUpdate)
        .eq('id', bin.id)

      // Create movement record
      const mvtNo = generateMovementNo()
      const prevQty = bin.availableQty
      const newQty = binUpdate.availableQty

      await supabase.from('FGStockMovement').insert({
        movementNo: mvtNo,
        movementType: 'Outward',
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
        referenceType: 'Dispatch',
        referenceNo: referenceNo || null,
        partyName: partyName || null,
        movedBy: 'System',
      })

      processed.push({
        styleNo,
        color,
        size,
        success: true,
        binId: bin.id,
        deductedQty: quantity,
      })
    }

    const successResults = processed.filter((r) => r.success)
    const totalDeducted = successResults.reduce((sum, r) => sum + (r.deductedQty || 0), 0)

    return NextResponse.json({
      results: processed,
      totalDeducted,
      successCount: successResults.length,
      errorCount: processed.length - successResults.length,
    })
  } catch (error: any) {
    console.error('[FG-Stock Dispatch Deduct POST]', error)
    return NextResponse.json(
      { error: error.message || 'Dispatch deduction failed' },
      { status: 500 },
    )
  }
}
