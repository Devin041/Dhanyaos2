import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const PRODUCTION_STAGES = [
  'Fabric Issue', 'Cutting', 'Embroidery', 'Printing', 'Stitching',
  'Finishing', 'Quality Check', 'Packing', 'Dispatch Ready', 'Dispatched',
] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: job } = await supabase.from('ProductionJob').select('id, stage').eq('id', id).single()
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })

    let { data: stages, error } = await supabase
      .from('StageTracking')
      .select('*, vendor:vendorId(id, vendorName, phone)')
      .eq('productionJobId', id)
      .order('sequence', { ascending: true })
    if (error) throw error

    if (!stages || stages.length === 0) {
      const ts = new Date().toISOString()
      await supabase.from('StageTracking').insert(
        PRODUCTION_STAGES.map((stageName, index) => ({
          productionJobId: id, stageName, sequence: index,
          status: index === 0 && (job as any).stage === 'Fabric Issue' ? 'In Progress' : 'Pending',
          createdAt: ts, updatedAt: ts,
        }))
      )
      const res = await supabase
        .from('StageTracking')
        .select('*, vendor:vendorId(id, vendorName, phone)')
        .eq('productionJobId', id)
        .order('sequence', { ascending: true })
      stages = res.data
    }
    return NextResponse.json({ stages })
  } catch (error) {
    console.error('GET /api/production/[id]/stages error:', error)
    return NextResponse.json({ error: 'Failed to fetch stage trackings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { stageName, ...updates } = body
    if (!stageName) return NextResponse.json({ error: 'stageName is required' }, { status: 400 })
    if (updates.vendorId) {
      const { data: vendor } = await supabase.from('Vendor').select('id').eq('id', updates.vendorId).single()
      if (!vendor) {
        // The stage dialog merges Vendors AND Suppliers into one picker, so a
        // Supplier id can arrive here. Resolve it: find the Supplier, then match
        // (by name) or auto-create the corresponding Vendor row so the
        // StageTracking vendorId FK (and the VendorBill relation) stays valid.
        const { data: supplier } = await supabase
          .from('Supplier')
          .select('id, name, contactPerson, phone, email')
          .eq('id', updates.vendorId)
          .single()
        if (supplier) {
          const s = supplier as any
          // Dedupe: reuse an existing Vendor with the same name (case-insensitive)
          const { data: existingVendor } = await supabase
            .from('Vendor')
            .select('id')
            .ilike('vendorName', s.name)
            .limit(1)
          if (existingVendor && existingVendor.length > 0) {
            updates.vendorId = (existingVendor[0] as any).id
          } else {
            const now = new Date().toISOString()
            const newVendor: Record<string, any> = {
              vendorName: s.name,
              contactPerson: s.contactPerson || null,
              phone: s.phone || null,
              email: s.email || null,
              // Supplier has no gstNumber/state columns — null-safe via any-cast
              gstNumber: (s as any).gstNumber || null,
              state: (s as any).state || null,
              vendorType: 'Job Worker',
              specialization: 'Synced from Supplier',
              paymentTerms: 30,
              status: 'Active',
              createdAt: now,
              updatedAt: now,
            }
            let { data: created } = await supabase.from('Vendor').insert(newVendor).select('id').single()
            if (!created) {
              // gstNumber/state/vendorType columns may not exist in the live DB
              // yet (VENDOR-GST migration pending) — retry without them.
              const { gstNumber: _g, state: _st, vendorType: _vt, ...fallbackVendor } = newVendor
              const retry = await supabase.from('Vendor').insert(fallbackVendor).select('id').single()
              created = retry.data
            }
            if (!created) return NextResponse.json({ error: 'Vendor not found' }, { status: 400 })
            updates.vendorId = (created as any).id
          }
        } else {
          return NextResponse.json({ error: 'Vendor not found' }, { status: 400 })
        }
      }
    }
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (updates.locationType !== undefined) updateData.locationType = updates.locationType
    if (updates.vendorId !== undefined) updateData.vendorId = updates.vendorId || null
    if (updates.sentDate !== undefined) updateData.sentDate = updates.sentDate ? new Date(updates.sentDate).toISOString() : null
    if (updates.expectedReturnDate !== undefined) updateData.expectedReturnDate = updates.expectedReturnDate ? new Date(updates.expectedReturnDate).toISOString() : null
    if (updates.receivedDate !== undefined) updateData.receivedDate = updates.receivedDate ? new Date(updates.receivedDate).toISOString() : null
    if (updates.sentQty !== undefined) updateData.sentQty = Number(updates.sentQty)
    if (updates.receivedQty !== undefined) updateData.receivedQty = Number(updates.receivedQty)
    if (updates.defectiveQty !== undefined) updateData.defectiveQty = Number(updates.defectiveQty)
    if (updates.perPieceRate !== undefined) updateData.perPieceRate = Number(updates.perPieceRate)
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.notes !== undefined) updateData.notes = updates.notes || null

    const { data: existing, error: findErr } = await supabase
      .from('StageTracking')
      .select('*')
      .eq('productionJobId', id)
      .eq('stageName', stageName)
      .single()
    if (!existing || findErr) return NextResponse.json({ error: 'Stage tracking not found' }, { status: 404 })

    const newReceivedQty = updates.receivedQty !== undefined ? Number(updates.receivedQty) : (existing as any).receivedQty
    const newRate = updates.perPieceRate !== undefined ? Number(updates.perPieceRate) : (existing as any).perPieceRate
    updateData.totalAmount = Math.round(newReceivedQty * newRate * 100) / 100

    const { data: updated, error } = await supabase
      .from('StageTracking')
      .update(updateData)
      .eq('productionJobId', id)
      .eq('stageName', stageName)
      .select('*, vendor:vendorId(id, vendorName, phone)')
      .single()
    if (error) throw error
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/production/[id]/stages error:', error)
    return NextResponse.json({ error: 'Failed to update stage tracking' }, { status: 500 })
  }
}
