import { NextRequest } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StreamEvent {
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

// ─── In-memory conversation store ─────────────────────────────────────────────

const conversations: Map<string, Array<{ role: string; content: string }>> = new Map()
function genId() { return `ag_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` }

// ─── Event helpers ────────────────────────────────────────────────────────────

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// ─── GET — Agent config ──────────────────────────────────────────────────────

export async function GET() {
  return new Response(JSON.stringify({
    name: 'Dhanya OS Agent',
    version: '6.3',
    architecture: 'native-tool-calling-all-tools-v6.3',
    totalTools: 67,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── POST — Streaming chat + Confirmation handling ───────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, conversationId: existingConvId, stream, confirmationResponse, role } = body

    // ── Handle confirmation response (Yes/No from frontend) ──
    if (confirmationResponse) {
      const { confirmationId, confirmed } = confirmationResponse
      if (!confirmationId) {
        return new Response(JSON.stringify({ error: 'confirmationId is required' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        })
      }

      const { resumeOrchestration } = await import('@/lib/agent/orchestrator')
      const encoder = new TextEncoder()
      const streamCtrl = new ReadableStream({
        async start(controller) {
          try {
            const result = await resumeOrchestration(confirmationId, confirmed, (event: StreamEvent) => {
              controller.enqueue(encoder.encode(sse(event)))
            })

            const convId = confirmationId
            if (!conversations.has(convId)) conversations.set(convId, [])
            const history = conversations.get(convId)!
            if (result.finalResponse) {
              history.push({ role: 'assistant', content: result.finalResponse })
            }

            controller.enqueue(encoder.encode(sse({
              type: 'done',
              conversationId: convId,
            })))
            controller.close()
          } catch (err) {
            console.error('[AI Agent] Confirmation error:', err)
            controller.enqueue(encoder.encode(sse({
              type: 'error',
              content: err instanceof Error ? err.message : 'Confirmation failed',
            })))
            controller.close()
          }
        },
      })

      return new Response(streamCtrl, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      })
    }

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const convId = existingConvId || genId()
    
    // ── Load conversation from DB if not in memory ──
    if (!conversations.has(convId) && existingConvId) {
      try {
        const { supabase } = await import('@/lib/supabase-db')
        const { data: saved } = await supabase
          .from('AgentConversation')
          .select('messages')
          .eq('id', convId)
          .single()
        if (saved) conversations.set(convId, JSON.parse(saved.messages))
      } catch { /* DB not available, use empty */ }
    }
    if (!conversations.has(convId)) conversations.set(convId, [])
    const history = conversations.get(convId)!

    // ── Non-streaming fallback ──
    if (!stream) {
      const { orchestrate } = await import('@/lib/agent/orchestrator')
      const result = await orchestrate(message, history)
      history.push({ role: 'user', content: message })
      history.push({ role: 'assistant', content: result.response })
      return new Response(JSON.stringify({
        response: result.response,
        conversationId: convId,
        toolCallsUsed: result.toolCallsLog.length,
        toolCallsLog: result.toolCallsLog,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Streaming mode ──
    const { orchestrateStream } = await import('@/lib/agent/orchestrator')
    const encoder = new TextEncoder()
    const streamCtrl = new ReadableStream({
      async start(controller) {
        try {
          const result = await orchestrateStream(message, history, (event: StreamEvent) => {
            controller.enqueue(encoder.encode(sse(event)))
          }, convId, role)

          // Save conversation history to memory + DB
          if (result.finalResponse) {
            history.push({ role: 'user', content: message })
            history.push({ role: 'assistant', content: result.finalResponse })
            // Persist to DB (fire-and-forget)
            import('@/lib/supabase-db').then(({ supabase }) => {
              // Upsert: try to find first, then insert or update
              supabase
                .from('AgentConversation')
                .select('id')
                .eq('id', convId)
                .single()
                .then(({ data: existing }) => {
                  const now = new Date().toISOString()
                  if (existing) {
                    return supabase
                      .from('AgentConversation')
                      .update({ messages: JSON.stringify(history), updatedAt: now })
                      .eq('id', convId)
                  } else {
                    return supabase
                      .from('AgentConversation')
                      .insert({ id: convId, role: role || 'founder', messages: JSON.stringify(history), createdAt: now, updatedAt: now })
                  }
                })
                .catch(() => {})
            })
          }

          const doneEvent: StreamEvent = {
            type: 'done',
            conversationId: convId,
          }
          controller.enqueue(encoder.encode(sse(doneEvent)))

          // Cleanup old conversations
          if (conversations.size > 50) {
            const keys = Array.from(conversations.keys())
            for (let i = 0; i < keys.length - 50; i++) conversations.delete(keys[i])
          }

          controller.close()
        } catch (err) {
          console.error('[AI Agent Stream] Error:', err)
          controller.enqueue(encoder.encode(sse({
            type: 'error',
            content: err instanceof Error ? err.message : 'Processing failed',
          })))
          controller.close()
        }
      },
    })

    return new Response(streamCtrl, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch (error) {
    console.error('AI Agent v6.1 error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
