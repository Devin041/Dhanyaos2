import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single supplier return detail ──────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: supplierReturn, error } = await supabase
      .from('SupplierReturn')
      .select('*, purchaseOrder:purchaseOrderId(id,poNumber,supplierId,totalAmount,paidAmount,status), items:SupplierReturnItem(*)')
      .eq('id', id)
      .single()

    if (error || !supplierReturn) {
      return NextResponse.json({ error: 'Supplier return not found' }, { status: 404 })
    }

    return NextResponse.json({ supplierReturn })
  } catch (error) {
    console.error('Error fetching supplier return:', error)
    return NextResponse.json({ error: 'Failed to fetch supplier return' }, { status: 500 })
  }
}

// ─── PATCH: Update supplier return (resolve, status change) ──────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, creditAmount, sentVia, lrNumber, status: newStatus, notes } = body

    const { data: supplierReturn, error: srErr } = await supabase
      .from('SupplierReturn')
      .select('*, purchaseOrder:purchaseOrderId(*), items:SupplierReturnItem(*)')
      .eq('id', id)
      .single()

    if (srErr || !supplierReturn) {
      return NextResponse.json({ error: 'Supplier return not found' }, { status: 404 })
    }

    if (action === 'credit') {
      if (!creditAmount || creditAmount <= 0) {
        return NextResponse.json({ error: 'Credit amount must be positive' }, { status: 400 })
      }

      // Adjust PO amounts (decrement) — read current, calculate, update
      const { data: po } = await supabase
        .from('PurchaseOrder')
        .select('totalAmount,paidAmount')
        .eq('id', supplierReturn.purchaseOrderId)
        .single()
      if (po) {
        await supabase
          .from('PurchaseOrder')
          .update({
            totalAmount: (po.totalAmount || 0) - creditAmount,
            paidAmount: (po.paidAmount || 0) - creditAmount,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', supplierReturn.purchaseOrderId)
      }

      // Create credit transaction
      const { error: txErr } = await supabase.from('Transaction').insert({
        type: 'Credit',
        category: 'Purchase Credit',
        amount: creditAmount,
        description: `Purchase credit for ${supplierReturn.returnNo} - ${supplierReturn.supplierName}`,
        referenceNo: supplierReturn.returnNo,
        referenceType: 'SupplierReturn',
        referenceId: supplierReturn.id,
      })
      if (txErr) throw txErr

      // Update return
      const { data: updated, error: updErr } = await supabase
        .from('SupplierReturn')
        .update({
          resolutionType: 'Credit',
          creditAmount,
          status: 'Credit Received',
          resolutionDate: new Date().toISOString(),
          notes: notes || supplierReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:SupplierReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ supplierReturn: updated })

    } else if (action === 'mark_sent') {
      const totalReturnedQty = (supplierReturn.items ?? []).reduce((sum: number, item: any) => sum + item.quantity, 0)

      // Deduct from FabricStock immediately
      const { data: fabricStocks } = await supabase
        .from('FabricStock')
        .select('*')
        .eq('supplierId', supplierReturn.supplierId)
        .limit(1)

      if (fabricStocks && fabricStocks.length > 0) {
        const stock = fabricStocks[0]
        const deductQty = Math.min(totalReturnedQty, stock.availableMeters)
        await supabase
          .from('FabricStock')
          .update({
            availableMeters: stock.availableMeters - deductQty,
            totalValue: stock.totalValue - (deductQty * stock.averageCost),
            updatedAt: new Date().toISOString(),
          })
          .eq('id', stock.id)
      }

      // Update return
      const { data: updated, error: updErr } = await supabase
        .from('SupplierReturn')
        .update({
          status: 'Sent',
          sentDate: new Date().toISOString(),
          sentVia: sentVia || null,
          lrNumber: lrNumber || null,
          notes: notes || supplierReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:SupplierReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ supplierReturn: updated })

    } else if (action === 'reject') {
      const { data: updated, error: updErr } = await supabase
        .from('SupplierReturn')
        .update({
          resolutionType: 'Rejected',
          status: 'Rejected',
          resolutionDate: new Date().toISOString(),
          notes: notes || supplierReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:SupplierReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ supplierReturn: updated })

    } else if (action === 'updateStatus') {
      if (!newStatus) {
        return NextResponse.json({ error: 'Status is required' }, { status: 400 })
      }
      const { data: updated, error: updErr } = await supabase
        .from('SupplierReturn')
        .update({
          status: newStatus,
          notes: notes || supplierReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:SupplierReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ supplierReturn: updated })

    } else {
      return NextResponse.json({ error: 'Invalid action. Use credit, mark_sent, reject, or updateStatus' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error updating supplier return:', error)
    return NextResponse.json({ error: 'Failed to update supplier return' }, { status: 500 })
  }
}
