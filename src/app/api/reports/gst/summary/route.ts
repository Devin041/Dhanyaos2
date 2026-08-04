import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const type = searchParams.get('type') || 'monthly'

    const now = new Date()
    let startDate: Date
    let endDate: Date

    if (from && to) {
      startDate = new Date(from)
      endDate = new Date(to)
      endDate.setHours(23, 59, 59, 999)
    } else {
      if (type === 'quarterly') {
        const quarter = Math.floor(now.getMonth() / 3)
        startDate = new Date(now.getFullYear(), quarter * 3, 1)
        endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999)
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      }
    }

    const startDateStr = startDate.toISOString()
    const endDateStr = endDate.toISOString()

    // Outward supplies (sales)
    const [salesRes, purchaseRes] = await Promise.all([
      supabase.from('SalesOrder')
        .select('totalAmount, totalCgst, totalSgst, totalIgst, totalGst')
        .gte('orderDate', startDateStr)
        .lte('orderDate', endDateStr)
        .neq('status', 'Cancelled'),
      supabase.from('PurchaseOrder')
        .select('subtotal, totalCgst, totalSgst, totalIgst, totalGst')
        .gte('createdAt', startDateStr)
        .lte('createdAt', endDateStr)
        .neq('status', 'Cancelled'),
    ])

    const salesArr: any[] = salesRes.data || []
    const purchaseArr: any[] = purchaseRes.data || []

    const outwardTaxable = salesArr.reduce((s: number, o: any) => s + ((o.totalAmount || 0) - (o.totalGst || 0)), 0)
    const outwardCgst = salesArr.reduce((s: number, o: any) => s + (o.totalCgst || 0), 0)
    const outwardSgst = salesArr.reduce((s: number, o: any) => s + (o.totalSgst || 0), 0)
    const outwardIgst = salesArr.reduce((s: number, o: any) => s + (o.totalIgst || 0), 0)

    const itcTaxable = purchaseArr.reduce((s: number, o: any) => s + (o.subtotal || 0), 0)
    const itcCgst = purchaseArr.reduce((s: number, o: any) => s + (o.totalCgst || 0), 0)
    const itcSgst = purchaseArr.reduce((s: number, o: any) => s + (o.totalSgst || 0), 0)
    const itcIgst = purchaseArr.reduce((s: number, o: any) => s + (o.totalIgst || 0), 0)
    const itcEligible = itcCgst + itcSgst + itcIgst

    const netCgst = outwardCgst - itcCgst
    const netSgst = outwardSgst - itcSgst
    const netIgst = outwardIgst - itcIgst
    const netTotal = netCgst + netSgst + netIgst

    return NextResponse.json({
      period: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        type,
        label: `${startDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' })} — ${endDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`,
      },
      outwardSupplies: {
        taxableValue: Math.round(outwardTaxable * 100) / 100,
        cgst: Math.round(outwardCgst * 100) / 100,
        sgst: Math.round(outwardSgst * 100) / 100,
        igst: Math.round(outwardIgst * 100) / 100,
        totalTax: Math.round((outwardCgst + outwardSgst + outwardIgst) * 100) / 100,
      },
      inputTaxCredit: {
        taxableValue: Math.round(itcTaxable * 100) / 100,
        cgst: Math.round(itcCgst * 100) / 100,
        sgst: Math.round(itcSgst * 100) / 100,
        igst: Math.round(itcIgst * 100) / 100,
        itcEligible: Math.round(itcEligible * 100) / 100,
      },
      netTaxPayable: {
        cgst: Math.round(netCgst * 100) / 100,
        sgst: Math.round(netSgst * 100) / 100,
        igst: Math.round(netIgst * 100) / 100,
        total: Math.round(netTotal * 100) / 100,
      },
    })
  } catch (error) {
    console.error('GST Summary API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate GST summary' },
      { status: 500 }
    )
  }
}
