import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List all bins currently at exhibition ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNo = searchParams.get('styleNo')?.trim()
    const location = searchParams.get('location')?.trim()

    let query = supabase
      .from('FGStockBin')
      .select('*')
      .gt('exhibitionQty', 0)

    if (styleNo) query = query.eq('styleNo', styleNo)
    if (location) query = query.eq('location', location)

    query = query.order('styleNo', { ascending: true }).order('color', { ascending: true }).order('size', { ascending: true })

    const { data: exhibitions, error } = await query
    if (error) throw error

    const mapped = (exhibitions || []).map((b: any) => ({
      binId: b.id,
      styleNo: b.styleNo,
      styleName: b.styleName,
      colorCode: b.colorCode,
      color: b.color,
      size: b.size,
      exhibitionQty: b.exhibitionQty,
      unitCost: b.unitCost,
      unitSellPrice: b.unitSellPrice,
      image: b.image,
      location: b.location,
      lastMovementDate: b.lastMovementDate,
    }))

    const totalPieces = mapped.reduce((s, b) => s + b.exhibitionQty, 0)
    const totalValue = mapped.reduce((s, b) => s + b.exhibitionQty * b.unitCost, 0)
    const uniqueStyles = new Set(mapped.map((b) => b.styleNo)).size
    const uniqueColors = new Set(mapped.map((b) => b.color)).size

    return NextResponse.json({
      exhibitions: mapped,
      totalPieces,
      totalValue,
      uniqueStyles,
      uniqueColors,
    })
  } catch (error: any) {
    console.error('[FG-Exhibition GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch exhibition data' }, { status: 500 })
  }
}
