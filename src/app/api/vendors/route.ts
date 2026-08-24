import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const includeBills = searchParams.get('includeBills') === 'true'

    let query = supabase
      .from('Vendor')
      .select('*')
      .order('createdAt', { ascending: false })

    if (search) {
      query = query.or(`vendorName.ilike.%${search}%,contactPerson.ilike.%${search}%,specialization.ilike.%${search}%`)
    }

    const { data: vendors, error } = await query
    if (error) throw error

    // Enrich vendors with stage trackings and optionally bills
    const enriched = await Promise.all(
      (vendors || []).map(async (v) => {
        // Fetch active stage trackings
        const { data: stageTrackings } = await supabase
          .from('StageTracking')
          .select('id')
          .eq('vendorId', v.id)
          .in('status', ['In Progress', 'Sent Out'])

        const result: Record<string, unknown> = {
          ...v,
          stageTrackings: stageTrackings || [],
        }

        // Optionally fetch vendor bills
        if (includeBills) {
          const { data: vendorBills } = await supabase
            .from('VendorBill')
            .select('id, totalAmount, paidAmount, status, dueDate')
            .eq('vendorId', v.id)

          const bills = vendorBills || []
          const totalBilled = bills.reduce((s, b) => s + b.totalAmount, 0)
          const totalPaid = bills.reduce((s, b) => s + b.paidAmount, 0)
          const outstanding = totalBilled - totalPaid
          const overdueAmt = bills.filter((b) => b.status === 'Overdue').reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0)
          result.vendorBills = bills
          result._billSummary = { totalBilled, totalPaid, outstanding, overdue: overdueAmt }
        }

        return result
      })
    )

    const total = enriched.length
    return NextResponse.json({ vendors: enriched, total })
  } catch (error) {
    console.error('GET /api/vendors error:', error)
    return NextResponse.json(
      { error: 'Failed to load vendors' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      vendorName,
      contactPerson,
      phone,
      email,
      address,
      gstNumber,
      state,
      vendorType,        // NEW: customizable type (Job Worker, Embroidery, Dyeing, etc.)
      specialization,
      paymentTerms,
    } = body

    if (!vendorName || !vendorName.trim()) {
      return NextResponse.json(
        { error: 'Vendor name is required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    // Build insert payload with optional gstNumber/state — these columns may
    // not exist yet if the VENDOR-GST migration hasn't been run. We try with
    // them; on "column does not exist" error we retry without them.
    const basePayload = {
      vendorName: vendorName.trim(),
      contactPerson: contactPerson?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: address?.trim() || null,
      specialization: specialization?.trim() || '',
      paymentTerms: paymentTerms ? Number(paymentTerms) : 30,
      status: 'Active',
      createdAt: now,
      updatedAt: now,
    }
    let vendor: any = null
    let error: any = null
    // First try WITH gstNumber/state/vendorType (all three may not exist yet)
    const { data: v1, error: e1 } = await supabase
      .from('Vendor')
      .insert({ ...basePayload, gstNumber: gstNumber?.trim() || null, state: state?.trim() || null, vendorType: vendorType?.trim() || 'Job Worker' })
      .select('*')
      .single()
    if (e1) {
      const msg = String(e1.message || '')
      if (/gstNumber|state|vendorType|column .* does not exist/i.test(msg)) {
        // Fallback: try with just vendorType (if only gstNumber/state missing)
        const { data: v1b, error: e1b } = await supabase
          .from('Vendor')
          .insert({ ...basePayload, vendorType: vendorType?.trim() || 'Job Worker' })
          .select('*')
          .single()
        if (e1b) {
          const msg2 = String(e1b.message || '')
          if (/vendorType|column .* does not exist/i.test(msg2)) {
            // Final fallback: insert without any new columns
            const { data: v2, error: e2 } = await supabase
              .from('Vendor')
              .insert(basePayload)
              .select('*')
              .single()
            if (e2) throw e2
            vendor = v2
          } else {
            throw e1b
          }
        } else {
          vendor = v1b
        }
      } else {
        throw e1
      }
    } else {
      vendor = v1
    }

    if (error) throw error

    return NextResponse.json({ vendor }, { status: 201 })
  } catch (error) {
    console.error('POST /api/vendors error:', error)
    return NextResponse.json(
      { error: 'Failed to create vendor' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { vendorName, contactPerson, phone, email, address, gstNumber, state, vendorType, specialization, status, paymentTerms } = body

    const { data: existing, error: existErr } = await supabase
      .from('Vendor')
      .select('*')
      .eq('id', id)
      .single()
    if (existErr || !existing) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (vendorName !== undefined) updateData.vendorName = vendorName.trim() || existing.vendorName
    if (contactPerson !== undefined) updateData.contactPerson = contactPerson?.trim() || null
    if (phone !== undefined) updateData.phone = phone?.trim() || null
    if (email !== undefined) updateData.email = email?.trim() || null
    if (address !== undefined) updateData.address = address?.trim() || null
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber?.trim() || null
    if (state !== undefined) updateData.state = state?.trim() || null
    if (vendorType !== undefined) updateData.vendorType = vendorType?.trim() || 'Job Worker'
    if (specialization !== undefined) updateData.specialization = specialization?.trim() || ''
    if (paymentTerms !== undefined) updateData.paymentTerms = Number(paymentTerms)
    if (status) updateData.status = status

    const { data: vendor, error } = await supabase
      .from('Vendor')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    // If update fails because gstNumber/state/vendorType column doesn't exist, retry without them
    if (error) {
      const msg = String(error.message || '')
      if (/gstNumber|state|vendorType|column .* does not exist/i.test(msg)) {
        const stripped = { ...updateData }
        delete stripped.gstNumber
        delete stripped.state
        delete stripped.vendorType
        const { data: v2, error: e2 } = await supabase
          .from('Vendor')
          .update(stripped)
          .eq('id', id)
          .select('*')
          .single()
        if (e2) throw e2
        return NextResponse.json({ vendor: v2 })
      }
      throw error
    }

    return NextResponse.json({ vendor })
  } catch (error) {
    console.error('PATCH /api/vendors error:', error)
    return NextResponse.json(
      { error: 'Failed to update vendor' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    const { data: vendor, error: existErr } = await supabase
      .from('Vendor')
      .select('*')
      .eq('id', id)
      .single()

    if (existErr || !vendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      )
    }

    // Check for active stage trackings
    const { data: activeTrackings } = await supabase
      .from('StageTracking')
      .select('id')
      .eq('vendorId', id)
      .in('status', ['In Progress', 'Sent Out'])

    // Check for unpaid bills
    const { data: unpaidBills } = await supabase
      .from('VendorBill')
      .select('id')
      .eq('vendorId', id)
      .in('status', ['Pending', 'Partially Paid', 'Overdue'])

    if ((activeTrackings && activeTrackings.length > 0) || (unpaidBills && unpaidBills.length > 0)) {
      return NextResponse.json(
        { error: 'Cannot delete vendor with active stage trackings or unpaid bills' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('Vendor')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/vendors error:', error)
    return NextResponse.json(
      { error: 'Failed to delete vendor' },
      { status: 500 }
    )
  }
}
