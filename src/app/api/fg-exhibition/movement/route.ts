import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo } from '@/lib/fg-color-code'

interface MovementItem {
  binId: string
  quantity: number
  partyName?: string
  referenceNo?: string
  reason?: string
}

// ─── POST: Move stock to/from exhibition ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, items, movedBy } = body as {
      action: 'move_out' | 'move_back'
      items: MovementItem[]
      movedBy?: string
    }

    if (!action || !['move_out', 'move_back'].includes(action)) {
      return NextResponse.json({ error: 'action must be move_out or move_back' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required with at least one entry' }, { status: 400 })
    }

    const outcomes: Array<{
      binId: string
      success: boolean
      action: string
      quantity: number
      error?: string
    }> = []

    for (const item of items) {
      if (!item.binId || typeof item.quantity !== 'number' || item.quantity <= 0) {
        outcomes.push({
          binId: item.binId || 'unknown',
          success: false,
          action,
          quantity: item.quantity || 0,
          error: 'Invalid binId or quantity',
        })
        continue
      }

      // Fetch bin
      const { data: bin, error: binErr } = await supabase
        .from('FGStockBin')
        .select('*')
        .eq('id', item.binId)
        .single()
      if (binErr || !bin) {
        outcomes.push({
          binId: item.binId,
          success: false,
          action,
          quantity: item.quantity,
          error: 'Stock bin not found',
        })
        continue
      }

      const mvtNo = generateMovementNo()

      if (action === 'move_out') {
        if (bin.availableQty < item.quantity) {
          outcomes.push({
            binId: item.binId,
            success: false,
            action,
            quantity: item.quantity,
            error: `Insufficient available stock. Available: ${bin.availableQty}, Requested: ${item.quantity}`,
          })
          continue
        }
        const prevAvail = bin.availableQty
        const prevExh = bin.exhibitionQty
        await supabase
          .from('FGStockBin')
          .update({
            availableQty: prevAvail - item.quantity,
            exhibitionQty: prevExh + item.quantity,
            location: 'Exhibition',
            lastMovementDate: new Date().toISOString(),
          })
          .eq('id', item.binId)
        await supabase.from('FGStockMovement').insert({
          movementNo: mvtNo,
          movementType: 'ExhibitionMove',
          fgStockBinId: item.binId,
          styleNo: bin.styleNo,
          styleName: bin.styleName,
          colorCode: bin.colorCode,
          color: bin.color,
          size: bin.size,
          quantity: item.quantity,
          previousQty: prevAvail,
          newQty: prevAvail - item.quantity,
          unitCost: bin.unitCost,
          fromLocation: 'Warehouse',
          toLocation: 'Exhibition',
          referenceType: 'Exhibition',
          referenceNo: item.referenceNo || null,
          partyName: item.partyName || null,
          reason: item.reason || null,
          movedBy: movedBy || 'System',
        })
      } else {
        // move_back
        if (bin.exhibitionQty < item.quantity) {
          outcomes.push({
            binId: item.binId,
            success: false,
            action,
            quantity: item.quantity,
            error: `Insufficient exhibition stock. Exhibition: ${bin.exhibitionQty}, Requested: ${item.quantity}`,
          })
          continue
        }
        const prevExh = bin.exhibitionQty
        const prevAvail = bin.availableQty
        await supabase
          .from('FGStockBin')
          .update({
            exhibitionQty: prevExh - item.quantity,
            availableQty: prevAvail + item.quantity,
            location: 'Warehouse',
            lastMovementDate: new Date().toISOString(),
          })
          .eq('id', item.binId)
        await supabase.from('FGStockMovement').insert({
          movementNo: mvtNo,
          movementType: 'ExhibitionReturn',
          fgStockBinId: item.binId,
          styleNo: bin.styleNo,
          styleName: bin.styleName,
          colorCode: bin.colorCode,
          color: bin.color,
          size: bin.size,
          quantity: item.quantity,
          previousQty: prevAvail,
          newQty: prevAvail + item.quantity,
          unitCost: bin.unitCost,
          fromLocation: 'Exhibition',
          toLocation: 'Warehouse',
          referenceType: 'Exhibition',
          referenceNo: item.referenceNo || null,
          partyName: item.partyName || null,
          reason: item.reason || null,
          movedBy: movedBy || 'System',
        })
      }

      outcomes.push({
        binId: item.binId,
        success: true,
        action,
        quantity: item.quantity,
      })
    }

    return NextResponse.json({ results: outcomes })
  } catch (error: any) {
    console.error('[FG-Exhibition Movement POST]', error)
    return NextResponse.json({ error: error.message || 'Exhibition movement failed' }, { status: 500 })
  }
}
