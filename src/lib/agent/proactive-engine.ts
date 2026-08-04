// ─── Proactive Alert Engine ─────────────────────────────────────────────────
// Scans business state on agent open and surfaces actionable alerts.

import { supabase } from '@/lib/supabase-db'
import { istNow } from './date-utils'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProactiveAlert {
  severity: 'critical' | 'warning' | 'info'
  category:
    | 'overdue_orders'
    | 'low_stock'
    | 'zero_stock'
    | 'payment_overdue'
    | 'production_delay'
    | 'quality_issue'
  title: string
  description: string
  metric: { label: string; value: number; unit: string }
  actionLabel: string
  actionMessage: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 }

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)

/** Start of today in IST, expressed as UTC Date for comparison */
function istTodayStartUTC(): Date {
  const ist = istNow()
  ist.setHours(0, 0, 0, 0)
  return new Date(ist.getTime() - IST_OFFSET_MS)
}

/** Start of N-days-ago in IST, expressed as UTC Date */
function istDaysAgoStartUTC(days: number): Date {
  const ist = istNow()
  ist.setDate(ist.getDate() - days)
  ist.setHours(0, 0, 0, 0)
  return new Date(ist.getTime() - IST_OFFSET_MS)
}

// ─── Individual Checks ──────────────────────────────────────────────────────

async function checkOverdueOrders(): Promise<ProactiveAlert | null> {
  const todayStart = istTodayStartUTC().toISOString()
  const { data: orders } = await supabase.from('SalesOrder')
    .select('orderNo, totalAmount, customer:customerId(companyName)')
    .in('status', ['Pending', 'Confirmed', 'In Production'])
    .lt('deliveryDate', todayStart)

  if (!orders || orders.length === 0) return null

  const totalValue = orders.reduce((s, o) => s + (o.totalAmount ?? 0), 0)
  const customerNames = orders.map((o) => (o.customer as any)?.companyName ?? '').filter(Boolean).join(', ')

  return {
    severity: orders.length > 5 ? 'critical' : 'warning',
    category: 'overdue_orders',
    title: 'Overdue Delivery Orders',
    description: `${orders.length} order${orders.length > 1 ? 's' : ''} past delivery date — ${customerNames}`,
    metric: { label: 'Outstanding Value', value: totalValue, unit: 'INR' },
    actionLabel: 'View Overdue Orders',
    actionMessage: 'Overdue orders dikhao with customer names',
  }
}

async function checkZeroStock(): Promise<ProactiveAlert | null> {
  const { data: fabrics } = await supabase.from('FabricStock')
    .select('fabricName')
    .eq('availableMeters', 0)
    .order('fabricName', { ascending: true })

  if (!fabrics || fabrics.length === 0) return null

  const names = fabrics.slice(0, 5).map((f) => f.fabricName).join(', ')
  const suffix = fabrics.length > 5 ? ` +${fabrics.length - 5} more` : ''

  return {
    severity: 'critical',
    category: 'zero_stock',
    title: 'Out-of-Stock Fabrics',
    description: `Zero stock: ${names}${suffix}`,
    metric: { label: 'Fabrics', value: fabrics.length, unit: 'items' },
    actionLabel: 'View Stock',
    actionMessage: 'Zero stock fabrics dikhao',
  }
}

async function checkLowStock(): Promise<ProactiveAlert | null> {
  const { data: fabrics } = await supabase.from('FabricStock')
    .select('fabricName, availableMeters')
    .gt('availableMeters', 0)
    .lte('availableMeters', 100)
    .order('availableMeters', { ascending: true })

  if (!fabrics || fabrics.length === 0) return null

  const hasCritical = fabrics.some((f) => f.availableMeters < 20)
  const top5 = fabrics.slice(0, 5).map((f) => `${f.fabricName} (${Math.round(f.availableMeters)}m)`).join(', ')
  const suffix = fabrics.length > 5 ? ` +${fabrics.length - 5} more` : ''

  return {
    severity: hasCritical ? 'critical' : 'warning',
    category: 'low_stock',
    title: 'Low Stock Fabrics',
    description: `${fabrics.length} fabric${fabrics.length > 1 ? 's' : ''} below 100m — ${top5}${suffix}`,
    metric: { label: 'Fabrics', value: fabrics.length, unit: 'items' },
    actionLabel: 'View Low Stock',
    actionMessage: 'Low stock fabric dikhao',
  }
}

async function checkPaymentOverdue(): Promise<ProactiveAlert | null> {
  const cutoff = istDaysAgoStartUTC(30).toISOString()
  const { data: orders } = await supabase.from('SalesOrder')
    .select('orderNo, totalAmount, paidAmount')
    .in('paymentStatus', ['Unpaid', 'Partial'])
    .lt('createdAt', cutoff)

  if (!orders || orders.length === 0) return null

  const outstanding = orders.reduce((s, o) => s + ((o.totalAmount ?? 0) - (o.paidAmount ?? 0)), 0)

  return {
    severity: 'warning',
    category: 'payment_overdue',
    title: 'Overdue Payments',
    description: `${orders.length} order${orders.length > 1 ? 's' : ''} unpaid for 30+ days`,
    metric: { label: 'Outstanding', value: outstanding, unit: 'INR' },
    actionLabel: 'View Overdue Payments',
    actionMessage: 'Overdue payments ka report banao',
  }
}

async function checkProductionDelays(): Promise<ProactiveAlert | null> {
  const todayStart = istTodayStartUTC().toISOString()
  const { data: jobs } = await supabase.from('ProductionJob')
    .select('jobNo')
    .not('status', 'in', '("Completed","Cancelled")')
    .lt('endDate', todayStart)
    .order('jobNo', { ascending: true })

  if (!jobs || jobs.length === 0) return null

  const jobNos = jobs.slice(0, 5).map((j) => j.jobNo).join(', ')
  const suffix = jobs.length > 5 ? ` +${jobs.length - 5} more` : ''

  return {
    severity: 'warning',
    category: 'production_delay',
    title: 'Delayed Production Jobs',
    description: `${jobs.length} job${jobs.length > 1 ? 's' : ''} past target end date — ${jobNos}${suffix}`,
    metric: { label: 'Delayed Jobs', value: jobs.length, unit: 'jobs' },
    actionLabel: 'View Delayed Jobs',
    actionMessage: 'Delayed production jobs dikhao',
  }
}

async function checkQCFailures(): Promise<ProactiveAlert | null> {
  const cutoff = istDaysAgoStartUTC(7).toISOString()
  const { data: checks } = await supabase.from('QualityCheck')
    .select('checkNo, defectType')
    .eq('status', 'Fail')
    .gte('checkedAt', cutoff)
    .order('checkedAt', { ascending: false })

  if (!checks || checks.length === 0) return null

  const defects = checks.map((c) => c.defectType || 'Unspecified').join(', ')

  return {
    severity: checks.length > 3 ? 'warning' : 'info',
    category: 'quality_issue',
    title: 'Recent QC Failures',
    description: `${checks.length} failure${checks.length > 1 ? 's' : ''} in last 7 days — Defects: ${defects}`,
    metric: { label: 'Failures', value: checks.length, unit: 'checks' },
    actionLabel: 'View QC Failures',
    actionMessage: 'Failed quality checks dikhao',
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function getProactiveAlerts(): Promise<ProactiveAlert[]> {
  const results = await Promise.all([
    checkOverdueOrders(),
    checkZeroStock(),
    checkLowStock(),
    checkPaymentOverdue(),
    checkProductionDelays(),
    checkQCFailures(),
  ])

  return results
    .filter((r): r is ProactiveAlert => r !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 5)
}
