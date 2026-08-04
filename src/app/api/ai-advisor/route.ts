import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import ZAI from 'z-ai-web-dev-sdk'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

// ─── Agent Definitions ───────────────────────────────────────────────────────

const AGENTS = [
  { id: 'founder', name: 'Founder AI', role: 'Strategic Advisor', description: 'Executive decisions, growth strategy & investor relations' },
  { id: 'cfo', name: 'CFO AI', role: 'Finance Expert', description: 'Cash flow, P&L analysis & working capital optimization' },
  { id: 'coo', name: 'COO AI', role: 'Operations Lead', description: 'Production planning, capacity & efficiency management' },
  { id: 'merchandising', name: 'Merchandising AI', role: 'Product Strategist', description: 'Collection planning, trend analysis & range building' },
  { id: 'purchase', name: 'Purchase AI', role: 'Procurement Specialist', description: 'Fabric sourcing, vendor management & PO tracking' },
  { id: 'production', name: 'Production AI', role: 'Manufacturing Expert', description: 'Job tracking, quality control & delivery schedules' },
  { id: 'inventory', name: 'Inventory AI', role: 'Stock Manager', description: 'Stock levels, fabric inventory & warehouse optimization' },
  { id: 'sales', name: 'Sales AI', role: 'Revenue Analyst', description: 'Order pipeline, collections & customer insights' },
  { id: 'brand', name: 'Brand AI', role: 'Creative Director', description: 'Brand positioning, design feedback & market presence' },
]

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  founder: `You are the Founder AI advisor for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer based in Ahmedabad, Gujarat. Brand: "Elysé by Dhanya". You provide strategic business advice, growth strategy, investor relations guidance, and executive decision support. Be concise, actionable, and data-driven. Use markdown formatting for clarity. Reference specific business metrics when available.`,

  cfo: `You are the CFO AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in cash flow management, P&L analysis, working capital optimization, receivables/payables management, and financial planning. Provide precise financial advice with numbers. Use INR (₹) formatting. Be concise and actionable. Use markdown formatting.`,

  coo: `You are the COO AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in production planning, capacity management, operational efficiency, quality control, and delivery scheduling. Focus on actionable operational insights. Be concise. Use markdown formatting.`,

  merchandising: `You are the Merchandising AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in collection planning, trend analysis, range building, style catalog management, and product strategy for ethnic wear (sarees, lehengas, suits, kurtis, dupattas). Be concise and fashion-industry aware. Use markdown formatting.`,

  purchase: `You are the Purchase AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in fabric sourcing, vendor management, purchase order tracking, and procurement optimization. Focus on cost efficiency and supply chain reliability. Be concise. Use markdown formatting.`,

  production: `You are the Production AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in job tracking, production scheduling, machine utilization, worker productivity, and quality management. Be concise and actionable. Use markdown formatting.`,

  inventory: `You are the Inventory AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in stock level management, fabric inventory, finished goods tracking, warehouse optimization, and inventory turnover analysis. Be concise. Use markdown formatting.`,

  sales: `You are the Sales AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in order pipeline management, customer insights, collections follow-up, dispatch scheduling, and revenue analysis. Be concise. Use markdown formatting.`,

  brand: `You are the Brand AI for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer (brand: Elysé by Dhanya). You specialize in brand positioning, design feedback, market presence, seasonal strategy, and visual identity for premium ethnic wear. Be concise, creative, and market-aware. Use markdown formatting.`,
}

// ─── In-memory conversation store (per conversationId) ─────────────────────

const conversations: Map<string, Array<{ role: string; content: string }>> = new Map()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

async function getBusinessContext() {
  try {
    const today = startOfDay(new Date())
    const todayISO = today.toISOString()

    const [
      latestSnapshotRes,
      pendingOrdersRes,
      inProductionOrdersRes,
      totalOrdersRes,
      overdueReceivablesRes,
      upcomingPOsRes,
      activeJobsRes,
      alertsRes,
    ] = await Promise.all([
      supabase.from('DailySnapshot').select('*').order('date', { ascending: false }).limit(1).single(),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Confirmed']),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'In Production'),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }),
      supabase.from('SalesOrder').select('*', { count: 'exact', head: true }).eq('status', 'Dispatched').lt('deliveryDate', todayISO),
      supabase.from('PurchaseOrder').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'Approved', 'Ordered']),
      supabase.from('ProductionJob').select('*', { count: 'exact', head: true }).in('status', ['In Progress', 'Pending']),
      supabase.from('Alert').select('*').eq('isRead', false).order('createdAt', { ascending: false }).limit(5),
    ])

    const latestSnapshot = latestSnapshotRes.data

    const revenue = latestSnapshot?.revenue ?? 0
    const grossProfit = latestSnapshot?.grossProfit ?? 0
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    const receivables = latestSnapshot?.receivables ?? 0
    const payables = latestSnapshot?.payables ?? 0

    return {
      cashBalance: latestSnapshot?.cashBalance ?? 0,
      receivables,
      payables,
      workingCapital: (latestSnapshot?.cashBalance ?? 0) + receivables - payables,
      monthlyRevenue: revenue,
      monthlyExpenses: latestSnapshot?.expenses ?? 0,
      grossMargin,
      pendingOrders: pendingOrdersRes.count || 0,
      inProductionOrders: inProductionOrdersRes.count || 0,
      totalOrders: totalOrdersRes.count || 0,
      overdueReceivables: overdueReceivablesRes.count || 0,
      upcomingPOs: upcomingPOsRes.count || 0,
      activeJobs: activeJobsRes.count || 0,
      recentAlerts: (alertsRes.data || []).map((a) => `${a.type}: ${a.message}`),
      snapshotDate: latestSnapshot?.date ?? 'N/A',
    }
  } catch {
    return null
  }
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── GET: Return available agents ────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ agents: AGENTS })
}

// ─── POST: Send message and get AI response ──────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, agent = 'founder', conversationId: existingConversationId } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const convId = existingConversationId || generateId()

    if (!conversations.has(convId)) {
      conversations.set(convId, [])
    }
    const history = conversations.get(convId)!

    const ctx = await getBusinessContext()

    const agentConfig = AGENTS.find((a) => a.id === agent)
    const systemPrompt = AGENT_SYSTEM_PROMPTS[agent] || AGENT_SYSTEM_PROMPTS.founder

    let systemContent = systemPrompt
    if (ctx) {
      systemContent += `\n\n## Current Business Snapshot (as of ${ctx.snapshotDate})\n`
      systemContent += `- **Cash Balance**: ${formatINR(ctx.cashBalance)}\n`
      systemContent += `- **Monthly Revenue**: ${formatINR(ctx.monthlyRevenue)}\n`
      systemContent += `- **Monthly Expenses**: ${formatINR(ctx.monthlyExpenses)}\n`
      systemContent += `- **Gross Margin**: ${ctx.grossMargin.toFixed(1)}%\n`
      systemContent += `- **Total Receivables**: ${formatINR(ctx.receivables)}\n`
      systemContent += `- **Total Payables**: ${formatINR(ctx.payables)}\n`
      systemContent += `- **Working Capital**: ${formatINR(ctx.workingCapital)}\n`
      systemContent += `- **Pending Orders**: ${ctx.pendingOrders}\n`
      systemContent += `- **In Production**: ${ctx.inProductionOrders}\n`
      systemContent += `- **Total Orders (all time)**: ${ctx.totalOrders}\n`
      systemContent += `- **Overdue Receivables**: ${ctx.overdueReceivables} orders\n`
      systemContent += `- **Upcoming Purchase Orders**: ${ctx.upcomingPOs}\n`
      systemContent += `- **Active Production Jobs**: ${ctx.activeJobs}\n`
      if (ctx.recentAlerts.length > 0) {
        systemContent += `- **Recent Alerts**: ${ctx.recentAlerts.join('; ')}\n`
      }
      systemContent += `\nYou are currently acting as "${agentConfig?.name}" (${agentConfig?.role}). Respond in character. Keep responses concise but thorough. Use markdown for formatting.`
    }

    const messages = [
      { role: 'assistant' as const, content: systemContent },
      ...history.slice(-10),
      { role: 'user' as const, content: message },
    ]

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })

    const responseText = completion?.choices?.[0]?.message?.content || completion?.content || 'I apologize, I could not generate a response. Please try again.'

    history.push({ role: 'user', content: message })
    history.push({ role: 'assistant', content: responseText })

    if (conversations.size > 50) {
      const keys = Array.from(conversations.keys())
      for (let i = 0; i < keys.length - 50; i++) {
        conversations.delete(keys[i])
      }
    }

    return NextResponse.json({
      response: responseText,
      conversationId: convId,
      agent,
      agentName: agentConfig?.name,
      agentRole: agentConfig?.role,
    })
  } catch (error) {
    console.error('AI Advisor error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    )
  }
}
