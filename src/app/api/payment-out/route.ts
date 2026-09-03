import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { createPaymentOutRecord, type PaymentOutBody } from '@/lib/payment-out-core'

/**
 * PAYMENT OUT — ALL outbound money (Phase A core).
 * See src/lib/payment-out-core.ts for the engine; PHASE-A-MIGRATION.sql for tables.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const payeeType = searchParams.get('payeeType')

    let query = supabase
      .from('PaymentOut')
      .select('*')
      .order('paymentDate', { ascending: false })
      .limit(200)
    if (payeeType) query = query.eq('payeeType', payeeType)

    const { data: payments, error } = await query
    if (error) throw error
    const list = payments || []

    const totalOut = list.reduce((s: number, p: any) => s + (p.netPaidAmount || 0), 0)
    const totalTds = list.reduce((s: number, p: any) => s + (p.tdsAmount || 0), 0)
    const byType: Record<string, number> = {}
    for (const p of list) byType[p.payeeType] = (byType[p.payeeType] || 0) + (p.netPaidAmount || 0)

    // Outstanding dues (what we still owe)
    const { data: pos } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, supplierId, totalAmount, paidAmount, paymentStatus, status')
      .eq('supplierId', 'not.null')
      .neq('status', 'Cancelled')
    const { data: bills } = await supabase
      .from('VendorBill')
      .select('id, billNo, vendorId, totalAmount, paidAmount, status')
      .in('status', ['Pending', 'Partial'])
    const { data: sheets } = await supabase
      .from('CostSheet')
      .select('id, sheetNo, brokerCommissionAmount, status')
      .neq('status', 'Cancelled')

    const supplierDues = (pos || []).reduce((s: number, p: any) => s + Math.max(0, (p.totalAmount || 0) - (p.paidAmount || 0)), 0)
    const billDues = (bills || []).reduce((s: number, b: any) => s + Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0)), 0)
    const paidBySheet = new Map<string, number>()
    for (const p of list) {
      if (p.payeeType === 'BROKER' && p.costSheetId) {
        paidBySheet.set(p.costSheetId, (paidBySheet.get(p.costSheetId) || 0) + (p.amount || 0))
      }
    }
    const brokerDues = (sheets || []).reduce(
      (s: number, c: any) => s + Math.max(0, (c.brokerCommissionAmount || 0) - (paidBySheet.get(c.id) || 0)), 0
    )

    return NextResponse.json({
      payments: list,
      summary: {
        count: list.length,
        totalOut: round2(totalOut),
        totalTds: round2(totalTds),
        byType,
        dues: {
          supplier: round2(supplierDues),
          vendorBills: round2(billDues),
          broker: round2(brokerDues),
          total: round2(supplierDues + billDues + brokerDues),
        },
      },
    })
  } catch (error: any) {
    console.error('GET /api/payment-out error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load payments out' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PaymentOutBody
    const result = await createPaymentOutRecord(body)
    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/payment-out error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to record payment out' }, { status: 400 })
  }
}
