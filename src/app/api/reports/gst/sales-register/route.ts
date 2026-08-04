import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const GUJARAT_GST_PREFIX = '24'

function isGujaratGST(gstNumber: string | null | undefined): boolean {
  if (!gstNumber) return true
  return gstNumber.trimStart().startsWith(GUJARAT_GST_PREFIX)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const customerId = searchParams.get('customerId')

    let startDate: Date
    let endDate: Date

    if (from && to) {
      startDate = new Date(from)
      endDate = new Date(to)
      endDate.setHours(23, 59, 59, 999)
    } else {
      const now = new Date()
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    }

    let query = supabase
      .from('SalesOrder')
      .select('*')
      .gte('orderDate', startDate.toISOString())
      .lte('orderDate', endDate.toISOString())
      .neq('status', 'Cancelled')
      .order('orderDate', { ascending: 'desc' })

    if (customerId) {
      query = query.eq('customerId', customerId)
    }

    const { data: salesOrders } = await query
    const ordersArr: any[] = salesOrders || []

    // Fetch customers
    const cIds = [...new Set(ordersArr.map((o: any) => o.customerId).filter(Boolean))]
    let customerMap: Record<string, any> = {}
    if (cIds.length > 0) {
      const { data: customers } = await supabase
        .from('Customer')
        .select('id, companyName, gstNumber')
        .in('id', cIds)
      if (customers) {
        customerMap = Object.fromEntries(customers.map((c: any) => [c.id, c]))
      }
    }

    const round2 = (v: number) => Math.round(v * 100) / 100

    const register = ordersArr.map((so: any) => {
      const customer = customerMap[so.customerId] || {}
      const isInterState = !isGujaratGST(customer.gstNumber)

      // Fetch order items for this order
      const totalTaxable = so.taxableAmount || 0
      const totalCgst = so.cgstAmount || 0
      const totalSgst = so.sgstAmount || 0
      const totalIgst = so.igstAmount || 0
      const totalTax = totalCgst + totalSgst + totalIgst

      return {
        soNumber: so.orderNo,
        soDate: so.orderDate ? so.orderDate.split('T')[0] : '',
        customerName: customer.companyName || '—',
        customerGst: customer.gstNumber || 'N/A',
        isInterState,
        status: so.status,
        itemRows: [],
        totalTaxable: round2(totalTaxable),
        totalCgst: round2(totalCgst),
        totalSgst: round2(totalSgst),
        totalIgst: round2(totalIgst),
        totalTax: round2(totalTax),
        totalAmount: round2(so.totalAmount || 0),
      }
    })

    const totals = {
      totalTaxable: register.reduce((s: number, r: any) => s + r.totalTaxable, 0),
      totalCgst: register.reduce((s: number, r: any) => s + r.totalCgst, 0),
      totalSgst: register.reduce((s: number, r: any) => s + r.totalSgst, 0),
      totalIgst: register.reduce((s: number, r: any) => s + r.totalIgst, 0),
    }
    totals.totalTax = round2(totals.totalCgst + totals.totalSgst + totals.totalIgst)
    totals.totalTaxable = round2(totals.totalTaxable)
    totals.totalCgst = round2(totals.totalCgst)
    totals.totalSgst = round2(totals.totalSgst)
    totals.totalIgst = round2(totals.totalIgst)

    return NextResponse.json({
      period: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
      register,
      ...totals,
    })
  } catch (error) {
    console.error('Sales Register API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate sales register' },
      { status: 500 }
    )
  }
}
