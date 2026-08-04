import type { OpenAITool } from './tool-schemas'
import { isWriteTool } from './tool-schemas'

// ═══════════════════════════════════════════════════════════════════════════════
// SMART TOOL ROUTER v2
// Strategy: Default = ALL tools (LLM is smart enough with native function calling)
// Only reduce for obvious single-domain READ queries to save tokens.
// This eliminates the Hinglish regex problem — the LLM understands Hinglish natively.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Obvious single-domain READ patterns ──────────────────────────────────────
// These are ONLY for token optimization on very clear, simple queries.
// If ambiguous or multi-domain → fall through to ALL tools.

interface SimpleQuery {
  patterns: RegExp[]
  toolNames: string[]
}

// Queries that are CLEARLY single-domain READ — safe to reduce tools
const SIMPLE_READ_QUERIES: SimpleQuery[] = [
  {
    patterns: [/^\s*(hi|hello|hey|namaste)\b/i, /^\s*(how are you|kaise ho)\b/i],
    toolNames: ['get_date_context', 'get_daily_summary', 'get_system_info'],
  },
  {
    // "pending orders", "orders dikhao", "konsa order" — pure READ on orders
    patterns: [
      /^(pending |today ke |aaj ke )?orders?\s*(dikhao|show|status|kons[ae])?\??\s*$/i,
      /^pending orders?\??\s*$/i,
    ],
    toolNames: [
      'get_orders', 'get_order_detail', 'get_overdue_orders',
      'get_date_context', 'get_daily_summary', 'get_customers',
      'search_all',
    ],
  },
]

/** Detect if message is a simple, obvious single-domain READ query */
function isSimpleReadQuery(message: string): string[] | null {
  for (const query of SIMPLE_READ_QUERIES) {
    if (query.patterns.some(p => p.test(message))) {
      return query.toolNames
    }
  }
  return null
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Select tools for the user's message.
 *
 * v2 Strategy:
 * - Default: Return ALL 57 tools — the LLM natively understands Hinglish
 *   and picks the right tools via function calling.
 * - Optimization: For obvious simple queries (greetings, single-domain reads),
 *   return a smaller set to save tokens.
 * - The old regex-based domain detection is REMOVED because Hinglish has
 *   infinite vocabulary — regex can't cover it, but the LLM can.
 */
export function selectToolsForMessage(
  message: string,
  allTools: OpenAITool[],
): OpenAITool[] {
  // Fast path: obvious simple queries get a reduced set
  const simpleTools = isSimpleReadQuery(message)
  if (simpleTools) {
    const toolMap = new Map(allTools.map(t => [t.function.name, t]))
    const selected: OpenAITool[] = []
    for (const name of simpleTools) {
      const tool = toolMap.get(name)
      if (tool) selected.push(tool)
    }
    if (selected.length > 0) return selected
  }

  // Default: ALL tools — let the LLM decide which to call
  // Native function calling handles 57 tools efficiently
  return allTools
}

/**
 * Check if a tool name is "write" type (create/update/workflow)
 * Re-exported from tool-schemas for convenience
 */
export { isWriteTool }