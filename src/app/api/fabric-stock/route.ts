import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List fabric stock with filtering, search, and aggregate stats ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const supplierId = searchParams.get('supplier')
    const lowStock = searchParams.get('lowStock') === 'true'

    let query = supabase.from('FabricStock').select('*').order('createdAt', { ascending: false })

    if (search) {
      query = query.or(`fabricName.ilike.%${search}%,lotNumber.ilike.%${search}%`)
    }

    if (supplierId) {
      query = query.eq('supplierId', supplierId)
    }

    if (lowStock) {
      query = query.lt('availableMeters', 50)
    }

    const { data: stocks, error } = await query

    if (error) throw error

    // Aggregate stats across ALL stocks (ignoring filters)
    const [allStocksRes, lowStockRes] = await Promise.all([
      supabase.from('FabricStock').select('*'),
      supabase.from('FabricStock').select('id').lt('availableMeters', 50),
    ])

    const allStocks = allStocksRes.data || []
    const uniqueTypes = new Set(allStocks.map((s: any) => s.fabricName))

    const stats = {
      totalFabricValue: Math.round(allStocks.reduce((s: number, f: any) => s + (f.totalValue || 0), 0)),
      totalAvailableMeters: Math.round(allStocks.reduce((s: number, f: any) => s + (f.availableMeters || 0), 0) * 100) / 100,
      totalReservedMeters: Math.round(allStocks.reduce((s: number, f: any) => s + (f.reservedMeters || 0), 0) * 100) / 100,
      uniqueFabricTypes: uniqueTypes.size,
      lowStockCount: lowStockRes.data?.length ?? 0,
    }

    // Fetch supplier details
    const supplierIds = [...new Set(stocks.map((s: any) => s.supplierId).filter(Boolean))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone')
        .in('id', supplierIds)
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
      }
    }

    return NextResponse.json({
      stocks: (stocks || []).map((s: any) => ({
        id: s.id,
        supplierId: s.supplierId,
        supplier: s.supplierId ? supplierMap[s.supplierId] || null : null,
        fabricName: s.fabricName,
        color: s.color || null,                    // NEW — color-wise tracking
        gsm: s.gsm,
        width: s.width,
        lotNumber: s.lotNumber,
        availableMeters: s.availableMeters,
        reservedMeters: s.reservedMeters,
        averageCost: s.averageCost,
        totalValue: s.totalValue,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      stats,
    })
  } catch (error) {
    console.error('Fabric Stock API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load fabric stock' },
      { status: 500 }
    )
  }
}

// ─── POST: Add new fabric stock entry ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { supplierId, fabricName, gsm, width, lotNumber, availableMeters, averageCost } = body

    if (!fabricName || availableMeters === undefined || averageCost === undefined) {
      return NextResponse.json(
        { error: 'fabricName, availableMeters, and averageCost are required' },
        { status: 400 }
      )
    }

    const totalValue = parseFloat(availableMeters) * parseFloat(averageCost)
    const now = new Date().toISOString()

    const { data: stock, error } = await supabase
      .from('FabricStock')
      .insert({
        supplierId: supplierId || null,
        fabricName,
        gsm: gsm ? parseInt(gsm, 10) : null,
        width: width ? parseFloat(width) : null,
        lotNumber: lotNumber || null,
        availableMeters: parseFloat(availableMeters),
        reservedMeters: 0,
        averageCost: parseFloat(averageCost),
        totalValue,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    // Fetch supplier for response
    let supplier = null
    if (stock.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone')
        .eq('id', stock.supplierId)
        .single()
      supplier = s || null
    }

    return NextResponse.json(
      {
        id: stock.id,
        supplierId: stock.supplierId,
        supplier,
        fabricName: stock.fabricName,
        gsm: stock.gsm,
        width: stock.width,
        lotNumber: stock.lotNumber,
        availableMeters: stock.availableMeters,
        reservedMeters: stock.reservedMeters,
        averageCost: stock.averageCost,
        totalValue: stock.totalValue,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Fabric Stock API POST error:', error)
    return NextResponse.json(
      { error: 'Failed to add fabric stock' },
      { status: 500 }
    )
  }
}
