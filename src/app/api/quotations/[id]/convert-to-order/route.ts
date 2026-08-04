import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { format, startOfDay } from 'date-fns'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Fetch quotation with items
    const { data: quotation, error: qErr } = await supabase
      .from('Quotation')
      .select('*, customer:Customer(*), items:QuotationItem(*)')
      .eq('id', id)
      .single()

    if (qErr || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    if (quotation.status === 'Converted') {
      return NextResponse.json(
        { error: 'This quotation has already been converted to a Sales Order' },
        { status: 400 }
      )
    }

    if (quotation.status === 'Rejected') {
      return NextResponse.json(
        { error: 'Cannot convert a rejected quotation' },
        { status: 400 }
      )
    }

    // 2. Generate SO number
    const today = format(new Date(), 'yyyyMMdd')
    const { data: lastOrder, error: loErr } = await supabase
      .from('SalesOrder')
      .select('orderNo')
      .ilike('orderNo', `SO-${today}%`)
      .order('orderNo', { ascending: false })
      .limit(1)
    if (loErr) throw loErr

    let sequence = 1
    if (lastOrder && lastOrder.length > 0) {
      const parts = lastOrder[0].orderNo.split('-')
      sequence = parseInt(parts[2] || '0') + 1
    }
    const orderNo = `SO-${today}-${String(sequence).padStart(3, '0')}`

    // 3. Calculate delivery date based on customer payment terms
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + (quotation.customer?.paymentTerms ?? 30))

    // 4. Calculate totals from items
    const totalAmount = (quotation.items ?? []).reduce((sum: number, item: any) => sum + item.totalAmount, 0)
    const totalCost = (quotation.items ?? []).reduce((sum: number, item: any) => sum + item.totalCost, 0)
    const grossProfit = totalAmount - totalCost
    const grossMargin = totalAmount > 0 ? (grossProfit / totalAmount) * 100 : 0

    // Apply discount
    const discountAmount = totalAmount * (quotation.discountPercent / 100)
    const finalAmount = totalAmount - discountAmount

    // 5. Create Sales Order
    const { data: salesOrder, error: soErr } = await supabase
      .from('SalesOrder')
      .insert({
        orderNo,
        customerId: quotation.customerId,
        orderDate: startOfDay(new Date()).toISOString(),
        deliveryDate: deliveryDate.toISOString(),
        status: 'Pending',
        totalAmount: finalAmount,
        totalCost,
        grossProfit: grossProfit - discountAmount,
        grossMargin: finalAmount > 0 ? ((grossProfit - discountAmount) / finalAmount) * 100 : 0,
        paymentStatus: 'Unpaid',
        paidAmount: 0,
        discountPercent: quotation.discountPercent,
        notes: `Converted from Quotation ${quotation.quotationNo}`,
        quotationId: id,
      })
      .select('*, customer:Customer(*), items:OrderItem(*)')
      .single()
    if (soErr) throw soErr

    // Create OrderItems from QuotationItems
    const orderItems = (quotation.items ?? []).map((item: any) => {
      const discountedUnitPrice =
        quotation.discountPercent > 0
          ? item.unitPrice * (1 - quotation.discountPercent / 100)
          : item.unitPrice
      const discountedTotal = discountedUnitPrice * item.quantity

      return {
        salesOrderId: salesOrder.id,
        styleName: item.styleName,
        quantity: item.quantity,
        unitPrice: discountedUnitPrice,
        unitCost: item.unitCost,
        totalAmount: Math.round(discountedTotal * 100) / 100,
        totalCost: item.totalCost,
        profit: Math.round((discountedTotal - item.totalCost) * 100) / 100,
      }
    })
    const { error: oiErr } = await supabase.from('OrderItem').insert(orderItems)
    if (oiErr) {
      await supabase.from('SalesOrder').delete().eq('id', salesOrder.id)
      throw oiErr
    }

    // Re-fetch the full order with items
    const { data: fullOrder, error: foErr } = await supabase
      .from('SalesOrder')
      .select('*, customer:Customer(*), items:OrderItem(*)')
      .eq('id', salesOrder.id)
      .single()
    if (foErr) throw foErr

    // 6. Update Quotation status
    const { error: updErr } = await supabase
      .from('Quotation')
      .update({
        status: 'Converted',
        convertedOrderId: salesOrder.id,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
    if (updErr) throw updErr

    return NextResponse.json({
      salesOrder: fullOrder,
      message: `Sales Order ${orderNo} created from Quotation ${quotation.quotationNo}`,
    })
  } catch (error) {
    console.error('Convert quotation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to convert quotation' },
      { status: 500 }
    )
  }
}
