import ZAI from 'z-ai-web-dev-sdk'
import { executeTool, type ToolResult, TOOLS } from './tools'
import { getModuleAgent, getAgentForTool } from './module-agents'
import type {
  TaskNode,
  TaskResult,
  ExecutionPlan,
  ModuleType,
  ProgressEvent,
} from './types'

// ─── Types ────────────────────────────────────────────────────────────────────────

type ProgressCallback = (event: ProgressEvent) => void

// ─── Response Cleaner ────────────────────────────────────────────────────────────

function cleanResponse(raw: string): string {
  let text = raw
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  text = text.replace(/<tool>[\s\S]*?<\/tool>/gi, '')
  text = text.replace(/<action>[\s\S]*?<\/action>/gi, '')
  text = text.replace(/^\s*<thinking>.*$/gim, '')
  text = text.replace(/^\s*<\/thinking>.*$/gim, '')
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

// ─── Tool Call Parser ────────────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string
  params: Record<string, unknown>
}

function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = []
  const regex = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.name && typeof parsed.name === 'string') {
        calls.push({ name: parsed.name, params: parsed.params || {} })
      }
    } catch { /* skip malformed */ }
  }
  return calls
}

// ─── Safe LLM Call ────────────────────────────────────────────────────────────────

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>

async function safeLLMCall(
  zai: ZAIInstance,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    return completion?.choices?.[0]?.message?.content || completion?.content || ''
  } catch (err) {
    console.error('[Executor] LLM call failed:', err)
    return ''
  }
}

// ─── Build Available Tools Description for Agent ─────────────────────────────────

function buildAgentToolsDescription(agentTools: string[]): string {
  return agentTools
    .map(toolName => {
      const toolDef = TOOLS.find(t => t.name === toolName)
      if (!toolDef) return null
      const params = Object.entries(toolDef.parameters)
        .map(([k, v]) => {
          let desc = `    "${k}": ${v.type}`
          if (v.enum) desc += ` (${v.enum.join('/')})`
          desc += ` — ${v.description}`
          if (v.required) desc += ' [REQUIRED]'
          return desc
        })
        .join('\n')
      return `**${toolDef.name}**: ${toolDef.description}\n  Parameters:\n${params}`
    })
    .filter(Boolean)
    .join('\n\n')
}

// ─── Inject Dependency Data into Agent Context ────────────────────────────────────

function buildDependencyContext(task: TaskNode, results: Record<string, TaskResult>): string {
  if (task.dependsOn.length === 0) return ''

  const deps = task.dependsOn
    .map(depId => {
      const result = results[depId]
      if (!result || result.status !== 'done') {
        return `[${depId}: DATA NOT AVAILABLE]`
      }
      const dataStr = typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data, null, 2)
      // Truncate large data to avoid token overflow
      const truncated = dataStr.length > 3000
        ? dataStr.substring(0, 3000) + '\n...[truncated]'
        : dataStr
      return `[Data from ${depId} (${result.module} - ${result.tool || 'agent'}):\n${truncated}]`
    })
    .join('\n\n')

  return deps
}

// ─── Execute a Direct Tool Call (for type='tool' tasks) ──────────────────────────

async function executeDirectTool(
  task: TaskNode,
  results: Record<string, TaskResult>
): Promise<TaskResult> {
  const start = Date.now()
  const toolName = task.tool || ''

  // If task has dependencies, inject data into params
  let params = { ...(task.params || {}) }
  if (task.dependsOn.length > 0) {
    const depData: Record<string, unknown> = {}
    for (const depId of task.dependsOn) {
      const depResult = results[depId]
      if (depResult?.status === 'done' && depResult.data) {
        depData[depId] = depResult.data
      }
    }
    params._dependencyData = depData
  }

  try {
    const toolResult: ToolResult = await executeTool(toolName, params)
    return {
      taskId: task.id,
      taskType: 'tool',
      status: toolResult.success ? 'done' : 'failed',
      data: toolResult.data,
      error: toolResult.success ? undefined : toolResult.summary,
      summary: toolResult.summary,
      module: task.module,
      tool: toolName,
      duration: Date.now() - start,
    }
  } catch (err) {
    return {
      taskId: task.id,
      taskType: 'tool',
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
      summary: `Tool "${toolName}" failed: ${err instanceof Error ? err.message : 'Unknown'}`,
      module: task.module,
      tool: toolName,
      duration: Date.now() - start,
    }
  }
}

// ─── Execute a Sub-Agent (for type='agent' tasks) ───────────────────────────────

async function executeSubAgent(
  zai: ZAIInstance,
  task: TaskNode,
  results: Record<string, TaskResult>,
  conversationHistory: Array<{ role: string; content: string }>,
  onProgress?: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  const MAX_AGENT_ITERATIONS = 3

  // Get the module agent
  const agent = getModuleAgent(task.module)
  if (!agent) {
    return {
      taskId: task.id,
      taskType: 'agent',
      status: 'failed',
      error: `No agent found for module: ${task.module}`,
      summary: `Module "${task.module}" ke liye koi agent nahi mila`,
      module: task.module,
      agentName: task.module,
      duration: Date.now() - start,
    }
  }

  onProgress?.({
    type: 'task_start',
    taskId: task.id,
    agentName: agent.nameHi,
    agentIcon: agent.icon,
    message: `${agent.icon} ${agent.nameHi} kaam shuru kar raha hai...`,
  })

  // Build system prompt for this sub-agent
  const toolsDescription = buildAgentToolsDescription(agent.tools)
  const systemPrompt = `${agent.systemPrompt}\n\n## TERE TOOLS:\n${toolsDescription}`

  // Build user context with dependency data
  const depContext = buildDependencyContext(task, results)

  // Build conversation history context for multi-turn awareness
  const recentConv = conversationHistory.slice(-10)
  const convContext = recentConv.length > 0
    ? recentConv.map(m => `${m.role === 'user' ? '👤 User' : '🤖 Assistant'}: ${m.content.substring(0, 400)}`).join('\n')
    : ''

  const userContext = `${convContext ? `## USER KE PEHLE KE MESSAGES (MULTI-TURN CONTEXT):\n${convContext}\n\n⚠️ IMPORTANT: Upar ke messages mein user ne bahut saari details di hain (style numbers, costs, quantities, etc). UN SABKO USE KARO. Tool call mein SAARE required params bharo. User ko dobara mat puchho jo wo pehle bata chuka hai.\n\n` : ''}## TERA TASK:\n${task.instruction}\n${depContext ? `\n## PEHLE ROUND KA DATA:\n${depContext}\n` : ''}\n\nApne tools use karke yeh task complete karo. Tool calls <tool> tags mein karo. SAARE required parameters bhar ke tool call karo — koi required param missing mat chhodna.`

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContext },
  ]

  const toolCallsLog: Array<{ tool: string; success: boolean; summary: string }> = []
  let agentResponse = ''

  // Mini ReAct loop for the sub-agent
  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const rawResponse = await safeLLMCall(zai, messages)

    if (!rawResponse) {
      // LLM failed — return what we have so far or error
      if (agentResponse) break
      return {
        taskId: task.id,
        taskType: 'agent',
        status: 'failed',
        error: 'LLM call failed',
        summary: `${agent.nameHi} mein LLM error aaya`,
        module: task.module,
        agentName: agent.nameHi,
        toolCallsLog,
        duration: Date.now() - start,
      }
    }

    // Check for tool calls
    const toolCalls = parseToolCalls(rawResponse)

    if (toolCalls.length === 0) {
      // No more tool calls — agent is done
      agentResponse = cleanResponse(rawResponse)
      break
    }

    // Agent wants to call tools — execute them
    messages.push({ role: 'assistant', content: rawResponse })

    for (const tc of toolCalls) {
      // Validate tool is in agent's allowed list
      if (!agent.tools.includes(tc.name)) {
        const errorMsg = `Tool "${tc.name}" tumhare allowed tools mein nahi hai. Tum sirf yeh tools use kar sakte ho: ${agent.tools.join(', ')}`
        messages.push({
          role: 'user',
          content: `<tool_result name="${tc.name}" success="false">\nError: ${errorMsg}\n</tool_result>`,
        })
        toolCallsLog.push({ tool: tc.name, success: false, summary: `Tool not allowed for ${agent.nameHi}` })
        continue
      }

      let result: ToolResult
      try {
        result = await executeTool(tc.name, tc.params)
      } catch (toolErr) {
        result = {
          success: false,
          data: null,
          summary: `Error: ${toolErr instanceof Error ? toolErr.message : 'Unknown'}`,
        }
      }

      toolCallsLog.push({ tool: tc.name, success: result.success, summary: result.summary })

      // Add tool result to agent's context
      const dataStr = typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data)
      const truncatedData = dataStr.length > 4000
        ? dataStr.substring(0, 4000) + '...[truncated]'
        : dataStr

      messages.push({
        role: 'user',
        content: `<tool_result name="${tc.name}" success="${result.success}">\nSummary: ${result.summary}\nData: ${truncatedData}\n</tool_result>`,
      })
    }

    // After executing tools, nudge agent to respond with final answer
    if (i === MAX_AGENT_ITERATIONS - 1) {
      messages.push({
        role: 'user',
        content: 'Ab apna final result batao. Saara data analyze karke ek clear summary do. Koi <thinking> tag mat lagana.',
      })
    }
  }

  // If we still don't have a response after the loop, try one more LLM call
  if (!agentResponse) {
    const finalRaw = await safeLLMCall(zai, messages)
    agentResponse = finalRaw ? cleanResponse(finalRaw) : 'Task complete but response generate nahi ho paya.'
  }

  onProgress?.({
    type: 'task_done',
    taskId: task.id,
    agentName: agent.nameHi,
    agentIcon: agent.icon,
    message: `${agent.icon} ${agent.nameHi} done — ${toolCallsLog.filter(t => t.success).length} tools executed`,
    data: { summary: agentResponse.substring(0, 200), toolCallsLog },
  })

  const hasFailures = toolCallsLog.some(t => !t.success)

  return {
    taskId: task.id,
    taskType: 'agent',
    status: hasFailures ? 'done' : 'done', // Still 'done' if agent gave a response
    data: agentResponse,
    summary: agentResponse.substring(0, 300),
    module: task.module,
    agentName: agent.nameHi,
    toolCallsLog,
    duration: Date.now() - start,
  }
}

// ─── Main Executor: Run All Rounds ───────────────────────────────────────────────

export async function executePlan(
  zai: ZAIInstance,
  plan: ExecutionPlan,
  conversationHistory: Array<{ role: string; content: string }>,
  onProgress?: ProgressCallback
): Promise<{ results: TaskResult[]; subAgentCalls: number }> {
  const allResults: Record<string, TaskResult> = {}
  let subAgentCalls = 0

  for (let roundIdx = 0; roundIdx < plan.rounds.length; roundIdx++) {
    const round = plan.rounds[roundIdx]

    onProgress?.({
      type: 'round_start',
      round: roundIdx + 1,
      message: `Round ${roundIdx + 1}/${plan.totalRounds} shuru — ${round.length} task(s) ${round.length > 1 ? 'parallel' : ''}`,
    })

    // Execute all tasks in this round IN PARALLEL
    const roundPromises = round.map(async (taskId) => {
      const task = plan.tasks[taskId]
      if (!task) {
        return {
          taskId,
          taskType: 'tool' as const,
          status: 'skipped' as const,
          summary: `Task ${taskId} not found in plan`,
          module: task?.module || 'cross_module' as ModuleType,
          duration: 0,
        }
      }

      // Check dependencies — if any dep failed, skip this task
      const depsMet = task.dependsOn.every(depId => {
        const dep = allResults[depId]
        return dep && dep.status === 'done'
      })

      if (!depsMet) {
        const failedDeps = task.dependsOn.filter(depId => {
          const dep = allResults[depId]
          return !dep || dep.status !== 'done'
        })
        return {
          taskId,
          taskType: task.type,
          status: 'skipped' as const,
          summary: `Skipped — dependency failed: ${failedDeps.join(', ')}`,
          module: task.module,
          duration: 0,
        }
      }

      if (task.type === 'tool' && task.tool) {
        // Direct tool execution — no LLM needed
        return executeDirectTool(task, allResults)
      } else {
        // Sub-agent execution — LLM with thinking
        subAgentCalls++
        return executeSubAgent(zai, task, allResults, conversationHistory, onProgress)
      }
    })

    // Promise.allSettled — partial success support
    const settled = await Promise.allSettled(roundPromises)

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]
      if (result.status === 'fulfilled') {
        allResults[result.value.taskId] = result.value
      } else {
        // Promise itself rejected (shouldn't happen with our error handling)
        const taskId = round[i]
        allResults[taskId] = {
          taskId,
          taskType: 'tool',
          status: 'failed',
          error: result.reason instanceof Error ? result.reason.message : 'Unknown',
          summary: `Task crashed: ${result.reason}`,
          module: 'cross_module',
          duration: 0,
        }
      }
    }
  }

  return {
    results: Object.values(allResults),
    subAgentCalls,
  }
}