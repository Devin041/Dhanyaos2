import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const productionJobId = searchParams.get('productionJobId')
    const workerId = searchParams.get('workerId')
    const stage = searchParams.get('stage')

    let query = supabase.from('LaborTimesheet').select('*').order('date', { ascending: false })

    if (productionJobId) query = query.eq('productionJobId', productionJobId)
    if (workerId) query = query.eq('workerId', workerId)
    if (stage) query = query.eq('stage', stage)

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    const summary = {
      totalHours: rows.reduce((s: number, r: any) => s + (r.hoursWorked || 0), 0),
      totalCost: rows.reduce((s: number, r: any) => s + (r.totalCost || 0), 0),
      entryCount: rows.length,
    }

    return NextResponse.json({ timesheets: rows, summary })
  } catch (error) {
    console.error('LaborTimesheet GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch labor timesheets' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const entries: any[] = Array.isArray(body) ? body : [body]

    const rows = entries.map((e) => {
      const hoursWorked = Number(e.hoursWorked) || 0
      const wagePerHour = Number(e.wagePerHour) || 0
      return {
        productionJobId: String(e.productionJobId || ''),
        workerId: e.workerId ? String(e.workerId) : null,
        workerName: e.workerName ? String(e.workerName) : null,
        date: e.date ? new Date(e.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        hoursWorked,
        wagePerHour,
        totalCost: Number(e.totalCost) || hoursWorked * wagePerHour,
        stage: e.stage ? String(e.stage) : null,
      }
    }).filter((r) => r.productionJobId)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'productionJobId is required' }, { status: 400 })
    }

    const { data, error } = await supabase.from('LaborTimesheet').insert(rows).select()
    if (error) throw error

    return NextResponse.json({ timesheets: data || [] }, { status: 201 })
  } catch (error) {
    console.error('LaborTimesheet POST error:', error)
    return NextResponse.json({ error: 'Failed to create labor timesheet entries' }, { status: 500 })
  }
}
