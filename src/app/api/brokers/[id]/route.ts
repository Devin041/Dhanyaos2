import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: broker, error } = await supabase
      .from('Broker')
      .select('*, ClientCatalog(*)')
      .eq('id', id)
      .single()

    if (error || !broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    return NextResponse.json(broker)
  } catch (error) {
    console.error('GET /api/brokers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch broker' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const { data: existing, error: findError } = await supabase
      .from('Broker')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    if (body.name !== undefined) {
      if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ error: 'Broker name is required' }, { status: 400 })
      }
    }

    if (body.commissionPercent !== undefined && body.commissionPercent !== null) {
      if (typeof body.commissionPercent !== 'number' || body.commissionPercent < 0 || body.commissionPercent > 100) {
        return NextResponse.json({ error: 'Commission percent must be between 0 and 100' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.commissionPercent !== undefined ? { commissionPercent: body.commissionPercent } : {}),
      ...(body.address !== undefined ? { address: body.address || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date().toISOString(),
    }

    const { data: broker, error } = await supabase
      .from('Broker')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to update broker' }, { status: 500 })
    }

    return NextResponse.json(broker)
  } catch (error) {
    console.error('PUT /api/brokers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update broker' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: existing, error: findError } = await supabase
      .from('Broker')
      .select('*, ClientCatalog(id)')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const catalogs = existing.ClientCatalog || []
    if (catalogs.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete broker with existing catalogs' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('Broker')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to delete broker' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/brokers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete broker' }, { status: 500 })
  }
}
