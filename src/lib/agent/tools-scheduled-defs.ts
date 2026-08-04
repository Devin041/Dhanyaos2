import type { ToolDef } from './tools'

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS ONLY — 3 SCHEDULED REPORT TOOLS (lightweight, no db import)
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS_SCHEDULED: ToolDef[] = [
  {
    name: 'create_scheduled_report',
    description: 'Schedule a recurring report that will appear as a proactive alert. Daily/weekly/monthly schedules supported.',
    parameters: {
      label: { type: 'string', description: 'Human-readable label for this scheduled report, e.g. "Daily business summary"', required: true },
      reportType: { type: 'string', description: 'Type of report', enum: ['daily_summary', 'revenue_report', 'inventory_alerts', 'pending_orders', 'custom'], required: true },
      schedule: { type: 'string', description: 'How often to run', enum: ['daily', 'weekly', 'monthly'], required: true },
      dayOfWeek: { type: 'number', description: 'Day of week for weekly schedule (1=Monday, 2=Tuesday, ..., 7=Sunday)' },
      dayOfMonth: { type: 'number', description: 'Day of month for monthly schedule (1-28)' },
      timeOfDay: { type: 'string', description: 'Time of day in HH:MM format, IST (default "09:00")' },
      query: { type: 'string', description: 'The natural language query to execute when the report triggers', required: true },
    },
  },
  {
    name: 'list_scheduled_reports',
    description: 'List all scheduled reports with their schedule, last run time, and status.',
    parameters: {},
  },
  {
    name: 'delete_scheduled_report',
    description: 'Delete a scheduled report by its ID.',
    parameters: {
      reportId: { type: 'string', description: 'The scheduled report ID to delete', required: true },
    },
  },
]