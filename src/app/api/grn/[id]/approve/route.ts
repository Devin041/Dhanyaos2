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

    // Update fabric stock for each accepted item AND create a FabricReceipt
    // row (audit ledger) so we can trace "this fabric came from PO-X via GRN-Y"
    for (const item of grnItems || []) {
      if (item.acceptedQty > 0) {
        // Find existing stock by fabricName + color + supplierId (color-wise
        // tracking — Pink Silk and Maroon Silk are separate stock rows)
        let stockQuery = supabase
          .from('FabricStock')
          .select('*')
          .eq('fabricName', item.fabricName)

        if (item.color) {
          stockQuery = stockQuery.eq('color', item.color)
        }
        if (grn.supplierId) {
          stockQuery = stockQuery.eq('supplierId', grn.supplierId)
        }
        if (item.lotNumber) {
          stockQuery = stockQuery.eq('lotNumber', item.lotNumber)
        }

        const { data: existingStocks } = await stockQuery.limit(1)
        const existingStock = existingStocks && existingStocks.length > 0 ? existingStocks[0] : null

        let fabricStockId: string

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
              color: item.color || existingStock.color,
              lotNumber: item.lotNumber || existingStock.lotNumber,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', existingStock.id)

          if (stockUpdErr) throw stockUpdErr
          fabricStockId = existingStock.id
        } else {
          const now = new Date().toISOString()
          const { data: newStock, error: stockInsErr } = await supabase
            .from('FabricStock')
            .insert({
              fabricName: item.fabricName,
              color: item.color || null,
              lotNumber: item.lotNumber || null,
              supplierId: grn.supplierId,
              availableMeters: item.acceptedQty,
              reservedMeters: 0,
              averageCost: item.ratePerUnit,
              totalValue: item.acceptedQty * item.ratePerUnit,
              createdAt: now,
              updatedAt: now,
            })
            .select('id')
            .single()

          if (stockInsErr) throw stockInsErr
          fabricStockId = newStock.id
        }

        // Create a FabricReceipt row (audit ledger — traceable to PO + GRN)
        try {
          await supabase.from('FabricReceipt').insert({
            fabricStockId,
            poId: grn.poId || null,
            grnId: grn.id,
            supplierId: grn.supplierId || null,
            fabricName: item.fabricName,
            color: item.color || null,
            lotNumber: item.lotNumber || null,
            receivedQty: item.receivedQty || 0,
            acceptedQty: item.acceptedQty,
            ratePerUnit: item.ratePerUnit,
            totalValue: item.acceptedQty * item.ratePerUnit,
            receivedDate: grn.receivedDate || new Date().toISOString(),
            notes: item.defectNotes || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        } catch (receiptErr: any) {
          // FabricReceipt table may not exist yet (migration pending) —
          // log but don't fail the approval (stock update already succeeded)
          console.error('FabricReceipt insert (non-fatal):', receiptErr?.message)
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
