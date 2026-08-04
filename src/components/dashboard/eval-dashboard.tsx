'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FlaskConical,
  Play,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  History,
  BarChart3,
  Zap,
  Target,
  Filter,
  Loader2,
  ExternalLink,
  CircleDot,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { EvalRunResult, EvalSingleResult, EvalProgress } from '@/lib/eval/eval-runner'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PastRun {
  id: string
  startedAt: string
  completedAt: string
  totalTests: number
  passed: number
  failed: number
  errors: number
  accuracy: number
  avgLatencyMs: number
  results?: EvalSingleResult[]
  categoryBreakdown?: EvalRunResult['categoryBreakdown']
  difficultyBreakdown?: EvalRunResult['difficultyBreakdown']
}

type FilterStatus = 'all' | 'passed' | 'failed' | 'error'

const ALL_CATEGORIES = [
  'all',
  'orders',
  'inventory',
  'cost-sheets',
  'production',
  'finance',
  'gst',
  'predictive',
  'dispatch',
  'customers-suppliers',
  'compound',
  'general',
  'scheduled',
  'quality',
  'samples',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Saare Categories',
  orders: 'Orders',
  inventory: 'Inventory',
  'cost-sheets': 'Cost Sheets',
  production: 'Production',
  finance: 'Finance',
  gst: 'GST',
  predictive: 'Predictive',
  dispatch: 'Dispatch',
  'customers-suppliers': 'Customers / Suppliers',
  compound: 'Compound (Multi-Tool)',
  general: 'General',
  scheduled: 'Scheduled Reports',
  quality: 'Quality',
  samples: 'Samples',
}

const QUICK_SMOKE_TEST_IDS = ['ORD-001', 'PRD-001', 'FIN-001', 'GST-001', 'CMP-001'] as const

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  hard: 'text-rose-600 dark:text-rose-400',
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getAccuracyColor(pct: number): string {
  if (pct > 80) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getAccuracyBg(pct: number): string {
  if (pct > 80) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-rose-500'
}

function getAccuracyRing(pct: number): string {
  if (pct > 80) return 'ring-emerald-500/20'
  if (pct >= 50) return 'ring-amber-500/20'
  return 'ring-rose-500/20'
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = (ms / 1000).toFixed(1)
  return `${secs}s`
}

function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(str: string, max = 40): string {
  return str.length > max ? str.substring(0, max) + '…' : str
}

function getResultStatus(r: EvalSingleResult): 'passed' | 'failed' | 'error' {
  if (r.error) return 'error'
  return r.toolAccuracy ? 'passed' : 'failed'
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EvalDashboard() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [progress, setProgress] = useState<EvalProgress | null>(null)
  const [currentRun, setCurrentRun] = useState<EvalRunResult | null>(null)
  const [pastRuns, setPastRuns] = useState<PastRun[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedTest, setExpandedTest] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [selectedPastRun, setSelectedPastRun] = useState<PastRun | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [liveResults, setLiveResults] = useState<EvalSingleResult[]>([])

  // ── Derived data ──────────────────────────────────────────────────────────
  const displayRun = selectedPastRun ?? currentRun

  const allResults = displayRun?.results ?? liveResults

  const filteredResults = allResults.filter(r => {
    if (selectedCategory !== 'all' && r.category !== selectedCategory) return false
    if (filterStatus !== 'all' && getResultStatus(r) !== filterStatus) return false
    return true
  })

  const overallAccuracy = displayRun
    ? Math.round((displayRun.accuracy ?? 0) * 100)
    : 0
  const passedCount = displayRun?.passed ?? 0
  const failedCount = displayRun?.failed ?? 0
  const errorCount = displayRun?.errors ?? 0
  const totalTests = displayRun?.totalTests ?? 0
  const avgLatency = displayRun?.avgLatencyMs ?? 0

  // Compute breakdowns from results if not present (e.g. when viewing past runs from DB)
  const categoryBreakdown = useMemo(() => {
    if (displayRun?.categoryBreakdown && Object.keys(displayRun.categoryBreakdown).length > 0) {
      return displayRun.categoryBreakdown
    }
    const map: Record<string, { total: number; passed: number; accuracy: number; avgLatencyMs: number }> = {}
    for (const r of allResults) {
      if (!map[r.category]) map[r.category] = { total: 0, passed: 0, accuracy: 0, avgLatencyMs: 0 }
      const b = map[r.category]
      b.total++
      if (!r.error && r.toolAccuracy) b.passed++
      b.accuracy = b.total > 0 ? b.passed / b.total : 0
    }
    return map
  }, [displayRun?.categoryBreakdown, allResults])

  const difficultyBreakdown = useMemo(() => {
    if (displayRun?.difficultyBreakdown && Object.keys(displayRun.difficultyBreakdown).length > 0) {
      return displayRun.difficultyBreakdown
    }
    const map: Record<string, { total: number; passed: number; accuracy: number }> = {}
    for (const r of allResults) {
      if (!map[r.difficulty]) map[r.difficulty] = { total: 0, passed: 0, accuracy: 0 }
      const b = map[r.difficulty]
      b.total++
      if (!r.error && r.toolAccuracy) b.passed++
      b.accuracy = b.total > 0 ? b.passed / b.total : 0
    }
    return map
  }, [displayRun?.difficultyBreakdown, allResults])

  // ── Fetch past runs ───────────────────────────────────────────────────────
  const fetchPastRuns = useCallback(async () => {
    try {
      setIsLoadingHistory(true)
      const res = await fetch('/api/eval')
      if (res.ok) {
        const data = await res.json()
        setPastRuns(Array.isArray(data) ? data : data.runs ?? [])
      }
    } catch {
      // silently fail — history is optional
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchPastRuns()
  }, [fetchPastRuns])

  // ── Shared SSE streaming logic ────────────────────────────────────────────
  const runEvalWithSSE = useCallback(async (body: Record<string, unknown>) => {
    if (isRunning) return
    setIsRunning(true)
    setProgress(null)
    setLiveResults([])
    setCurrentRun(null)
    setSelectedPastRun(null)

    try {
      const response = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok || !response.body) {
        throw new Error('Eval run failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr || jsonStr === '[DONE]') continue

          try {
            const event = JSON.parse(jsonStr)
            if (event.type === 'progress') {
              setProgress(event as unknown as EvalProgress)
            } else if (event.type === 'result') {
              setLiveResults(prev => [...prev, event as unknown as EvalSingleResult])
            } else if (event.type === 'done') {
              const runResult = event as unknown as EvalRunResult
              setCurrentRun(runResult)
              setProgress(null)
              fetchPastRuns()
            } else if (event.type === 'error') {
              setProgress(null)
              setErrorMsg(event.message || 'Eval run failed')
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch {
      // error starting run
    } finally {
      setIsRunning(false)
      setProgress(null)
    }
  }, [isRunning])

  // ── Start eval run ────────────────────────────────────────────────────────
  const startRun = async () => {
    await runEvalWithSSE({
      categories: selectedCategory !== 'all' ? [selectedCategory] : undefined,
    })
  }

  // ── Start quick smoke test ───────────────────────────────────────────────
  const startQuickRun = async () => {
    await runEvalWithSSE({ testIds: [...QUICK_SMOKE_TEST_IDS] })
  }

  // ── View past run ─────────────────────────────────────────────────────────
  const viewPastRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/eval/${runId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedPastRun(data)
        setCurrentRun(null)
      }
    } catch {
      // silently fail
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">

        {/* ── Progress Bar (shown during active run) ──────────────────────── */}
        {isRunning && progress && (
          <Card className="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Test {progress.current}/{progress.total} chal raha hai…
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <Progress
                value={(progress.current / progress.total) * 100}
                className="h-2.5 [&>[data-slot=progress-indicator]]:bg-emerald-500"
              />
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate max-w-md">
                  <span className="font-medium text-foreground">{progress.testId}</span>
                  {' — '}
                  {truncate(progress.query, 60)}
                </span>
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  {progress.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                  )}
                  <span>{formatLatency(progress.elapsedMs)}</span>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Top Bar ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <FlaskConical className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                AI Agent Eval Harness
                <span className="ml-2 inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground align-middle">
                  v6.3
                </span>
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground ml-[2.875rem]">
              Automated accuracy testing for Dhanya OS Agent
            </p>
          </div>
          <div className="flex items-center gap-3 ml-[2.875rem] sm:ml-0">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={startQuickRun}
                  disabled={isRunning}
                  size="sm"
                  className="gap-1.5 text-xs border-border/60"
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  Quick Test
                </Button>
              </TooltipTrigger>
              <TooltipContent>Quick smoke test with 5 representative cases</TooltipContent>
            </Tooltip>
            <Button
              onClick={startRun}
              disabled={isRunning}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  Naya Run Shuru Karo
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ── Quick Category Pills ───────────────────────────────────────── */}
        <div className="max-h-28 overflow-y-auto -mx-1 px-1">
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map(cat => {
              const isActive = selectedCategory === cat
              const catData = categoryBreakdown[cat]
              const catPct = catData ? Math.round(catData.accuracy * 100) : null
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                  {catPct !== null && (
                    <span className={`text-[10px] font-semibold tabular-nums ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : getAccuracyColor(catPct)
                    }`}>
                      {catPct}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Stats Cards Row ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Overall Accuracy */}
          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Overall Accuracy
                </p>
                <Target className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${getAccuracyColor(overallAccuracy)}`}>
                  {displayRun ? overallAccuracy : '—'}
                </span>
                {displayRun && <span className="text-sm text-muted-foreground">%</span>}
              </div>
              {displayRun && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getAccuracyBg(overallAccuracy)}`}
                    style={{ width: `${overallAccuracy}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tests Passed/Failed */}
          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tests Passed / Failed
                </p>
                <Zap className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                  {displayRun ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400">{passedCount}</span>
                      <span className="text-lg text-muted-foreground font-normal">/</span>
                      <span className="text-lg text-foreground">{totalTests}</span>
                    </>
                  ) : '—'}
                </span>
              </div>
              {displayRun && totalTests > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {passedCount} pass
                  </span>
                  {failedCount > 0 && (
                    <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                      <XCircle className="h-3 w-3" />
                      {failedCount} fail
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      {errorCount} error
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Avg Latency */}
          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Avg Latency
                </p>
                <Clock className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                  {displayRun ? (
                    avgLatency >= 1000
                      ? (avgLatency / 1000).toFixed(1)
                      : avgLatency
                  ) : '—'}
                </span>
                {displayRun && (
                  <span className="text-sm text-muted-foreground">
                    {avgLatency >= 1000 ? 's' : 'ms'}
                  </span>
                )}
              </div>
              {displayRun && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Avg per test: {formatLatency(avgLatency)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Total Runs */}
          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Runs
                </p>
                <History className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                  {isLoadingHistory ? (
                    <Skeleton className="h-9 w-12" />
                  ) : (
                    pastRuns.length
                  )}
                </span>
                <span className="text-sm text-muted-foreground">runs</span>
              </div>
              {pastRuns.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last: {formatDate(pastRuns[0].startedAt)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Category Breakdown ─────────────────────────────────────────── */}
        {displayRun && Object.keys(categoryBreakdown).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">
                  Category-wise Accuracy
                </CardTitle>
              </div>
              <CardDescription>
                Har category ka performance breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {Object.entries(categoryBreakdown)
                  .sort(([, a], [, b]) => b.accuracy - a.accuracy)
                  .map(([cat, data]) => {
                    const pct = Math.round(data.accuracy * 100)
                    return (
                      <div key={cat} className="group">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-foreground">
                            {CATEGORY_LABELS[cat] ?? cat}
                          </span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>
                              {data.passed}/{data.total} pass
                            </span>
                            <span className={getAccuracyColor(pct)}>
                              {pct}%
                            </span>
                            <span className="hidden sm:inline">
                              {formatLatency(data.avgLatencyMs)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${getAccuracyBg(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Difficulty Breakdown ───────────────────────────────────────── */}
        {displayRun && Object.keys(difficultyBreakdown).length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {(['easy', 'medium', 'hard'] as const).map(diff => {
              const data = difficultyBreakdown[diff]
              if (!data) return null
              const pct = Math.round(data.accuracy * 100)
              return (
                <Card key={diff} className="relative overflow-hidden">
                  <CardContent className="p-4 sm:p-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {DIFFICULTY_LABELS[diff] ?? diff}
                    </p>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${DIFFICULTY_COLORS[diff]}`}>
                        {pct}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.passed}/{data.total} tests passed
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          diff === 'easy'
                            ? 'bg-emerald-500'
                            : diff === 'medium'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* ── Test Results Table ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <CircleDot className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">
                  Test Results
                </CardTitle>
                {allResults.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {filteredResults.length} / {allResults.length}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={filterStatus}
                  onValueChange={(v) => setFilterStatus(v as FilterStatus)}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="passed">Passed ✅</SelectItem>
                    <SelectItem value="failed">Failed ❌</SelectItem>
                    <SelectItem value="error">Error ⚠️</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {allResults.length === 0 && !isRunning ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/60 mb-5">
                  <FlaskConical className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-base font-semibold text-foreground">Start your first eval run</p>
                <p className="text-sm mt-1.5 text-center max-w-xs">
                  Start your first eval run to measure agent accuracy
                </p>
                <div className="flex items-center gap-3 mt-5">
                  <Button
                    onClick={startRun}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run Full Eval (56 tests)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={startQuickRun}
                    size="sm"
                    className="gap-1.5 border-border/60"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Quick Smoke Test (5 tests)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10" />
                      <TableHead className="w-[80px] text-xs">ID</TableHead>
                      <TableHead className="text-xs">Query</TableHead>
                      <TableHead className="hidden md:table-cell text-xs">Category</TableHead>
                      <TableHead className="hidden lg:table-cell text-xs">Expected</TableHead>
                      <TableHead className="hidden lg:table-cell text-xs">Actual</TableHead>
                      <TableHead className="w-[80px] text-xs text-center">Status</TableHead>
                      <TableHead className="w-[80px] text-xs text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                          Is filter ke saath koi results nahi mile
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredResults.map(r => {
                      const status = getResultStatus(r)
                      const isExpanded = expandedTest === r.testId
                      return (
                        <Collapsible
                          key={r.testId}
                          open={isExpanded}
                          onOpenChange={(open) =>
                            setExpandedTest(open ? r.testId : null)
                          }
                        >
                          <TableRow
                            className="cursor-pointer group"
                            onClick={() =>
                              setExpandedTest(isExpanded ? null : r.testId)
                            }
                          >
                            <TableCell className="w-10 px-3">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {r.testId}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] sm:max-w-[300px] truncate">
                              {r.query}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className="text-xs font-normal">
                                {CATEGORY_LABELS[r.category] ?? r.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {r.expectedTools.map(t => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {r.actualTools.map(t => (
                                  <span
                                    key={t}
                                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
                                      r.expectedTools.includes(t)
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                    }`}
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {status === 'passed' && (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              )}
                              {status === 'failed' && (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-rose-100 dark:bg-rose-900/30">
                                  <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                </span>
                              )}
                              {status === 'error' && (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30">
                                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                              {formatLatency(r.latencyMs)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={8} className="p-0">
                                <CollapsibleContent>
                                  <div className="px-4 sm:px-8 py-4 bg-muted/30 border-b border-border space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">
                                          Category
                                        </span>
                                        <p className="mt-0.5">{CATEGORY_LABELS[r.category] ?? r.category}</p>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">
                                          Difficulty
                                        </span>
                                        <p className={`mt-0.5 ${DIFFICULTY_COLORS[r.difficulty] ?? ''}`}>
                                          {DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">
                                          Latency
                                        </span>
                                        <p className="mt-0.5 tabular-nums">{formatLatency(r.latencyMs)}</p>
                                      </div>
                                    </div>

                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">
                                        Tool Match
                                      </span>
                                      <div className="mt-1 flex items-center gap-2 text-sm">
                                        <span className="text-muted-foreground">Expected:</span>
                                        <div className="flex flex-wrap gap-1">
                                          {r.expectedTools.map(t => (
                                            <code
                                              key={t}
                                              className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                                            >
                                              {t}
                                            </code>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="mt-1 flex items-center gap-2 text-sm">
                                        <span className="text-muted-foreground">Actual:</span>
                                        <div className="flex flex-wrap gap-1">
                                          {r.actualTools.map(t => {
                                            const isMatch = r.expectedTools.includes(t)
                                            return (
                                              <code
                                                key={t}
                                                className={`rounded px-1.5 py-0.5 text-xs font-mono ${
                                                  isMatch
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                                }`}
                                              >
                                                {t}
                                              </code>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    </div>

                                    {r.toolCallsLog && r.toolCallsLog.length > 0 && (
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">
                                          Tool Call Log
                                        </span>
                                        <div className="mt-1.5 space-y-1.5">
                                          {r.toolCallsLog.map((log, i) => (
                                            <div
                                              key={i}
                                              className="flex items-center gap-2 text-xs bg-background rounded-md px-3 py-2 border"
                                            >
                                              {log.success ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                              ) : (
                                                <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                              )}
                                              <span className="font-mono font-medium">{log.tool}</span>
                                              <Separator orientation="vertical" className="h-3" />
                                              <span className="text-muted-foreground truncate">
                                                {log.summary}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">
                                        Agent Response
                                      </span>
                                      <div className="mt-1 rounded-lg bg-background border p-3 text-sm text-foreground whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                                        {r.error ? (
                                          <span className="text-rose-600 dark:text-rose-400">
                                            Error: {r.error}
                                          </span>
                                        ) : r.response ? (
                                          r.response
                                        ) : (
                                          <span className="text-muted-foreground italic">
                                            No response captured
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {r.partialAccuracy !== undefined && r.partialAccuracy < 1 && (
                                      <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md px-3 py-2 border border-amber-200 dark:border-amber-900/40">
                                        <strong>Partial Match:</strong> {Math.round(r.partialAccuracy * 100)}% of expected tools were called correctly
                                      </div>
                                    )}
                                  </div>
                                </CollapsibleContent>
                              </TableCell>
                            </TableRow>
                          )}
                        </Collapsible>
                      )
                    })}
                    {isRunning && liveResults.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-3">
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Aur tests chal rahe hain…
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Run History ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">
                Run History
              </CardTitle>
              {pastRuns.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pastRuns.length}
                </Badge>
              )}
            </div>
            <CardDescription>
              Pichle eval runs ka record
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : pastRuns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">Abhi koi history nahi</p>
                <p className="text-xs mt-1">Pehla eval run karo — yahan results dikhenge</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pastRuns.map((run, idx) => {
                  const pct = Math.round(run.accuracy * 100)
                  const isSelected = selectedPastRun?.id === run.id
                  return (
                    <div
                      key={run.id}
                      onClick={() => viewPastRun(run.id)}
                      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            Run {run.id.slice(-8)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(run.startedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6 text-sm pl-11 sm:pl-0">
                        <div className="text-right flex items-center gap-1.5">
                          <span className={`font-bold tabular-nums ${getAccuracyColor(pct)}`}>
                            {pct}%
                          </span>
                          {idx === 0 && pastRuns.length >= 2 && (() => {
                            const prevPct = Math.round(pastRuns[1].accuracy * 100)
                            const delta = pct - prevPct
                            if (delta === 0) return null
                            const isUp = delta > 0
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {isUp ? (
                                      <ArrowUpRight className="h-3 w-3" />
                                    ) : (
                                      <ArrowDownRight className="h-3 w-3" />
                                    )}
                                    {isUp ? '+' : ''}{delta}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>vs previous run ({prevPct}%)</TooltipContent>
                              </Tooltip>
                            )
                          })()}
                          <span className="text-xs text-muted-foreground ml-0.5">accuracy</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium tabular-nums">{run.totalTests}</span>
                          <span className="text-xs text-muted-foreground ml-1">tests</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium tabular-nums">
                            {formatDuration(run.startedAt, run.completedAt)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">duration</span>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Sticky Footer ───────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-border bg-background/60 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>AI Agent Eval Harness v1.0</span>
          <span>Dhanya OS · Elysé by Dhanya</span>
        </div>
      </footer>
    </div>
  )
}