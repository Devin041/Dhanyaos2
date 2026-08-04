import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo } from '@/lib/fg-color-code'

interface IssueItem {
  binId: string
  quantity: number
  partyName?: string
  reason?: string
}

// ─── POST: Issue promotional stock ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items, movedBy } = body as {
      items: IssueItem[]
      movedBy?: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required with at least one entry' }, { status: 400 })
    }

    const outcomes: Array<{
      binId: string
      success: boolean
      quantity: number
      error?: string
    }> = []

    for (const item of items) {
      if (!item.binId || typeof item.quantity !== 'number' || item.quantity <= 0) {
        outcomes.push({
          binId: item.binId || 'unknown',
          success: false,
          quantity: item.quantity || 0,
          error: 'Invalid binId or quantity',
        })
        continue
      }

      const { data: bin, error: binErr } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('id', item.binId)
        .single()
      if (binErr || !bin) {
        outcomes.push({
          binId: item.binId,
          success: false,
          quantity: item.quantity,
          error: 'Stock bin not found',
        })
        continue
      }

      if (bin.availableQty < item.quantity) {
        outcomes.push({
          binId: item.binId,
          success: false,
          quantity: item.quantity,
          error: `Insufficient stock. Available: ${bin.availableQty}, Requested: ${item.quantity}`,
        })
        continue
      }

      const mvtNo = generateMovementNo()
      const prevQty = bin.availableQty

      await supabase
        .from('FGStockBin')
        .update({
          availableQty: prevQty - item.quantity,
          lastMovementDate: new Date().toISOString(),
        })
        .eq('id', item.binId)

      await supabase.from('FGStockMovement').insert({
        movementNo: mvtNo,
        movementType: 'PromotionalIssue',
        fgStockBinId: item.binId,
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        quantity: item.quantity,
        previousQty: prevQty,
        newQty: prevQty - item.quantity,
        unitCost: bin.unitCost,
        referenceType: 'Promotional',
        partyName: item.partyName || null,
        reason: item.reason || null,
        movedBy: movedBy || 'System',
      })

      outcomes.push({
        binId: item.binId,
        success: true,
        quantity: item.quantity,
      })
    }

    return NextResponse.json({ results: outcomes })
  } catch (error: any) {
    console.error('[FG-Promotional Issue POST]', error)
    return NextResponse.json({ error: error.message || 'Promotional issue failed' }, { status: 500 })
  }
}
