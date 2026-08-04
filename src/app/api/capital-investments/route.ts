import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format, startOfDay } from 'date-fns'

// ─── GET /api/capital-investments ──────────────────────────────────────────────
export async function GET() {
  try {
    const { data: investments, error } = await supabase
      .from('CapitalInvestment')
      .select('*')
      .order('investmentDate', { ascending: true })

    if (error) {
      // Gracefully return empty if the table does not exist yet in Supabase
      if (isMissingTableError(error)) {
        return NextResponse.json({ investments: [], totalInvested: 0 })
      }
      throw error
    }

    const totalInvested = (investments || []).reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0)

    return NextResponse.json({ investments: investments || [], totalInvested: Math.round(totalInvested * 100) / 100 })
  } catch (error) {
    console.error('Capital investments GET error:', error)
    return NextResponse.json({ error: 'Failed to load investments' }, { status: 500 })
  }
}

// ─── POST /api/capital-investments ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, investmentDate, source, description } = body

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const investAmount = Math.round(Number(amount) * 100) / 100

    // Generate investment number: CI-YYYYMMDD-XXX
    const today = startOfDay(new Date())
    const dateStr = format(today, 'yyyyMMdd')
    const { data: todayInvestments } = await supabase
      .from('CapitalInvestment')
      .select('investmentNo')
      .ilike('investmentNo', `CI-${dateStr}%`)
      .order('investmentNo', { ascending: false })
      .limit(1)
    let seq = 1
    if (todayInvestments && todayInvestments.length > 0) {
      const lastNo = todayInvestments[0].investmentNo
      const parts = lastNo.split('-')
      seq = parseInt(parts[2], 10) + 1
    }
    const investmentNo = `CI-${dateStr}-${String(seq).padStart(3, '0')}`

    const now = new Date().toISOString()

    const { data: investment, error } = await supabase
      .from('CapitalInvestment')
      .insert({
        investmentNo,
        amount: investAmount,
        investmentDate: investmentDate ? new Date(investmentDate).toISOString() : now,
        source: source || 'Owner Capital',
        description: description || null,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    // Also create a Credit Transaction for the capital inflow
    await supabase.from('Transaction').insert({
      type: 'Credit',
      category: 'Capital Investment',
      amount: investAmount,
      description: `Capital Investment — ${source || 'Owner Capital'}${description ? ` (${description})` : ''}`,
      referenceNo: investmentNo,
      referenceType: 'CapitalInvestment',
      referenceId: investment.id,
      date: investmentDate ? new Date(investmentDate).toISOString() : now,
      createdAt: now,
      updatedAt: now,
    })

    return NextResponse.json({ investment }, { status: 201 })
  } catch (error) {
    console.error('Capital investments POST error:', error)
    return NextResponse.json({ error: 'Failed to record investment' }, { status: 500 })
  }
}

// ─── DELETE /api/capital-investments?id=xxx ─────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Investment ID is required' }, { status: 400 })
    }

    // Delete the linked Transaction first (if any)
    await supabase
      .from('Transaction')
      .delete()
      .eq('referenceType', 'CapitalInvestment')
      .eq('referenceId', id)

    // Delete the investment
    const { error } = await supabase.from('CapitalInvestment').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Capital investments DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete investment' }, { status: 500 })
  }
}
