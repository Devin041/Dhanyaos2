import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('Broker')
      .select('*')
      .order('createdAt', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: brokers, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to fetch brokers' }, { status: 500 })
    }

    return NextResponse.json(brokers)
  } catch (error) {
    console.error('GET /api/brokers error:', error)
    return NextResponse.json({ error: 'Failed to fetch brokers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, commissionPercent, address, notes, status } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Broker name is required' }, { status: 400 })
    }

    if (commissionPercent !== undefined && commissionPercent !== null) {
      if (typeof commissionPercent !== 'number' || commissionPercent < 0 || commissionPercent > 100) {
        return NextResponse.json({ error: 'Commission percent must be between 0 and 100' }, { status: 400 })
      }
    }

    const now = new Date().toISOString()

    const { data: broker, error } = await supabase
      .from('Broker')
      .insert({
        name: name.trim(),
        phone: phone || null,
        commissionPercent: commissionPercent ?? 5,
        address: address || null,
        notes: notes || null,
        status: status || 'Active',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to create broker' }, { status: 500 })
    }

    return NextResponse.json(broker, { status: 201 })
  } catch (error) {
    console.error('POST /api/brokers error:', error)
    return NextResponse.json({ error: 'Failed to create broker' }, { status: 500 })
  }
}
