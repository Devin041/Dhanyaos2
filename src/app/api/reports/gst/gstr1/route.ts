import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Gujarat GST code: 24
const GUJARAT_GST_PREFIX = '24'

function isGujaratGST(gstNumber: string | null | undefined): boolean {
  if (!gstNumber) return true // No GST → assume local
  return gstNumber.trimStart().startsWith(GUJARAT_GST_PREFIX)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const { data: salesOrders } = await supabase
      .from('SalesOrder')
      .select('id, orderNo, orderDate, status, customerId')
      .gte('orderDate', startDate.toISOString())
      .lte('orderDate', endDate.toISOString())
      .neq('status', 'Cancelled')
      .order('orderDate', { ascending: true })

    const ordersArr: any[] = salesOrders || []

    // Fetch customers
    const customerIds = [...new Set(ordersArr.map((o: any) => o.customerId).filter(Boolean))]
    let customerMap: Record<string, any> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('Customer')
        .select('id, companyName, gstNumber, billingAddress')
        .in('id', customerIds)
      if (customers) {
        customerMap = Object.fromEntries(customers.map((c: any) => [c.id, c]))
      }
    }

    const invoiceWise = ordersArr.map((so: any) => {
      const customer = customerMap[so.customerId] || {}
      const isInterState = !isGujaratGST(customer.gstNumber)
      const gstNumber = customer.gstNumber || 'N/A'

      return {
        invoiceNo: so.orderNo,
        invoiceDate: so.orderDate ? so.orderDate.split('T')[0] : '',
        customerName: customer.companyName || '—',
        customerGst: gstNumber,
        customerState: isInterState ? 'Other' : 'Gujarat',
        isInterState,
        totalTaxableValue: so.taxableAmount || 0,
        totalCgst: so.cgstAmount || 0,
        totalSgst: so.sgstAmount || 0,
        totalIgst: so.igstAmount || 0,
        totalTax: (so.cgstAmount || 0) + (so.sgstAmount || 0) + (so.igstAmount || 0),
      }
    })

    const totals = {
      totalTaxableValue: invoiceWise.reduce((s: number, i: any) => s + i.totalTaxableValue, 0),
      totalCgst: invoiceWise.reduce((s: number, i: any) => s + i.totalCgst, 0),
      totalSgst: invoiceWise.reduce((s: number, i: any) => s + i.totalSgst, 0),
      totalIgst: invoiceWise.reduce((s: number, i: any) => s + i.totalIgst, 0),
    }
    totals.totalTax = totals.totalCgst + totals.totalSgst + totals.totalIgst

    // Round all totals
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] = Math.round((totals[key] as number) * 100) / 100
    }

    return NextResponse.json({
      period: `${MONTHS[month - 1]} ${year}`,
      company: 'Dhanya Lifestyle LLP',
      gstNumber: '24AAACR5055K1Z3',
      invoiceCount: invoiceWise.length,
      invoiceWise,
      ...totals,
    })
  } catch (error) {
    console.error('GSTR-1 API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate GSTR-1 report' },
      { status: 500 }
    )
  }
}
