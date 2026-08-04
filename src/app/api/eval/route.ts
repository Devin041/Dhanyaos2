import { NextRequest } from 'next/server'
import { runEval } from '@/lib/eval/eval-runner'
import { EVAL_TEST_CASES } from '@/lib/eval/eval-test-cases'
import { supabase } from '@/lib/supabase-db'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalRequestBody {
  testIds?: string[]
  categories?: string[]
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// ─── GET — List past eval runs ────────────────────────────────────────────────

export async function GET() {
  try {
    const { data: runs } = await supabase
      .from('EvalRun')
      .select('*')
      .order('startedAt', { ascending: false })
      .limit(20)

    // Get result counts for each run
    const formatted = await Promise.all((runs || []).map(async (run) => {
      const { count } = await supabase
        .from('EvalResult')
        .select('*', { count: 'exact', head: true })
        .eq('evalRunId', run.id)
      return {
        ...run,
        resultsCount: count || 0,
      }
    }))

    return new Response(JSON.stringify({ runs: formatted }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Eval API] GET error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch eval runs' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

// ─── POST — Start a new eval run with SSE streaming ──────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: EvalRequestBody = await request.json()
    const { testIds, categories } = body

    let resolvedTestIds: string[] | undefined

    if (testIds && testIds.length > 0) {
      resolvedTestIds = testIds
    } else if (categories && categories.length > 0) {
      resolvedTestIds = EVAL_TEST_CASES
        .filter(tc => categories.includes(tc.category))
        .map(tc => tc.id)
      if (resolvedTestIds.length === 0) {
        return new Response(
          JSON.stringify({ error: `No test cases found for categories: ${categories.join(', ')}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    const encoder = new TextEncoder()

    const streamCtrl = new ReadableStream({
      async start(controller) {
        try {
          const runResult = await runEval(resolvedTestIds, (progress) => {
            controller.enqueue(encoder.encode(sse({
              type: 'progress',
              current: progress.current,
              total: progress.total,
              testId: progress.testId,
              query: progress.query,
              passed: progress.passed,
              elapsedMs: progress.elapsedMs,
            })))
          })

          // ── Save run to Supabase ────────────────────────────────────────
          const now = new Date().toISOString()
          const { data: savedRun, error: runError } = await supabase
            .from('EvalRun')
            .insert({
              id: runResult.id,
              startedAt: new Date(runResult.startedAt).toISOString(),
              completedAt: new Date(runResult.completedAt).toISOString(),
              version: '6.4',
              totalTests: runResult.totalTests,
              passed: runResult.passed,
              failed: runResult.failed,
              errors: runResult.errors,
              accuracy: runResult.accuracy,
              avgLatencyMs: runResult.avgLatencyMs,
              createdAt: now,
            })
            .select()
            .single()

          // ── Save results ────────────────────────────────────────────────
          if (runResult.results.length > 0) {
            const resultRows = runResult.results.map(r => ({
              evalRunId: runResult.id,
              testId: r.testId,
              query: r.query,
              category: r.category,
              difficulty: r.difficulty,
              expectedTools: JSON.stringify(r.expectedTools),
              actualTools: JSON.stringify(r.actualTools),
              toolAccuracy: r.toolAccuracy,
              partialAccuracy: r.partialAccuracy,
              response: r.response,
              latencyMs: r.latencyMs,
              error: r.error,
              createdAt: now,
            }))
            await supabase.from('EvalResult').insert(resultRows)
          }

          // ── Stream final done event ────────────────────────────────────
          controller.enqueue(encoder.encode(sse({
            type: 'done',
            runId: savedRun?.id || runResult.id,
            startedAt: new Date(runResult.startedAt).toISOString(),
            completedAt: new Date(runResult.completedAt).toISOString(),
            totalTests: runResult.totalTests,
            passed: runResult.passed,
            failed: runResult.failed,
            errors: runResult.errors,
            accuracy: runResult.accuracy,
            avgLatencyMs: runResult.avgLatencyMs,
            categoryBreakdown: runResult.categoryBreakdown,
            difficultyBreakdown: runResult.difficultyBreakdown,
          })))

          controller.close()
        } catch (err) {
          console.error('[Eval API] Run error:', err)
          controller.enqueue(encoder.encode(sse({
            type: 'error',
            message: err instanceof Error ? err.message : 'Eval run failed',
          })))
          controller.close()
        }
      },
    })

    return new Response(streamCtrl, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Eval API] POST error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to start eval run' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
