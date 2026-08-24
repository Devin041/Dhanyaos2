import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List fabric receipts (audit ledger) ──────────────────────────────
// Returns FabricReceipt rows joined with PO/GRN/supplier info so the user can
// see "this 40m Pink Silk came from PO-001 via GRN-001 on 22 Aug".
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const poId = searchParams.get('poId')
    const grnId = searchParams.get('grnId')
    const fabricStockId = searchParams.get('fabricStockId')
    const supplierId = searchParams.get('supplierId')

    let query = supabase
      .from('FabricReceipt')
      .select('*')
      .order('receivedDate', { ascending: false })

    if (poId) query = query.eq('poId', poId)
    if (grnId) query = query.eq('grnId', grnId)
    if (fabricStockId) query = query.eq('fabricStockId', fabricStockId)
    if (supplierId) query = query.eq('supplierId', supplierId)

    const { data: receipts, error } = await query
    if (error) throw error

    // Fetch related PO numbers + GRN numbers + supplier names for display
    const poIds = [...new Set((receipts || []).map((r: any) => r.poId).filter(Boolean))]
    const grnIds = [...new Set((receipts || []).map((r: any) => r.grnId).filter(Boolean))]
    const supplierIds = [...new Set((receipts || []).map((r: any) => r.supplierId).filter(Boolean))]

    const [poRes, grnRes, supplierRes] = await Promise.all([
      poIds.length > 0
        ? supabase.from('PurchaseOrder').select('id, poNumber').in('id', poIds)
        : Promise.resolve({ data: [] }),
      grnIds.length > 0
        ? supabase.from('GrnNote').select('id, grnNo').in('id', grnIds)
        : Promise.resolve({ data: [] }),
      supplierIds.length > 0
        ? supabase.from('Supplier').select('id, name').in('id', supplierIds)
        : Promise.resolve({ data: [] }),
    ])

    const poMap: Record<string, any> = Object.fromEntries((poRes.data || []).map((p: any) => [p.id, p]))
    const grnMap: Record<string, any> = Object.fromEntries((grnRes.data || []).map((g: any) => [g.id, g]))
    const supplierMap: Record<string, any> = Object.fromEntries((supplierRes.data || []).map((s: any) => [s.id, s]))

    return NextResponse.json({
      receipts: (receipts || []).map((r: any) => ({
        ...r,
        purchaseOrder: r.poId ? poMap[r.poId] || null : null,
        grn: r.grnId ? grnMap[r.grnId] || null : null,
        supplier: r.supplierId ? supplierMap[r.supplierId] || null : null,
      })),
      total: receipts?.length || 0,
    })
  } catch (error: any) {
    console.error('Fabric Receipts API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load fabric receipts', detail: error?.message },
      { status: 500 }
    )
  }
}
