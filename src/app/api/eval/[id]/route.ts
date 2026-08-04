import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase-db'

// ─── GET — Single eval run with full results ─────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { data: run } = await supabase
      .from('EvalRun')
      .select('*')
      .eq('id', id)
      .single()

    if (!run) {
      return new Response(
        JSON.stringify({ error: 'Eval run not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { data: results } = await supabase
      .from('EvalResult')
      .select('*')
      .eq('evalRunId', id)
      .order('createdAt', { ascending: true })

    const formattedResults = (results || []).map(r => ({
      id: r.id,
      testId: r.testId,
      query: r.query,
      category: r.category,
      difficulty: r.difficulty,
      expectedTools: JSON.parse(r.expectedTools || '[]'),
      actualTools: JSON.parse(r.actualTools || '[]'),
      toolAccuracy: r.toolAccuracy,
      partialAccuracy: r.partialAccuracy,
      response: r.response,
      latencyMs: r.latencyMs,
      error: r.error,
    }))

    return new Response(JSON.stringify({
      id: run.id,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      version: run.version,
      totalTests: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      errors: run.errors,
      accuracy: run.accuracy,
      avgLatencyMs: run.avgLatencyMs,
      results: formattedResults,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Eval API] GET /:id error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch eval run' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
