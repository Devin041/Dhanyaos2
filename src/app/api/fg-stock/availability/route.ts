import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { computeBinHealth } from '@/lib/fg-color-code'

// ─── GET /api/fg-stock/availability ─────────────────────────────────────────
// Stock availability check for Sales Orders and Dispatch modules.
// ?styleNo=DH-01&color=Pink&size=S  → exact bin
// ?styleNo=DH-01                      → all bins for the style
export async function GET(req: NextRequest) {
  try {
    const styleNo = req.nextUrl.searchParams.get('styleNo')?.trim()
    const color = req.nextUrl.searchParams.get('color')?.trim()
    const size = req.nextUrl.searchParams.get('size')?.trim()

    if (!styleNo) {
      return NextResponse.json(
        { error: 'styleNo is required' },
        { status: 400 },
      )
    }

    let query = supabase
      .from('FGStockBin')
      .select('id, styleNo, styleName, colorCode, color, size, availableQty, reservedQty, qcPendingQty, defectiveQty, unitSellPrice, image')
      .eq('styleNo', styleNo)

    if (color) query = query.eq('color', color)
    if (size) query = query.eq('size', size)

    query = query.order('color', { ascending: true }).order('size', { ascending: true })

    const { data: bins, error } = await query
    if (error) throw error

    const binsWithHealth = (bins || []).map((bin: any) => {
      const health = computeBinHealth(bin)
      return {
        binId: bin.id,
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        size: bin.size,
        availableQty: bin.availableQty,
        reservedQty: bin.reservedQty,
        qcPendingQty: bin.qcPendingQty,
        defectiveQty: bin.defectiveQty,
        unitSellPrice: bin.unitSellPrice,
        image: bin.image,
        health,
      }
    })

    const totalAvailable = binsWithHealth.reduce(
      (sum, b) => sum + b.availableQty,
      0,
    )

    const totalReserved = binsWithHealth.reduce(
      (sum, b) => sum + b.reservedQty,
      0,
    )

    const available = totalAvailable + totalReserved > 0

    return NextResponse.json({
      available,
      bins: binsWithHealth,
      totalAvailable,
      totalReserved,
    })
  } catch (error: any) {
    console.error('[FG-Stock Availability GET]', error)
    return NextResponse.json(
      { error: error.message || 'Availability check failed' },
      { status: 500 },
    )
  }
}
