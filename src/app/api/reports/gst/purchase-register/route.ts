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
    const supplierId = searchParams.get('supplierId')

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
      .from('PurchaseOrder')
      .select('*')
      .gte('createdAt', startDate.toISOString())
      .lte('createdAt', endDate.toISOString())
      .neq('status', 'Cancelled')
      .order('createdAt', { ascending: 'desc' })

    if (supplierId) {
      query = query.eq('supplierId', supplierId)
    }

    const { data: purchaseOrders } = await query
    const poArr: any[] = purchaseOrders || []

    // Fetch suppliers
    const supplierIds = [...new Set(poArr.map((po: any) => po.supplierId).filter(Boolean))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name, gstNumber')
        .in('id', supplierIds)
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
      }
    }

    const round2 = (v: number) => Math.round(v * 100) / 100

    const register = poArr.map((po: any) => {
      const supplier = supplierMap[po.supplierId] || {}
      const isInterState = !isGujaratGST(supplier.gstNumber)

      // PO-level data
      const totalTaxable = po.taxableAmount || 0
      const totalCgst = po.cgstAmount || 0
      const totalSgst = po.sgstAmount || 0
      const totalIgst = po.igstAmount || 0
      const totalTax = totalCgst + totalSgst + totalIgst

      return {
        poNumber: po.poNumber,
        poDate: po.createdAt ? po.createdAt.split('T')[0] : '',
        supplierName: supplier.name || 'Unknown',
        supplierGst: supplier.gstNumber || 'N/A',
        isInterState,
        status: po.status,
        itemRows: [],
        totalTaxable: round2(totalTaxable),
        totalCgst: round2(totalCgst),
        totalSgst: round2(totalSgst),
        totalIgst: round2(totalIgst),
        totalTax: round2(totalTax),
        totalAmount: round2(po.totalAmount || 0),
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
    console.error('Purchase Register API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate purchase register' },
      { status: 500 }
    )
  }
}
