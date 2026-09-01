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
    // Stamp the PO's product (styleNo) onto the stock so Fabric Stock shows
    // which product the material arrived for.
    let poStyleNo: string | null = null
    if (grn.poId) {
      try {
        const { data: poRow } = await supabase
          .from('PurchaseOrder')
          .select('styleNo')
          .eq('id', grn.poId)
          .single()
        poStyleNo = poRow?.styleNo || null
        // Older POs never had header styleNo persisted — fall back to the
        // first line item that carries a styleNo
        if (!poStyleNo) {
          const { data: firstItem } = await supabase
            .from('POItem')
            .select('styleNo')
            .eq('purchaseOrderId', grn.poId)
            .not('styleNo', 'is', null)
            .order('createdAt', { ascending: true })
            .limit(1)
          poStyleNo = firstItem && firstItem.length > 0 ? firstItem[0].styleNo : null
        }
      } catch {
        poStyleNo = null
      }
    }

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

          let { error: stockUpdErr } = await supabase
            .from('FabricStock')
            .update({
              availableMeters: newMeters,
              totalValue: newValue,
              averageCost: newAvg,
              supplierId: grn.supplierId || existingStock.supplierId,
              color: item.color || existingStock.color,
              lotNumber: item.lotNumber || existingStock.lotNumber,
              styleNo: poStyleNo || (existingStock as any).styleNo || null,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', existingStock.id)

          // styleNo column may not exist yet (migration pending) — retry without it
          if (stockUpdErr && String(stockUpdErr.message || '').includes('styleNo')) {
            const r = await supabase
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
            stockUpdErr = r.error
          }
          if (stockUpdErr) throw stockUpdErr
          fabricStockId = existingStock.id
        } else {
          const now = new Date().toISOString()
          let newStock: any = null
          let stockInsErr: any = null
          const full = await supabase
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
              styleNo: poStyleNo || null,
              createdAt: now,
              updatedAt: now,
            })
            .select('id')
            .single()
          newStock = full.data
          stockInsErr = full.error
          // styleNo column may not exist yet (migration pending) — retry without it
          if (stockInsErr && String(stockInsErr.message || '').includes('styleNo')) {
            const r = await supabase
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
            newStock = r.data
            stockInsErr = r.error
          }
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

    // Update PO received quantities if linked.
    // Line-level first (GrnItem.poItemId → POItem.receivedQty), then recompute
    // the PO header status from its lines: all lines fully received → Received,
    // any partial progress → Partial.
    if (grn.poId) {
      try {
        const linkedItems = (grnItems || []).filter((i: any) => i.poItemId && (i.acceptedQty || 0) > 0)
        for (const item of linkedItems) {
          try {
            const { data: poItem } = await supabase
              .from('POItem')
              .select('id, quantity, receivedQty, status')
              .eq('id', item.poItemId)
              .single()
            if (!poItem) continue
            const newReceived = (poItem.receivedQty || 0) + (item.acceptedQty || 0)
            const newLineStatus = poItem.quantity > 0 && newReceived >= poItem.quantity ? 'Received' : 'Partial'
            await supabase
              .from('POItem')
              .update({ receivedQty: newReceived, status: newLineStatus, updatedAt: new Date().toISOString() })
              .eq('id', item.poItemId)
          } catch (lineErr: any) {
            console.error('POItem receivedQty update (non-fatal):', lineErr?.message)
          }
        }

        // Recompute PO header from its line items
        const { data: poItems } = await supabase
          .from('POItem')
          .select('quantity, receivedQty')
          .eq('purchaseOrderId', grn.poId)
        const { data: currentPo } = await supabase
          .from('PurchaseOrder')
          .select('status, receivedQty')
          .eq('id', grn.poId)
          .single()
        if (currentPo && currentPo.status !== 'Cancelled') {
          const updatePayload: Record<string, any> = { updatedAt: new Date().toISOString() }
          if (poItems && poItems.length > 0) {
            const totalOrdered = poItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0)
            const totalReceived = poItems.reduce((s: number, i: any) => s + (i.receivedQty || 0), 0)
            updatePayload.receivedQty = totalReceived
            const allLinesDone = poItems.every((i: any) => i.quantity > 0 && (i.receivedQty || 0) >= i.quantity)
            const anyProgress = poItems.some((i: any) => (i.receivedQty || 0) > 0)
            if (allLinesDone || (totalOrdered > 0 && totalReceived >= totalOrdered)) updatePayload.status = 'Received'
            else if (anyProgress) updatePayload.status = 'Partial'
          } else {
            const totalAccepted = (grnItems || []).reduce((sum: number, i: any) => sum + (i.acceptedQty || 0), 0)
            updatePayload.receivedQty = (currentPo.receivedQty || 0) + totalAccepted
          }
          await supabase.from('PurchaseOrder').update(updatePayload).eq('id', grn.poId)
        }
      } catch (poErr: any) {
        console.error('PO receive-status recompute (non-fatal):', poErr?.message)
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
