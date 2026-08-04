import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single transaction ─────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: transaction, error } = await supabase
      .from('Transaction')
      .select()
      .eq('id', id)
      .single()

    if (error || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: transaction.id,
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      description: transaction.description,
      referenceNo: transaction.referenceNo,
      date: transaction.date,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    })
  } catch (error) {
    console.error('Accounts [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to load transaction' }, { status: 500 })
  }
}

// ─── PATCH: Update transaction ───────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: findErr } = await supabase
      .from('Transaction')
      .select('id')
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Validate type if provided
    if (body.type !== undefined && body.type !== 'Credit' && body.type !== 'Debit') {
      return NextResponse.json({ error: 'type must be Credit or Debit' }, { status: 400 })
    }

    // Validate amount if provided
    if (body.amount !== undefined && (parseFloat(body.amount) <= 0 || isNaN(parseFloat(body.amount)))) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (body.type !== undefined) updateData.type = body.type
    if (body.category !== undefined) updateData.category = body.category.trim()
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount)
    if (body.description !== undefined) updateData.description = body.description?.trim() || ''
    if (body.referenceNo !== undefined) updateData.referenceNo = body.referenceNo?.trim() || null
    if (body.date !== undefined) updateData.date = new Date(body.date).toISOString()

    const { data: updated, error } = await supabase
      .from('Transaction')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      category: updated.category,
      amount: updated.amount,
      description: updated.description,
      referenceNo: updated.referenceNo,
      date: updated.date,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error('Accounts [id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}

// ─── DELETE: Remove transaction ──────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: existing, error: findErr } = await supabase
      .from('Transaction')
      .select('id')
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const { error } = await supabase.from('Transaction').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Accounts [id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
