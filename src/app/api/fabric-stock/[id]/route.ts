import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single fabric stock item with supplier ─────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: stock, error } = await supabase
      .from('FabricStock')
      .select()
      .eq('id', id)
      .single()

    if (error || !stock) {
      return NextResponse.json({ error: 'Fabric stock not found' }, { status: 404 })
    }

    // Fetch supplier
    let supplier = null
    if (stock.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone, email, paymentTerms, rating, status')
        .eq('id', stock.supplierId)
        .single()
      supplier = s || null
    }

    return NextResponse.json({
      id: stock.id,
      supplierId: stock.supplierId,
      supplier,
      fabricName: stock.fabricName,
      gsm: stock.gsm,
      width: stock.width,
      lotNumber: stock.lotNumber,
      availableMeters: stock.availableMeters,
      reservedMeters: stock.reservedMeters,
      averageCost: stock.averageCost,
      totalValue: stock.totalValue,
      createdAt: stock.createdAt,
      updatedAt: stock.updatedAt,
    })
  } catch (error) {
    console.error('Fabric Stock [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to load fabric stock' }, { status: 500 })
  }
}

// ─── PATCH: Update fabric stock (add/reserve/release meters, edit) ────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: findErr } = await supabase
      .from('FabricStock')
      .select()
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Fabric stock not found' }, { status: 404 })
    }

    let availableMeters = existing.availableMeters
    let reservedMeters = existing.reservedMeters
    let averageCost = existing.averageCost

    // Add meters to stock
    if (body.addMeters !== undefined) {
      const add = parseFloat(body.addMeters)
      if (isNaN(add) || add <= 0) {
        return NextResponse.json({ error: 'addMeters must be a positive number' }, { status: 400 })
      }
      availableMeters += add
    }

    // Reserve meters from available stock
    if (body.reserveMeters !== undefined) {
      const reserve = parseFloat(body.reserveMeters)
      if (isNaN(reserve) || reserve <= 0) {
        return NextResponse.json({ error: 'reserveMeters must be a positive number' }, { status: 400 })
      }
      if (reserve > availableMeters) {
        return NextResponse.json(
          { error: `Cannot reserve ${reserve}m — only ${availableMeters.toFixed(1)}m available` },
          { status: 400 }
        )
      }
      availableMeters -= reserve
      reservedMeters += reserve
    }

    // Release reserved meters back to available
    if (body.releaseMeters !== undefined) {
      const release = parseFloat(body.releaseMeters)
      if (isNaN(release) || release <= 0) {
        return NextResponse.json({ error: 'releaseMeters must be a positive number' }, { status: 400 })
      }
      if (release > reservedMeters) {
        return NextResponse.json(
          { error: `Cannot release ${release}m — only ${reservedMeters.toFixed(1)}m reserved` },
          { status: 400 }
        )
      }
      reservedMeters -= release
      availableMeters += release
    }

    // Update cost if provided
    if (body.averageCost !== undefined) {
      averageCost = parseFloat(body.averageCost)
    }

    const totalValue = availableMeters * averageCost

    const updateData: Record<string, any> = {
      availableMeters,
      reservedMeters,
      averageCost,
      totalValue,
      updatedAt: new Date().toISOString(),
    }
    if (body.fabricName !== undefined) updateData.fabricName = body.fabricName
    if (body.gsm !== undefined) updateData.gsm = body.gsm ? parseInt(body.gsm, 10) : null
    if (body.width !== undefined) updateData.width = body.width ? parseFloat(body.width) : null
    if (body.lotNumber !== undefined) updateData.lotNumber = body.lotNumber || null
    if (body.supplierId !== undefined) updateData.supplierId = body.supplierId || null

    const { data: updated, error } = await supabase
      .from('FabricStock')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Fetch supplier for response
    let supplier = null
    if (updated.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone')
        .eq('id', updated.supplierId)
        .single()
      supplier = s || null
    }

    return NextResponse.json({
      id: updated.id,
      supplierId: updated.supplierId,
      supplier,
      fabricName: updated.fabricName,
      gsm: updated.gsm,
      width: updated.width,
      lotNumber: updated.lotNumber,
      availableMeters: updated.availableMeters,
      reservedMeters: updated.reservedMeters,
      averageCost: updated.averageCost,
      totalValue: updated.totalValue,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error('Fabric Stock [id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update fabric stock' }, { status: 500 })
  }
}
