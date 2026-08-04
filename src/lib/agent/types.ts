// ─── Dhanya OS Agent v4.0 — Type Definitions ──────────────────────────────────
// Architecture: Single Agent ReAct Loop (Z.ai style)

// ─── Thought Step (shown in UI) ───────────────────────────────────────────────

export interface ThoughtStep {
  icon: string   // '🧠' '⚡' '✅' '⚠️' '💬' '❌'
  text: string
}

// ─── Orchestrator Output ───────────────────────────────────────────────────────

export interface OrchestratorOutput {
  response: string
  thoughtSteps: ThoughtStep[]
  version: string
  llmCalls: number
  totalDuration: number
}

// ─── Progress Event (internal, for logging) ────────────────────────────────────

export interface ProgressEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'tool_error' | 'responding'
  message: string
  icon?: string
  tool?: string
}

// ─── Module type (kept for reference) ──────────────────────────────────────────

export type ModuleType =
  | 'orders'
  | 'costing'
  | 'sampling'
  | 'production'
  | 'dispatch'
  | 'accounts'
  | 'inventory'
  | 'cross_module'