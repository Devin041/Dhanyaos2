import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { differenceInDays, format, parseISO, isValid, subDays } from 'date-fns'

/**
 * GET /api/quality/dashboard
 *
 * Quality Control Dashboard — aggregates QC inspection metrics across
 * pass/fail rates, defect types, severity, inspection points, and trends.
 *
 * Computes:
 *   - Overall pass rate, total checks, total checked/passed/failed units
 *   - Defect type breakdown (top defects by count + percentage)
 *   - Severity distribution (Critical/Major/Minor)
 *   - Inspection point analysis (which stages have most failures)
 *   - 14-day QC trend (pass rate over time)
 *   - Inspector performance
 *   - Rework cycle analysis (conditional passes → rework needed)
 *   - Quality score (0-100) with grade
 */

interface DefectTypeStat {
  type: string
  count: number
  percentage: number
  color: string
}

interface InspectionPointStat {
  point: string
  totalChecks: number
  totalChecked: number
  totalPassed: number
  totalFailed: number
  passRate: number
}

interface TrendItem {
  date: string
  checked: number
  passed: number
  failed: number
  passRate: number
}

interface InspectorStat {
  name: string
  checks: number
  passRate: number
  avgChecked: number
}

interface QCSummary {
  totalChecks: number
  totalChecked: number
  totalPassed: number
  totalFailed: number
  passRate: number
  failRate: number
  criticalDefects: number
  conditionalCount: number
  reworkNeeded: number
  qualityScore: number
  grade: string
  avgDefectsPerCheck: number
}

const DEFECT_COLORS = [
  'oklch(0.65 0.22 25)',   // red
  'oklch(0.8 0.15 75)',    // gold
  'oklch(0.75 0.15 65)',   // orange
  'oklch(0.7 0.15 250)',   // blue
  'oklch(0.7 0.15 300)',   // purple
  'oklch(0.65 0.12 180)',  // teal
  'oklch(0.72 0.18 145)',  // green
  'oklch(0.7 0.15 350)',   // pink
]

function getGrade(score: number): string {
  if (score >= 95) return 'A+'
  if (score >= 90) return 'A'
  if (score >= 85) return 'B+'
  if (score >= 80) return 'B'
  if (score >= 75) return 'C+'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export async function GET() {
  try {
    const now = new Date()

    // ── Fetch all QC checks ──
    const { data: checks, error: qcErr } = await supabase
      .from('QualityCheck')
      .select('id, checkNo, inspectionPoint, checkedQty, passedQty, failedQty, defectType, defectCount, severity, status, inspectorName, notes, checkedAt, createdAt, productionJob:productionJobId(jobNo, styleNo, styleName)')
      .order('checkedAt', { ascending: true })

    if (qcErr) {
      if (isMissingTableError(qcErr)) {
        return NextResponse.json({
          summary: { totalChecks: 0, totalChecked: 0, totalPassed: 0, totalFailed: 0, passRate: 0, failRate: 0, criticalDefects: 0, conditionalCount: 0, reworkNeeded: 0, qualityScore: 100, grade: 'A+', avgDefectsPerCheck: 0 },
          defectTypes: [],
          inspectionPoints: [],
          trend: [],
          inspectors: [],
        })
      }
      throw qcErr
    }

    const allChecks = checks || []

    // ── Summary ──
    const totalChecks = allChecks.length
    const totalChecked = allChecks.reduce((s: number, c: any) => s + (c.checkedQty || 0), 0)
    const totalPassed = allChecks.reduce((s: number, c: any) => s + (c.passedQty || 0), 0)
    const totalFailed = allChecks.reduce((s: number, c: any) => s + (c.failedQty || 0), 0)
    const passRate = totalChecked > 0 ? Math.round((totalPassed / totalChecked) * 1000) / 10 : 0
    const failRate = totalChecked > 0 ? Math.round((totalFailed / totalChecked) * 1000) / 10 : 0
    const criticalDefects = allChecks.filter((c: any) => c.severity === 'Critical').length
    const conditionalCount = allChecks.filter((c: any) => c.status === 'Conditional').length
    const reworkNeeded = conditionalCount
    const totalDefects = allChecks.reduce((s: number, c: any) => s + (c.defectCount || 0), 0)
    const avgDefectsPerCheck = totalChecks > 0 ? Math.round((totalDefects / totalChecks) * 100) / 100 : 0

    // Quality score: weighted formula
    // - Pass rate: 60%
    // - Critical defect penalty: -2 per critical defect (max -20)
    // - Conditional rate penalty: conditional/total * 20
    const criticalPenalty = Math.min(20, criticalDefects * 2)
    const conditionalPenalty = totalChecks > 0 ? Math.round((conditionalCount / totalChecks) * 200) / 10 : 0
    const qualityScore = Math.max(0, Math.min(100, Math.round(passRate * 0.6 + 40 - criticalPenalty - conditionalPenalty)))
    const grade = getGrade(qualityScore)

    const summary: QCSummary = {
      totalChecks,
      totalChecked,
      totalPassed,
      totalFailed,
      passRate,
      failRate,
      criticalDefects,
      conditionalCount,
      reworkNeeded,
      qualityScore,
      grade,
      avgDefectsPerCheck,
    }

    // ── Defect type breakdown ──
    const defectMap: Record<string, number> = {}
    for (const c of allChecks) {
      if (c.defectType && c.defectCount > 0) {
        defectMap[c.defectType] = (defectMap[c.defectType] || 0) + c.defectCount
      }
    }
    const totalDefectCount = Object.values(defectMap).reduce((s, v) => s + v, 0)
    const defectTypes: DefectTypeStat[] = Object.entries(defectMap)
      .map(([type, count], i) => ({
        type,
        count,
        percentage: totalDefectCount > 0 ? Math.round((count / totalDefectCount) * 1000) / 10 : 0,
        color: DEFECT_COLORS[i % DEFECT_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count)

    // ── Inspection point analysis ──
    const pointMap: Record<string, { totalChecks: number; totalChecked: number; totalPassed: number; totalFailed: number }> = {}
    for (const c of allChecks) {
      const point = c.inspectionPoint || 'Unknown'
      if (!pointMap[point]) pointMap[point] = { totalChecks: 0, totalChecked: 0, totalPassed: 0, totalFailed: 0 }
      pointMap[point].totalChecks++
      pointMap[point].totalChecked += c.checkedQty || 0
      pointMap[point].totalPassed += c.passedQty || 0
      pointMap[point].totalFailed += c.failedQty || 0
    }
    const inspectionPoints: InspectionPointStat[] = Object.entries(pointMap)
      .map(([point, s]) => ({
        point,
        ...s,
        passRate: s.totalChecked > 0 ? Math.round((s.totalPassed / s.totalChecked) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.totalFailed - a.totalFailed)

    // ── 14-day trend ──
    const trend: TrendItem[] = []
    for (let i = 13; i >= 0; i--) {
      const day = subDays(now, i)
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setHours(23, 59, 59, 999)

      const dayChecks = allChecks.filter((c: any) => {
        const checkedAt = c.checkedAt || c.createdAt
        if (!checkedAt) return false
        const d = new Date(checkedAt)
        return d >= dayStart && d <= dayEnd
      })

      const checked = dayChecks.reduce((s: number, c: any) => s + (c.checkedQty || 0), 0)
      const passed = dayChecks.reduce((s: number, c: any) => s + (c.passedQty || 0), 0)
      const failed = dayChecks.reduce((s: number, c: any) => s + (c.failedQty || 0), 0)

      trend.push({
        date: format(day, 'MMM dd'),
        checked,
        passed,
        failed,
        passRate: checked > 0 ? Math.round((passed / checked) * 1000) / 10 : 0,
      })
    }

    // ── Inspector performance ──
    const inspectorMap: Record<string, { checks: number; totalChecked: number; totalPassed: number }> = {}
    for (const c of allChecks) {
      const name = c.inspectorName || 'Unknown'
      if (!inspectorMap[name]) inspectorMap[name] = { checks: 0, totalChecked: 0, totalPassed: 0 }
      inspectorMap[name].checks++
      inspectorMap[name].totalChecked += c.checkedQty || 0
      inspectorMap[name].totalPassed += c.passedQty || 0
    }
    const inspectors: InspectorStat[] = Object.entries(inspectorMap)
      .map(([name, s]) => ({
        name,
        checks: s.checks,
        passRate: s.totalChecked > 0 ? Math.round((s.totalPassed / s.totalChecked) * 1000) / 10 : 0,
        avgChecked: s.checks > 0 ? Math.round(s.totalChecked / s.checks) : 0,
      }))
      .sort((a, b) => b.checks - a.checks)

    // ── Recent failed checks (top 5) ──
    const recentFailures = allChecks
      .filter((c: any) => c.status === 'Fail' || c.failedQty > 0)
      .sort((a: any, b: any) => (b.failedQty || 0) - (a.failedQty || 0))
      .slice(0, 5)
      .map((c: any) => ({
        id: c.id,
        checkNo: c.checkNo,
        inspectionPoint: c.inspectionPoint,
        checkedQty: c.checkedQty,
        passedQty: c.passedQty,
        failedQty: c.failedQty,
        defectType: c.defectType,
        severity: c.severity,
        status: c.status,
        inspectorName: c.inspectorName,
        checkedAt: c.checkedAt || c.createdAt,
        jobNo: (c.productionJob as any)?.jobNo,
        styleName: (c.productionJob as any)?.styleName,
      }))

    return NextResponse.json({
      summary,
      defectTypes,
      inspectionPoints,
      trend,
      inspectors,
      recentFailures,
    })
  } catch (error) {
    console.error('Quality dashboard API error:', error)
    return NextResponse.json({ error: 'Failed to load quality dashboard data' }, { status: 500 })
  }
}
