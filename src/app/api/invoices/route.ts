import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { format, addDays } from 'date-fns'

// ─── GET: List invoices ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')

    let query = supabase
      .from('Invoice')
      .select('*, customer:customerId(id, companyName), dispatch:dispatchId(id, dispatchNo), payments:Payment(id, amount, paymentDate, paymentMode)')
      .order('invoiceDate', { ascending: false })

    if (status && status !== 'All') query = query.eq('paymentStatus', status)
    if (customerId) query = query.eq('customerId', customerId)

    const { data: invoices, error } = await query
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ invoices: [], summary: { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0, paidCount: 0, unpaidCount: 0, partialCount: 0, overdueCount: 0 } })
      }
      throw error
    }

    // Compute summary
    const all = invoices || []
    const totalAmount = all.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0)
    const totalPaid = all.reduce((s: number, i: any) => s + (i.paidAmount || 0), 0)
    const totalOutstanding = totalAmount - totalPaid
    const paidCount = all.filter((i: any) => i.paymentStatus === 'Paid').length
    const unpaidCount = all.filter((i: any) => i.paymentStatus === 'Unpaid').length
    const partialCount = all.filter((i: any) => i.paymentStatus === 'Partial').length
    const overdueCount = all.filter((i: any) => {
      if (i.paymentStatus === 'Paid') return false
      if (!i.dueDate) return false
      return new Date(i.dueDate) < new Date()
    }).length

    return NextResponse.json({
      invoices: all,
      summary: {
        totalInvoices: all.length,
        totalAmount: Math.round(totalAmount),
        totalPaid: Math.round(totalPaid),
        totalOutstanding: Math.round(totalOutstanding),
        paidCount,
        unpaidCount,
        partialCount,
        overdueCount,
      },
    })
  } catch (error) {
    console.error('GET /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

// ─── POST: Create invoice from dispatch ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { dispatchId, salesOrderId, customerId, totalAmount, paymentTerms, notes } = body

    if (!totalAmount || totalAmount <= 0) {
      return NextResponse.json({ error: 'totalAmount is required and must be > 0' }, { status: 400 })
    }

    // Auto-generate invoice number: INV-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const prefix = `INV-${today}-`
    const { data: lastInvoices } = await supabase
      .from('Invoice')
      .select('invoiceNo')
      .ilike('invoiceNo', `${prefix}%`)
      .order('invoiceNo', { ascending: false })
      .limit(1)
    let seq = 1
    if (lastInvoices && lastInvoices.length > 0) {
      const lastSeq = parseInt(lastInvoices[0].invoiceNo.slice(prefix.length), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const invoiceNo = `${prefix}${String(seq).padStart(3, '0')}`

    // Calculate due date based on payment terms (credit days)
    const invoiceDate = new Date()
    const dueDate = paymentTerms > 0 ? addDays(invoiceDate, paymentTerms) : null
    const now = invoiceDate.toISOString()

    const { data: invoice, error } = await supabase
      .from('Invoice')
      .insert({
        invoiceNo,
        salesOrderId: salesOrderId || null,
        dispatchId: dispatchId || null,
        customerId: customerId || null,
        totalAmount: Number(totalAmount),
        paidAmount: 0,
        paymentStatus: 'Unpaid',
        paymentTerms: Number(paymentTerms) || 0,
        dueDate: dueDate ? dueDate.toISOString() : null,
        invoiceDate: now,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .select()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: 'Invoice table not yet created in Supabase. Please run SQL migration to create it.' }, { status: 500 })
      }
      throw error
    }

    const inv = invoice && invoice.length > 0 ? invoice[0] : null
    return NextResponse.json(inv, { status: 201 })
  } catch (error) {
    console.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
