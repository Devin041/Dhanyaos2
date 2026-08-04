import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /api/orders/[id] ──────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: order, error } = await supabase
      .from('SalesOrder')
      .select('*, customer:Customer(*), items:OrderItem(*, style:styleId(styleNo,collectionName,category,fabricType))')
      .eq('id', id)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch quotation number if this order was converted from a quotation
    let quotationNo: string | null = null
    if (order.quotationId) {
      const { data: quotation } = await supabase
        .from('Quotation')
        .select('quotationNo')
        .eq('id', order.quotationId)
        .single()
      if (quotation) quotationNo = quotation.quotationNo
    }

    return NextResponse.json({ order: { ...order, quotationNo } })
  } catch (error) {
    console.error('Order GET error:', error)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }
}

// ─── PATCH /api/orders/[id] ────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, paymentStatus, paidAmount, notes } = body

    const { data: existing, error: existErr } = await supabase
      .from('SalesOrder')
      .select('*')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    // Handle payment status changes
    if (paymentStatus !== undefined) {
      updateData.paymentStatus = paymentStatus
      if (paymentStatus === 'Paid') {
        updateData.paidAmount = existing.totalAmount
      }
    }
    if (paidAmount !== undefined) {
      const amt = Number(paidAmount)
      updateData.paidAmount = amt
      if (amt >= existing.totalAmount) {
        updateData.paymentStatus = 'Paid'
      } else if (amt > 0) {
        updateData.paymentStatus = 'Partial'
      } else {
        updateData.paymentStatus = 'Unpaid'
      }
    }

    const { data: order, error } = await supabase
      .from('SalesOrder')
      .update(updateData)
      .eq('id', id)
      .select('*, customer:customerId(id,companyName,buyerName), items:OrderItem(*, style:styleId(styleNo,collectionName,category))')
      .single()

    if (error) throw error

    return NextResponse.json({ order })
  } catch (error) {
    console.error('Order PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}

// ─── DELETE /api/orders/[id] ───────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: existing, error: existErr } = await supabase
      .from('SalesOrder')
      .select('id')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Cancel by setting status
    const { data: order, error } = await supabase
      .from('SalesOrder')
      .update({ status: 'Cancelled', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select('*, customer:customerId(id,companyName,buyerName), items:OrderItem(*)')
      .single()

    if (error) throw error

    return NextResponse.json({ order })
  } catch (error) {
    console.error('Order DELETE error:', error)
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }
}
