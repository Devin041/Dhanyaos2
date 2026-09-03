import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const INSPECTION_POINTS = ['Fabric Check','Cutting Check','In-Process Check','Finishing Check','Final Inspection'] as const

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const inspectionPoint = searchParams.get('inspectionPoint')
    const status = searchParams.get('status')
    const severity = searchParams.get('severity')
    const search = searchParams.get('search')
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const { data: allRaw, error: allErr } = await supabase.from('QualityCheck').select('*, productionJob:productionJobId(jobNo, styleNo, styleName)').order('checkedAt', { ascending: false })
    if (allErr) throw allErr
    let all = allRaw || []
    let searchFiltered = all
    if (search) {
      const term = search.toLowerCase()
      searchFiltered = all.filter((c: any) =>
        (c.checkNo || '').toLowerCase().includes(term) ||
        (c.productionJob?.styleNo || '').toLowerCase().includes(term) ||
        (c.productionJob?.styleName || '').toLowerCase().includes(term) ||
        (c.color || '').toLowerCase().includes(term) ||
        (c.defectType || '').toLowerCase().includes(term)
      )
    }
    const inspectionCounts: Record<string, number> = {}
    for (const point of INSPECTION_POINTS) inspectionCounts[point] = 0
    const statusCounts: Record<string, number> = { Pass: 0, Fail: 0, Conditional: 0 }
    const severityCounts: Record<string, number> = { Minor: 0, Major: 0, Critical: 0 }
    for (const c of searchFiltered as any[]) {
      inspectionCounts[c.inspectionPoint] = (inspectionCounts[c.inspectionPoint] || 0) + 1
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
      severityCounts[c.severity] = (severityCounts[c.severity] || 0) + 1
    }
    const totalChecked = searchFiltered.reduce((sum: number, c: any) => sum + (c.checkedQty || 0), 0)
    const totalPassed = searchFiltered.reduce((sum: number, c: any) => sum + (c.passedQty || 0), 0)
    const totalFailed = searchFiltered.reduce((sum: number, c: any) => sum + (c.failedQty || 0), 0)
    const passRate = totalChecked > 0 ? Math.round((totalPassed / totalChecked) * 100) : 100
    const criticalDefects = searchFiltered.filter((c: any) => c.severity === 'Critical').length
    const defectMap: Record<string, number> = {}
    for (const c of searchFiltered as any[]) { if (c.defectType) defectMap[c.defectType] = (defectMap[c.defectType] || 0) + (c.defectCount || 0) }
    const topDefects = Object.entries(defectMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => ({ type, count }))
    let filtered = all
    if (inspectionPoint) filtered = filtered.filter((c: any) => c.inspectionPoint === inspectionPoint)
    if (status) filtered = filtered.filter((c: any) => c.status === status)
    if (severity) filtered = filtered.filter((c: any) => c.severity === severity)
    if (search) {
      const term = search.toLowerCase()
      filtered = filtered.filter((c: any) =>
        (c.checkNo || '').toLowerCase().includes(term) ||
        (c.productionJob?.styleNo || '').toLowerCase().includes(term) ||
        (c.productionJob?.styleName || '').toLowerCase().includes(term) ||
        (c.color || '').toLowerCase().includes(term) ||
        (c.defectType || '').toLowerCase().includes(term)
      )
    }
    const total = filtered.length
    const skip = (page - 1) * limit
    const checks = filtered.slice(skip, skip + limit)
    return NextResponse.json({ checks, total, inspectionCounts, statusCounts, severityCounts, summary: { totalChecked, totalPassed, totalFailed, passRate, criticalDefects, topDefects } })
  } catch (error) {
    console.error('Quality GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch quality checks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { productionJobId, inspectionPoint, checkedQty, passedQty, failedQty, defectType, defectCount, severity, status, inspectorName, notes, color } = body
    if (!productionJobId || !inspectionPoint || checkedQty == null)
      return NextResponse.json({ error: 'productionJobId, inspectionPoint, and checkedQty are required' }, { status: 400 })
    const validPoints = INSPECTION_POINTS as readonly string[]
    if (!validPoints.includes(inspectionPoint))
      return NextResponse.json({ error: `Invalid inspectionPoint. Must be one of: ${validPoints.join(', ')}` }, { status: 400 })
    // Phase 5b — explicit QC color: optional, but must be a non-empty string
    // when present (an empty string is a typo, not "no color")
    if (color !== undefined && color !== null) {
      if (typeof color !== 'string' || color.trim() === '')
        return NextResponse.json({ error: 'color must be a non-empty string (or omit it)' }, { status: 400 })
    }
    const { data: job } = await supabase.from('ProductionJob').select('jobNo, color').eq('id', productionJobId).single()
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    // Color defaulting: explicit > the job's own color
    const finalColor = (typeof color === 'string' && color.trim() !== '')
      ? color.trim()
      : ((job as { color?: string | null }).color || null)
    const checked = Number(checkedQty)
    const passed = passedQty != null ? Number(passedQty) : checked
    const failed = failedQty != null ? Number(failedQty) : checked - passed
    const { count } = await supabase.from('QualityCheck').select('*', { count: 'exact', head: true }).eq('productionJobId', productionJobId)
    const checkNo = `QC-${(job as any).jobNo}-${String((count || 0) + 1).padStart(2, '0')}`
    let finalStatus = status
    if (!finalStatus) {
      const rate = checked > 0 ? (passed / checked) * 100 : 100
      if (rate === 100) finalStatus = 'Pass'
      else if (failed > 5) finalStatus = 'Fail'
      else finalStatus = 'Conditional'
    }
    const validSeverities = ['Minor', 'Major', 'Critical']
    const finalSeverity = severity && validSeverities.includes(severity) ? severity : 'Minor'
    const ts = new Date().toISOString()
    const insertBase = {
      checkNo, productionJobId, inspectionPoint, checkedQty: checked, passedQty: passed,
      failedQty: Math.max(0, failed), defectType: defectType || null,
      defectCount: defectCount != null ? Number(defectCount) : (failed > 0 ? failed : 0),
      severity: finalSeverity, status: finalStatus, inspectorName: inspectorName || null, notes: notes || null,
      checkedAt: ts, createdAt: ts, updatedAt: ts,
    }
    // Phase 5b — record the color. Defensive: if the live QualityCheck.color
    // column were missing, retry once without it (the column exists since the
    // COLOR-PRODUCTION migration, so this is belt-and-braces).
    let { data: check, error } = await supabase.from('QualityCheck')
      .insert({ ...insertBase, color: finalColor })
      .select('*, productionJob:productionJobId(*)')
      .single()
    if (error && /color/i.test(String((error as { message?: string }).message || ''))) {
      const retry = await supabase.from('QualityCheck')
        .insert(insertBase)
        .select('*, productionJob:productionJobId(*)')
        .single()
      check = retry.data
      error = retry.error
    }
    if (error) throw error
    return NextResponse.json(check, { status: 201 })
  } catch (error) {
    console.error('Quality POST error:', error)
    return NextResponse.json({ error: 'Failed to create quality check' }, { status: 500 })
  }
}
