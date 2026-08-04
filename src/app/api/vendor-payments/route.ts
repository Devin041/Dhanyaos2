import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// --- GET /api/vendor-payments ---------------------------------------------
// List all payments, optionally filtered by vendorId or billId

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId') || ''
    const billId = searchParams.get('billId') || ''
    const limit = Number(searchParams.get('limit') || '50')

    let query = supabase
      .from('VendorPayment')
      .select('*')
      .order('paymentDate', { ascending: false })
      .limit(limit)

    if (vendorId) query = query.eq('vendorId', vendorId)
    if (billId) query = query.eq('vendorBillId', billId)

    const { data: payments, error } = await query
    if (error) throw error

    // Enrich payments with vendorBill and vendor data
    const enrichedPayments = await Promise.all(
      (payments || []).map(async (p) => {
        let vendorBill: any = null
        if (p.vendorBillId) {
          const { data: vb } = await supabase
            .from('VendorBill')
            .select('id, billNo, description, totalAmount, paidAmount')
            .eq('id', p.vendorBillId)
            .single()

          if (vb) {
            let vendor: any = null
            if (vb.vendorId) {
              const { data: v } = await supabase
                .from('Vendor')
                .select('id, vendorName')
                .eq('id', vb.vendorId)
                .single()
              vendor = v || null
            }
            vendorBill = { ...vb, vendor }
          }
        }
        return { ...p, vendorBill }
      })
    )

    const total = enrichedPayments.length
    const totalAmount = enrichedPayments.reduce((s, p) => s + p.amount, 0)

    return NextResponse.json({ payments: enrichedPayments, total, totalAmount })
  } catch (error) {
    console.error('GET /api/vendor-payments error:', error)
    return NextResponse.json({ error: 'Failed to load vendor payments' }, { status: 500 })
  }
}

// --- POST /api/vendor-payments --------------------------------------------
// Record a payment against a vendor bill

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { vendorBillId, amount, paymentDate, paymentMethod, referenceNo, notes } = body

    if (!vendorBillId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Bill ID and valid amount are required' },
        { status: 400 }
      )
    }

    // Validate bill exists
    const { data: bill, error: billErr } = await supabase
      .from('VendorBill')
      .select('*')
      .eq('id', vendorBillId)
      .single()

    if (billErr || !bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    if (bill.status === 'Paid') {
      return NextResponse.json({ error: 'This bill is already fully paid' }, { status: 400 })
    }

    if (bill.status === 'Cancelled') {
      return NextResponse.json({ error: 'Cannot pay a cancelled bill' }, { status: 400 })
    }

    const remaining = bill.totalAmount - bill.paidAmount
    if (amount > remaining + 0.01) {
      return NextResponse.json(
        { error: `Payment amount \u20b9${amount.toFixed(2)} exceeds remaining balance \u20b9${remaining.toFixed(2)}` },
        { status: 400 }
      )
    }

    // Generate payment number
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const prefix = `VP-${dateStr}-`
    const { data: todayPayments } = await supabase
      .from('VendorPayment')
      .select('paymentNo')
      .ilike('paymentNo', `${prefix}%`)
      .order('paymentNo', { ascending: false })
      .limit(1)
    let nextSeq = 1
    if (todayPayments && todayPayments.length > 0) {
      const lastSeq = parseInt(todayPayments[0].paymentNo.slice(prefix.length), 10)
      nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1
    }
    const paymentNo = `${prefix}${String(nextSeq).padStart(3, '0')}`

    const now = new Date().toISOString()

    // Create the payment
    const { data: payment, error: payErr } = await supabase
      .from('VendorPayment')
      .insert({
        paymentNo,
        vendorBillId,
        vendorId: bill.vendorId,
        amount: Math.round(Number(amount) * 100) / 100,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : now,
        paymentMethod: paymentMethod || 'Bank Transfer',
        referenceNo: referenceNo?.trim() || null,
        notes: notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .select('*')
      .single()

    if (payErr) throw payErr

    // Update bill paid amount and status
    const newPaidAmount = Math.round((bill.paidAmount + Number(amount)) * 100) / 100
    let newStatus = bill.status
    if (newPaidAmount >= bill.totalAmount - 0.01) {
      newStatus = 'Paid'
    } else if (newPaidAmount > 0) {
      newStatus = 'Partially Paid'
    }

    await supabase
      .from('VendorBill')
      .update({
        paidAmount: Math.min(newPaidAmount, bill.totalAmount),
        status: newStatus,
        updatedAt: now,
      })
      .eq('id', vendorBillId)

    return NextResponse.json({ payment }, { status: 201 })
  } catch (error) {
    console.error('POST /api/vendor-payments error:', error)
    return NextResponse.json({ error: 'Failed to record vendor payment' }, { status: 500 })
  }
}

// --- DELETE /api/vendor-payments?id=xxx -------------------------------------
// Delete a payment (only if not the only one and bill isn't completed long ago)

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 })
    }

    const { data: payment, error: payErr } = await supabase
      .from('VendorPayment')
      .select('*')
      .eq('id', id)
      .single()

    if (payErr || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Fetch the bill
    const { data: vendorBill, error: billErr } = await supabase
      .from('VendorBill')
      .select('*')
      .eq('id', payment.vendorBillId)
      .single()

    if (billErr || !vendorBill) {
      return NextResponse.json({ error: 'Vendor bill not found' }, { status: 500 })
    }

    // Reverse the payment from the bill
    const newPaid = Math.max(0, vendorBill.paidAmount - payment.amount)
    let newStatus: string
    if (newPaid <= 0.01) {
      newStatus = 'Pending'
    } else {
      newStatus = 'Partially Paid'
    }
    // Check if bill was overdue before
    if (vendorBill.dueDate && new Date(vendorBill.dueDate) < new Date() && newStatus === 'Pending') {
      newStatus = 'Overdue'
    }

    const now = new Date().toISOString()

    await supabase
      .from('VendorBill')
      .update({
        paidAmount: Math.round(newPaid * 100) / 100,
        status: newStatus,
        updatedAt: now,
      })
      .eq('id', payment.vendorBillId)

    const { error } = await supabase
      .from('VendorPayment')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/vendor-payments error:', error)
    return NextResponse.json({ error: 'Failed to delete vendor payment' }, { status: 500 })
  }
}
