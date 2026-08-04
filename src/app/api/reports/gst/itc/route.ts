import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Gujarat GST code: 24
const GUJARAT_GST_PREFIX = '24'

function isGujaratGST(gstNumber: string | null | undefined): boolean {
  if (!gstNumber) return true
  return gstNumber.trimStart().startsWith(GUJARAT_GST_PREFIX)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const { data: purchaseOrders } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, createdAt, supplierId, totalGst, totalAmount, status')
      .gte('createdAt', startDate.toISOString())
      .lte('createdAt', endDate.toISOString())
      .neq('status', 'Cancelled')
      .order('createdAt', { ascending: true })

    const poArr: any[] = purchaseOrders || []

    // Fetch suppliers
    const supplierIds = [...new Set(poArr.map((po: any) => po.supplierId).filter(Boolean))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name, gstNumber, address')
        .in('id', supplierIds)
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
      }
    }

    // Fetch items for each PO
    const poIds = poArr.map((po: any) => po.id)
    const poItemsMap: Record<string, any[]> = {}
    if (poIds.length > 0) {
      // Assuming PO items are in a separate table (PurchaseOrderItem or similar)
      // Since the schema doesn't have this, we skip items and use PO-level data
    }

    const round2 = (v: number) => Math.round(v * 100) / 100

    const register = poArr.map((po: any) => {
      const supplier = supplierMap[po.supplierId] || {}
      const isInterState = !isGujaratGST(supplier.gstNumber)

      return {
        poNumber: po.poNumber,
        poDate: po.createdAt ? po.createdAt.split('T')[0] : '',
        supplierName: supplier.name || 'Unknown',
        supplierGst: supplier.gstNumber || 'N/A',
        supplierState: isInterState ? 'Other' : 'Gujarat',
        isInterState,
        items: [],
        totalTaxable: round2(po.taxableAmount || 0),
        totalCgst: round2(po.cgstAmount || 0),
        totalSgst: round2(po.sgstAmount || 0),
        totalIgst: round2(po.igstAmount || 0),
        totalTax: round2(po.totalGst || 0),
        totalAmount: round2(po.totalAmount || 0),
        itcEligible: (po.totalGst || 0) > 0,
        status: po.status,
      }
    })

    const totals = {
      totalTaxable: register.reduce((s: number, r: any) => s + r.totalTaxable, 0),
      totalCgst: register.reduce((s: number, r: any) => s + r.totalCgst, 0),
      totalSgst: register.reduce((s: number, r: any) => s + r.totalSgst, 0),
      totalIgst: register.reduce((s: number, r: any) => s + r.totalIgst, 0),
    }
    totals.totalTax = round2(totals.totalCgst + totals.totalSgst + totals.totalIgst)

    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] = round2(totals[key] as number)
    }

    return NextResponse.json({
      period: `${MONTHS[month - 1]} ${year}`,
      register,
      ...totals,
    })
  } catch (error) {
    console.error('ITC Register API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate ITC register' },
      { status: 500 }
    )
  }
}
