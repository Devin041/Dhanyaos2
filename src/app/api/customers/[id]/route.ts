import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: customer, error } = await supabase
      .from('Customer')
      .select('*, SalesOrder(*)')
      .eq('id', id)
      .single()

    if (error || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    const orders = customer.SalesOrder || []
    const orderCount = orders.length
    const totalOrderValue = orders.reduce(
      (sum: number, o: any) => sum + o.totalAmount,
      0
    )
    const totalPaid = orders.reduce(
      (sum: number, o: any) => sum + o.paidAmount,
      0
    )
    const pendingAmount = totalOrderValue - totalPaid
    const avgMargin =
      orderCount > 0
        ? orders.reduce((sum: number, o: any) => sum + o.grossMargin, 0) /
          orderCount
        : 0
    const lastOrderDate =
      orderCount > 0
        ? orders.reduce(
            (latest: string, o: any) =>
              o.orderDate > latest ? o.orderDate : latest,
            orders[0].orderDate
          )
        : null

    const { SalesOrder: _orders, ...customerData } = customer

    return NextResponse.json({
      customer: {
        ...customerData,
        orderCount,
        totalOrderValue,
        totalPaid,
        pendingAmount,
        avgMargin: Math.round(avgMargin * 100) / 100,
        lastOrderDate,
      },
      orders,
    })
  } catch (error) {
    console.error('Customer GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load customer' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: findError } = await supabase
      .from('Customer')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'companyName',
      'buyerName',
      'gstNumber',
      'billingAddress',
      'shippingAddress',
      'paymentTerms',
      'creditLimit',
      'phone',
      'email',
      'status',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'paymentTerms' || field === 'creditLimit') {
          updateData[field] = Number(body[field]) || 0
        } else if (
          field === 'companyName' ||
          field === 'buyerName' ||
          field === 'gstNumber' ||
          field === 'phone' ||
          field === 'email'
        ) {
          updateData[field] = body[field]?.trim() || null
          if (field === 'companyName' && !updateData[field]) {
            return NextResponse.json(
              { error: 'Company name is required' },
              { status: 400 }
            )
          }
        } else {
          updateData[field] = body[field]
        }
      }
    }

    updateData.updatedAt = new Date().toISOString()

    const { data: customer, error } = await supabase
      .from('Customer')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to update customer' },
        { status: 500 }
      )
    }

    return NextResponse.json({ customer })
  } catch (error) {
    console.error('Customer PATCH error:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: existing, error: findError } = await supabase
      .from('Customer')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('Customer')
      .update({ status: 'Inactive', updatedAt: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to deactivate customer' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Customer DELETE error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate customer' },
      { status: 500 }
    )
  }
}
