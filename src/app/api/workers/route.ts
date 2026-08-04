import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const department = searchParams.get('department') || ''
    const status = searchParams.get('status') || ''
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50))
    const skip = (page - 1) * limit

    // Build the main workers query
    let query = supabase.from('Employee').select('*')

    if (status && status !== 'All') {
      query = query.eq('status', status)
    }

    if (department) {
      query = query.eq('department', department)
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,department.ilike.%${search}%,designation.ilike.%${search}%,phone.ilike.%${search}%,skills.ilike.%${search}%`
      )
    }

    query = query.order('createdAt', { ascending: false })
    const from = skip
    const to = from + limit - 1
    query = query.range(from, to)

    // Build the count query (same filters)
    let countQuery = supabase.from('Employee').select('*', { count: 'exact', head: true })

    if (status && status !== 'All') {
      countQuery = countQuery.eq('status', status)
    }

    if (department) {
      countQuery = countQuery.eq('department', department)
    }

    if (search) {
      countQuery = countQuery.or(
        `name.ilike.%${search}%,department.ilike.%${search}%,designation.ilike.%${search}%,phone.ilike.%${search}%,skills.ilike.%${search}%`
      )
    }

    // Fetch all workers for department/status counts and summary
    const allWorkersQuery = supabase
      .from('Employee')
      .select('department, status, salary')

    const [workersResult, totalResult, allWorkersResult] = await Promise.all([
      query,
      countQuery,
      allWorkersQuery,
    ])

    if (workersResult.error) {
      console.error('Supabase error:', workersResult.error)
      return NextResponse.json(
        { error: 'Failed to load workers' },
        { status: 500 }
      )
    }

    const workers = workersResult.data || []
    const total = totalResult.count || 0
    const allWorkers = allWorkersResult.data || []

    // Department counts
    const departmentCounts: Record<string, number> = {}
    for (const w of allWorkers) {
      departmentCounts[w.department] = (departmentCounts[w.department] || 0) + 1
    }

    // Status counts
    const statusCounts: Record<string, number> = {}
    for (const w of allWorkers) {
      statusCounts[w.status] = (statusCounts[w.status] || 0) + 1
    }

    // Summary
    const totalEmployees = allWorkers.length
    const activeCount = allWorkers.filter((w) => w.status === 'Active').length
    const monthlyPayroll = allWorkers
      .filter((w) => w.status === 'Active')
      .reduce((sum, w) => sum + w.salary, 0)
    const avgSalary =
      totalEmployees > 0
        ? Math.round(allWorkers.reduce((sum, w) => sum + w.salary, 0) / totalEmployees)
        : 0
    const departmentCount = Object.keys(departmentCounts).length
    const productionCount = departmentCounts['Production'] || 0

    return NextResponse.json({
      workers,
      total,
      page,
      limit,
      departmentCounts,
      statusCounts,
      summary: {
        totalEmployees,
        activeCount,
        monthlyPayroll,
        avgSalary,
        departmentCount,
        productionCount,
      },
    })
  } catch (error) {
    console.error('Workers GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load workers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      phone,
      department,
      designation,
      skills,
      salary,
      dailyWage,
    } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }
    if (!department?.trim()) {
      return NextResponse.json(
        { error: 'Department is required' },
        { status: 400 }
      )
    }
    if (!designation?.trim()) {
      return NextResponse.json(
        { error: 'Designation is required' },
        { status: 400 }
      )
    }
    if (salary === undefined || salary === null || Number(salary) <= 0) {
      return NextResponse.json(
        { error: 'Valid salary is required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    const { data: worker, error } = await supabase
      .from('Employee')
      .insert({
        name: name.trim(),
        phone: phone?.trim() || null,
        department: department.trim(),
        designation: designation.trim(),
        skills: skills?.trim() || null,
        salary: Number(salary),
        dailyWage: dailyWage ? Number(dailyWage) : null,
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create worker' },
        { status: 500 }
      )
    }

    return NextResponse.json({ worker }, { status: 201 })
  } catch (error) {
    console.error('Workers POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create worker' },
      { status: 500 }
    )
  }
}
