import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single finished good by ID ─────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: item, error } = await supabase
      .from('FinishedGood')
      .select()
      .eq('id', id)
      .single()

    if (error || !item) {
      return NextResponse.json({ error: 'Finished good not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: item.id,
      styleNo: item.styleNo,
      styleName: item.styleName,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalValue: item.totalValue,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })
  } catch (error) {
    console.error('Inventory [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to load finished good' }, { status: 500 })
  }
}

// ─── PATCH: Update finished good (quantity, status) ──────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { quantity, unitCost, status, styleNo, styleName } = body

    // Verify existence
    const { data: existing, error: findErr } = await supabase
      .from('FinishedGood')
      .select()
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Finished good not found' }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (quantity !== undefined) {
      const qty = parseInt(quantity, 10)
      if (isNaN(qty) || qty < 0) {
        return NextResponse.json({ error: 'quantity must be a non-negative number' }, { status: 400 })
      }
      updateData.quantity = qty
    }
    if (unitCost !== undefined) {
      const cost = parseFloat(unitCost)
      if (isNaN(cost) || cost < 0) {
        return NextResponse.json({ error: 'unitCost must be a non-negative number' }, { status: 400 })
      }
      updateData.unitCost = cost
    }
    if (status !== undefined) {
      const validStatuses = ['In Stock', 'Reserved', 'Shipped', 'Damaged', 'Disposed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `status must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.status = status
    }
    if (styleNo !== undefined) updateData.styleNo = styleNo
    if (styleName !== undefined) updateData.styleName = styleName

    // Recalculate total value
    const newQty = quantity !== undefined ? parseInt(quantity, 10) : existing.quantity
    const newCost = unitCost !== undefined ? parseFloat(unitCost) : existing.unitCost
    updateData.totalValue = Math.round(newQty * newCost)

    const { data: updated, error } = await supabase
      .from('FinishedGood')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      id: updated.id,
      styleNo: updated.styleNo,
      styleName: updated.styleName,
      quantity: updated.quantity,
      unitCost: updated.unitCost,
      totalValue: updated.totalValue,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error('Inventory [id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update finished good' }, { status: 500 })
  }
}

// ─── DELETE: Remove finished good ────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: existing, error: findErr } = await supabase
      .from('FinishedGood')
      .select('id')
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Finished good not found' }, { status: 404 })
    }

    const { error } = await supabase.from('FinishedGood').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Inventory [id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete finished good' }, { status: 500 })
  }
}
