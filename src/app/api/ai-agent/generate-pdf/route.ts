import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { istToday, istNow, istMonthStart, parseDateInput } from '@/lib/agent/date-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PdfRequest {
  reportType: 'daily_summary' | 'order_detail' | 'revenue_report' | 'inventory_report' | 'customer_ledger'
  params: Record<string, unknown>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const fmtNum = (n: number) => new Intl.NumberFormat('en-IN').format(n)

function htmlWrap(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; padding: 40px; font-size: 13px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; font-weight: 700; color: #111827; }
  .header .subtitle { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .header .meta { text-align: right; font-size: 11px; color: #9ca3af; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f9fafb; text-align: left; padding: 10px 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; border-bottom: 2px solid #e5e7eb; }
  td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  tr:hover td { background: #f9fafb; }
  .amount { text-align: right; font-family: 'SF Mono', 'Fira Code', monospace; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 4px; }
  .summary-card .value { font-size: 20px; font-weight: 700; color: #111827; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #9ca3af; }
  .section-title { font-size: 15px; font-weight: 700; margin: 24px 0 12px; color: #111827; }
</style>
</head>
<body>
${bodyHtml}
<div class="footer">Dhanya OS — Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} | Confidential</div>
</body>
</html>`
}

// ─── Report Generators ──────────────────────────────────────────────────────

async function dailySummaryPdf(): Promise<string> {
  const today = istToday()
  const todayStart = new Date(today + 'T00:00:00.000Z')
  const todayEnd = new Date(today + 'T23:59:59.999Z')

  const [ordersRes, transactionsRes, jobsRes, dispatchesRes] = await Promise.all([
    supabase.from('SalesOrder').select('*, customer:customerId(companyName)').gte('orderDate', todayStart.toISOString()).lte('orderDate', todayEnd.toISOString()).order('createdAt', { ascending: false }),
    supabase.from('Transaction').select('*').gte('date', todayStart.toISOString()).lte('date', todayEnd.toISOString()),
    supabase.from('ProductionJob').select('*').gte('createdAt', todayStart.toISOString()).lte('createdAt', todayEnd.toISOString()),
    supabase.from('Dispatch').select('*').gte('createdAt', todayStart.toISOString()).lte('createdAt', todayEnd.toISOString()),
  ])

  const orders = ordersRes.data || []
  const transactions = transactionsRes.data || []
  const jobs = jobsRes.data || []
  const dispatches = dispatchesRes.data || []

  const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0)
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0)

  const body = `
<div class="header">
  <div>
    <h1>Daily Business Summary</h1>
    <div class="subtitle">Dhanya Lifestyle LLP</div>
  </div>
  <div class="meta">
    <div>Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div>Generated: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
  </div>
</div>

<div class="summary-grid">
  <div class="summary-card"><div class="label">New Orders</div><div class="value">${orders.length}</div></div>
  <div class="summary-card"><div class="label">Order Value</div><div class="value">${fmt(totalRevenue)}</div></div>
  <div class="summary-card"><div class="label">Income</div><div class="value">${fmt(totalIncome)}</div></div>
  <div class="summary-card"><div class="label">Expense</div><div class="value">${fmt(totalExpense)}</div></div>
</div>

${orders.length > 0 ? `
<div class="section-title">Today's Orders</div>
<table>
  <thead><tr><th>Order No</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
  <tbody>
    ${orders.map(o => `<tr><td><strong>${o.orderNo}</strong></td><td>${o.customer?.companyName || '-'}</td><td class="amount">${fmt(o.totalAmount)}</td><td><span class="badge ${o.status === 'Delivered' ? 'badge-green' : o.status === 'Cancelled' ? 'badge-red' : 'badge-blue'}">${o.status}</span></td></tr>`).join('')}
  </tbody>
</table>` : '<p style="color:#6b7280;">No orders today.</p>'}

<div class="summary-grid" style="margin-top:24px">
  <div class="summary-card"><div class="label">Production Jobs</div><div class="value">${jobs.length}</div></div>
  <div class="summary-card"><div class="label">Dispatches</div><div class="value">${dispatches.length}</div></div>
  <div class="summary-card"><div class="label">Transactions</div><div class="value">${transactions.length}</div></div>
  <div class="summary-card"><div class="label">Net Cash Flow</div><div class="value">${fmt(totalIncome - totalExpense)}</div></div>
</div>
`
  return htmlWrap('Daily Summary — ' + today, body)
}

async function revenueReportPdf(period: string, fromDate?: string, toDate?: string): Promise<string> {
  const from = parseDateInput(fromDate) || new Date(2020, 0, 1)
  const to = parseDateInput(toDate) || istNow()

  const { data: orders } = await supabase
    .from('SalesOrder')
    .select('*, customer:customerId(companyName)')
    .gte('orderDate', from.toISOString())
    .lte('orderDate', to.toISOString())
    .neq('status', 'Cancelled')
    .order('totalAmount', { ascending: false })
    .limit(50)

  const totalRevenue = (orders || []).reduce((s, o) => s + (o.totalAmount || 0), 0)
  const totalGST = (orders || []).reduce((s, o) => s + (o.totalGst || 0), 0)
  const avgOrderValue = (orders || []).length > 0 ? totalRevenue / (orders || []).length : 0

  const body = `
<div class="header">
  <div>
    <h1>Revenue Report</h1>
    <div class="subtitle">${period} — Dhanya Lifestyle LLP</div>
  </div>
  <div class="meta">
    <div>Period: ${from.toLocaleDateString('en-IN')} — ${to.toLocaleDateString('en-IN')}</div>
  </div>
</div>

<div class="summary-grid">
  <div class="summary-card"><div class="label">Total Orders</div><div class="value">${(orders || []).length}</div></div>
  <div class="summary-card"><div class="label">Total Revenue</div><div class="value">${fmt(totalRevenue)}</div></div>
  <div class="summary-card"><div class="label">Total GST</div><div class="value">${fmt(totalGST)}</div></div>
  <div class="summary-card"><div class="label">Avg Order Value</div><div class="value">${fmt(avgOrderValue)}</div></div>
</div>

<table>
  <thead><tr><th>#</th><th>Order No</th><th>Customer</th><th>Amount</th><th>GST</th><th>Status</th></tr></thead>
  <tbody>
    ${(orders || []).map((o, i) => `<tr><td>${i + 1}</td><td>${o.orderNo}</td><td>${o.customer?.companyName || '-'}</td><td class="amount">${fmt(o.totalAmount)}</td><td class="amount">${fmt(o.totalGst)}</td><td><span class="badge ${o.status === 'Delivered' ? 'badge-green' : 'badge-blue'}">${o.status}</span></td></tr>`).join('')}
  </tbody>
</table>
`
  return htmlWrap('Revenue Report', body)
}

async function inventoryReportPdf(): Promise<string> {
  const { data: fabrics } = await supabase
    .from('FabricStock')
    .select('*, supplier:supplierId(name)')
    .order('availableMeters', { ascending: true })

  const totalValue = (fabrics || []).reduce((s, f) => s + ((f.availableMeters || 0) * (f.averageCost || 0)), 0)
  const lowStock = (fabrics || []).filter(f => (f.availableMeters || 0) <= 100)
  const outOfStock = (fabrics || []).filter(f => (f.availableMeters || 0) === 0)

  const body = `
<div class="header">
  <div>
    <h1>Inventory Report</h1>
    <div class="subtitle">Fabric Stock Status — Dhanya Lifestyle LLP</div>
  </div>
  <div class="meta">
    <div>Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
  </div>
</div>

<div class="summary-grid">
  <div class="summary-card"><div class="label">Total Fabrics</div><div class="value">${(fabrics || []).length}</div></div>
  <div class="summary-card"><div class="label">Total Value</div><div class="value">${fmt(totalValue)}</div></div>
  <div class="summary-card"><div class="label">Low Stock</div><div class="value" style="color:#d97706">${lowStock.length}</div></div>
  <div class="summary-card"><div class="label">Out of Stock</div><div class="value" style="color:#dc2626">${outOfStock.length}</div></div>
</div>

<table>
  <thead><tr><th>Fabric</th><th>Supplier</th><th>Available (m)</th><th>Avg Cost/m</th><th>Total Value</th><th>Status</th></tr></thead>
  <tbody>
    ${(fabrics || []).map(f => {
      const meters = f.availableMeters || 0
      const value = meters * (f.averageCost || 0)
      const status = meters === 0 ? 'badge-red' : meters <= 100 ? 'badge-amber' : 'badge-green'
      const statusLabel = meters === 0 ? 'Out of Stock' : meters <= 100 ? 'Low Stock' : 'In Stock'
      return `<tr><td><strong>${f.fabricName}</strong></td><td>${f.supplier?.name || '-'}</td><td class="amount">${fmtNum(meters)}</td><td class="amount">${fmt(f.averageCost || 0)}</td><td class="amount">${fmt(value)}</td><td><span class="badge ${status}">${statusLabel}</span></td></tr>`
    }).join('')}
  </tbody>
</table>
`
  return htmlWrap('Inventory Report', body)
}

// ─── POST — Generate PDF Report ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reportType, params = {} }: PdfRequest = body

    if (!reportType) {
      return NextResponse.json({ error: 'reportType is required' }, { status: 400 })
    }

    let html: string

    switch (reportType) {
      case 'daily_summary':
        html = await dailySummaryPdf()
        break
      case 'revenue_report':
        html = await revenueReportPdf(
          (params.period as string) || 'this_month',
          params.fromDate as string,
          params.toDate as string
        )
        break
      case 'inventory_report':
        html = await inventoryReportPdf()
        break
      default:
        return NextResponse.json({ error: `Unknown report type: ${reportType}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, html, reportType })
  } catch (error) {
    console.error('[PDF] Generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF generation failed' },
      { status: 500 }
    )
  }
}
