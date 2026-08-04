import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: worker, error } = await supabase
      .from('Employee')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ worker })
  } catch (error) {
    console.error('Worker GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load worker' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: findError } = await supabase
      .from('Employee')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'phone',
      'department',
      'designation',
      'skills',
      'salary',
      'dailyWage',
      'status',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'salary' || field === 'dailyWage') {
          updateData[field] = body[field] !== null ? Number(body[field]) : null
        } else if (
          field === 'name' ||
          field === 'department' ||
          field === 'designation'
        ) {
          const val = body[field]?.trim()
          if (!val) {
            return NextResponse.json(
              { error: `${field} cannot be empty` },
              { status: 400 }
            )
          }
          updateData[field] = val
        } else if (field === 'phone' || field === 'skills') {
          updateData[field] = body[field]?.trim() || null
        } else {
          updateData[field] = body[field]
        }
      }
    }

    // Status transition validation
    if (updateData.status && !['Active', 'Inactive'].includes(updateData.status as string)) {
      return NextResponse.json(
        { error: 'Status must be Active or Inactive' },
        { status: 400 }
      )
    }

    updateData.updatedAt = new Date().toISOString()

    const { data: worker, error } = await supabase
      .from('Employee')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to update worker' },
        { status: 500 }
      )
    }

    return NextResponse.json({ worker })
  } catch (error) {
    console.error('Worker PATCH error:', error)
    return NextResponse.json(
      { error: 'Failed to update worker' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: existing, error: findError } = await supabase
      .from('Employee')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('Employee')
      .update({ status: 'Inactive', updatedAt: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to deactivate worker' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Worker DELETE error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate worker' },
      { status: 500 }
    )
  }
}
