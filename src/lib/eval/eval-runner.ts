// ─── Dhanya OS Eval — Runner Engine v2 ────────────────────────────────────────
// Runs evaluation test cases against the orchestrate() function,
// measures tool-call accuracy, latency, and compiles breakdowns.
// v2: Added retry logic for ZAI SDK rate limiting, throttled test detection.

import { orchestrate } from '@/lib/agent/orchestrator'
import { EVAL_TEST_CASES, type EvalTestCase } from './eval-test-cases'

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvalSingleResult {
  testId: string
  query: string
  category: string
  difficulty: string
  expectedTools: string[]
  actualTools: string[]
  toolAccuracy: boolean       // true if ALL expectedTools found in actualTools
  partialAccuracy: number     // 0-1, fraction of expected tools found
  response: string
  latencyMs: number
  error?: string
  retries?: number            // how many retries were needed
  toolCallsLog: Array<{ tool: string; success: boolean; summary: string }>
}

export interface EvalRunResult {
  id: string
  startedAt: string
  completedAt: string
  totalTests: number
  passed: number
  failed: number
  errors: number
  accuracy: number            // passed / totalTests
  avgLatencyMs: number
  results: EvalSingleResult[]
  categoryBreakdown: Record<string, { total: number; passed: number; accuracy: number; avgLatencyMs: number }>
  difficultyBreakdown: Record<string, { total: number; passed: number; accuracy: number }>
}

export interface EvalProgress {
  current: number
  total: number
  testId: string
  query: string
  passed: boolean
  elapsedMs: number
  retried?: boolean           // true if this test was retried
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_DELAY_MS = 8000         // Delay between tests (8s to avoid ZAI SDK rate limits)
const RETRY_DELAY_MS = 25000       // Delay before retry (25s for 429 reset)
const MAX_RETRIES = 2              // Max retries per test
const THROTTLE_LATENCY_MS = 200    // If a test completes in < this ms, it was likely throttled

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateRunId(): string {
  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Check whether every tool in `expectedTools` appears at least once in `actualTools`.
 */
function isFullMatch(expectedTools: string[] | undefined, actualTools: string[]): boolean {
  if (!expectedTools || expectedTools.length === 0) return true
  return expectedTools.every(et => actualTools.includes(et))
}

/**
 * Fraction of expectedTools found in actualTools (0–1).
 */
function partialMatch(expectedTools: string[] | undefined, actualTools: string[]): number {
  if (!expectedTools || expectedTools.length === 0) return 1
  const matched = expectedTools.filter(et => actualTools.includes(et)).length
  return matched / expectedTools.length
}

/**
 * If `expectedToolsAnyOf` is set, at least one tool from that array must be
 * present in actualTools. This is an *additional* check on top of expectedTools.
 */
function checkAnyOf(anyOf: string[] | undefined, actualTools: string[]): boolean {
  if (!anyOf || anyOf.length === 0) return true
  return anyOf.some(t => actualTools.includes(t))
}

/**
 * Detect if a result looks like it was throttled by the ZAI SDK.
 * Signs: no tool calls, response is "AI se response nahi aaya.", very low latency.
 */
function isThrottled(result: { response: string; actualTools: string[]; latencyMs: number }): boolean {
  return result.actualTools.length === 0
    && result.latencyMs < THROTTLE_LATENCY_MS
    && (result.response.includes('nahi aaya') || result.response.includes('Processing me error'))
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a single test case with retry logic for rate limiting.
 */
async function runSingleTestCase(
  testCase: EvalTestCase,
): Promise<EvalSingleResult> {
  let lastResult: EvalSingleResult | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = performance.now()
    let actualTools: string[] = []
    let response = ''
    let toolCallsLog: EvalSingleResult['toolCallsLog'] = []
    let error: string | undefined

    try {
      const result = await orchestrate(testCase.query, [])
      actualTools = result.toolCallsLog.map(t => t.tool)
      response = result.response
      toolCallsLog = result.toolCallsLog
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }

    const latencyMs = Math.round(performance.now() - start)
    const singleResult: EvalSingleResult = {
      testId: testCase.id,
      query: testCase.query,
      category: testCase.category,
      difficulty: testCase.difficulty,
      expectedTools: testCase.expectedTools ?? [],
      actualTools,
      toolAccuracy: isFullMatch(testCase.expectedTools, actualTools)
        && checkAnyOf(testCase.expectedToolsAnyOf, actualTools),
      partialAccuracy: partialMatch(testCase.expectedTools, actualTools),
      response,
      latencyMs,
      error,
      retries: attempt,
      toolCallsLog,
    }

    // If throttled and we have retries left, wait longer and retry
    if (isThrottled(singleResult) && attempt < MAX_RETRIES) {
      console.log(`[Eval] ${testCase.id} throttled (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAY_MS / 1000}s...`)
      await delay(RETRY_DELAY_MS)
      lastResult = singleResult
      continue
    }

    return singleResult
  }

  // All retries exhausted, return the last result
  return lastResult!
}

/**
 * Run all (or a subset of) eval test cases and return the compiled result.
 *
 * @param testIds  Array of test IDs to run. If empty/undefined, runs ALL cases.
 * @param onProgress  Optional callback invoked after each test completes.
 */
export async function runEval(
  testIds?: string[],
  onProgress?: (progress: EvalProgress) => void,
): Promise<EvalRunResult> {
  const startedAt = new Date().toISOString()
  const runId = generateRunId()

  // Resolve which test cases to run
  const casesToRun = testIds && testIds.length > 0
    ? EVAL_TEST_CASES.filter(tc => testIds.includes(tc.id))
    : [...EVAL_TEST_CASES]

  const total = casesToRun.length
  const results: EvalSingleResult[] = []

  for (let i = 0; i < casesToRun.length; i++) {
    const tc = casesToRun[i]
    const testStart = performance.now()

    const singleResult = await runSingleTestCase(tc)
    results.push(singleResult)

    const elapsedMs = Math.round(performance.now() - testStart)

    // Report progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        testId: tc.id,
        query: tc.query,
        passed: singleResult.error ? false : singleResult.toolAccuracy,
        elapsedMs,
        retried: (singleResult.retries ?? 0) > 0,
      })
    }

    // Adaptive delay: if we got throttled, use longer delay for next test
    const nextDelay = isThrottled(singleResult)
      ? RETRY_DELAY_MS
      : BASE_DELAY_MS

    // Delay between calls to avoid rate limiting (skip after the last test)
    if (i < casesToRun.length - 1) {
      await delay(nextDelay)
    }
  }

  const completedAt = new Date().toISOString()

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const passed = results.filter(r => !r.error && r.toolAccuracy).length
  const errors = results.filter(r => !!r.error).length
  const failed = total - passed - errors
  const accuracy = total > 0 ? passed / total : 0
  const avgLatencyMs = total > 0
    ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / total)
    : 0

  // ── Category breakdown ───────────────────────────────────────────────────
  const categoryMap: Record<string, { total: number; passed: number; totalLatency: number }> = {}
  for (const r of results) {
    if (!categoryMap[r.category]) {
      categoryMap[r.category] = { total: 0, passed: 0, totalLatency: 0 }
    }
    const bucket = categoryMap[r.category]
    bucket.total++
    if (!r.error && r.toolAccuracy) bucket.passed++
    bucket.totalLatency += r.latencyMs
  }

  const categoryBreakdown: EvalRunResult['categoryBreakdown'] = {}
  for (const [cat, data] of Object.entries(categoryMap)) {
    categoryBreakdown[cat] = {
      total: data.total,
      passed: data.passed,
      accuracy: data.total > 0 ? data.passed / data.total : 0,
      avgLatencyMs: Math.round(data.totalLatency / data.total),
    }
  }

  // ── Difficulty breakdown ─────────────────────────────────────────────────
  const difficultyMap: Record<string, { total: number; passed: number }> = {}
  for (const r of results) {
    if (!difficultyMap[r.difficulty]) {
      difficultyMap[r.difficulty] = { total: 0, passed: 0 }
    }
    const bucket = difficultyMap[r.difficulty]
    bucket.total++
    if (!r.error && r.toolAccuracy) bucket.passed++
  }

  const difficultyBreakdown: EvalRunResult['difficultyBreakdown'] = {}
  for (const [diff, data] of Object.entries(difficultyMap)) {
    difficultyBreakdown[diff] = {
      total: data.total,
      passed: data.passed,
      accuracy: data.total > 0 ? data.passed / data.total : 0,
    }
  }

  return {
    id: runId,
    startedAt,
    completedAt,
    totalTests: total,
    passed,
    failed,
    errors,
    accuracy,
    avgLatencyMs,
    results,
    categoryBreakdown,
    difficultyBreakdown,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Same as `runEval` but always requires an `onProgress` callback for
 * real-time streaming of progress to the frontend.
 *
 * @param onProgress  Callback invoked after each test case completes.
 * @param testIds     Optional subset of test IDs. Runs all if omitted.
 */
export async function runEvalStreaming(
  onProgress: (progress: EvalProgress) => void,
  testIds?: string[],
): Promise<EvalRunResult> {
  return runEval(testIds, onProgress)
}