import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    let query = supabase
      .from('Customer')
      .select('*, SalesOrder(totalAmount, paidAmount, grossMargin, orderDate)')

    if (status && status !== 'All') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(
        `companyName.ilike.%${search}%,buyerName.ilike.%${search}%,gstNumber.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    query = query.order('createdAt', { ascending: false })

    const { data: customers, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to load customers' },
        { status: 500 }
      )
    }

    const customersWithMetrics = (customers || []).map((c: any) => {
      const orders = c.SalesOrder || []
      const orderCount = orders.length
      const totalOrderValue = orders.reduce((sum: number, o: any) => sum + o.totalAmount, 0)
      const totalPaid = orders.reduce((sum: number, o: any) => sum + o.paidAmount, 0)
      const pendingAmount = totalOrderValue - totalPaid
      const avgMargin =
        orderCount > 0
          ? orders.reduce((sum: number, o: any) => sum + o.grossMargin, 0) / orderCount
          : 0
      const lastOrderDate =
        orderCount > 0
          ? orders.reduce(
              (latest: string, o: any) =>
                o.orderDate > latest ? o.orderDate : latest,
              orders[0].orderDate
            )
          : null

      const { SalesOrder: _orders, ...customerData } = c

      return {
        ...customerData,
        orderCount,
        totalOrderValue,
        totalPaid,
        pendingAmount,
        avgMargin: Math.round(avgMargin * 100) / 100,
        lastOrderDate,
      }
    })

    return NextResponse.json({
      customers: customersWithMetrics,
      total: customersWithMetrics.length,
    })
  } catch (error) {
    console.error('Customers GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load customers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      companyName,
      buyerName,
      gstNumber,
      billingAddress,
      shippingAddress,
      paymentTerms = 30,
      creditLimit = 0,
      phone,
      email,
    } = body

    if (!companyName || !companyName.trim()) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    const { data: customer, error } = await supabase
      .from('Customer')
      .insert({
        companyName: companyName.trim(),
        buyerName: buyerName?.trim() || null,
        gstNumber: gstNumber?.trim() || null,
        billingAddress: billingAddress?.trim() || null,
        shippingAddress: shippingAddress?.trim() || null,
        paymentTerms: Number(paymentTerms) || 30,
        creditLimit: Number(creditLimit) || 0,
        status: 'Active',
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500 }
      )
    }

    return NextResponse.json({ customer }, { status: 201 })
  } catch (error) {
    console.error('Customers POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    )
  }
}
