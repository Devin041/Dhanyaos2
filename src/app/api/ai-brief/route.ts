import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { subDays, startOfDay } from 'date-fns'

const _hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

// ─── In-memory cache (10 minutes) ──────────────────────────────────────

let cachedBrief: string | null = null
let cacheTimestamp = 0
const CACHE_TTL = 10 * 60 * 1000

export async function GET() {
  try {
    if (!_hasSupabase) return NextResponse.json({ brief: 'Connect Supabase for AI-generated daily brief.', cached: false })
    if (cachedBrief && Date.now() - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json({ brief: cachedBrief, cached: true })
    }

    const [
      latestSnapshotRes,
      prevSnapshotsRes,
      pendingOrdersRes,
      inProductionRes,
      deliveredCountRes,
      totalOrdersRes,
      alertsRes,
      recentOrdersRes,
      topCustomersRes,
      activeJobsRes,
      fabricStockRes,
    ] = await Promise.all([
      supabase.from('DailySnapshot').select('*').order('date', { ascending: false }).limit(1).single(),
      supabase.from('DailySnapshot').select('*').order('date', { ascending: false }).limit(2),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Confirmed']),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'In Production'),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'Delivered'),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }),
      supabase.from('Alert').select('*').order('createdAt', { ascending: false }).limit(5),
      supabase.from('SalesOrder').select('*, customer:customerId(companyName)').order('createdAt', { ascending: false }).limit(5),
      supabase.from('SalesOrder').select('customerId, totalAmount, grossProfit'),
      supabase.from('ProductionJob').select('*').eq('status', 'In Progress').order('createdAt', { ascending: false }).limit(5),
      supabase.from('FabricStock').select('*').order('availableMeters', { ascending: true }).limit(3),
    ])

    const latestSnapshot = latestSnapshotRes.data
    const prevSnapshots = prevSnapshotsRes.data || []
    const prev = prevSnapshots.length > 1 ? prevSnapshots[1] : null
    const curr = latestSnapshot

    const revenueChange = prev && prev.revenue > 0
      ? Math.round(((curr?.revenue - prev.revenue) / prev.revenue) * 100)
      : 0

    // Group by customer for top customers
    const customerAggMap = new Map<string, { totalAmount: number; grossProfit: number; count: number }>()
    for (const o of (topCustomersRes.data || [])) {
      const existing = customerAggMap.get(o.customerId) || { totalAmount: 0, grossProfit: 0, count: 0 }
      existing.totalAmount += o.totalAmount || 0
      existing.grossProfit += o.grossProfit || 0
      existing.count++
      customerAggMap.set(o.customerId, existing)
    }
    const top6CustomerIds = Array.from(customerAggMap.entries())
      .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
      .slice(0, 3)

    const topCustDetails = await Promise.all(
      top6CustomerIds.map(async ([customerId, data]) => {
        const { data: c } = await supabase.from('Customer').select('companyName').eq('id', customerId).single()
        return {
          name: c?.companyName || 'Unknown',
          revenue: data.totalAmount,
          margin: data.totalAmount ? Math.round(((data.grossProfit) / data.totalAmount) * 100) : 0,
        }
      })
    )

    const userPrompt = `TODAY'S SNAPSHOT for Dhanya Lifestyle LLP (Elysé by Dhanya):

## Financials
- Cash Balance: ${formatINR(curr?.cashBalance ?? 0)}
- Today's Revenue: ${formatINR(curr?.revenue ?? 0)}
- Monthly Expenses: ${formatINR(curr?.expenses ?? 0)}
- Gross Profit: ${formatINR(curr?.grossProfit ?? 0)}
- Gross Margin: ${curr && curr.revenue > 0 ? ((curr.grossProfit / curr.revenue) * 100).toFixed(1) : 0}%
- Receivables: ${formatINR(curr?.receivables ?? 0)}
- Payables: ${formatINR(curr?.payables ?? 0)}
- Inventory Value: ${formatINR(curr?.inventoryValue ?? 0)}
- Revenue vs Last Period: ${revenueChange > 0 ? '+' : ''}${revenueChange}%

## Orders
- Pending: ${pendingOrdersRes.count || 0} | In Production: ${inProductionRes.count || 0} | Delivered: ${deliveredCountRes.count || 0}/${totalOrdersRes.count || 0}

## Active Production Jobs
${(activeJobsRes.data || []).map(j => `- ${j.jobNo}: ${j.styleName} (${j.completedQty}/${j.targetQty} pcs, ${j.stage})`).join('\n')}

## Recent Orders
${(recentOrdersRes.data || []).map(o => `- ${o.orderNo}: ${o.customer?.companyName || 'Unknown'}, ${formatINR(o.totalAmount)}, ${o.status}`).join('\n')}

## Top Customers
${topCustDetails.map(c => `- ${c.name}: ${formatINR(c.revenue)} (${c.margin}% margin)`).join('\n')}

## Low Stock Fabrics
${(fabricStockRes.data || []).map(f => `- ${f.fabricName}: ${f.availableMeters}m`).join('\n')}

## Alerts
${(alertsRes.data || []).map(a => `- [${a.severity}] ${a.title}: ${a.message}`).join('\n')}

Generate a concise daily founder brief in markdown with exactly 3 sections:
1. **Executive Summary** (2-3 sentences: overall health, key concern, top opportunity)
2. **Immediate Actions** (3-4 bullet points with specific next steps, prioritize by cash impact)
3. **Cash Flow Watch** (1-2 sentences about receivables/payables/cash position risk)

Be direct, founder-level, specific to numbers. No fluff. Max 200 words.`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are the Founder AI of Dhanya Lifestyle LLP, a women\'s ethnic wear manufacturer in Ahmedabad, Gujarat. You write concise, actionable daily briefs for the founder. Use markdown formatting. Be direct and specific with numbers.' },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    })

    const brief = completion?.choices?.[0]?.message?.content || ''

    if (brief) {
      cachedBrief = brief
      cacheTimestamp = Date.now()
    }

    return NextResponse.json({
      brief: brief || 'Brief generation failed. Please try again later.',
      generatedAt: new Date().toISOString(),
      snapshotDate: curr?.date ?? null,
    })
  } catch (error) {
    console.error('AI Brief error:', error)
    return NextResponse.json({ error: 'Failed to generate AI brief' }, { status: 500 })
  }
}
