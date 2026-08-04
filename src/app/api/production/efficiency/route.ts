import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { differenceInDays, parseISO, isValid, format } from 'date-fns'

/**
 * GET /api/production/efficiency
 *
 * Production Efficiency Dashboard — aggregates production job metrics across
 * stages, progress, throughput, and bottlenecks.
 *
 * Computes:
 *   - Overall completion rate (completedQty / targetQty across all jobs)
 *   - Per-stage stats: job count, avg progress, bottleneck detection
 *   - On-time delivery rate (jobs completed by endDate)
 *   - Average production cycle time (startDate → endDate/completed)
 *   - Throughput (units per day)
 *   - Job status distribution
 *   - Stage bottleneck (stage with most jobs stuck / lowest avg progress)
 *   - Top performing jobs (highest progress)
 *   - At-risk jobs (behind schedule: progress < expected based on time elapsed)
 */

interface StageStat {
  stage: string
  jobCount: number
  totalTarget: number
  totalCompleted: number
  avgProgress: number
  color: string
}

interface JobEfficiency {
  id: string
  jobNo: string
  styleNo: string
  styleName: string
  targetQty: number
  completedQty: number
  progress: number
  stage: string
  status: string
  startDate: string
  endDate: string | null
  daysElapsed: number
  daysPlanned: number
  expectedProgress: number
  efficiency: number // actual progress / expected progress * 100
  isBehind: boolean
  isAtRisk: boolean
  throughput: number // units per day
}

interface EfficiencySummary {
  totalJobs: number
  completedJobs: number
  inProgressJobs: number
  totalTarget: number
  totalCompleted: number
  overallCompletion: number
  onTimeRate: number
  avgCycleTime: number
  avgEfficiency: number
  totalThroughput: number
  bottleneckStage: string
  bottleneckJobCount: number
  atRiskCount: number
}

const STAGE_COLORS: Record<string, string> = {
  'Fabric Issue': 'oklch(0.75 0.15 65)',
  'Cutting': 'oklch(0.8 0.15 75)',
  'Embroidery': 'oklch(0.7 0.15 300)',
  'Printing': 'oklch(0.7 0.15 250)',
  'Stitching': 'oklch(0.7 0.15 250)',
  'Finishing': 'oklch(0.65 0.12 180)',
  'Quality Check': 'oklch(0.72 0.18 145)',
  'Packing': 'oklch(0.65 0.18 155)',
  'Dispatch': 'oklch(0.78 0.14 85)',
}

function getStageColor(stage: string): string {
  return STAGE_COLORS[stage] || 'oklch(0.6 0.01 260)'
}

const PRODUCTION_STAGES = [
  'Fabric Issue',
  'Cutting',
  'Embroidery',
  'Printing',
  'Stitching',
  'Finishing',
  'Quality Check',
  'Packing',
  'Dispatch',
]

export async function GET() {
  try {
    const now = new Date()

    // ── 1. Fetch all production jobs ──
    const { data: jobs, error: jobErr } = await supabase
      .from('ProductionJob')
      .select('id, jobNo, styleNo, styleName, targetQty, completedQty, stage, status, startDate, endDate, createdAt, updatedAt')
      .order('createdAt', { ascending: true })

    if (jobErr) {
      if (isMissingTableError(jobErr)) {
        return NextResponse.json({
          summary: { totalJobs: 0, completedJobs: 0, inProgressJobs: 0, totalTarget: 0, totalCompleted: 0, overallCompletion: 0, onTimeRate: 0, avgCycleTime: 0, avgEfficiency: 0, totalThroughput: 0, bottleneckStage: '—', bottleneckJobCount: 0, atRiskCount: 0 },
          stages: [],
          jobs: [],
          statusDist: [],
        })
      }
      throw jobErr
    }

    const allJobs = jobs || []

    // ── 2. Compute per-job efficiency ──
    const jobEfficiencies: JobEfficiency[] = []
    let totalTarget = 0
    let totalCompleted = 0
    let completedCount = 0
    let inProgressCount = 0
    let onTimeCount = 0
    let completedCycleTimes = 0
    let completedCycleTimeCount = 0
    let totalEfficiency = 0
    let efficiencyCount = 0
    let totalThroughput = 0

    for (const job of allJobs) {
      const target = job.targetQty || 0
      const completed = job.completedQty || 0
      const progress = target > 0 ? Math.min(100, Math.round((completed / target) * 1000) / 10) : 0

      totalTarget += target
      totalCompleted += completed

      if (job.status === 'Completed') completedCount++
      else inProgressCount++

      const start = job.startDate ? new Date(job.startDate) : (job.createdAt ? new Date(job.createdAt) : now)
      const daysElapsed = Math.max(1, differenceInDays(now, start))

      // Planned duration
      let daysPlanned = 0
      if (job.endDate) {
        const end = new Date(job.endDate)
        if (isValid(end)) {
          daysPlanned = Math.max(1, differenceInDays(end, start))
        }
      }
      if (daysPlanned === 0) daysPlanned = 7 // default assumption

      // Expected progress = time elapsed / planned duration * 100
      const expectedProgress = Math.min(100, Math.round((daysElapsed / daysPlanned) * 1000) / 10)
      // Efficiency = actual / expected * 100
      const efficiency = expectedProgress > 0 ? Math.round((progress / expectedProgress) * 1000) / 10 : 100
      const isBehind = progress < expectedProgress - 10 // more than 10% behind
      const isAtRisk = isBehind && job.status !== 'Completed' && progress < 80

      // On-time check (for completed jobs)
      if (job.status === 'Completed' && job.endDate) {
        const end = new Date(job.endDate)
        if (isValid(end)) {
          if (end >= now || progress >= 100) onTimeCount++
          completedCycleTimes += differenceInDays(end, start)
          completedCycleTimeCount++
        }
      }

      // Throughput
      const throughput = Math.round((completed / daysElapsed) * 10) / 10
      totalThroughput += throughput

      if (job.status !== 'Completed') {
        totalEfficiency += efficiency
        efficiencyCount++
      }

      jobEfficiencies.push({
        id: job.id,
        jobNo: job.jobNo,
        styleNo: job.styleNo,
        styleName: job.styleName || 'Unknown',
        targetQty: target,
        completedQty: completed,
        progress,
        stage: job.stage || 'Unknown',
        status: job.status || 'Unknown',
        startDate: start.toISOString(),
        endDate: job.endDate,
        daysElapsed,
        daysPlanned,
        expectedProgress,
        efficiency,
        isBehind,
        isAtRisk,
        throughput,
      })
    }

    // ── 3. Per-stage stats ──
    const stageMap: Record<string, { jobCount: number; totalTarget: number; totalCompleted: number; progressSum: number }> = {}
    for (const job of jobEfficiencies) {
      const stage = job.stage
      if (!stageMap[stage]) stageMap[stage] = { jobCount: 0, totalTarget: 0, totalCompleted: 0, progressSum: 0 }
      stageMap[stage].jobCount++
      stageMap[stage].totalTarget += job.targetQty
      stageMap[stage].totalCompleted += job.completedQty
      stageMap[stage].progressSum += job.progress
    }

    const stages: StageStat[] = Object.entries(stageMap).map(([stage, s]) => ({
      stage,
      jobCount: s.jobCount,
      totalTarget: s.totalTarget,
      totalCompleted: s.totalCompleted,
      avgProgress: s.jobCount > 0 ? Math.round((s.progressSum / s.jobCount) * 10) / 10 : 0,
      color: getStageColor(stage),
    }))

    // Sort stages by production order
    stages.sort((a, b) => {
      const ai = PRODUCTION_STAGES.indexOf(a.stage)
      const bi = PRODUCTION_STAGES.indexOf(b.stage)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    // ── 4. Status distribution ──
    const statusMap: Record<string, number> = {}
    for (const job of jobEfficiencies) {
      const s = job.status
      statusMap[s] = (statusMap[s] || 0) + 1
    }
    const statusDist = Object.entries(statusMap).map(([status, count]) => ({ status, count }))

    // ── 5. Bottleneck detection ──
    // Bottleneck = stage with most jobs AND lowest avg progress (excluding Completed jobs in Dispatch)
    let bottleneckStage = '—'
    let bottleneckJobCount = 0
    let bottleneckAvgProgress = 100
    for (const s of stages) {
      if (s.stage === 'Dispatch' && s.avgProgress >= 100) continue
      // Score: more jobs + lower progress = worse bottleneck
      const bottleneckScore = s.jobCount * 2 + (100 - s.avgProgress)
      const currentScore = bottleneckJobCount * 2 + (100 - bottleneckAvgProgress)
      if (bottleneckStage === '—' || bottleneckScore > currentScore) {
        bottleneckStage = s.stage
        bottleneckJobCount = s.jobCount
        bottleneckAvgProgress = s.avgProgress
      }
    }

    // ── 6. Summary ──
    const overallCompletion = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 1000) / 10 : 0
    const onTimeRate = completedCount > 0 ? Math.round((onTimeCount / completedCount) * 1000) / 10 : 0
    const avgCycleTime = completedCycleTimeCount > 0 ? Math.round(completedCycleTimes / completedCycleTimeCount) : 0
    const avgEfficiency = efficiencyCount > 0 ? Math.round((totalEfficiency / efficiencyCount) * 10) / 10 : 100
    const atRiskCount = jobEfficiencies.filter(j => j.isAtRisk).length

    const summary: EfficiencySummary = {
      totalJobs: allJobs.length,
      completedJobs: completedCount,
      inProgressJobs: inProgressCount,
      totalTarget,
      totalCompleted,
      overallCompletion,
      onTimeRate,
      avgCycleTime,
      avgEfficiency,
      totalThroughput: Math.round(totalThroughput * 10) / 10,
      bottleneckStage,
      bottleneckJobCount,
      atRiskCount,
    }

    return NextResponse.json({
      summary,
      stages,
      jobs: jobEfficiencies,
      statusDist,
    })
  } catch (error) {
    console.error('Production efficiency API error:', error)
    return NextResponse.json({ error: 'Failed to load production efficiency data' }, { status: 500 })
  }
}
