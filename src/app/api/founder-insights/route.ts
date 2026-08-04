import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import ZAI from 'z-ai-web-dev-sdk'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

const _hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// ─── In-memory cache (5 minutes) ────────────────────────────────────────────

let cachedInsights: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ─── Fallback insights ──────────────────────────────────────────────────────

const FALLBACK_INSIGHTS = [
  'Cash collection from unpaid orders should be prioritized — follow up on top 3 customers by outstanding amount to improve working capital.',
  'Production capacity utilization below 70% indicates room to take on additional orders without expanding workforce.',
  'Gross margin trending above 35% is healthy for the ethnic wear segment — focus on maintaining this through fabric cost control.',
  'Consider negotiating longer payment terms with fabric suppliers (45-60 days) to better align cash outflows with customer collection cycles.',
  'Top 3 customers contribute over 50% of revenue — diversify the customer base to reduce concentration risk.',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

async function getBusinessSnapshot() {
  const today = startOfDay(new Date())
  const todayISO = today.toISOString()
  const todayEndISO = endOfDay(new Date()).toISOString()
  const thirtyDaysAgo = startOfDay(subDays(new Date(), 30))
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()
  const nowISO = new Date().toISOString()

  const [
    latestSnapshotRes,
    todayTxnsRes,
    pendingOrdersRes,
    inProductionOrdersRes,
    activeJobsRes,
    overdueJobsRes,
    unreadAlertsRes,
    outstandingPOsRes,
    pendingPaymentsRes,
  ] = await Promise.all([
    supabase.from('DailySnapshot').select('*').order('date', { ascending: false }).limit(1).single(),
    supabase.from('Transaction').select('*').gte('date', todayISO).lt('date', todayEndISO),
    supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Confirmed']),
    supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'In Production'),
    supabase.from('ProductionJob').select('*', { count: 'exact', head: true }).eq('status', 'In Progress'),
    supabase.from('ProductionJob').select('*', { count: 'exact', head: true }).eq('status', 'In Progress').lt('endDate', nowISO),
    supabase.from('Alert').select('*', { count: 'exact', head: true }).eq('isRead', false),
    supabase.from('PurchaseOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Approved', 'Ordered']),
    supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).in('paymentStatus', ['Unpaid', 'Partial']),
  ])

  const latestSnapshot = latestSnapshotRes.data
  const todayTxns = todayTxnsRes.data || []

  const todayRevenue = todayTxns.filter(t => t.type === 'Credit').reduce((s, t) => s + t.amount, 0)
  const todayExpenses = todayTxns.filter(t => t.type === 'Debit').reduce((s, t) => s + t.amount, 0)

  const { data: snapshots } = await supabase
    .from('DailySnapshot')
    .select('*')
    .gte('date', thirtyDaysAgoISO)
    .order('date', { ascending: true })

  const totalRevenue30d = (snapshots || []).reduce((s, d) => s + d.revenue, 0)
  const totalExpenses30d = (snapshots || []).reduce((s, d) => s + d.expenses, 0)
  const avgMargin = totalRevenue30d > 0
    ? Math.round(((totalRevenue30d - totalExpenses30d) / totalRevenue30d) * 100)
    : 0

  return {
    cashBalance: latestSnapshot?.cashBalance || 0,
    receivables: latestSnapshot?.receivables || 0,
    payables: latestSnapshot?.payables || 0,
    inventoryValue: latestSnapshot?.inventoryValue || 0,
    todayRevenue,
    todayExpenses,
    totalRevenue30d,
    totalExpenses30d,
    avgMargin,
    pendingOrders: pendingOrdersRes.count || 0,
    inProductionOrders: inProductionOrdersRes.count || 0,
    activeJobs: activeJobsRes.count || 0,
    overdueJobs: overdueJobsRes.count || 0,
    unreadAlerts: unreadAlertsRes.count || 0,
    outstandingPOs: outstandingPOsRes.count || 0,
    pendingPayments: pendingPaymentsRes.count || 0,
    workingCapital: (latestSnapshot?.cashBalance || 0) + (latestSnapshot?.receivables || 0) - (latestSnapshot?.payables || 0),
  }
}

async function generateInsights(data: ReturnType<typeof getBusinessSnapshot> extends Promise<infer T> ? T : never): Promise<string[]> {
  const zai = await ZAI.create()

  const prompt = `You are the Founder AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer in Ahmedabad, Gujarat. Brand: "Elysé by Dhanya". Think like a CEO/founder.

TODAY'S SNAPSHOT:
- Cash Balance: ${formatINR(data.cashBalance)}
- Receivables: ${formatINR(data.receivables)}
- Payables: ${formatINR(data.payables)}
- Working Capital: ${formatINR(data.workingCapital)}
- Inventory Value: ${formatINR(data.inventoryValue)}
- Today Revenue: ${formatINR(data.todayRevenue)}
- Today Expenses: ${formatINR(data.todayExpenses)}
- 30-Day Revenue: ${formatINR(data.totalRevenue30d)}
- 30-Day Expenses: ${formatINR(data.totalExpenses30d)}
- Average Margin: ${data.avgMargin}%
- Pending Orders: ${data.pendingOrders}
- Orders in Production: ${data.inProductionOrders}
- Active Production Jobs: ${data.activeJobs}
- Overdue Jobs: ${data.overdueJobs}
- Unread Alerts: ${data.unreadAlerts}
- Outstanding Purchase Orders: ${data.outstandingPOs}
- Orders with Pending Payments: ${data.pendingPayments}

Provide exactly 4-5 strategic insights. Each insight should:
1. Reference specific numbers from the data
2. Be actionable (what should the founder do?)
3. Focus on: cash flow, production efficiency, customer profitability, growth, or risk mitigation
4. Be 1-2 sentences max

Respond ONLY with a JSON array of strings. No markdown, no explanation. Example: ["insight 1", "insight 2", "insight 3"]`

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: 'You are a strategic business advisor AI. Respond only with JSON arrays of insight strings.' },
      { role: 'user', content: prompt },
    ],
    thinking: { type: 'disabled' },
  })

  const response = completion.choices[0]?.message?.content || ''

  try {
    const match = response.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 5).map(String)
      }
    }
  } catch {
    // Fallback below
  }

  return FALLBACK_INSIGHTS
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET() {
  try {
    if (!_hasSupabase) {
      return NextResponse.json({ insights: FALLBACK_INSIGHTS, cached: false })
    }
    if (cachedInsights && Date.now() - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json({ insights: cachedInsights, cached: true })
    }

    const data = await getBusinessSnapshot()
    const insights = await generateInsights(data)

    cachedInsights = insights
    cacheTimestamp = Date.now()

    return NextResponse.json({ insights, cached: false })
  } catch (error) {
    console.error('Founder Insights error:', error)
    return NextResponse.json({
      insights: FALLBACK_INSIGHTS,
      cached: false,
      fallback: true,
    })
  }
}
