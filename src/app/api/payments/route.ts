import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { format } from 'date-fns'

// ─── GET: List payments ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('invoiceId')

    let query = supabase
      .from('Payment')
      .select('*, invoice:invoiceId(id, invoiceNo, totalAmount, paidAmount, paymentStatus)')
      .order('paymentDate', { ascending: false })

    if (invoiceId) query = query.eq('invoiceId', invoiceId)

    const { data: payments, error } = await query
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ payments: [], summary: { totalPayments: 0, totalCollected: 0 } })
      }
      throw error
    }

    const all = payments || []
    const totalCollected = all.reduce((s: number, p: any) => s + (p.amount || 0), 0)

    return NextResponse.json({
      payments: all,
      summary: {
        totalPayments: all.length,
        totalCollected: Math.round(totalCollected),
      },
    })
  } catch (error) {
    console.error('GET /api/payments error:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

// ─── POST: Record a payment against an invoice ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { invoiceId, amount, paymentMode, referenceNo, notes } = body

    if (!invoiceId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'invoiceId and amount (> 0) are required' }, { status: 400 })
    }

    // Fetch invoice to verify and update
    const { data: invoice, error: invErr } = await supabase
      .from('Invoice')
      .select('id, invoiceNo, totalAmount, paidAmount, paymentStatus')
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const inv = invoice as any
    const newPaidAmount = (inv.paidAmount || 0) + Number(amount)
    const newStatus = newPaidAmount >= inv.totalAmount ? 'Paid' : 'Partial'

    // Auto-generate payment number: PAY-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const prefix = `PAY-${today}-`
    const { data: lastPayments } = await supabase
      .from('Payment')
      .select('paymentNo')
      .ilike('paymentNo', `${prefix}%`)
      .order('paymentNo', { ascending: false })
      .limit(1)
    let seq = 1
    if (lastPayments && lastPayments.length > 0) {
      const lastSeq = parseInt(lastPayments[0].paymentNo.slice(prefix.length), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const paymentNo = `${prefix}${String(seq).padStart(3, '0')}`

    const now = new Date().toISOString()

    // Insert payment record
    const { data: payment, error: payErr } = await supabase
      .from('Payment')
      .insert({
        paymentNo,
        invoiceId,
        amount: Number(amount),
        paymentDate: now,
        paymentMode: paymentMode || 'Cash',
        referenceNo: referenceNo || null,
        notes: notes || null,
        createdAt: now,
      })
      .select()
      .single()

    if (payErr) throw payErr

    // Update invoice paid amount and status
    await supabase
      .from('Invoice')
      .update({
        paidAmount: newPaidAmount,
        paymentStatus: newStatus,
        updatedAt: now,
      })
      .eq('id', invoiceId)

    return NextResponse.json({
      ...payment,
      invoiceUpdated: {
        paidAmount: newPaidAmount,
        paymentStatus: newStatus,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/payments error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
