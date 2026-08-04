// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRMATION STORE
// In-memory store for pending write-tool confirmations.
// When the AI wants to execute a write tool (create order, etc.),
// the confirmation is stored here and the user must approve it.
// ═══════════════════════════════════════════════════════════════════════════════

import type { FactCard } from './fact-card'

export interface PendingConfirmation {
  id: string
  conversationId: string
  toolCalls: Array<{
    id: string
    name: string
    params: Record<string, unknown>
    label: string
  }>
  /** Full LLM conversation state to resume from */
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    tool_call_id?: string
  }>
  allFactCards: FactCard[]
  iteration: number
  createdAt: number
}

// In-memory store (survives within a single server process)
const store = new Map<string, PendingConfirmation>()

/** Store a pending confirmation */
export function setPendingConfirmation(confirmation: PendingConfirmation): void {
  store.set(confirmation.id, confirmation)
}

/** Get a pending confirmation by ID */
export function getPendingConfirmation(id: string): PendingConfirmation | undefined {
  return store.get(id)
}

/** Remove a pending confirmation (after it's handled) */
export function removePendingConfirmation(id: string): void {
  store.delete(id)
}

/** Cleanup old confirmations (older than 10 minutes) */
export function cleanupOldConfirmations(): void {
  const now = Date.now()
  const maxAge = 10 * 60 * 1000
  for (const [id, conf] of store) {
    if (now - conf.createdAt > maxAge) {
      store.delete(id)
    }
  }
}

/** Generate a unique confirmation ID */
export function generateConfirmationId(): string {
  return `cfm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}