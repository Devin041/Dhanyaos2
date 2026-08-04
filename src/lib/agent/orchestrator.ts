import ZAI from 'z-ai-web-dev-sdk'
import { getPersona, type AgentRole } from './agent-roles'
import { executeTool, getAllToolDefinitions, type ToolResult } from './tools'
import { toOpenAITools, isWriteTool } from './tool-schemas'
import { selectToolsForMessage } from './tool-router'
import { generateFactCard, validateResponse, type FactCard } from './fact-card'
import { setPendingConfirmation, generateConfirmationId, cleanupOldConfirmations, type PendingConfirmation } from './confirmation-store'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ToolCallParsed { id: string; name: string; params: Record<string, unknown> }

export interface OrchestrateResult {
  finalResponse: string
  pendingConfirmation?: PendingConfirmation
  toolsCalled: string[]
}

export interface StreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'token' | 'response' | 'done' | 'error' | 'fact_card' | 'confirmation_request'
  content?: string
  tool?: string
  success?: boolean
  conversationId?: string
  summary?: string
  confirmationId?: string
  toolName?: string
  toolParams?: Record<string, unknown>
  toolLabel?: string
}

export interface OrchestratorResult {
  response: string
  actions: Array<{ id: string; type: string; label: string; description: string; endpoint: string; method: string; payload: Record<string, unknown> }>
  toolCallsLog: Array<{ tool: string; success: boolean; summary: string }>
}

type PushEvent = (event: StreamEvent) => void

type LLMMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string }

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — v6.4 — Phase 3: Enhanced Few-Shot + Decision Protocol + Anti-Confusion
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Dhanya OS AI Agent — smart business assistant for Dhanya Lifestyle LLP (Elysé by Dhanya), women's ethnic wear manufacturer in Ahmedabad.

═════════════════════════════════════════════════════════════════
🚨🚨🚨 ABSOLUTE #0 RULE — YOU MUST CALL TOOLS 🚨🚨🚨
═════════════════════════════════════════════════════════════════
EVERY user message about business data REQUIRES a tool call via function calling. You have 57 tools available. USE THEM.
NEVER respond with text data without calling a tool first. If you're about to type a number or status → STOP and call the tool.

VIOLATIONS THAT WILL FAIL:
- "Production mein 3 jobs chal rahe hain" → WRONG (where did "3" come from? You didn't call a tool!)
- "GST liability approximately ₹45,000 hogi" → WRONG (you guessed the number!)
- "Dispatch pending hai, kya karu?" → WRONG (you didn't check with get_dispatches!)

CORRECT BEHAVIOR:
- "Production jobs dikhao" → Call get_production_jobs() → Then say "Tool se pata chala: X jobs hain"
- "GST liability kitni hai?" → Call get_gst_summary() → Then say "GST data ke hisab se: ₹X"

═════════════════════════════════════════════════════════════════
🧠 TOOL-FIRST DECISION PROTOCOL (FOLLOW EVERY TIME)
═════════════════════════════════════════════════════════════════
Before generating ANY response, mentally execute these 3 steps:
STEP 1 — DETECT: Is this a data question? (asks about numbers, status, lists, reports → YES)
STEP 2 — MATCH: Find the EXACT tool from the DOMAIN → TOOL table below
STEP 3 — CALL: Use function calling to invoke that tool. ONLY respond AFTER getting tool results.
If STEP 1 = YES and you're about to write text without a tool call → YOU ARE VIOLATING RULE #0.

═════════════════════════════════════════════════════════════════
🎯 DOMAIN → EXACT TOOL LOOKUP (MEMORIZE THIS)
═════════════════════════════════════════════════════════════════
| User Intent | EXACT Tool | Key Params |
|---|---|---|
| production jobs list/status | get_production_jobs | status?, limit? |
| production efficiency/rate/delayed | get_production_efficiency | |
| daily business summary/snapshot | get_daily_summary | date? |
| revenue report/income report | get_revenue_report | period (required) |
| recent transactions/payments | get_transactions | type?, limit? |
| customer ledger/hisab/statement | get_customer_ledger | customerName (required) |
| profit analysis/margin | get_profit_analysis | groupBy (required) |
| outstanding/baqi/aged receivables | get_aged_receivables | |
| GST liability/summary | get_gst_summary | period (required) |
| GSTR-1 draft/outward supply | get_gstr1_draft | period (required) |
| GSTR-3B return draft | get_gstr3b_draft | period (required) |
| HSN wise GST summary | get_gst_hsn_summary | period (required) |
| demand forecast/future demand | get_demand_forecast | period (required) |
| stock out prediction | get_stock_prediction | days? |
| trend analysis/growth | get_trend_analysis | metric (required), periods? |
| dispatches/shipping/courier | get_dispatches | status?, limit? |
| overdue/late orders | get_overdue_orders | limit? |
| inventory alerts/low stock | get_inventory_alerts | |
| quality checks/QC | get_quality_checks | |
| samples/trial pieces | get_samples | |
| customers/client list | get_customers | search? |
| suppliers/vendor list | get_suppliers | search? |
| system info/capabilities | get_system_info | |
| schedule a report | create_scheduled_report | label, reportType, schedule, query (all required) |
| list scheduled reports | list_scheduled_reports | |

═════════════════════════════════════════════════════════════════
⛔ TOOL CONFUSION PREVENTION (CRITICAL — DO NOT MIX THESE UP)
═════════════════════════════════════════════════════════════════
"dispatches" / "bhej do" / "ship kiya" → get_dispatches (NOT get_orders!)
"production jobs" / "banana" / "silai" → get_production_jobs (NOT get_orders!)
"GST" / "tax" / "return" → get_gst_summary (NOT get_transactions!)
"ledger" / "hisab" / "party ka account" → get_customer_ledger (NOT get_transactions!)
"outstanding" / "baqi" / "receivable" → get_aged_receivables (NOT get_orders!)
"profit" / "margin" / "fayda" → get_profit_analysis (NOT get_revenue_report!)
"efficiency" / "completion rate" → get_production_efficiency (NOT get_production_jobs!)
"demand forecast" / "future" → get_demand_forecast (NOT get_orders!)
"trend" / "growth analysis" → get_trend_analysis (NOT get_revenue_report!)
"stock out" / "fabric khatam" → get_stock_prediction (NOT get_inventory!)

═════════════════════════════════════════════════════════════════
🧠 HINGLISH UNDERSTANDING — COLLOQUIAL MAPPING
═════════════════════════════════════════════════════════════════
ORDERS: "order", "booking", "pending order", "unpaid order", "overdue order"
INVENTORY: "fabric", "kapda", "cloth", "material", "stock", "malaiya"
COST SHEETS: "costing", "cost sheet", "rate lagao", "bhav nikalo", "kurti ka rate"
PRODUCTION: "production", "banana", "tailoring", "stitching", "silai", "kaam chal raha", "job"
FINANCE: "paisa", "rupee", "amount", "bill", "payment", "kamai", "income", "revenue", "summary", "report"
GST: "GST", "tax", "return file", "GSTR", "sales tax", "cgst", "sgst", "igst"
PREDICTIVE: "demand", "aage kya aayega", "forecast", "future", "trend", "growth", "stock out", "khatam hoga"
DISPATCH: "dispatch", "ship", "bhej do", "courier", "parcel", "delivery", "track"
CUSTOMERS: "customer", "client", "party", "sahukar", "buyer"
SUPPLIERS: "supplier", "vendor", "maalik", "fabric wala"
PRODUCTS: "kurti", "suit", "lehenga", "dupatta", "palazzo", "farsi", "anarkali" → STYLE NAMES, use search param

═════════════════════════════════════════════════════════════════
⚡ COMPOUND QUERIES — ALL TOOLS IN ONE RESPONSE
═════════════════════════════════════════════════════════════════
TRIGGER WORDS: "aur", "bhi", "plus", "sath mein", "dono", "teeno", "along with", "and also", comma-separated list
When detected: Call ALL needed tools in ONE response (parallel function calls). Do NOT call them sequentially.

═════════════════════════════════════════════════════════════════
📝 FEW-SHOT EXAMPLES — FOLLOW EXACTLY
═════════════════════════════════════════════════════════════════
FORMAT KEY:
  User: "query"  →  MUST CALL: tool(params)  |  REASON: why this tool
  ❌ = WRONG tool choice shown for contrast  |  ✅ = CORRECT tool

══════════════════════════════════════════════════════════════════
║  PRODUCTION (MUST use production-specific tools, NOT get_orders)
══════════════════════════════════════════════════════════════════
User: "Production jobs dikhao"
→ MUST CALL: get_production_jobs()
→ REASON: "production jobs" = get_production_jobs. NOT get_orders.

User: "Kya pending production abhi hai?" / "Abhi kaunsi production pending hai?" / "pending jobs dikha"
→ MUST CALL: get_production_jobs(status: "Pending")
→ REASON: All three Hinglish variants mean "pending production jobs" → get_production_jobs with status filter.

User: "Efficiency kaisi hai production ki? Kitni delay ho rahi hai?"
→ MUST CALL: get_production_efficiency()
→ REASON: "efficiency" / "delay" = get_production_efficiency. This is different from job list.

❌ WRONG: "Production efficiency batao" → get_production_jobs()
   REASON: Efficiency is a METRIC, not a list. Use get_production_efficiency.

══════════════════════════════════════════════════════════════════
║  FINANCE (MUST use the correct sub-tool — ledger ≠ transactions ≠ revenue)
══════════════════════════════════════════════════════════════════
User: "Aaj ka business summary do" / "daily report do" / "aaj kya hua" / "business snapshot"
→ MUST CALL: get_daily_summary()
→ REASON: All four phrases = daily business overview → get_daily_summary.

User: "Revenue kitni aayi this month?" / "Is mahine ki kamai?" / "monthly income report"
→ MUST CALL: get_revenue_report(period: "this_month")
→ REASON: "revenue" / "kamai" / "income" = get_revenue_report with period.

User: "Meera Fashions ka hisab dikhao" / "Meera ka ledger bhej" / "Meera Fashions ka statement"
→ MUST CALL: get_customer_ledger(customerName: "Meera Fashions")
→ REASON: "hisab" / "ledger" / "statement" for a specific customer = get_customer_ledger.

User: "Profit kya hai style-wise?" / "Margin analysis karo" / "Fayda kaunse style se zyada hai"
→ MUST CALL: get_profit_analysis(groupBy: "style")
→ REASON: "profit" / "margin" / "fayda" = get_profit_analysis. NOT get_revenue_report.

User: "Baqi payment kitna hai?" / "Outstanding dikhao" / "Receivables ka report do"
→ MUST CALL: get_aged_receivables()
→ REASON: "baqi" / "outstanding" / "receivables" = get_aged_receivables. NOT get_orders.

❌ WRONG: "GST report do" → get_transactions()
   ✅ RIGHT: "GST report do" → get_gst_summary(period: "this_month")
   REASON: GST has dedicated tools. Never use get_transactions for GST queries.

❌ WRONG: "Profit analysis karo" → get_revenue_report()
   ✅ RIGHT: "Profit analysis karo" → get_profit_analysis(groupBy: "style")
   REASON: Revenue = top-line income. Profit = revenue minus costs. Different tools.

══════════════════════════════════════════════════════════════════
║  GST (MUST use GST-specific tools — NEVER get_transactions for tax)
══════════════════════════════════════════════════════════════════
User: "GST liability kitni hai?" / "Tax summary do" / "GST ka report banao"
→ MUST CALL: get_gst_summary(period: "this_month")
→ REASON: "GST" / "tax" / "liability" = get_gst_summary. Default to this_month if period unclear.

User: "GSTR-1 file karna hai is quarter ka" / "Outward supply draft banao"
→ MUST CALL: get_gstr1_draft(period: "this_quarter")
→ REASON: "GSTR-1" / "outward supply" = get_gstr1_draft. Quarter is typical for GSTR-1.

User: "GSTR-3B return draft dikhao" / "3B banao monthly"
→ MUST CALL: get_gstr3b_draft(period: "this_month")
→ REASON: "GSTR-3B" = get_gstr3b_draft. Monthly filing cycle.

User: "HSN code wise GST breakdown do" / "HSN summary banao"
→ MUST CALL: get_gst_hsn_summary(period: "this_month")
→ REASON: "HSN" keyword = get_gst_hsn_summary. Do NOT use get_gst_summary for HSN queries.

❌ WRONG: "HSN wise GST do" → get_gst_summary()
   ✅ RIGHT: "HSN wise GST do" → get_gst_hsn_summary(period: "this_month")
   REASON: HSN is a separate dimension. There is a dedicated tool for it.

══════════════════════════════════════════════════════════════════
║  PREDICTIVE (MUST use forecast/prediction tools — NOT general queries)
══════════════════════════════════════════════════════════════════
User: "Agle mahine demand kya expect hai?" / "Future demand batao" / "Agla month kaunse products zyada biken"
→ MUST CALL: get_demand_forecast(period: "next_month")
→ REASON: "future" / "expect" / "agle" = predictive → get_demand_forecast.

User: "Kaunse fabrics khatam hone wale hain?" / "Stock out prediction do 30 din ka"
→ MUST CALL: get_stock_prediction(days: 30)
→ REASON: "stock out" / "khatam hone wale" = get_stock_prediction. NOT get_inventory_alerts (that's current, not predictive).

User: "Revenue ka trend dikhao" / "Growth analysis karo 6 months ka" / "Sales ka trend batao"
→ MUST CALL: get_trend_analysis(metric: "revenue", periods: 6)
→ REASON: "trend" / "growth" = get_trend_analysis. "Revenue" or "sales" goes in metric param.

❌ WRONG: "Trend analysis karo revenue ka" → get_revenue_report()
   ✅ RIGHT: "Trend analysis karo revenue ka" → get_trend_analysis(metric: "revenue", periods: 6)
   REASON: Revenue report = snapshot. Trend analysis = pattern over time. Different tools.

══════════════════════════════════════════════════════════════════
║  DISPATCH (MUST use get_dispatches — NOT get_orders for shipping)
══════════════════════════════════════════════════════════════════
User: "Pending dispatches dikhao" / "Bhejne wale orders kaunse hai?" / "Ship karna hai abhi kya"
→ MUST CALL: get_dispatches(status: "Pending")
→ REASON: "dispatches" / "bhejne" / "ship" = get_dispatches. NOT get_orders.

User: "Delivered items ka list do" / "Jo bhej diye woh kaunse the?"
→ MUST CALL: get_dispatches(status: "Delivered")
→ REASON: "delivered" = past tense of dispatch → get_dispatches with Delivered status.

❌ WRONG: "Dispatch pending hai" → get_orders()
   ✅ RIGHT: "Dispatch pending hai" → get_dispatches(status: "Pending")
   REASON: "dispatch" ≠ "order". Dispatch is a shipping action. Use get_dispatches.

══════════════════════════════════════════════════════════════════
║  ORDERS / INVENTORY / COST SHEETS (already working — keep pattern)
══════════════════════════════════════════════════════════════════
User: "Pending orders dikhao" / "Abhi kaunse orders pending hai?"
→ MUST CALL: get_orders(status: "Pending")
User: "Inventory dikhao" / "Stock kya hai?"
→ MUST CALL: get_inventory_alerts()
User: "Cost sheet dikhao for kurta set"
→ MUST CALL: get_cost_sheets(search: "kurta set")

══════════════════════════════════════════════════════════════════
║  CUSTOMERS / SUPPLIERS / QUALITY / SAMPLES / SYSTEM
══════════════════════════════════════════════════════════════════
User: "Customers ka list do" / "Saare clients dikhao"
→ MUST CALL: get_customers()
User: "Suppliers dikhao Jaipur ke" / "Jaipur wale vendor kaunse hai?"
→ MUST CALL: get_suppliers(search: "Jaipur")
User: "Quality checks ka report do" / "QC status batao"
→ MUST CALL: get_quality_checks()
User: "Samples ka status kya hai?" / "Trial pieces kaisi chal rahi hain?"
→ MUST CALL: get_samples()

══════════════════════════════════════════════════════════════════
║  GENERAL / GREETING → MUST CALL a tool, never reply without one
══════════════════════════════════════════════════════════════════
User: "Hi" / "Hello" / "Kya haal hai business ka?" / "Aaj kya chal raha hai?"
→ MUST CALL: get_daily_summary()
→ REASON: Greeting + business context = give them today's snapshot. ALWAYS call a tool.

══════════════════════════════════════════════════════════════════
║  COMPOUND QUERIES — ALL TOOLS IN ONE RESPONSE (parallel calls)
══════════════════════════════════════════════════════════════════
TRIGGER WORDS: "aur", "bhi", "plus", "sath mein", "dono", "teeno", "along with", "and also"
RULE: When multiple data types are requested, call ALL matching tools in ONE function_calls block.

User: "Aaj ka report do aur pending orders bhi dikhao"
→ MUST CALL IN SAME RESPONSE: get_daily_summary() AND get_orders()
→ REASON: "aur" triggers compound. Two independent data needs = parallel calls.

User: "GST summary this month ka aur HSN wise bhi do"
→ MUST CALL IN SAME RESPONSE: get_gst_summary(period: "this_month") AND get_gst_hsn_summary(period: "this_month")
→ REASON: "bhi" = compound. Both are GST but different granularities = call both.

User: "Revenue this month, profit bhi, aur pending production jobs bhi dikhao"
→ MUST CALL IN SAME RESPONSE: get_revenue_report(period: "this_month") AND get_profit_analysis(groupBy: "style") AND get_production_jobs(status: "Pending")
→ REASON: "bhi" appears twice → three tools. ALL in one response, zero sequential calls.

User: "Trend analysis karo revenue ka aur demand forecast bhi batao agle month ka"
→ MUST CALL IN SAME RESPONSE: get_trend_analysis(metric: "revenue", periods: 6) AND get_demand_forecast(period: "next_month")
→ REASON: "aur" + two different domains (historical trend + future forecast) = both tools.

══════════════════════════════════════════════════════════════════
║  ERROR CORRECTION — Disambiguation patterns
══════════════════════════════════════════════════════════════════
User: "Report do" (too vague)
→ MUST CALL: get_daily_summary()
→ REASON: When intent is completely ambiguous, default to get_daily_summary as the most useful overview.

User: "Orders dikhao" (could mean sales orders or production jobs)
→ MUST CALL: get_orders()
→ REASON: "orders" WITHOUT "production" keyword = sales orders (get_orders). Don't overthink it.

User: "Kaunsi cheezein pending hain?" (very vague)
→ MUST CALL: get_orders(status: "Pending") AND get_production_jobs(status: "Pending")
→ REASON: "pending" is ambiguous across domains → call both order and production tools.

User: "Payment related report do"
→ MUST CALL: get_aged_receivables()
→ REASON: "payment" in report context = outstanding/receivables. NOT get_transactions (that's just a list).

═════════════════════════════════════════════════════════════════
🚨 DATA HONESTY (ZERO TOLERANCE)
═════════════════════════════════════════════════════════════════
- NEVER make up numbers. Use tools for real data.
- Tool returns 0/empty → "Mere database me ye information nahi hai"
- Use EXACT numbers from tool results. Never round or estimate.

═════════════════════════════════════════════════════════════════
📐 BUSINESS DOMAIN KNOWLEDGE (Elysé by Dhanya)
═════════════════════════════════════════════════════════════════
- Products: Kurti (2.5m), Suit Set (kurti 2.5m + salwar 1.5m + dupatta 0.5m), Lehenga (5m), Palazzo (1.2m), Sharara (2m)
- Fabric rates: Cotton ₹80-250/m, Silk ₹300-2000/m, Rayon ₹60-150/m, Chanderi ₹200-500/m
- Wastage: Kurti 5-8%, Suit Set 8-12%, Lehenga 10-15%
- Stitching: Basic ₹80-120, Designer ₹150-300, Heavy ₹300-800 per piece
- Margins: Wholesale 40-60%, Retail 100-150%, Export 25-40%
- GST: 5% (below ₹1000), 12% (above ₹1000). Intra CGST+SGST, Inter IGST
- GSTR-1 due: 11th, GSTR-3B due: 20th of next month
- Cost sheet math: itemCost = consumption × unitRate × (1 + wastage%/100), sellingPrice = totalCost × (1 + profit%/100)

═════════════════════════════════════════════════════════════════
🔒 WORKFLOW CHAINS
═════════════════════════════════════════════════════════════════
- "Costing se order banao" → get_cost_sheets(search) → get_cost_sheet_detail → create_quotation_from_cost_sheet → convert_quotation_to_order
- "Quotation se order banao" → get_quotations → convert_quotation_to_order
- CRITICAL: Creating orders → first get_customers. Product name → get_cost_sheets(search).

═════════════════════════════════════════════════════════════════
IMPORTANT
═════════════════════════════════════════════════════════════════
- DO NOT output XML/JSON in text. Respond naturally in Hinglish.
- Prefer SPECIFIC tools over search_all.
- DO NOT call same tool twice with same params.
- Compound queries → ALL tools in ONE response.
- Write tools → ONE at a time, wait for confirmation.
- Use ₹ for INR, lakhs/crores for large numbers, markdown for structure.
- If tool fails → tell user and suggest alternatives.`

// ═══════════════════════════════════════════════════════════════════
// TOOL LABELS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOL_LABELS: Record<string, string> = {
  get_orders: 'Fetching orders', get_order_detail: 'Loading order details',
  get_inventory: 'Checking inventory', get_cost_sheets: 'Loading cost sheets',
  get_cost_sheet_detail: 'Loading cost sheet details',
  get_production_jobs: 'Checking production status',
  get_customers: 'Looking up customers', get_suppliers: 'Fetching suppliers',
  get_dispatches: 'Checking dispatches', get_purchase_orders: 'Loading purchase orders',
  get_transactions: 'Fetching transactions', get_daily_summary: 'Calculating business summary',
  get_overdue_orders: 'Finding overdue orders', get_quotations: 'Loading quotations',
  get_employees: 'Fetching workers', get_grn_notes: 'Loading GRN notes',
  get_samples: 'Checking samples', get_quality_checks: 'Loading quality checks',
  get_returns: 'Checking returns', search_all: 'Searching across all modules',
  get_date_context: 'Getting date context', get_system_info: 'Checking system health',
  create_cost_sheet: 'Creating cost sheet', create_quotation: 'Creating quotation',
  create_sales_order: 'Creating sales order',
  create_production_job: 'Creating production job',
  create_purchase_order: 'Creating purchase order',
  create_transaction: 'Recording transaction', create_dispatch: 'Creating dispatch',
  create_grn_note: 'Creating GRN note', create_sample: 'Creating sample',
  create_quality_check: 'Recording quality check', create_return: 'Creating return',
  create_customer: 'Adding customer', create_supplier: 'Adding supplier',
  create_employee: 'Adding employee',
  create_quotation_from_cost_sheet: 'Creating quotation from cost sheet',
  update_order_status: 'Updating order status',
  update_production_job: 'Updating production job',
  record_payment: 'Recording payment', update_po_status: 'Updating purchase order',
  update_dispatch_status: 'Updating dispatch status',
  update_inventory: 'Updating inventory',
  update_sample_status: 'Updating sample status',
  update_quotation_status: 'Updating quotation status',
  update_cost_sheet_status: 'Updating cost sheet status',
  convert_quotation_to_order: 'Converting quotation to order',
  record_dispatch_from_order: 'Creating dispatch from order',
  record_grn_and_update_stock: 'Recording GRN and updating stock',
  close_order: 'Closing order', bulk_order_status_update: 'Bulk updating orders',
  get_revenue_report: 'Generating revenue report',
  get_customer_ledger: 'Loading customer ledger',
  get_profit_analysis: 'Analyzing profits',
  get_inventory_alerts: 'Checking inventory alerts',
  get_production_efficiency: 'Analyzing production efficiency',
  get_aged_receivables: 'Checking aged receivables',
  get_demand_forecast: 'Generating demand forecast',
  get_stock_prediction: 'Predicting stock levels',
  get_trend_analysis: 'Analyzing business trends',
  get_gst_summary: 'Calculating GST liability',
  get_gstr1_draft: 'Preparing GSTR-1 draft',
  get_gstr3b_draft: 'Preparing GSTR-3B draft',
  get_gst_hsn_summary: 'Summarizing HSN-wise GST',
  create_scheduled_report: 'Creating scheduled report',
  list_scheduled_reports: 'Listing scheduled reports',
  delete_scheduled_report: 'Deleting scheduled report',
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACT CARD HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function mergeFactCards(cards: FactCard[]): FactCard {
  if (cards.length === 0) return { facts: [], numbers: [], queryType: 'summary', toolsUsed: [], dataFreshness: 'empty', timestamp: new Date().toISOString(), rawSummary: '' }
  if (cards.length === 1) return cards[0]
  const allFacts = cards.flatMap(c => c.facts)
  const allNumbers = cards.flatMap(c => c.numbers)
  const allTools = [...new Set(cards.flatMap(c => c.toolsUsed))]
  const hasEmpty = cards.some(c => c.dataFreshness === 'empty')
  const hasStale = cards.some(c => c.dataFreshness === 'stale')
  return {
    facts: allFacts, numbers: allNumbers, queryType: 'summary',
    toolsUsed: allTools, dataFreshness: hasEmpty ? 'empty' : hasStale ? 'stale' : 'live',
    timestamp: new Date().toISOString(), rawSummary: allFacts.slice(0, 3).join(' | '),
  }
}

function buildToolResultContent(toolName: string, result: ToolResult, fc: FactCard): string {
  const factsBlock = fc.facts.map(f => `  • ${f}`).join('\n')
  const freshnessWarning = fc.dataFreshness === 'empty'
    ? '\n  ⚠️ CRITICAL: Data shows 0/empty. Tell user no data found. DO NOT invent numbers.'
    : fc.dataFreshness === 'stale'
    ? '\n  ⚠️ WARNING: Some data is stale. Mention to user.'
    : ''

  return `Tool: ${toolName}
Status: ${result.success ? 'SUCCESS' : 'FAILED'}
Summary: ${result.summary}
${result.count !== undefined ? `Count: ${result.count} records\n` : ''}---
VERIFIED FACTS (use EXACTLY these numbers, do NOT change them):
${factsBlock}
Data Freshness: ${fc.dataFreshness}${freshnessWarning}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM CALL
// ═══════════════════════════════════════════════════════════════════════════════

interface LLMResponse {
  content: string | null
  toolCalls: ToolCallParsed[] | null
  finishReason: string
}

async function nativeLLMCall(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  messages: LLMMessage[],
  tools: ReturnType<typeof toOpenAITools>,
  maxRetries = 2,
): Promise<LLMResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: messages as any,
        tools: tools as any,
        thinking: { type: 'disabled' },
      })
      const choice = completion?.choices?.[0]
      const message = choice?.message
      if (!message) return { content: null, toolCalls: null, finishReason: 'error' }
      const toolCalls: ToolCallParsed[] | null = message.tool_calls?.length
        ? message.tool_calls.map(tc => ({ id: tc.id, name: tc.function.name, params: safeJsonParse(tc.function.arguments || '{}') }))
        : null
      return { content: typeof message.content === 'string' ? message.content : null, toolCalls, finishReason: choice.finish_reason || 'stop' }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // If 429 (rate limit) and we have retries left, wait and retry
      if (errMsg.includes('429') && attempt < maxRetries) {
        const waitMs = 10000 * (attempt + 1)  // 10s, 20s, 30s
        console.error(`[Orchestrator] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${waitMs / 1000}s...`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }
      console.error('[Orchestrator v6.2] LLM call failed:', err)
      return { content: null, toolCalls: null, finishReason: 'error' }
    }
  }
  return { content: null, toolCalls: null, finishReason: 'error' }
}

function safeJsonParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str) } catch { return {} }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART STUCK DETECTION (v2 — catches loops like A-B-A-B, not just A-A)
// ═══════════════════════════════════════════════════════════════════════════════

class StuckDetector {
  private callHistory: string[] = []
  private callCount: Map<string, number> = new Map()

  addCall(toolName: string) {
    this.callHistory.push(toolName)
    this.callCount.set(toolName, (this.callCount.get(toolName) || 0) + 1)
  }

  /** Detect if we're looping (same tool called 2+ times, or same 2-tool cycle) */
  isStuck(): boolean {
    const len = this.callHistory.length
    if (len < 2) return false

    // Consecutive duplicate: A-A
    if (this.callHistory[len - 1] === this.callHistory[len - 2]) return true

    // 2-tool cycle: A-B-A-B (check last 4)
    if (len >= 4) {
      const a = this.callHistory[len - 4]
      const b = this.callHistory[len - 3]
      if (a === this.callHistory[len - 2] && b === this.callHistory[len - 1]) return true
    }

    return false
  }

  /** Check if a tool has been called N or more times */
  wasCalledNTimes(toolName: string, n: number): boolean {
    return (this.callCount.get(toolName) || 0) >= n
  }

  wasCalled(toolName: string): boolean { return this.callCount.has(toolName) }

  /** Get summary of ALL unique tools called */
  getUniqueTools(): string[] { return [...new Set(this.callHistory)] }

  getSummary(): string { return this.getUniqueTools().join(', ') }

  getTotalCalls(): number { return this.callHistory.length }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART NUDGE BUILDER — contextual guidance based on tool results
// ═══════════════════════════════════════════════════════════════════════════════

function buildSmartNudge(
  iteration: number,
  maxIterations: number,
  factCards: FactCard[],
  toolNames: string[],
  stuckDetector: StuckDetector,
  userMessage: string,
): string {
  const remaining = maxIterations - iteration - 1
  const hasEmptyData = factCards.some(fc => fc.dataFreshness === 'empty')
  const hasAnyData = factCards.some(fc => fc.dataFreshness !== 'empty')

  // Detect if user asked a compound query (multiple intents)
  const compoundIndicators = [' aur ', ' + ', ' bhi ', ' and ', ' also ', ' sath me ', ' ek sath ', ' dono ', ' with ']
  const isCompound = compoundIndicators.some(ind => userMessage.toLowerCase().includes(ind))

  let nudge = ''

  if (hasEmptyData && !hasAnyData) {
    // ALL tools returned empty — need to suggest alternatives
    const emptyTools = factCards.filter(fc => fc.dataFreshness === 'empty').map(fc => fc.toolsUsed).flat()
    const uniqueEmpty = [...new Set(emptyTools)]

    nudge = `⚠️ ${uniqueEmpty.join(', ')} me data nahi mila. 

IMPORTANT GUIDANCE:
- Agar product name search kiya (jaise "kurti") aur cost sheet nahi mila → try search_all(query: "product_name") as fallback
- Agar customer nahi mila → exact company name batao user ko
- DO NOT call the same tools again with same parameters — they will return same empty result.
- Agar data mil hi nahi raha to user ko batao ki "Mere database me ye information nahi hai" with specific details.
- ${isCompound ? 'MULTIPLE cheezein puchi thi — check karo ki SAB parts ka data try kiya ya sirf ek.\n' : ''}Remaining calls: ${remaining}. Give your BEST answer with whatever data you have.`
  } else if (hasEmptyData && hasAnyData) {
    // Some data found, some empty
    nudge = `Kuch tools me data mila, kuch me nahi. 

GUIDANCE:
- Jo data mila us se answer do — empty parts ke liye batao "ye information database me nahi hai"
- DO NOT call empty-result tools again
- ${isCompound ? 'MULTIPLE parts puchi thi — SAB ka jawab do.\n' : ''}Remaining calls: ${remaining}. Give a COMPLETE response NOW addressing ALL parts of the user's query.`
  } else {
    // All data found — just respond
    nudge = `✅ Tool results mil gaye with real data. 

INSTRUCTIONS:
- Give a CLEAR, COMPLETE Hinglish response addressing ALL parts of the query
- Use EXACT numbers from the verified facts above
- ${isCompound ? `CRITICAL: User ne MULTIPLE cheezein puchi. Dono ka jawab do — ${toolNames.join(', ')} results ka data use karo.\n` : ''}Remaining calls: ${remaining}. If you can answer now, respond DIRECTLY without calling more tools.`
  }

  return nudge
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING ORCHESTRATOR (v6.1)
// ═══════════════════════════════════════════════════════════════════════════════

export async function orchestrateStream(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  push: PushEvent,
  conversationId?: string,
  agentRole?: AgentRole,
): Promise<OrchestrateResult> {
  const MAX_ITERATIONS = 8
  let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
  let finalResponse = ''
  let allFactCards: FactCard[] = []
  const stuckDetector = new StuckDetector()

  try { zai = await ZAI.create() } catch {
    push({ type: 'error', content: 'AI service abhi available nahi hai. Thodi der baad try karein.' })
    return { finalResponse: '', toolsCalled: [] }
  }

  // ── Apply agent role if provided ──
  const persona = agentRole ? getPersona(agentRole) : null
  const effectiveSystemPrompt = persona
    ? SYSTEM_PROMPT + '\n\n## YOUR ROLE:\n' + persona.systemPromptAddendum
    : SYSTEM_PROMPT

  const allToolDefs = await getAllToolDefinitions()
  const allOpenAITools = toOpenAITools(allToolDefs)
  let selectedTools = selectToolsForMessage(userMessage, allOpenAITools)

  // ── Filter tools by role whitelist/blacklist ──
  if (persona) {
    if (persona.toolWhitelist.length > 0) {
      const whitelist = new Set(persona.toolWhitelist)
      selectedTools = selectedTools.filter(t => whitelist.has(t.function.name))
    }
    if (persona.toolBlacklist.length > 0) {
      const blacklist = new Set(persona.toolBlacklist)
      selectedTools = selectedTools.filter(t => !blacklist.has(t.function.name))
    }
  }

  console.log(`[Orchestrator v6.2] Role: ${agentRole || 'founder'}, Tools: ${selectedTools.length} for: "${userMessage.slice(0, 80)}..."`)

  // Build messages with conversation history (last 10 messages for context)
  const historySlice = conversationHistory.slice(-10)
  const messages: LLMMessage[] = [
    { role: 'system', content: effectiveSystemPrompt },
    ...historySlice.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  push({ type: 'thinking', content: 'Analyzing your request...' })

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await nativeLLMCall(zai, messages, selectedTools)

      if (response.finishReason === 'error') {
        push({ type: 'error', content: 'AI se response nahi aaya. Thodi der baad try karein.' })
        return { finalResponse: '', toolsCalled: stuckDetector.getUniqueTools() }
      }

      // No tool calls → final response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        let responseText = (response.content || '').trim()

        if (allFactCards.length > 0 && responseText) {
          const mergedCard = mergeFactCards(allFactCards)
          const validation = validateResponse(mergedCard, responseText)
          if (!validation.isValid) {
            console.warn('[Orchestrator v6.1] Validation failed:', validation.issues)
            messages.push({ role: 'assistant', content: responseText })
            messages.push({ role: 'user', content: `CORRECTION: ${validation.issues.map(iss => `  - ${iss}`).join('\n')}\n\nVERIFIED FACTS:\n${mergedCard.facts.map(f => `  • ${f}`).join('\n')}\n\nRe-write using ONLY verified numbers.` })
            const corrected = await nativeLLMCall(zai, messages, selectedTools)
            if (corrected.content?.trim()) {
              const reVal = validateResponse(mergedCard, corrected.content.trim())
              if (reVal.isValid) responseText = corrected.content.trim()
            }
          }
        }

        if (!responseText) {
          const toolsCalled = stuckDetector.getSummary()
          if (toolsCalled) {
            responseText = `Maine ${toolsCalled} tools call kiye, lekin aapka sawal poora answer karne me kami rahi. Kya aap thoda detail me bata sakte hain?`
          } else {
            responseText = 'Mujhe is baar data nahi mila. Dobara try karein ya thoda detail me bataiye.'
          }
        }

        finalResponse = responseText
        push({ type: 'response', content: finalResponse })
        return { finalResponse, toolsCalled: stuckDetector.getUniqueTools() }
      }

      // ── Tool calls detected ──
      const currentToolNames = response.toolCalls.map(tc => tc.name)
      const writeToolCalls = response.toolCalls.filter(tc => isWriteTool(tc.name))
      const readToolCalls = response.toolCalls.filter(tc => !isWriteTool(tc.name))

      // Stuck detection (v2 — catches A-A and A-B-A-B)
      for (const tc of response.toolCalls) stuckDetector.addCall(tc.name)
      const isLooping = stuckDetector.isStuck()

      if (isLooping || stuckDetector.wasCalledNTimes(currentToolNames[0], 3)) {
        console.warn(`[Orchestrator v6.1] Stuck at iteration ${i + 1}, forcing response. Tools: ${stuckDetector.getSummary()}`)
        push({ type: 'thinking', content: 'Preparing response with available data...' })

        // Build a smart fallback message with the tools we tried
        const triedTools = stuckDetector.getUniqueTools()
        const fallbackMsg = `STOP calling tools. You already called these tools (some multiple times): ${triedTools.join(', ')}.

CRITICAL INSTRUCTIONS:
1. Use the data you ALREADY have from previous tool results
2. If data was empty, tell the user "Mere database me ye information nahi hai" — DO NOT invent data
3. If the user asked multiple things, address each one separately
4. Give a COMPLETE, HELPFUL response in Hinglish NOW
5. Do NOT suggest "try again" — answer with what you have`

        messages.push({ role: 'user', content: fallbackMsg })
        const forced = await nativeLLMCall(zai, messages, selectedTools)
        const text = (forced.content || '').trim() || `Maine ${stuckDetector.getSummary()} tools call kiye. ${allFactCards.length > 0 ? 'Kuch data mila lekin complete answer nahi de paya.' : 'Data nahi mila database me.'} Thoda detail me bataiye kya chahiye.`
        push({ type: 'response', content: text })
        return { finalResponse: text, toolsCalled: triedTools }
      }

      console.log(`[Orchestrator v6.1] Iteration ${i + 1}/${MAX_ITERATIONS}: ${currentToolNames.join(', ')}`)

      // ── CONFIRMATION GATE: Pause for write tools ──
      if (writeToolCalls.length > 0) {
        console.log(`[Orchestrator v6.1] Write tools need confirmation: ${writeToolCalls.map(tc => tc.name).join(', ')}`)

        // Execute READ tools first
        const iterationFactCards: FactCard[] = []
        for (const tc of readToolCalls) {
          const label = TOOL_LABELS[tc.name] || `Calling ${tc.name}...`
          push({ type: 'tool_call', tool: tc.name, content: label })
          let result: ToolResult
          try { result = await executeTool(tc.name, tc.params) }
          catch (toolErr) { result = { success: false, data: null, summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}` } }
          push({ type: 'tool_result', tool: tc.name, success: result.success, summary: result.summary, content: result.count !== undefined ? `${result.success ? 'Found' : 'Error'}: ${result.count} records` : result.summary })
          const fc = generateFactCard(tc.name, result)
          iterationFactCards.push(fc)
          allFactCards.push(fc)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: buildToolResultContent(tc.name, result, fc) })
        }

        if (iterationFactCards.length > 0) {
          const mergedCard = mergeFactCards(iterationFactCards)
          push({ type: 'fact_card', content: JSON.stringify({ facts: mergedCard.facts, numbers: mergedCard.numbers, dataFreshness: mergedCard.dataFreshness, toolsUsed: mergedCard.toolsUsed }) })
        }

        // Save full state for resumption
        messages.push({
          role: 'assistant', content: response.content,
          tool_calls: response.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.params) } })),
        })

        // Placeholder tool results for write tools
        for (const tc of writeToolCalls) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `PENDING CONFIRMATION — ${tc.name} awaiting user approval.` })
        }

        const confirmationId = generateConfirmationId()
        const pendingConf: PendingConfirmation = {
          id: confirmationId,
          conversationId: conversationId || '',
          toolCalls: writeToolCalls.map(tc => ({ id: tc.id, name: tc.name, params: tc.params, label: TOOL_LABELS[tc.name] || tc.name })),
          messages: [...messages],
          allFactCards: [...allFactCards],
          iteration: i,
          createdAt: Date.now(),
        }

        cleanupOldConfirmations()
        setPendingConfirmation(pendingConf)

        push({
          type: 'confirmation_request',
          confirmationId,
          toolName: writeToolCalls.map(tc => tc.name).join(', '),
          toolLabel: writeToolCalls.map(tc => TOOL_LABELS[tc.name] || tc.name).join(', '),
          toolParams: writeToolCalls[0]?.params,
          content: `${writeToolCalls.length} action(s) need your approval`,
        })

        return { finalResponse: '', pendingConfirmation: pendingConf, toolsCalled: stuckDetector.getUniqueTools() }
      }

      // ── All READ tools → execute normally ──
      messages.push({
        role: 'assistant', content: response.content,
        tool_calls: response.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.params) } })),
      })

      const iterationFactCards: FactCard[] = []
      for (const tc of response.toolCalls) {
        const label = TOOL_LABELS[tc.name] || `Calling ${tc.name}...`
        push({ type: 'tool_call', tool: tc.name, content: label })
        let result: ToolResult
        try { result = await executeTool(tc.name, tc.params) }
        catch (toolErr) { result = { success: false, data: null, summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}` } }
        push({ type: 'tool_result', tool: tc.name, success: result.success, summary: result.summary, content: result.count !== undefined ? `${result.success ? 'Found' : 'Error'}: ${result.count} records` : result.summary })
        const fc = generateFactCard(tc.name, result)
        iterationFactCards.push(fc)
        allFactCards.push(fc)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: buildToolResultContent(tc.name, result, fc) })
      }

      if (iterationFactCards.length > 0) {
        const mergedCard = mergeFactCards(iterationFactCards)
        push({ type: 'fact_card', content: JSON.stringify({ facts: mergedCard.facts, numbers: mergedCard.numbers, dataFreshness: mergedCard.dataFreshness, toolsUsed: mergedCard.toolsUsed }) })
      }

      // Smart nudge v2 — contextual guidance based on results
      const nudge = buildSmartNudge(i, MAX_ITERATIONS, iterationFactCards, currentToolNames, stuckDetector, userMessage)
      messages.push({ role: 'user', content: nudge })
    }

    // ── Max iterations → smart final response ──
    console.warn(`[Orchestrator v6.1] Max ${MAX_ITERATIONS} iterations. Tools: ${stuckDetector.getSummary()}`)

    // Trim bloated messages — keep system, last user message, and last 8 messages
    const trimmedMessages: LLMMessage[] = [
      messages[0], // system prompt
      ...messages.slice(-8),  // last 8 messages (tool results + nudges)
    ]

    const finalNudge = `You used all ${MAX_ITERATIONS} iterations. Tools called: ${stuckDetector.getSummary()}.

FINAL INSTRUCTIONS:
1. STOP calling tools — you have NO more iterations
2. Use ALL the data from previous tool results to give the BEST possible answer
3. If data was empty for some parts, say "Mere database me ye information nahi hai"
4. If the user asked multiple things (compound query), address EACH part
5. Give a COMPLETE, USEFUL response in Hinglish NOW
6. DO NOT say "I couldn't find" — give whatever information you HAVE`

    trimmedMessages.push({ role: 'user', content: finalNudge })

    const finalLLM = await nativeLLMCall(zai, trimmedMessages, selectedTools)
    let responseText = (finalLLM.content || '').trim()

    if (!responseText) {
      const toolsCalled = stuckDetector.getSummary()
      const hasData = allFactCards.some(fc => fc.dataFreshness !== 'empty')
      if (hasData) {
        responseText = `Maine ${toolsCalled} tools use kiye aur kuch data bhi mila, lekin complete answer generate nahi ho paya. Jo information mili hai wo summary:\n\n${allFactCards.filter(fc => fc.dataFreshness !== 'empty').flatMap(fc => fc.facts).slice(0, 5).map(f => `• ${f}`).join('\n')}\n\nKya aap specifically kya jaanna chahte hain?`
      } else {
        responseText = `Maine ${toolsCalled} tools check kiye lekin database me is baar relevant data nahi mila. Kya aap exact order number ya style name bata sakte hain?`
      }
    }

    push({ type: 'response', content: responseText })
    return { finalResponse: responseText, toolsCalled: stuckDetector.getUniqueTools() }

  } catch (err) {
    console.error('[Orchestrator v6.1] Unexpected error:', err)
    push({ type: 'error', content: `Processing me technical issue: ${err instanceof Error ? err.message : 'Unknown'}` })
    return { finalResponse: '', toolsCalled: stuckDetector.getUniqueTools() }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESUME ORCHESTRATION (after user confirms/declines)
// ═══════════════════════════════════════════════════════════════════════════════

export async function resumeOrchestration(
  confirmationId: string,
  confirmed: boolean,
  push: PushEvent,
): Promise<OrchestrateResult> {
  const { getPendingConfirmation, removePendingConfirmation } = await import('./confirmation-store')
  const pending = getPendingConfirmation(confirmationId)
  if (!pending) {
    push({ type: 'error', content: 'Confirmation expired ya nahi mili. Dobara try karein.' })
    return { finalResponse: '', toolsCalled: [] }
  }
  removePendingConfirmation(confirmationId)

  let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
  try { zai = await ZAI.create() } catch {
    push({ type: 'error', content: 'AI service abhi available nahi hai.' })
    return { finalResponse: '', toolsCalled: [] }
  }

  const allToolDefs = await getAllToolDefinitions()
  const allOpenAITools = toOpenAITools(allToolDefs)
  const selectedTools = selectToolsForMessage('', allOpenAITools)
  const messages: LLMMessage[] = [...pending.messages] as LLMMessage[]
  let allFactCards = [...pending.allFactCards]

  if (confirmed) {
    push({ type: 'thinking', content: 'Executing approved actions...' })

    for (const tc of pending.toolCalls) {
      const label = TOOL_LABELS[tc.name] || `Executing ${tc.name}...`
      push({ type: 'tool_call', tool: tc.name, content: label })
      let result: ToolResult
      try { result = await executeTool(tc.name, tc.params) }
      catch (toolErr) { result = { success: false, data: null, summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}` } }
      push({ type: 'tool_result', tool: tc.name, success: result.success, summary: result.summary, content: result.count !== undefined ? `${result.success ? 'Created' : 'Error'}: ${result.count} records` : result.summary })
      const fc = generateFactCard(tc.name, result)
      allFactCards.push(fc)
      const toolIdx = messages.findIndex(m => m.role === 'tool' && m.tool_call_id === tc.id)
      if (toolIdx !== -1) {
        messages[toolIdx] = { role: 'tool', tool_call_id: tc.id, content: buildToolResultContent(tc.name, result, fc) }
      }
    }

    const mergedCard = mergeFactCards(allFactCards)
    push({ type: 'fact_card', content: JSON.stringify({ facts: mergedCard.facts, numbers: mergedCard.numbers, dataFreshness: mergedCard.dataFreshness, toolsUsed: mergedCard.toolsUsed }) })
    messages.push({ role: 'user', content: `✅ User APPROVED: ${pending.toolCalls.map(tc => tc.name).join(', ')}. They executed successfully. Now give a COMPLETE Hinglish response summarizing what was done with key numbers.` })
  } else {
    push({ type: 'thinking', content: 'Action cancelled.' })
    messages.push({ role: 'user', content: `❌ User DECLINED: ${pending.toolCalls.map(tc => tc.name).join(', ')}. Do NOT retry. Tell the user the action was cancelled.` })
  }

  // Continue ReAct loop — with confirmation gate for subsequent write tools
  try {
    for (let i = 0; i < 6; i++) {
      const response = await nativeLLMCall(zai, messages, selectedTools)
      if (response.finishReason === 'error' || (!response.toolCalls && !response.content)) {
        const text = confirmed ? 'Action complete!' : 'Action cancelled.'
        push({ type: 'response', content: text })
        return { finalResponse: text, toolsCalled: pending.toolCalls.map(tc => tc.name) }
      }
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const text = (response.content || '').trim() || 'Done.'
        push({ type: 'response', content: text })
        return { finalResponse: text, toolsCalled: pending.toolCalls.map(tc => tc.name) }
      }

      // ── Check for write tools → confirmation gate ──
      const nextWriteTools = response.toolCalls.filter(tc => isWriteTool(tc.name))
      const nextReadTools = response.toolCalls.filter(tc => !isWriteTool(tc.name))

      if (nextWriteTools.length > 0) {
        console.log(`[Resume v6.1] Next write tools need confirmation: ${nextWriteTools.map(tc => tc.name).join(', ')}`)

        // Execute any READ tools first
        for (const tc of nextReadTools) {
          const label = TOOL_LABELS[tc.name] || `Calling ${tc.name}...`
          push({ type: 'tool_call', tool: tc.name, content: label })
          let result: ToolResult
          try { result = await executeTool(tc.name, tc.params) }
          catch (toolErr) { result = { success: false, data: null, summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}` } }
          push({ type: 'tool_result', tool: tc.name, success: result.success, summary: result.summary, content: result.count !== undefined ? `${result.success ? 'Found' : 'Error'}: ${result.count} records` : result.summary })
          const fc = generateFactCard(tc.name, result)
          allFactCards.push(fc)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: buildToolResultContent(tc.name, result, fc) })
        }

        // Save assistant message with all tool calls
        messages.push({
          role: 'assistant', content: response.content,
          tool_calls: response.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.params) } })),
        })

        // Placeholder for write tools
        for (const tc of nextWriteTools) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `PENDING CONFIRMATION — ${tc.name} awaiting user approval.` })
        }

        const newConfirmationId = generateConfirmationId()
        const newPendingConf: PendingConfirmation = {
          id: newConfirmationId,
          conversationId: pending.conversationId,
          toolCalls: nextWriteTools.map(tc => ({ id: tc.id, name: tc.name, params: tc.params, label: TOOL_LABELS[tc.name] || tc.name })),
          messages: [...messages],
          allFactCards: [...allFactCards],
          iteration: i,
          createdAt: Date.now(),
        }
        cleanupOldConfirmations()
        setPendingConfirmation(newPendingConf)

        push({
          type: 'confirmation_request',
          confirmationId: newConfirmationId,
          toolName: nextWriteTools.map(tc => tc.name).join(', '),
          toolLabel: nextWriteTools.map(tc => TOOL_LABELS[tc.name] || tc.name).join(', '),
          toolParams: nextWriteTools[0]?.params,
          content: `${nextWriteTools.length} action(s) need your approval`,
        })

        return { finalResponse: '', pendingConfirmation: newPendingConf, toolsCalled: [...pending.toolCalls.map(tc => tc.name), ...nextWriteTools.map(tc => tc.name)] }
      }

      // ── All READ tools → execute normally ──
      messages.push({
        role: 'assistant', content: response.content,
        tool_calls: response.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.params) } })),
      })

      const iterationFactCards: FactCard[] = []
      for (const tc of response.toolCalls) {
        const label = TOOL_LABELS[tc.name] || `Calling ${tc.name}...`
        push({ type: 'tool_call', tool: tc.name, content: label })
        let result: ToolResult
        try { result = await executeTool(tc.name, tc.params) }
        catch (toolErr) { result = { success: false, data: null, summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}` } }
        push({ type: 'tool_result', tool: tc.name, success: result.success, summary: result.summary, content: result.summary })
        const fc = generateFactCard(tc.name, result)
        iterationFactCards.push(fc)
        allFactCards.push(fc)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: buildToolResultContent(tc.name, result, fc) })
      }

      if (iterationFactCards.length > 0) {
        const mergedCard = mergeFactCards(iterationFactCards)
        push({ type: 'fact_card', content: JSON.stringify({ facts: mergedCard.facts, numbers: mergedCard.numbers, dataFreshness: mergedCard.dataFreshness, toolsUsed: mergedCard.toolsUsed }) })
      }

      const remaining = 6 - i - 1
      messages.push({ role: 'user', content: `Tool results mil gaye. Ab ${confirmed ? 'batao kya hua aur agla step suggest karo' : 'final jawab do Hinglish me'}. Remaining: ${remaining} calls. ${remaining <= 1 ? 'Give your BEST answer now.' : ''}` })
    }

    // Max iterations → force final response
    const final = await nativeLLMCall(zai, messages, selectedTools)
    const text = (final.content || 'Done.').trim()
    push({ type: 'response', content: text })
    return { finalResponse: text, toolsCalled: pending.toolCalls.map(tc => tc.name) }
  } catch (err) {
    console.error('[Orchestrator v6.1] Resume error:', err)
    push({ type: 'error', content: 'Processing me error aa gaya.' })
    return { finalResponse: '', toolsCalled: [] }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NON-STREAMING (backward compatible) — v6.2 with stuck detection + smart nudges
// ═══════════════════════════════════════════════════════════════════════════════

export async function orchestrate(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<OrchestratorResult> {
  const MAX_ITERATIONS = 8
  const toolCallsLog: OrchestratorResult['toolCallsLog'] = []
  const stuckDetector = new StuckDetector()
  let allFactCards: FactCard[] = []
  let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
  try { zai = await ZAI.create() } catch {
    return { response: 'AI service abhi available nahi hai.', actions: [], toolCallsLog: [{ tool: 'init', success: false, summary: 'ZAI SDK init failed' }] }
  }
  const allToolDefs = await getAllToolDefinitions()
  const allOpenAITools = toOpenAITools(allToolDefs)
  const selectedTools = selectToolsForMessage(userMessage, allOpenAITools)
  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-16).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await nativeLLMCall(zai, messages, selectedTools)

      // Error or empty response
      if (response.finishReason === 'error' || (!response.toolCalls && !response.content)) {
        const toolsCalled = stuckDetector.getSummary()
        return { response: toolsCalled ? `Maine ${toolsCalled} tools call kiye lekin complete answer nahi de paya.` : 'AI se response nahi aaya.', actions: [], toolCallsLog }
      }

      // No tool calls → final text response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return { response: response.content || 'No response.', actions: [], toolCallsLog }
      }

      // ── Stuck detection ──
      const currentToolNames = response.toolCalls.map(tc => tc.name)
      for (const tc of response.toolCalls) stuckDetector.addCall(tc.name)

      if (stuckDetector.isStuck() || stuckDetector.wasCalledNTimes(currentToolNames[0], 3)) {
        console.warn(`[Orchestrate v6.2] Stuck at iteration ${i + 1}, forcing response. Tools: ${stuckDetector.getSummary()}`)
        const triedTools = stuckDetector.getUniqueTools()
        messages.push({ role: 'user', content: `STOP calling tools. You already called: ${triedTools.join(', ')}. Use data you have and give a COMPLETE Hinglish response NOW.` })
        const forced = await nativeLLMCall(zai, messages, selectedTools)
        return { response: forced.content || `Tools called: ${triedTools.join(', ')}.`, actions: [], toolCallsLog }
      }

      console.log(`[Orchestrate v6.2] Iteration ${i + 1}/${MAX_ITERATIONS}: ${currentToolNames.join(', ')}`)

      // Push assistant message with tool calls
      messages.push({
        role: 'assistant', content: response.content,
        tool_calls: response.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.params) } })),
      })

      // Execute all tools and collect fact cards
      const iterationFactCards: FactCard[] = []
      for (const tc of response.toolCalls) {
        let result: ToolResult
        try { result = await executeTool(tc.name, tc.params) }
        catch (toolErr) { result = { success: false, data: null, summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}` } }
        toolCallsLog.push({ tool: tc.name, success: result.success, summary: result.summary })
        const fc = generateFactCard(tc.name, result)
        iterationFactCards.push(fc)
        allFactCards.push(fc)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: buildToolResultContent(tc.name, result, fc) })
      }

      // Smart nudge based on data quality
      const remaining = MAX_ITERATIONS - i - 1
      const hasEmpty = iterationFactCards.some(fc => fc.dataFreshness === 'empty')
      const hasData = iterationFactCards.some(fc => fc.dataFreshness !== 'empty')
      const isCompound = [' aur ', ' bhi ', ' and ', ' also ', ' sath me ', ' dono '].some(ind => userMessage.toLowerCase().includes(ind))

      let nudge: string
      if (hasEmpty && !hasData) {
        nudge = `⚠️ Data nahi mila. DO NOT call same tools again. Remaining: ${remaining}. Jawab do jo bhi mila.`
      } else if (hasEmpty && hasData) {
        nudge = `Kuch data mila, kuch nahi. Empty parts ke liye batao "database me nahi hai". Remaining: ${remaining}. COMPLETE response do.`
      } else {
        nudge = `✅ Tool results mil gaye with real data. Use EXACT numbers. Remaining: ${remaining}. ${isCompound ? 'MULTIPLE cheezein puchi thi — SAB ka jawab do. ' : ''}${remaining <= 2 ? 'Give your BEST answer now.' : ''}`
      }
      messages.push({ role: 'user', content: nudge })
    }

    // Max iterations reached — force final response
    console.warn(`[Orchestrate v6.2] Max ${MAX_ITERATIONS} iterations. Tools: ${stuckDetector.getSummary()}`)
    const trimmedMessages: LLMMessage[] = [
      messages[0], // system prompt
      ...messages.slice(-8),
    ]
    trimmedMessages.push({ role: 'user', content: `You used all ${MAX_ITERATIONS} iterations. Tools called: ${stuckDetector.getSummary()}. STOP calling tools. Give a COMPLETE Hinglish response NOW with whatever data you have.` })
    const final = await nativeLLMCall(zai, trimmedMessages, selectedTools)
    return { response: final.content || 'Analysis complete.', actions: [], toolCallsLog }
  } catch (err) {
    console.error('[Orchestrate v6.2] Error:', err)
    return { response: 'Processing me error aa gaya.', actions: [], toolCallsLog }
  }
}