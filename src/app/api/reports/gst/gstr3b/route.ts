import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    // Outward supplies (sales)
    const { data: salesOrders } = await supabase
      .from('SalesOrder')
      .select('totalAmount, totalCgst, totalSgst, totalIgst, totalGst')
      .gte('orderDate', startDate.toISOString())
      .lte('orderDate', endDate.toISOString())
      .neq('status', 'Cancelled')

    const salesArr: any[] = salesOrders || []

    const outwardTaxable = salesArr.reduce(
      (s: number, o: any) => s + ((o.totalAmount || 0) - (o.totalGst || 0)),
      0
    )
    const outwardCgst = salesArr.reduce((s: number, o: any) => s + (o.totalCgst || 0), 0)
    const outwardSgst = salesArr.reduce((s: number, o: any) => s + (o.totalSgst || 0), 0)
    const outwardIgst = salesArr.reduce((s: number, o: any) => s + (o.totalIgst || 0), 0)

    // Input tax credit (purchases)
    const { data: purchaseOrders } = await supabase
      .from('PurchaseOrder')
      .select('subtotal, totalCgst, totalSgst, totalIgst, totalGst')
      .gte('createdAt', startDate.toISOString())
      .lte('createdAt', endDate.toISOString())
      .neq('status', 'Cancelled')

    const poArr: any[] = purchaseOrders || []

    const itcTaxable = poArr.reduce((s: number, o: any) => s + (o.subtotal || 0), 0)
    const itcCgst = poArr.reduce((s: number, o: any) => s + (o.totalCgst || 0), 0)
    const itcSgst = poArr.reduce((s: number, o: any) => s + (o.totalSgst || 0), 0)
    const itcIgst = poArr.reduce((s: number, o: any) => s + (o.totalIgst || 0), 0)
    const itcEligible = itcCgst + itcSgst + itcIgst

    // Net tax payable
    const netCgst = outwardCgst - itcCgst
    const netSgst = outwardSgst - itcSgst
    const netIgst = outwardIgst - itcIgst
    const netTotal = netCgst + netSgst + netIgst

    const round2 = (v: number) => Math.round(v * 100) / 100

    return NextResponse.json({
      period: `${MONTHS[month - 1]} ${year}`,
      company: 'Dhanya Lifestyle LLP',
      gstNumber: '24AAACR5055K1Z3',
      outwardSupplies: {
        taxableValue: round2(outwardTaxable),
        cgst: round2(outwardCgst),
        sgst: round2(outwardSgst),
        igst: round2(outwardIgst),
        totalTax: round2(outwardCgst + outwardSgst + outwardIgst),
      },
      inputTaxCredit: {
        taxableValue: round2(itcTaxable),
        cgst: round2(itcCgst),
        sgst: round2(itcSgst),
        igst: round2(itcIgst),
        itcEligible: round2(itcEligible),
      },
      netTaxPayable: {
        cgst: round2(netCgst),
        sgst: round2(netSgst),
        igst: round2(netIgst),
        total: round2(netTotal),
      },
    })
  } catch (error) {
    console.error('GSTR-3B API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate GSTR-3B report' },
      { status: 500 }
    )
  }
}
