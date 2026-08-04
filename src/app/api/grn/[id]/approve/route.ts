import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── POST: Approve GRN ─────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const { data: grn, error: findErr } = await supabase
      .from('GrnNote')
      .select()
      .eq('id', id)
      .single()

    if (findErr || !grn) {
      return NextResponse.json({ error: 'GRN not found' }, { status: 404 })
    }

    if (grn.status !== 'Inspected' && grn.status !== 'Draft') {
      return NextResponse.json(
        { error: 'Only Draft or Inspected GRNs can be approved' },
        { status: 400 },
      )
    }

    // Fetch GRN items
    const { data: grnItems, error: itemsErr } = await supabase
      .from('GrnItem')
      .select('*')
      .eq('grnId', id)

    if (itemsErr) throw itemsErr

    // Update GRN status
    const { error: updErr } = await supabase
      .from('GrnNote')
      .update({ status: 'Approved', updatedAt: new Date().toISOString() })
      .eq('id', id)
    if (updErr) throw updErr

    // Update fabric stock for each accepted item
    for (const item of grnItems || []) {
      if (item.acceptedQty > 0) {
        // Find existing stock by fabricName (+ supplierId if available)
        let stockQuery = supabase
          .from('FabricStock')
          .select('*')
          .eq('fabricName', item.fabricName)

        if (grn.supplierId) {
          stockQuery = stockQuery.eq('supplierId', grn.supplierId)
        }

        const { data: existingStocks } = await stockQuery.limit(1)
        const existingStock = existingStocks && existingStocks.length > 0 ? existingStocks[0] : null

        if (existingStock) {
          const newMeters = existingStock.availableMeters + item.acceptedQty
          const newValue = existingStock.totalValue + (item.acceptedQty * item.ratePerUnit)
          const newAvg = newMeters > 0 ? newValue / newMeters : item.ratePerUnit

          const { error: stockUpdErr } = await supabase
            .from('FabricStock')
            .update({
              availableMeters: newMeters,
              totalValue: newValue,
              averageCost: newAvg,
              supplierId: grn.supplierId || existingStock.supplierId,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', existingStock.id)

          if (stockUpdErr) throw stockUpdErr
        } else {
          const now = new Date().toISOString()
          const { error: stockInsErr } = await supabase
            .from('FabricStock')
            .insert({
              fabricName: item.fabricName,
              supplierId: grn.supplierId,
              availableMeters: item.acceptedQty,
              reservedMeters: 0,
              averageCost: item.ratePerUnit,
              totalValue: item.acceptedQty * item.ratePerUnit,
              createdAt: now,
              updatedAt: now,
            })

          if (stockInsErr) throw stockInsErr
        }
      }
    }

    // Update PO received qty if linked
    if (grn.poId) {
      const totalAccepted = (grnItems || []).reduce((sum: number, i: any) => sum + (i.acceptedQty || 0), 0)
      const { data: po } = await supabase
        .from('PurchaseOrder')
        .select('receivedQty')
        .eq('id', grn.poId)
        .single()
      if (po) {
        const newReceivedQty = (po.receivedQty || 0) + totalAccepted
        await supabase
          .from('PurchaseOrder')
          .update({ receivedQty: newReceivedQty, updatedAt: new Date().toISOString() })
          .eq('id', grn.poId)
      }
    }

    // Fetch updated GRN with items
    const { data: updated } = await supabase
      .from('GrnNote')
      .select()
      .eq('id', id)
      .single()

    const { data: finalItems } = await supabase
      .from('GrnItem')
      .select('*')
      .eq('grnId', id)

    return NextResponse.json({ grn: { ...updated, grnItems: finalItems || [] } })
  } catch (error) {
    console.error('GRN approve error:', error)
    return NextResponse.json({ error: 'Failed to approve GRN' }, { status: 500 })
  }
}
