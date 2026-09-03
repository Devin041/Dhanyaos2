import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single GRN ───────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { data: grn, error } = await supabase
      .from('GrnNote')
      .select()
      .eq('id', id)
      .single()

    if (error || !grn) {
      return NextResponse.json({ error: 'GRN not found' }, { status: 404 })
    }

    // Fetch PO and supplier
    const [poRes, supplierRes, itemsRes] = await Promise.all([
      grn.poId
        ? supabase.from('PurchaseOrder').select('id, poNumber, fabricName, quantity, unit').eq('id', grn.poId).single()
        : Promise.resolve({ data: null }),
      grn.supplierId
        ? supabase.from('Supplier').select('id, name, supplierType, phone, email').eq('id', grn.supplierId).single()
        : Promise.resolve({ data: null }),
      supabase.from('GrnItem').select('*').eq('grnId', id).order('createdAt', { ascending: true }),
    ])

    return NextResponse.json({
      grn: {
        ...grn,
        purchaseOrder: poRes.data || null,
        supplier: supplierRes.data || null,
        grnItems: itemsRes.data || [],
      },
    })
  } catch (error) {
    console.error('GRN get error:', error)
    return NextResponse.json({ error: 'Failed to fetch GRN' }, { status: 500 })
  }
}

// ─── PATCH: Update GRN ─────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, notes, qualityRemarks, supplierName, receivedDate, items } = body

    const { data: existingGrn, error: findErr } = await supabase
      .from('GrnNote')
      .select()
      .eq('id', id)
      .single()

    if (findErr || !existingGrn) {
      return NextResponse.json({ error: 'GRN not found' }, { status: 404 })
    }

    // Cannot edit Approved or Rejected GRNs
    if (existingGrn.status === 'Approved' || existingGrn.status === 'Rejected') {
      return NextResponse.json(
        { error: `Cannot modify a GRN that is ${existingGrn.status}` },
        { status: 400 },
      )
    }

    // Build update data
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (qualityRemarks !== undefined) updateData.qualityRemarks = qualityRemarks
    if (supplierName !== undefined) updateData.supplierName = supplierName
    if (receivedDate !== undefined) updateData.receivedDate = new Date(receivedDate).toISOString()

    // If items are provided, replace all items
    if (items && Array.isArray(items)) {
      let totalReceivedQty = 0
      let totalAcceptedQty = 0
      let totalRejectedQty = 0

      const itemData = items.map((item: Record<string, unknown>) => {
        const receivedQty = Number(item.receivedQty) || 0
        const acceptedQty = Number(item.acceptedQty) || 0
        const rejectedQty = Number(item.rejectedQty) || 0
        const ratePerUnit = Number(item.ratePerUnit) || 0
        const totalValue = acceptedQty * ratePerUnit

        totalReceivedQty += receivedQty
        totalAcceptedQty += acceptedQty
        totalRejectedQty += rejectedQty

        return {
          grnId: id,
          // Preserve the PO-line link + color/lot through the delete-and-rebuild
          // so Draft-GRN edits don't orphan the GrnItem → POItem relation.
          poItemId: item.poItemId ? String(item.poItemId) : null,
          fabricName: String(item.fabricName || ''),
          color: item.color ? String(item.color) : null,
          lotNumber: item.lotNumber ? String(item.lotNumber) : null,
          orderedQty: Number(item.orderedQty) || 0,
          receivedQty,
          acceptedQty,
          rejectedQty,
          defectNotes: item.defectNotes ? String(item.defectNotes) : null,
          ratePerUnit,
          totalValue,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })

      updateData.totalReceivedQty = totalReceivedQty
      updateData.acceptedQty = totalAcceptedQty
      updateData.rejectedQty = totalRejectedQty

      // Delete old items, then update GRN, then insert new items
      const { error: delErr } = await supabase.from('GrnItem').delete().eq('grnId', id)
      if (delErr) throw delErr

      const { error: updErr } = await supabase.from('GrnNote').update(updateData).eq('id', id)
      if (updErr) throw updErr

      const { data: newItems, error: insErr } = await supabase
        .from('GrnItem')
        .insert(itemData)
        .select()
      if (insErr) throw insErr

      // Fetch the updated GRN
      const { data: updated } = await supabase.from('GrnNote').select().eq('id', id).single()

      // Fetch PO reference
      let purchaseOrder = null
      if (updated?.poId) {
        const { data: po } = await supabase
          .from('PurchaseOrder')
          .select('id, poNumber, fabricName')
          .eq('id', updated.poId)
          .single()
        purchaseOrder = po || null
      }

      return NextResponse.json({ grn: { ...updated, purchaseOrder, grnItems: newItems || [] } })
    }

    const { data: updated, error } = await supabase
      .from('GrnNote')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Fetch PO reference and items
    const [poRes, itemsRes] = await Promise.all([
      updated.poId
        ? supabase.from('PurchaseOrder').select('id, poNumber, fabricName').eq('id', updated.poId).single()
        : Promise.resolve({ data: null }),
      supabase.from('GrnItem').select('*').eq('grnId', id).order('createdAt', { ascending: true }),
    ])

    return NextResponse.json({
      grn: {
        ...updated,
        purchaseOrder: poRes.data || null,
        grnItems: itemsRes.data || [],
      },
    })
  } catch (error) {
    console.error('GRN update error:', error)
    return NextResponse.json({ error: 'Failed to update GRN' }, { status: 500 })
  }
}

// ─── DELETE: Delete GRN (only if Draft) ────────────────────────────────────

export async function DELETE(
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
    if (grn.status !== 'Draft') {
      return NextResponse.json(
        { error: 'Only Draft GRNs can be deleted' },
        { status: 400 },
      )
    }

    // Delete items first (cascade-like)
    await supabase.from('GrnItem').delete().eq('grnId', id)
    const { error } = await supabase.from('GrnNote').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('GRN delete error:', error)
    return NextResponse.json({ error: 'Failed to delete GRN' }, { status: 500 })
  }
}
