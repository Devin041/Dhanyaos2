import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, withComputedFields } from '@/lib/fg-color-code'

// ─── POST /api/fg-stock/bulk-return-reject ───────────────────────────────
// Reject QC pending items (move to defective).
// Body: { items: [{ binId, quantity, reason }] }
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
        { error: 'Maximum 100 items per batch' },
        { status: 400 },
      )
    }

    const processed: Array<{
      binId: string
      success: boolean
      movedQty?: number
      newDefective?: number
      newQcPending?: number
      error?: string
    }> = []

    for (const item of items) {
      const { binId, quantity, reason } = item

      if (!binId || !quantity) {
        processed.push({
          binId: binId || 'unknown',
          success: false,
          error: 'Missing required fields (binId, quantity)',
        })
        continue
      }

      if (quantity <= 0) {
        processed.push({
          binId,
          success: false,
          error: 'Quantity must be positive',
        })
        continue
      }

      // Find bin
      const { data: bin, error: binErr } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('id', binId)
        .single()

      if (binErr || !bin) {
        processed.push({
          binId,
          success: false,
          error: 'Stock bin not found',
        })
        continue
      }

      if (bin.qcPendingQty < quantity) {
        processed.push({
          binId,
          success: false,
          error: `Insufficient QC pending stock. Have: ${bin.qcPendingQty}, Requested: ${quantity}`,
        })
        continue
      }

      // Move from qcPendingQty to defectiveQty
      const prevQc = bin.qcPendingQty
      const prevDef = bin.defectiveQty

      const { error: updErr } = await supabase
        .from('FGStockBin')
        .update({
          qcPendingQty: prevQc - quantity,
          defectiveQty: prevDef + quantity,
          lastMovementDate: new Date().toISOString(),
        })
        .eq('id', binId)
      if (updErr) {
        processed.push({ binId, success: false, error: updErr.message })
        continue
      }

      // Create movement record
      const mvtNo = generateMovementNo()
      const { error: mvtErr } = await supabase.from('FGStockMovement').insert({
        movementNo: mvtNo,
        movementType: 'QCStatusChange',
        fgStockBinId: binId,
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        quantity,
        previousQty: prevQc,
        newQty: prevQc - quantity,
        unitCost: bin.unitCost,
        fromStatus: 'QCPending',
        toStatus: 'Defective',
        referenceType: 'QC',
        reason: reason || 'Return QC rejected — defective',
        movedBy: 'System',
      })
      if (mvtErr) {
        processed.push({ binId, success: false, error: mvtErr.message })
        continue
      }

      processed.push({
        binId,
        success: true,
        movedQty: quantity,
        newDefective: prevDef + quantity,
        newQcPending: prevQc - quantity,
      })
    }

    const successResults = processed.filter((r) => r.success)

    return NextResponse.json({
      results: processed,
      successCount: successResults.length,
      errorCount: processed.length - successResults.length,
    })
  } catch (error: any) {
    console.error('[FG-Stock Bulk Return Reject POST]', error)
    return NextResponse.json(
      { error: error.message || 'Bulk return reject failed' },
      { status: 500 },
    )
  }
}
