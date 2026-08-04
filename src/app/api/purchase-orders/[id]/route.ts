import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'

// ─── GET: Single PO with supplier details ────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: po, error } = await supabase
      .from('PurchaseOrder')
      .select()
      .eq('id', id)
      .single()

    if (error || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // Fetch supplier
    let supplier = null
    if (po.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone, email, paymentTerms, rating, status')
        .eq('id', po.supplierId)
        .single()
      supplier = s || null
    }

    return NextResponse.json({
      id: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplier,
      fabricName: po.fabricName,
      quantity: po.quantity,
      unit: po.unit,
      ratePerUnit: po.ratePerUnit,
      totalAmount: po.totalAmount,
      expectedDelivery: po.expectedDelivery
        ? format(new Date(po.expectedDelivery), 'yyyy-MM-dd')
        : null,
      status: po.status,
      paymentStatus: po.paymentStatus,
      paidAmount: po.paidAmount,
      receivedQty: po.receivedQty,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    })
  } catch (error) {
    console.error('Purchase Order GET by ID error:', error)
    return NextResponse.json({ error: 'Failed to load purchase order' }, { status: 500 })
  }
}

// ─── PATCH: Update PO (status, goods receipt, payment) ───────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: existing, error: findErr } = await supabase
      .from('PurchaseOrder')
      .select()
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const body = await request.json()
    const updateData: Record<string, any> = {}
    updateData.updatedAt = new Date().toISOString()

    // Status transitions
    if (body.status) {
      const validTransitions: Record<string, string[]> = {
        Pending: ['Approved', 'Cancelled'],
        Approved: ['Ordered', 'Cancelled'],
        Ordered: ['Received', 'Cancelled'],
        Received: [],
        Cancelled: [],
      }
      const allowed = validTransitions[existing.status] || []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          {
            error: `Invalid transition from "${existing.status}" to "${body.status}"`,
          },
          { status: 400 }
        )
      }
      updateData.status = body.status
    }

    // Goods receipt
    if (body.receivedQty !== undefined && body.status === 'Received') {
      if (existing.status !== 'Ordered') {
        return NextResponse.json(
          { error: 'Can only record receipt for "Ordered" purchase orders' },
          { status: 400 }
        )
      }
      updateData.receivedQty = body.receivedQty
      updateData.status = 'Received'
    }

    // Payment recording
    if (body.paidAmount !== undefined && body.paymentStatus) {
      const newPaid = body.paidAmount
      if (newPaid < 0) {
        return NextResponse.json({ error: 'Paid amount cannot be negative' }, { status: 400 })
      }
      updateData.paidAmount = newPaid
      updateData.paymentStatus = body.paymentStatus

      if (newPaid >= existing.totalAmount) {
        updateData.paymentStatus = 'Paid'
        updateData.paidAmount = existing.totalAmount
      } else if (newPaid > 0) {
        updateData.paymentStatus = 'Partial'
      } else {
        updateData.paymentStatus = 'Unpaid'
      }
    }

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('PurchaseOrder')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Fetch supplier
    let supplier = null
    if (updated.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone, email, paymentTerms, rating, status')
        .eq('id', updated.supplierId)
        .single()
      supplier = s || null
    }

    return NextResponse.json({
      id: updated.id,
      poNumber: updated.poNumber,
      supplierId: updated.supplierId,
      supplier,
      fabricName: updated.fabricName,
      quantity: updated.quantity,
      unit: updated.unit,
      ratePerUnit: updated.ratePerUnit,
      totalAmount: updated.totalAmount,
      expectedDelivery: updated.expectedDelivery
        ? format(new Date(updated.expectedDelivery), 'yyyy-MM-dd')
        : null,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      paidAmount: updated.paidAmount,
      receivedQty: updated.receivedQty,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error('Purchase Order PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 })
  }
}
