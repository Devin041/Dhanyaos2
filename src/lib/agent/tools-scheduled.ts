import { supabase } from '@/lib/supabase-db'
import type { ToolDef, ToolResult } from './tools'
import { TOOLS_SCHEDULED } from './tools-scheduled-defs'

// ─── Tool Definitions ──────────────────────────────────────────────────────────

export { TOOLS_SCHEDULED }

// ─── Executor ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function executeScheduledTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
  switch (toolName) {
    case 'create_scheduled_report':
      return createScheduledReport(params)
    case 'list_scheduled_reports':
      return listScheduledReports()
    case 'delete_scheduled_report':
      return deleteScheduledReport(params)
    default:
      return { success: false, data: null, summary: `Unknown scheduled tool: ${toolName}` }
  }
}

// ─── create_scheduled_report ───────────────────────────────────────────────────

async function createScheduledReport(params: Record<string, unknown>): Promise<ToolResult> {
  const label = params.label as string | undefined
  const reportType = params.reportType as string | undefined
  const schedule = params.schedule as string | undefined
  const query = params.query as string | undefined
  const dayOfWeek = params.dayOfWeek as number | undefined
  const dayOfMonth = params.dayOfMonth as number | undefined
  const timeOfDay = (params.timeOfDay as string | undefined) || '09:00'

  if (!label) return { success: false, data: null, summary: 'label is required' }
  if (!reportType) return { success: false, data: null, summary: 'reportType is required' }
  if (!schedule) return { success: false, data: null, summary: 'schedule is required' }
  if (!query) return { success: false, data: null, summary: 'query is required' }

  const validReportTypes = ['daily_summary', 'revenue_report', 'inventory_alerts', 'pending_orders', 'custom']
  if (!validReportTypes.includes(reportType)) {
    return { success: false, data: null, summary: `reportType must be one of: ${validReportTypes.join(', ')}` }
  }

  const validSchedules = ['daily', 'weekly', 'monthly']
  if (!validSchedules.includes(schedule)) {
    return { success: false, data: null, summary: `schedule must be one of: ${validSchedules.join(', ')}` }
  }

  // Validate time format
  if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
    return { success: false, data: null, summary: 'timeOfDay must be in HH:MM format' }
  }

  // Validate dayOfWeek for weekly
  if (schedule === 'weekly') {
    if (dayOfWeek === undefined || dayOfWeek < 1 || dayOfWeek > 7) {
      return { success: false, data: null, summary: 'dayOfWeek is required for weekly schedule and must be 1-7 (1=Monday, 7=Sunday)' }
    }
  }

  // Validate dayOfMonth for monthly
  if (schedule === 'monthly') {
    if (dayOfMonth === undefined || dayOfMonth < 1 || dayOfMonth > 28) {
      return { success: false, data: null, summary: 'dayOfMonth is required for monthly schedule and must be 1-28' }
    }
  }

  const now = new Date().toISOString()
  const { data: report, error } = await supabase.from('ScheduledReport').insert({
    label,
    reportType,
    schedule,
    dayOfWeek: schedule === 'weekly' ? dayOfWeek : null,
    dayOfMonth: schedule === 'monthly' ? dayOfMonth : null,
    timeOfDay,
    query,
    createdAt: now,
    updatedAt: now,
  }).select().single()

  if (error) {
    return { success: false, data: null, summary: `Failed to create scheduled report: ${error.message}` }
  }

  let scheduleDesc = ''
  if (schedule === 'daily') scheduleDesc = `daily at ${timeOfDay} IST`
  else if (schedule === 'weekly') scheduleDesc = `every ${DAY_NAMES[dayOfWeek! - 1]} at ${timeOfDay} IST`
  else scheduleDesc = `on day ${dayOfMonth} of each month at ${timeOfDay} IST`

  return {
    success: true,
    data: { id: report.id, label: report.label, reportType: report.reportType, schedule: report.schedule, scheduleDesc },
    summary: `Scheduled "${label}" — ${scheduleDesc} (${reportType})`,
  }
}

// ─── list_scheduled_reports ────────────────────────────────────────────────────

async function listScheduledReports(): Promise<ToolResult> {
  const { data: reports, error } = await supabase.from('ScheduledReport')
    .select('id, label, reportType, schedule, dayOfWeek, dayOfMonth, timeOfDay, isActive, lastRunAt, createdAt')
    .order('createdAt', { ascending: false })

  if (error) {
    return { success: false, data: null, summary: `Failed to fetch scheduled reports: ${error.message}` }
  }

  const list = (reports ?? []).map((r) => {
    let scheduleDesc: string
    if (r.schedule === 'daily') scheduleDesc = `Daily at ${r.timeOfDay}`
    else if (r.schedule === 'weekly') scheduleDesc = `Every ${DAY_NAMES[(r.dayOfWeek ?? 1) - 1]} at ${r.timeOfDay}`
    else scheduleDesc = `Day ${r.dayOfMonth} at ${r.timeOfDay}`

    return {
      id: r.id,
      label: r.label,
      reportType: r.reportType,
      schedule: r.schedule,
      scheduleDesc,
      isActive: r.isActive,
      lastRunAt: r.lastRunAt ? new Date(r.lastRunAt).toISOString() : null,
    }
  })

  return {
    success: true,
    data: list,
    count: list.length,
    summary: list.length === 0
      ? 'No scheduled reports found'
      : `${list.length} scheduled report${list.length === 1 ? '' : 's'}`,
  }
}

// ─── delete_scheduled_report ───────────────────────────────────────────────────

async function deleteScheduledReport(params: Record<string, unknown>): Promise<ToolResult> {
  const reportId = params.reportId as string | undefined
  if (!reportId) return { success: false, data: null, summary: 'reportId is required' }

  const { data: existing, error: fetchErr } = await supabase.from('ScheduledReport')
    .select('id, label').eq('id', reportId).single()

  if (fetchErr || !existing) return { success: false, data: null, summary: `Scheduled report "${reportId}" not found` }

  const { error: deleteErr } = await supabase.from('ScheduledReport').delete().eq('id', reportId)
  if (deleteErr) {
    return { success: false, data: null, summary: `Failed to delete scheduled report: ${deleteErr.message}` }
  }

  return {
    success: true,
    data: { id: reportId, label: existing.label },
    summary: `Deleted scheduled report "${existing.label}"`,
  }
}
