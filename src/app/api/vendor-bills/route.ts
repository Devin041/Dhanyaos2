import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// --- GET /api/vendor-bills -----------------------------------------------
// List bills with optional filters: vendorId, status, overdue

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId') || ''
    const status = searchParams.get('status') || ''
    const overdue = searchParams.get('overdue') === 'true'

    // Mark overdue bills (only if no specific status/vendor filter)
    if (!status && !vendorId) {
      const now = new Date().toISOString()
      await supabase
        .from('VendorBill')
        .update({ status: 'Overdue', updatedAt: now })
        .in('status', ['Pending', 'Partially Paid'])
        .lt('dueDate', now)
    }

    // Build query
    let query = supabase
      .from('VendorBill')
      .select('*')
      .order('billDate', { ascending: false })

    if (vendorId) query = query.eq('vendorId', vendorId)
    if (status) {
      query = query.eq('status', status)
    } else if (overdue) {
      query = query.in('status', ['Pending', 'Partially Paid']).lt('dueDate', new Date().toISOString())
    }

    const { data: bills, error } = await query
    if (error) throw error

    // Enrich bills with vendor, stageTracking, and payments data
    const enrichedBills = await Promise.all(
      (bills || []).map(async (bill) => {
        // Fetch vendor
        let vendor: any = null
        if (bill.vendorId) {
          const { data: v } = await supabase
            .from('Vendor')
            .select('id, vendorName, paymentTerms')
            .eq('id', bill.vendorId)
            .single()
          vendor = v || null
        }

        // Fetch stage tracking
        let stageTracking: any = null
        if (bill.stageTrackingId) {
          const { data: st } = await supabase
            .from('StageTracking')
            .select('id, stageName, productionJobId')
            .eq('id', bill.stageTrackingId)
            .single()

          if (st) {
            let productionJob: any = null
            if (st.productionJobId) {
              const { data: pj } = await supabase
                .from('ProductionJob')
                .select('id, jobNo, styleName')
                .eq('id', st.productionJobId)
                .single()
              productionJob = pj || null
            }
            stageTracking = { ...st, productionJob }
          }
        }

        // Fetch payments
        const { data: payments } = await supabase
          .from('VendorPayment')
          .select('*')
          .eq('vendorBillId', bill.id)
          .order('paymentDate', { ascending: false })

        return { ...bill, vendor, stageTracking, payments: payments || [] }
      })
    )

    // Compute summary from all non-cancelled bills
    const { data: allBills } = await supabase
      .from('VendorBill')
      .select('totalAmount, paidAmount, status, dueDate')
      .neq('status', 'Cancelled')

    const summary = {
      totalBilled: (allBills || []).reduce((s, b) => s + b.totalAmount, 0),
      totalPaid: (allBills || []).reduce((s, b) => s + b.paidAmount, 0),
      outstanding: (allBills || []).reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0),
      overdueCount: (allBills || []).filter((b) => b.status === 'Overdue').length,
    }

    return NextResponse.json({ bills: enrichedBills, summary })
  } catch (error) {
    console.error('GET /api/vendor-bills error:', error)
    return NextResponse.json({ error: 'Failed to load vendor bills' }, { status: 500 })
  }
}

// --- POST /api/vendor-bills ------------------------------------------------
// Create a new vendor bill (manual or auto-generated from stage tracking)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      vendorId,
      stageTrackingId,
      description,
      totalQty,
      perPieceRate,
      totalAmount,
      billDate,
      dueDate,
      notes,
    } = body

    if (!vendorId || !totalAmount || totalAmount <= 0) {
      return NextResponse.json(
        { error: 'Vendor ID and valid total amount are required' },
        { status: 400 }
      )
    }

    // Validate vendor
    const { data: vendor, error: vendorErr } = await supabase
      .from('Vendor')
      .select('*')
      .eq('id', vendorId)
      .single()
    if (vendorErr || !vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 400 })
    }

    // If linked to stage tracking, validate it
    if (stageTrackingId) {
      const { data: st, error: stErr } = await supabase
        .from('StageTracking')
        .select('id')
        .eq('id', stageTrackingId)
        .single()
      if (stErr || !st) {
        return NextResponse.json({ error: 'Stage tracking not found' }, { status: 400 })
      }
    }

    // Generate bill number
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const prefix = `VB-${dateStr}-`
    const { data: todayBills } = await supabase
      .from('VendorBill')
      .select('billNo')
      .ilike('billNo', `${prefix}%`)
      .order('billNo', { ascending: false })
      .limit(1)
    let nextSeq = 1
    if (todayBills && todayBills.length > 0) {
      const lastSeq = parseInt(todayBills[0].billNo.slice(prefix.length), 10)
      nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1
    }
    const billNo = `${prefix}${String(nextSeq).padStart(3, '0')}`

    // Calculate due date from vendor payment terms if not provided
    const effectiveDueDate = dueDate
      ? new Date(dueDate).toISOString()
      : new Date(today.getTime() + vendor.paymentTerms * 24 * 60 * 60 * 1000).toISOString()

    const now = new Date().toISOString()
    const { data: bill, error: insertErr } = await supabase
      .from('VendorBill')
      .insert({
        billNo,
        vendorId,
        stageTrackingId: stageTrackingId || null,
        description: description || `${vendor.vendorName} — Bill`,
        totalQty: totalQty ? Number(totalQty) : 0,
        perPieceRate: perPieceRate ? Number(perPieceRate) : 0,
        totalAmount: Number(totalAmount),
        paidAmount: 0,
        billDate: billDate ? new Date(billDate).toISOString() : now,
        dueDate: effectiveDueDate,
        status: 'Pending',
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .select('*')
      .single()

    if (insertErr) throw insertErr

    // Enrich with vendor and payments
    const enrichedBill = {
      ...bill,
      vendor: { id: vendor.id, vendorName: vendor.vendorName },
      payments: [],
    }

    return NextResponse.json({ bill: enrichedBill }, { status: 201 })
  } catch (error) {
    console.error('POST /api/vendor-bills error:', error)
    return NextResponse.json({ error: 'Failed to create vendor bill' }, { status: 500 })
  }
}

// --- PATCH /api/vendor-bills?id=xxx ------------------------------------------
// Update bill (cancel, adjust, or record full payment)

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { status, notes } = body

    const { data: existing, error: existErr } = await supabase
      .from('VendorBill')
      .select('*')
      .eq('id', id)
      .single()

    if (existErr || !existing) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    // Fetch existing payments
    const { data: existingPayments } = await supabase
      .from('VendorPayment')
      .select('*')
      .eq('vendorBillId', id)
    const totalPaidSoFar = (existingPayments || []).reduce((s, p) => s + p.amount, 0)

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() }

    if (status) {
      if (status === 'Paid') {
        updateData.paidAmount = existing.totalAmount
        updateData.status = 'Paid'
      } else if (status === 'Cancelled') {
        if (totalPaidSoFar > 0) {
          return NextResponse.json(
            { error: 'Cannot cancel a bill that has partial payments. Record payments first.' },
            { status: 400 }
          )
        }
        updateData.status = 'Cancelled'
      } else {
        updateData.status = status
      }
    }

    if (notes !== undefined) updateData.notes = notes || null

    const { data: bill, error: updErr } = await supabase
      .from('VendorBill')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (updErr) throw updErr

    // Enrich with vendor and payments
    let vendor: any = null
    if (bill.vendorId) {
      const { data: v } = await supabase
        .from('Vendor')
        .select('id, vendorName')
        .eq('id', bill.vendorId)
        .single()
      vendor = v || null
    }

    const { data: payments } = await supabase
      .from('VendorPayment')
      .select('*')
      .eq('vendorBillId', id)
      .order('paymentDate', { ascending: false })

    return NextResponse.json({ bill: { ...bill, vendor, payments: payments || [] } })
  } catch (error) {
    console.error('PATCH /api/vendor-bills error:', error)
    return NextResponse.json({ error: 'Failed to update vendor bill' }, { status: 500 })
  }
}
