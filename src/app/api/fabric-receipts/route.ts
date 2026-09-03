import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List fabric receipts (audit ledger) ──────────────────────────────
// Returns FabricReceipt rows FLATTENED with PO/GRN/supplier/stock info so
// the user can see "this 40m Pink Silk came from PO-001 via GRN-001 on
// 22 Aug". All joins are batched (no N+1):
//   - FabricStock: stockStyleNo / stockColor / stockLot / stockAvailableMeters
//   - GrnNote: grnNo (+ supplierName fallback)
//   - PurchaseOrder: poNumber
//   - Supplier: supplierName (fallback to grn.supplierName)
// Filters: poId / grnId / fabricStockId / supplierId / limit
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const poId = searchParams.get('poId')
    const grnId = searchParams.get('grnId')
    const fabricStockId = searchParams.get('fabricStockId')
    const supplierId = searchParams.get('supplierId')
    const limitParam = parseInt(searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(500, limitParam) : 200

    let query = supabase
      .from('FabricReceipt')
      .select('*')
      .order('receivedDate', { ascending: false })
      .limit(limit)

    if (poId) query = query.eq('poId', poId)
    if (grnId) query = query.eq('grnId', grnId)
    if (fabricStockId) query = query.eq('fabricStockId', fabricStockId)
    if (supplierId) query = query.eq('supplierId', supplierId)

    const { data: receipts, error } = await query
    if (error) throw error

    // ── Batch joins (all in parallel) ────────────────────────────────────
    const stockIds = [...new Set((receipts || []).map((r: any) => r.fabricStockId).filter(Boolean))]
    const grnIds = [...new Set((receipts || []).map((r: any) => r.grnId).filter(Boolean))]
    const poIds = [...new Set((receipts || []).map((r: any) => r.poId).filter(Boolean))]
    const supplierIds = [...new Set((receipts || []).map((r: any) => r.supplierId).filter(Boolean))]

    const [stockRes, grnRes, poRes, supplierRes] = await Promise.all([
      stockIds.length > 0
        ? supabase
            .from('FabricStock')
            .select('id, fabricName, color, lotNumber, styleNo, availableMeters')
            .in('id', stockIds)
        : Promise.resolve({ data: [] }),
      grnIds.length > 0
        ? supabase.from('GrnNote').select('id, grnNo, supplierName').in('id', grnIds)
        : Promise.resolve({ data: [] }),
      poIds.length > 0
        ? supabase.from('PurchaseOrder').select('id, poNumber').in('id', poIds)
        : Promise.resolve({ data: [] }),
      supplierIds.length > 0
        ? supabase.from('Supplier').select('id, name').in('id', supplierIds)
        : Promise.resolve({ data: [] }),
    ])

    const stockMap: Record<string, any> = Object.fromEntries((stockRes.data || []).map((s: any) => [s.id, s]))
    const grnMap: Record<string, any> = Object.fromEntries((grnRes.data || []).map((g: any) => [g.id, g]))
    const poMap: Record<string, any> = Object.fromEntries((poRes.data || []).map((p: any) => [p.id, p]))
    const supplierMap: Record<string, any> = Object.fromEntries((supplierRes.data || []).map((s: any) => [s.id, s]))

    return NextResponse.json({
      receipts: (receipts || []).map((r: any) => {
        const stock = r.fabricStockId ? stockMap[r.fabricStockId] || null : null
        const grn = r.grnId ? grnMap[r.grnId] || null : null
        return {
          ...r,
          // Flattened join fields
          grnNo: grn?.grnNo || null,
          poNumber: r.poId ? poMap[r.poId]?.poNumber || null : null,
          supplierName:
            (r.supplierId ? supplierMap[r.supplierId]?.name || null : null) ||
            grn?.supplierName ||
            null,
          stockFabricName: stock?.fabricName || null,
          stockColor: stock?.color || null,
          stockLot: stock?.lotNumber || null,
          stockStyleNo: stock?.styleNo || null,
          stockAvailableMeters: stock ? Number(stock.availableMeters) || 0 : null,
          rejectedQty: Math.max(0, (Number(r.receivedQty) || 0) - (Number(r.acceptedQty) || 0)),
        }
      }),
      total: receipts?.length || 0,
    })
  } catch (error: any) {
    console.error('Fabric Receipts API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load fabric receipts', detail: error?.message },
      { status: 500 },
    )
  }
}
