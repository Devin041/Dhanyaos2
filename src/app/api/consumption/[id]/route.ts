import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Single consumption detail ──────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: consumption, error } = await supabase
      .from('FabricConsumption')
      .select()
      .eq('id', id)
      .single()

    if (error || !consumption) {
      return NextResponse.json({ error: 'Consumption record not found' }, { status: 404 })
    }

    const [jobRes, stockRes] = await Promise.all([
      supabase.from('ProductionJob').select('id, jobNo, styleNo, styleName, targetQty, completedQty, status').eq('id', consumption.productionJobId).single(),
      supabase.from('FabricStock').select('id, fabricName, gsm, width, lotNumber, availableMeters, averageCost').eq('id', consumption.fabricStockId).single(),
    ])

    return NextResponse.json({
      consumption: {
        ...consumption,
        productionJob: jobRes.data || null,
        fabricStock: stockRes.data || null,
      },
    })
  } catch (error) {
    console.error('Error fetching consumption:', error)
    return NextResponse.json({ error: 'Failed to fetch consumption record' }, { status: 500 })
  }
}

// ─── PATCH: Update consumption record ─────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { issuedQty, consumedQty, outputQty, plannedQty, wastageReason, wastageRemarks } = body

    const { data: existing, error: findErr } = await supabase
      .from('FabricConsumption')
      .select()
      .eq('id', id)
      .single()
    if (findErr || !existing) {
      return NextResponse.json({ error: 'Consumption record not found' }, { status: 404 })
    }

    const newIssued = issuedQty ?? existing.issuedQty
    const newConsumed = consumedQty ?? existing.consumedQty
    const newOutput = outputQty ?? existing.outputQty
    const newPlanned = plannedQty ?? existing.plannedQty

    const wastageQty = newIssued - newConsumed
    const wastagePercent = newIssued > 0 ? (wastageQty / newIssued) * 100 : 0
    const consumptionPerPc = newOutput > 0 ? newConsumed / newOutput : 0
    const varianceVsPlan = newPlanned ? newConsumed - newPlanned : 0

    const { data: consumption, error } = await supabase
      .from('FabricConsumption')
      .update({
        issuedQty: newIssued,
        consumedQty: newConsumed,
        wastageQty,
        wastagePercent,
        plannedQty: newPlanned,
        varianceVsPlan,
        outputQty: newOutput,
        consumptionPerPc,
        wastageReason: wastageReason ?? existing.wastageReason,
        wastageRemarks: wastageRemarks ?? existing.wastageRemarks,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const [jobRes, stockRes] = await Promise.all([
      supabase.from('ProductionJob').select('id, jobNo, styleNo, styleName').eq('id', consumption.productionJobId).single(),
      supabase.from('FabricStock').select('id, fabricName').eq('id', consumption.fabricStockId).single(),
    ])

    return NextResponse.json({
      consumption: {
        ...consumption,
        productionJob: jobRes.data || null,
        fabricStock: stockRes.data || null,
      },
    })
  } catch (error) {
    console.error('Error updating consumption:', error)
    return NextResponse.json({ error: 'Failed to update consumption record' }, { status: 500 })
  }
}
