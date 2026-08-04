import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single style with full details + order history ────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: style, error } = await supabase
      .from('Style')
      .select('*, OrderItem(*, SalesOrder(*, Customer(id, companyName, buyerName)))')
      .eq('id', id)
      .single()

    if (error || !style) {
      return NextResponse.json({ error: 'Style not found' }, { status: 404 })
    }

    const orderItems = style.OrderItem || []

    // Compute aggregate metrics from order items
    const uniqueOrderIds = new Set(orderItems.map((oi: any) => oi.salesOrderId))
    const orderCount = uniqueOrderIds.size
    const totalQtyOrdered = orderItems.reduce((sum: number, oi: any) => sum + oi.quantity, 0)
    const totalRevenue = orderItems.reduce((sum: number, oi: any) => sum + oi.totalAmount, 0)
    const totalProfit = orderItems.reduce((sum: number, oi: any) => sum + oi.profit, 0)

    return NextResponse.json({
      id: style.id,
      styleNo: style.styleNo,
      collectionName: style.collectionName,
      season: style.season,
      category: style.category,
      fit: style.fit,
      fabricType: style.fabricType,
      embroideryType: style.embroideryType,
      neckDesign: style.neckDesign,
      sleeveType: style.sleeveType,
      brand: style.brand,
      status: style.status,
      costPrice: style.costPrice,
      sellPrice: style.sellPrice,
      createdAt: style.createdAt,
      updatedAt: style.updatedAt,
      metrics: { orderCount, totalQtyOrdered, totalRevenue, totalProfit },
      orderHistory: orderItems.map((oi: any) => ({
        id: oi.id,
        orderNo: oi.SalesOrder?.orderNo || '—',
        orderDate: oi.SalesOrder?.orderDate || null,
        customer: oi.SalesOrder?.Customer?.companyName || '—',
        buyerName: oi.SalesOrder?.Customer?.buyerName || null,
        quantity: oi.quantity,
        unitPrice: oi.unitPrice,
        totalAmount: oi.totalAmount,
        profit: oi.profit,
        orderStatus: oi.SalesOrder?.status || '—',
      })),
    })
  } catch (error) {
    console.error('Style GET error:', error)
    return NextResponse.json({ error: 'Failed to load style' }, { status: 500 })
  }
}

// ─── PATCH: Update style fields ─────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: findError } = await supabase
      .from('Style')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Style not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}

    const allowedFields = [
      'collectionName',
      'season',
      'category',
      'fit',
      'fabricType',
      'embroideryType',
      'neckDesign',
      'sleeveType',
      'costPrice',
      'sellPrice',
      'status',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'costPrice' || field === 'sellPrice') {
          data[field] = parseFloat(body[field])
        } else if (field === 'status') {
          if (body[field] !== 'Active' && body[field] !== 'Inactive') {
            return NextResponse.json(
              { error: 'Status must be Active or Inactive' },
              { status: 400 }
            )
          }
          data[field] = body[field]
        } else {
          data[field] = body[field] || null
        }
      }
    }

    data.updatedAt = new Date().toISOString()

    const { data: updated, error } = await supabase
      .from('Style')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to update style' }, { status: 500 })
    }

    return NextResponse.json({
      id: updated.id,
      styleNo: updated.styleNo,
      collectionName: updated.collectionName,
      season: updated.season,
      category: updated.category,
      fit: updated.fit,
      fabricType: updated.fabricType,
      embroideryType: updated.embroideryType,
      neckDesign: updated.neckDesign,
      sleeveType: updated.sleeveType,
      brand: updated.brand,
      status: updated.status,
      costPrice: updated.costPrice,
      sellPrice: updated.sellPrice,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error('Style PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update style' }, { status: 500 })
  }
}

// ─── DELETE: Soft delete (set status to Inactive) ───────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: existing, error: findError } = await supabase
      .from('Style')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Style not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('Style')
      .update({ status: 'Inactive', updatedAt: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to delete style' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Style DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete style' }, { status: 500 })
  }
}
