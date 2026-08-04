import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const fromDate = searchParams.get('fromDate') || undefined
    const toDate = searchParams.get('toDate') || undefined
    const type = searchParams.get('type') || undefined
    const styleNo = searchParams.get('styleNo') || undefined
    const binId = searchParams.get('binId') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Count query
    let countQuery = supabase.from('FGStockMovement').select('*', { count: 'exact', head: true })
    if (fromDate) countQuery = countQuery.gte('movedAt', new Date(fromDate).toISOString())
    if (toDate) countQuery = countQuery.lte('movedAt', new Date(toDate + 'T23:59:59.999Z').toISOString())
    if (type) countQuery = countQuery.eq('movementType', type)
    if (styleNo) countQuery = countQuery.eq('styleNo', styleNo)
    if (binId) countQuery = countQuery.eq('fgStockBinId', binId)

    // Data query
    let dataQuery = supabase.from('FGStockMovement').select('*')
      .order('movedAt', { ascending: false })
      .range(from, to)
    if (fromDate) dataQuery = dataQuery.gte('movedAt', new Date(fromDate).toISOString())
    if (toDate) dataQuery = dataQuery.lte('movedAt', new Date(toDate + 'T23:59:59.999Z').toISOString())
    if (type) dataQuery = dataQuery.eq('movementType', type)
    if (styleNo) dataQuery = dataQuery.eq('styleNo', styleNo)
    if (binId) dataQuery = dataQuery.eq('fgStockBinId', binId)

    const [{ count: total }, { data: movements, error }] = await Promise.all([
      countQuery,
      dataQuery,
    ])
    if (error) throw error

    return NextResponse.json({
      movements: movements || [],
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
