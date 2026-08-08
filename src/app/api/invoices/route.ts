import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { getCompanySettings } from '@/lib/company-settings'
import { format, addDays } from 'date-fns'

// ─── GET: List invoices ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')

    let query = supabase
      .from('Invoice')
      .select('*')
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

    // Fetch invoice items separately
    const invoiceIds = (invoices || []).map((i: any) => i.id)
    let itemsMap: Record<string, any[]> = {}
    if (invoiceIds.length > 0) {
      const { data: items } = await supabase
        .from('InvoiceItem')
        .select('*')
        .in('invoiceId', invoiceIds)
      for (const item of (items || [])) {
        if (!itemsMap[item.invoiceId]) itemsMap[item.invoiceId] = []
        itemsMap[item.invoiceId].push(item)
      }
    }

    // Fetch payments separately
    let paymentsMap: Record<string, any[]> = {}
    if (invoiceIds.length > 0) {
      const { data: payments } = await supabase
        .from('Payment')
        .select('*')
        .in('invoiceId', invoiceIds)
      for (const p of (payments || [])) {
        if (!paymentsMap[p.invoiceId]) paymentsMap[p.invoiceId] = []
        paymentsMap[p.invoiceId].push(p)
      }
    }

    const all = (invoices || []).map((inv: any) => ({
      ...inv,
      items: itemsMap[inv.id] || [],
      payments: paymentsMap[inv.id] || [],
    }))

    // Summary
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
        paidCount, unpaidCount, partialCount, overdueCount,
      },
    })
  } catch (error) {
    console.error('GET /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

// ─── POST: Create GST-compliant invoice ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      dispatchId, salesOrderId, customerId, paymentTerms, notes,
      // Customer details
      customerGstNumber, customerName, customerAddress, customerPhone,
      billingAddress, shippingAddress, placeOfSupply,
      // GST settings
      gstType, gstPercent,
      // Other
      poReference, dispatchReference,
      // Items
      items,
    } = body

    // Fetch company settings for GST number, bank details, terms
    const company = await getCompanySettings()
    const companyGstNumber = company.gstNumber || ''
    const companyStateCode = company.stateCode || '24'

    // Determine GST type (intra-state vs inter-state)
    let resolvedGstType = gstType
    if (!resolvedGstType && placeOfSupply) {
      const custStateCode = placeOfSupply.substring(0, 2)
      resolvedGstType = custStateCode === companyStateCode ? 'IntraState' : 'InterState'
    }
    resolvedGstType = resolvedGstType || 'IntraState'

    // Calculate item amounts + GST
    const resolvedGstPercent = gstPercent || company.defaultGstPercent || 5
    let taxableAmount = 0
    let totalGst = 0

    const processedItems = (items || []).map((item: any) => {
      const qty = Number(item.quantity) || 0
      const rate = Number(item.ratePerUnit) || 0
      const amount = qty * rate
      const discountPct = Number(item.discountPercent) || 0
      const discountedAmount = amount * (1 - discountPct / 100)
      const itemGstPercent = Number(item.gstPercent) || resolvedGstPercent
      const itemGst = Math.round(discountedAmount * itemGstPercent / 100 * 100) / 100
      const itemTotal = Math.round((discountedAmount + itemGst) * 100) / 100

      taxableAmount += discountedAmount
      totalGst += itemGst

      return {
        styleNo: item.styleNo || null,
        styleName: item.styleName || '',
        hsnCode: item.hsnCode || '6104',
        quantity: qty,
        unit: item.unit || 'pcs',
        ratePerUnit: rate,
        amount: Math.round(amount * 100) / 100,
        discountPercent: discountPct,
        taxableAmount: Math.round(discountedAmount * 100) / 100,
        gstPercent: itemGstPercent,
        gstAmount: itemGst,
        totalAmount: itemTotal,
      }
    })

    // Calculate GST breakup
    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0
    if (resolvedGstType === 'IntraState') {
      cgstAmount = Math.round(totalGst / 2 * 100) / 100
      sgstAmount = Math.round(totalGst / 2 * 100) / 100
    } else {
      igstAmount = totalGst
    }

    const grandTotal = Math.round(taxableAmount + totalGst)
    const roundOff = 0 // can add rounding logic

    // Auto-generate invoice number
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

    // Calculate due date
    const terms = Number(paymentTerms) || 0
    const invoiceDate = new Date()
    const dueDate = terms > 0 ? addDays(invoiceDate, terms) : null
    const now = invoiceDate.toISOString()
    const fy = invoiceDate.getMonth() >= 3
      ? `${invoiceDate.getFullYear()}-${invoiceDate.getFullYear() + 1}`
      : `${invoiceDate.getFullYear() - 1}-${invoiceDate.getFullYear()}`

    // Insert invoice (only with columns that exist — handle migration gracefully)
    const insertPayload: any = {
      invoiceNo,
      salesOrderId: salesOrderId || null,
      dispatchId: dispatchId || null,
      customerId: customerId || null,
      totalAmount: grandTotal,
      paidAmount: 0,
      paymentStatus: 'Unpaid',
      paymentTerms: terms,
      dueDate: dueDate ? dueDate.toISOString() : null,
      invoiceDate: now,
      notes: notes || null,
    }

    // Try inserting with all new GST fields — if fails, retry without them
    const gstFields: any = {
      customerGstNumber: customerGstNumber || null,
      customerName: customerName || null,
      customerAddress: customerAddress || null,
      customerPhone: customerPhone || null,
      billingAddress: billingAddress || null,
      shippingAddress: shippingAddress || null,
      placeOfSupply: placeOfSupply || null,
      gstType: resolvedGstType,
      gstPercent: resolvedGstPercent,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      cgstAmount, sgstAmount, igstAmount,
      totalGst: Math.round(totalGst * 100) / 100,
      roundOff,
      discountAmount: 0,
      poReference: poReference || null,
      dispatchReference: dispatchReference || null,
      bankName: company.bankName || null,
      bankAccountNo: company.bankAccountNo || null,
      bankIfsc: company.bankIfsc || null,
      termsConditions: company.termsConditions || null,
      financialYear: fy,
      status: 'Sent',
    }

    let invoice: any = null
    let insertError: any = null

    // First try with all fields
    const { data: inv1, error: err1 } = await supabase
      .from('Invoice')
      .insert({ ...insertPayload, ...gstFields })
      .select()
      .single()

    if (err1) {
      // Retry without new GST fields (migration may not have been run)
      console.warn('Invoice insert with GST fields failed, retrying basic:', err1.message)
      const { data: inv2, error: err2 } = await supabase
        .from('Invoice')
        .insert(insertPayload)
        .select()
        .single()
      if (err2) { insertError = err2 }
      else { invoice = inv2 }
    } else {
      invoice = inv1
    }

    if (insertError) throw insertError

    // Insert invoice items
    if (processedItems.length > 0) {
      const itemRows = processedItems.map((item: any) => ({
        invoiceId: invoice.id,
        ...item,
      }))
      const { error: itemsErr } = await supabase.from('InvoiceItem').insert(itemRows)
      if (itemsErr) console.error('InvoiceItem insert error:', itemsErr)
    }

    return NextResponse.json({
      ...invoice,
      items: processedItems,
      companyGstNumber,
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
