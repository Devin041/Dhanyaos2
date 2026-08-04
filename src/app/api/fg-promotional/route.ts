import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List all promotional issue movements ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const styleNo = searchParams.get('styleNo')?.trim()
    const partyName = searchParams.get('partyName')?.trim()
    const fromDate = searchParams.get('fromDate')?.trim()
    const toDate = searchParams.get('toDate')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Count query
    let countQuery = supabase.from('FGStockMovement').select('*', { count: 'exact', head: true })
      .eq('movementType', 'PromotionalIssue')
    if (styleNo) countQuery = countQuery.eq('styleNo', styleNo)
    if (partyName) countQuery = countQuery.ilike('partyName', `%${partyName}%`)
    if (fromDate) countQuery = countQuery.gte('movedAt', new Date(fromDate).toISOString())
    if (toDate) countQuery = countQuery.lte('movedAt', new Date(toDate).toISOString())

    // Data query
    let dataQuery = supabase.from('FGStockMovement').select('*')
      .eq('movementType', 'PromotionalIssue')
      .order('movedAt', { ascending: false })
      .range(from, to)
    if (styleNo) dataQuery = dataQuery.eq('styleNo', styleNo)
    if (partyName) dataQuery = dataQuery.ilike('partyName', `%${partyName}%`)
    if (fromDate) dataQuery = dataQuery.gte('movedAt', new Date(fromDate).toISOString())
    if (toDate) dataQuery = dataQuery.lte('movedAt', new Date(toDate).toISOString())

    const [{ count: total }, { data: promotions, error }] = await Promise.all([
      countQuery,
      dataQuery,
    ])
    if (error) throw error

    const mapped = (promotions || []).map((p: any) => ({
      id: p.id,
      movementNo: p.movementNo,
      styleNo: p.styleNo,
      styleName: p.styleName,
      colorCode: p.colorCode,
      color: p.color,
      size: p.size,
      quantity: p.quantity,
      unitCost: p.unitCost,
      partyName: p.partyName,
      reason: p.reason,
      movedBy: p.movedBy,
      movedAt: p.movedAt,
    }))

    const totalPieces = mapped.reduce((s, p) => s + p.quantity, 0)
    const totalCostValue = mapped.reduce((s, p) => s + p.quantity * p.unitCost, 0)

    return NextResponse.json({
      promotions: mapped,
      totalPieces,
      totalCostValue,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error('[FG-Promotional GET]', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch promotional issues' }, { status: 500 })
  }
}
