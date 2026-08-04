import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single customer return detail ──────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: customerReturn, error } = await supabase
      .from('CustomerReturn')
      .select('*, salesOrder:salesOrderId(id,orderNo,customerName,totalAmount,status,paidAmount), deliveryChallan:deliveryChallanId(id,challanNo), items:CustomerReturnItem(*)')
      .eq('id', id)
      .single()

    if (error || !customerReturn) {
      return NextResponse.json({ error: 'Customer return not found' }, { status: 404 })
    }

    return NextResponse.json({ customerReturn })
  } catch (error) {
    console.error('Error fetching customer return:', error)
    return NextResponse.json({ error: 'Failed to fetch customer return' }, { status: 500 })
  }
}

// ─── PATCH: Update customer return (resolve, status change) ──────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, refundAmount, creditNoteAmount, status: newStatus, notes } = body

    const { data: customerReturn, error: crErr } = await supabase
      .from('CustomerReturn')
      .select('*, salesOrder:salesOrderId(*), items:CustomerReturnItem(*)')
      .eq('id', id)
      .single()

    if (crErr || !customerReturn) {
      return NextResponse.json({ error: 'Customer return not found' }, { status: 404 })
    }

    if (action === 'refund') {
      if (!refundAmount || refundAmount <= 0) {
        return NextResponse.json({ error: 'Refund amount must be positive' }, { status: 400 })
      }

      // Create debit transaction
      const { error: txErr } = await supabase.from('Transaction').insert({
        type: 'Debit',
        category: 'Refund',
        amount: refundAmount,
        description: `Refund for ${customerReturn.returnNo} - ${customerReturn.customerName}`,
        referenceNo: customerReturn.returnNo,
        referenceType: 'CustomerReturn',
        referenceId: customerReturn.id,
      })
      if (txErr) throw txErr

      // Update SO paid amount (decrement) — read current, calculate, update
      const { data: so } = await supabase
        .from('SalesOrder')
        .select('paidAmount')
        .eq('id', customerReturn.salesOrderId)
        .single()
      if (so) {
        await supabase
          .from('SalesOrder')
          .update({
            paidAmount: (so.paidAmount || 0) - refundAmount,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', customerReturn.salesOrderId)
      }

      // Update return
      const { data: updated, error: updErr } = await supabase
        .from('CustomerReturn')
        .update({
          resolutionType: 'Refund',
          refundAmount,
          status: 'Completed',
          resolutionDate: new Date().toISOString(),
          notes: notes || customerReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:CustomerReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ customerReturn: updated })

    } else if (action === 'credit_note') {
      if (!creditNoteAmount || creditNoteAmount <= 0) {
        return NextResponse.json({ error: 'Credit note amount must be positive' }, { status: 400 })
      }

      // Update customer credit limit (increment)
      const { data: customer } = await supabase
        .from('Customer')
        .select('creditLimit')
        .eq('id', customerReturn.customerId)
        .single()
      if (customer) {
        await supabase
          .from('Customer')
          .update({
            creditLimit: (customer.creditLimit || 0) + creditNoteAmount,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', customerReturn.customerId)
      }

      // Create alert
      const { error: alertErr } = await supabase.from('Alert').insert({
        type: 'credit_note',
        severity: 'info',
        title: 'Credit Note Issued',
        message: `Credit note ₹${creditNoteAmount.toLocaleString('en-IN')} issued to ${customerReturn.customerName} for ${customerReturn.returnNo}`,
      })
      if (alertErr) throw alertErr

      // Update return
      const { data: updated, error: updErr } = await supabase
        .from('CustomerReturn')
        .update({
          resolutionType: 'Credit Note',
          creditNoteAmount,
          status: 'Completed',
          resolutionDate: new Date().toISOString(),
          notes: notes || customerReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:CustomerReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ customerReturn: updated })

    } else if (action === 'replace') {
      const { data: updated, error: updErr } = await supabase
        .from('CustomerReturn')
        .update({
          resolutionType: 'Replace',
          status: 'In Process',
          notes: notes || customerReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:CustomerReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ customerReturn: updated })

    } else if (action === 'reject') {
      const { data: updated, error: updErr } = await supabase
        .from('CustomerReturn')
        .update({
          resolutionType: 'Rejected',
          status: 'Rejected',
          resolutionDate: new Date().toISOString(),
          notes: notes || customerReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:CustomerReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ customerReturn: updated })

    } else if (action === 'updateStatus') {
      if (!newStatus) {
        return NextResponse.json({ error: 'Status is required' }, { status: 400 })
      }
      const { data: updated, error: updErr } = await supabase
        .from('CustomerReturn')
        .update({
          status: newStatus,
          notes: notes || customerReturn.notes,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, items:CustomerReturnItem(*)')
        .single()
      if (updErr) throw updErr

      return NextResponse.json({ customerReturn: updated })

    } else {
      return NextResponse.json({ error: 'Invalid action. Use refund, credit_note, replace, reject, or updateStatus' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error updating customer return:', error)
    return NextResponse.json({ error: 'Failed to update customer return' }, { status: 500 })
  }
}
