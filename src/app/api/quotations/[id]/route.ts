import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format, startOfDay } from 'date-fns'
import { batchResolveStyleImages } from '@/lib/style-image'

// ─── GET /api/quotations/[id] ───────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: quotation, error } = await supabase
      .from('Quotation')
      .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:QuotationItem(*)')
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // If converted, fetch the order number for display
    let convertedOrderNo: string | null = null
    if (quotation.convertedOrderId) {
      const { data: order } = await supabase
        .from('SalesOrder')
        .select('orderNo')
        .eq('id', quotation.convertedOrderId)
        .single()
      if (order) convertedOrderNo = order.orderNo
    }

    // Batch-resolve style images for items
    const items = quotation.items || []
    const styleNos = [...new Set(items.map((i: any) => {
      const match = i.styleName?.match(/^[A-Z]{2,}-\d+/)
      return match ? match[0] : ''
    }).filter(Boolean))]
    if (styleNos.length > 0) {
      const images = await batchResolveStyleImages(styleNos)
      for (const item of items) {
        const sno = (item as any).styleName?.match(/^[A-Z]{2,}-\d+/)?.[0] || ''
        ;(item as any)._image = images[sno]?.url || null
      }
    }

    return NextResponse.json({
      ...quotation,
      itemCount: quotation.items?.length ?? 0,
      convertedOrderNo,
    })
  } catch (error) {
    console.error('GET /api/quotations/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch quotation' }, { status: 500 })
  }
}

// ─── PATCH /api/quotations/[id] ──────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: existErr } = await supabase
      .from('Quotation')
      .select('*, items:QuotationItem(*)')
      .eq('id', id)
      .single()

    if (existErr || !existing) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Handle status transitions
    if (body.status) {
      const validTransitions: Record<string, string[]> = {
        Draft: ['Sent', 'Rejected'],
        Sent: ['Accepted', 'Rejected'],
        Accepted: ['Converted'],
      }

      if (existing.status in validTransitions) {
        const allowed = validTransitions[existing.status]
        if (!allowed.includes(body.status)) {
          return NextResponse.json(
            { error: `Cannot transition from ${existing.status} to ${body.status}` },
            { status: 400 }
          )
        }
      } else {
        return NextResponse.json(
          { error: `Cannot change status from ${existing.status}` },
          { status: 400 }
        )
      }

      // Handle Convert to Order
      if (body.status === 'Converted' && existing.status === 'Accepted') {
        const today = startOfDay(new Date())
        const dateStr = format(today, 'yyyyMMdd')
        const todayStart = new Date(today)
        const todayEnd = new Date(today)
        todayEnd.setDate(todayEnd.getDate() + 1)

        const { count: todayCount, error: countErr } = await supabase
          .from('SalesOrder')
          .select('*', { count: 'exact', head: true })
          .gte('orderDate', todayStart.toISOString())
          .lt('orderDate', todayEnd.toISOString())
        if (countErr) throw countErr

        const orderNo = `SO-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

        const subtotal = existing.totalAmount / (1 - existing.discountPercent / 100 || 1)
        const grossProfit = existing.totalAmount - existing.totalCost
        const grossMargin = existing.totalAmount > 0 ? (grossProfit / existing.totalAmount) * 100 : 0

        // Create SalesOrder
        const { data: salesOrder, error: soErr } = await supabase
          .from('SalesOrder')
          .insert({
            orderNo,
            customerId: existing.customerId,
            status: 'Pending',
            totalAmount: existing.totalAmount,
            totalCost: existing.totalCost,
            grossProfit: Math.round(grossProfit * 100) / 100,
            grossMargin: Math.round(grossMargin * 100) / 100,
            discountPercent: existing.discountPercent,
            paymentStatus: 'Unpaid',
            paidAmount: 0,
            notes: existing.notes,
            quotationId: id,
          })
          .select('*')
          .single()
        if (soErr) throw soErr

        // Create OrderItems from QuotationItems
        const orderItems = (existing.items ?? []).map((item: any) => ({
          salesOrderId: salesOrder.id,
          styleName: item.styleName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          totalAmount: item.totalAmount,
          totalCost: item.totalCost,
          profit: item.profit,
        }))
        const { error: oiErr } = await supabase.from('OrderItem').insert(orderItems)
        if (oiErr) {
          await supabase.from('SalesOrder').delete().eq('id', salesOrder.id)
          throw oiErr
        }

        // Update quotation
        const { data: updated, error: updErr } = await supabase
          .from('Quotation')
          .update({
            status: 'Converted',
            convertedOrderId: salesOrder.id,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', id)
          .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:QuotationItem(*)')
          .single()
        if (updErr) throw updErr

        return NextResponse.json({
          quotation: { ...updated, itemCount: updated.items?.length ?? 0 },
          convertedOrder: { id: salesOrder.id, orderNo: salesOrder.orderNo },
        })
      }
    }

    // Handle field updates
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.validUntil !== undefined) updateData.validUntil = new Date(body.validUntil).toISOString()
    if (body.discountPercent !== undefined) {
      const discountPercent = body.discountPercent
      const subtotal = (existing.items ?? []).reduce((sum: number, item: any) => sum + item.totalAmount, 0)
      const totalAmount = subtotal * (1 - discountPercent / 100)
      updateData.discountPercent = discountPercent
      updateData.totalAmount = Math.round(totalAmount * 100) / 100
    }

    if (body.status && body.status !== 'Converted') {
      updateData.status = body.status
    }

    const { data: updated, error } = await supabase
      .from('Quotation')
      .update(updateData)
      .eq('id', id)
      .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:QuotationItem(*)')
      .single()

    if (error) throw error

    return NextResponse.json({ ...updated, itemCount: updated.items?.length ?? 0 })
  } catch (error) {
    console.error('PATCH /api/quotations/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update quotation' }, { status: 500 })
  }
}
