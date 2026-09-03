import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { createPaymentOutRecord } from '@/lib/payment-out-core'

/**
 * VENDOR BILL PAYMENTS (legacy-compatible path).
 *
 * The vendors.tsx "Make Payment" dialog posts here. Internally this now uses
 * the Phase A PaymentOut engine (double-entry GL + cash book + bill status),
 * instead of the old single-entry VendorPayment table (kept for history, 0 rows).
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId') || ''
    const billId = searchParams.get('billId') || ''
    const limit = Number(searchParams.get('limit') || '50')

    let query = supabase
      .from('PaymentOut')
      .select('*')
      .eq('payeeType', 'VENDOR_BILL')
      .order('paymentDate', { ascending: false })
      .limit(limit)
    if (billId) query = query.eq('vendorBillId', billId)

    const { data: payments, error } = await query
    if (error) throw error
    let list = payments || []

    // vendorId filter: resolve via bills (PaymentOut stores payeeId = vendor when known)
    if (vendorId) {
      list = list.filter((p: any) => p.payeeId === vendorId || p.payeeName === vendorId)
    }

    // Enrich with bill info
    const billIds = [...new Set(list.map((p: any) => p.vendorBillId).filter(Boolean))]
    const { data: bills } = billIds.length
      ? await supabase.from('VendorBill').select('id, billNo, description, totalAmount, paidAmount, vendorId, status').in('id', billIds)
      : { data: [] as any[] }
    const billMap = new Map((bills || []).map((b: any) => [b.id, b]))

    const enriched = list.map((p: any) => {
      const vb = p.vendorBillId ? billMap.get(p.vendorBillId) : null
      return {
        ...p,
        // Legacy shape for the existing UI
        vendorId: p.payeeId || vb?.vendorId || null,
        vendorBillId: p.vendorBillId,
        paymentMethod: p.paymentMode,
        amount: p.amount,
        paymentDate: p.paymentDate,
        paymentNo: p.paymentNo,
        referenceNo: p.referenceNo,
        notes: p.notes,
        vendorBill: vb ? { ...vb } : null,
      }
    })

    const total = enriched.length
    const totalAmount = enriched.reduce((s: number, p: any) => s + p.amount, 0)

    return NextResponse.json({ payments: enriched, total, totalAmount })
  } catch (error: any) {
    console.error('GET /api/vendor-payments error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load vendor payments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { vendorBillId, amount, paymentDate, paymentMethod, referenceNo, notes, bankAccountId, cheque } = body

    // Legacy contract: vendorBillId + amount (+optional date/method/ref/notes)
    const result = await createPaymentOutRecord({
      payeeType: 'VENDOR_BILL',
      vendorBillId,
      amount: Number(amount),
      paymentDate: paymentDate || new Date().toISOString(),
      paymentMode: paymentMethod || 'NEFT',
      bankAccountId: bankAccountId || null,
      referenceNo: referenceNo || null,
      notes: notes || null,
      cheque: cheque || null,
    })

    return NextResponse.json({
      payment: result.payment,
      journal: result.journal,
      bill: result.updatedBill,
      // Legacy response field for old UI
      ...result.payment,
    }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/vendor-payments error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to record vendor payment' }, { status: 400 })
  }
}
