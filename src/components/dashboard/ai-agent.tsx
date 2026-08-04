'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AgentRole } from '@/lib/agent/agent-roles'
import {
  Send,
  Square,
  Plus,
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Bot,
  User,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  Database,
  Search,
  ArrowLeft,
  CircleDot,
  CheckCircle2,
  XCircle,
  Wrench,
  Shield,
  AlertTriangle,
  Clock,
  ChevronUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ThoughtStep {
  id: string
  type: 'thinking' | 'tool_call' | 'tool_result'
  content: string
  tool?: string
  success?: boolean
  timestamp: number
}

interface PendingConfirmationData {
  confirmationId: string
  toolName: string
  toolLabel: string
  toolParams: Record<string, unknown>
  assistantMsgId: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thoughtProcess?: ThoughtStep[]
  factCard?: FactCardData
  timestamp: number
  isStreaming?: boolean
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

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

interface FactNumber {
  label: string
  value: number
  unit: string
  isStale: boolean
}

interface FactCardData {
  facts: string[]
  numbers: FactNumber[]
  dataFreshness: 'live' | 'stale' | 'empty'
  toolsUsed: string[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const genId = () => `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
const STORAGE_KEY = 'dhanya-agent-conversations'

function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveConversations(convs: Conversation[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, 100)))
  } catch { /* storage full */ }
}

function truncateTitle(msg: string, max = 36): string {
  return msg.length > max ? msg.substring(0, max) + '…' : msg
}

function groupByDate(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekAgo = today - 7 * 86400000

  const groups: Record<string, Conversation[]> = {}
  for (const c of convs) {
    let label: string
    if (c.updatedAt >= today) label = 'Today'
    else if (c.updatedAt >= yesterday) label = 'Yesterday'
    else if (c.updatedAt >= weekAgo) label = 'Previous 7 Days'
    else label = 'Older'
    ;(groups[label] ??= []).push(c)
  }
  return ['Today', 'Yesterday', 'Previous 7 Days', 'Older']
    .filter(l => groups[l]?.length)
    .map(l => ({ label: l, items: groups[l] }))
}

const SUGGESTED_QUERIES = [
  'Aaj ka business summary do',
  'Pending orders dikhao',
  'Low stock fabric kaunsa hai?',
  'Costing se order banao + aaj ka report',
  'Cash balance kitna hai?',
  'Overdue orders check karo',
]

const fmtINR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const TOOL_ICONS: Record<string, string> = {
  get_orders: '📦', get_order_detail: '📋', get_inventory: '🏪',
  get_cost_sheets: '💰', get_cost_sheet_detail: '💰', get_production_jobs: '🏭',
  get_customers: '👥', get_suppliers: '🚚', get_dispatches: '📤',
  get_purchase_orders: '📝', get_transactions: '🏦', get_daily_summary: '📊',
  get_overdue_orders: '⚠️', get_quotations: '📑', get_employees: '👷',
  get_grn_notes: '📥', get_samples: '🧵', get_quality_checks: '✅',
  get_returns: '↩️', search_all: '🔍',
  create_cost_sheet: '➕', create_quotation: '➕',
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

const msgVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

const thoughtVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Thought Step ────────────────────────────────────────────────────────────

function ThoughtStepItem({ step }: { step: ThoughtStep }) {
  return (
    <motion.div
      variants={thoughtVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex items-start gap-2 text-xs text-muted-foreground py-0.5"
    >
      {step.type === 'thinking' && (
        <>
          <Sparkles className="h-3 w-3 mt-0.5 text-amber-400 shrink-0" />
          <span className="italic">{step.content}</span>
        </>
      )}
      {step.type === 'tool_call' && (
        <>
          <Wrench className="h-3 w-3 mt-0.5 text-blue-400 shrink-0 animate-pulse" />
          <span>
            <span className="font-medium text-foreground/70">{TOOL_ICONS[step.tool || ''] || '🔧'} {step.tool}</span>
            {' — '}{step.content}
          </span>
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        </>
      )}
      {step.type === 'tool_result' && (
        <>
          {step.success ? (
            <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="h-3 w-3 mt-0.5 text-red-400 shrink-0" />
          )}
          <span>
            <span className="font-medium text-foreground/70">{TOOL_ICONS[step.tool || ''] || '🔧'} {step.tool}</span>
            {' — '}{step.content}
          </span>
        </>
      )}
    </motion.div>
  )
}

// ─── Thought Process (collapsible) ───────────────────────────────────────────

function ThoughtProcess({ steps }: { steps: ThoughtStep[] }) {
  const [open, setOpen] = useState(true)
  if (steps.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground/70 transition-colors mb-1.5 group"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <CircleDot className="h-3 w-3 text-primary/60" />
        <span className="font-medium">Thought process</span>
        <span className="text-muted-foreground/60">({steps.length} steps)</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="ml-1 border-l-2 border-primary/15 pl-3 py-1.5 space-y-1">
              {steps.map(s => <ThoughtStepItem key={s.id} step={s} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Fact Card Panel (shows verified data from tools) ─────────────────────

function FactCardPanel({ data }: { data: FactCardData }) {
  const [expanded, setExpanded] = useState(false)
  if (!data || (data.facts.length === 0 && data.numbers.length === 0)) return null

  const freshnessColor = data.dataFreshness === 'live'
    ? 'text-emerald-600 dark:text-emerald-400'
    : data.dataFreshness === 'stale'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-orange-600 dark:text-orange-400'

  const freshnessBg = data.dataFreshness === 'live'
    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40'
    : data.dataFreshness === 'stale'
    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40'
    : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200/60 dark:border-orange-800/40'

  const freshnessIcon = data.dataFreshness === 'live'
    ? <CheckCircle2 className="h-3 w-3" />
    : data.dataFreshness === 'stale'
    ? <AlertTriangle className="h-3 w-3" />
    : <Clock className="h-3 w-3" />

  const freshnessLabel = data.dataFreshness === 'live'
    ? 'Live Data'
    : data.dataFreshness === 'stale'
    ? 'Stale Data'
    : 'No Data Found'

  // Show up to 4 key numbers, rest expandable
  const keyNumbers = data.numbers.filter(n => n.unit === 'INR' || n.value > 0).slice(0, 6)
  const extraNumbers = data.numbers.filter(n => n.unit === 'INR' || n.value > 0).slice(6)
  const displayFacts = data.facts.slice(0, expanded ? undefined : 4)

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-xl border bg-muted/30 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-xs font-semibold text-foreground/80">Data Card</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${freshnessBg} ${freshnessColor} flex items-center gap-1`}>
            {freshnessIcon} {freshnessLabel}
          </span>
        </div>
        {data.toolsUsed.length > 0 && (
          <span className="text-[10px] text-muted-foreground/50">
            {data.toolsUsed.length} tool{data.toolsUsed.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Numbers Grid */}
      {keyNumbers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border/30">
          {keyNumbers.map((n, i) => (
            <div key={i} className="bg-background/80 px-3 py-2">
              <p className="text-[10px] text-muted-foreground/70 leading-tight truncate">{n.label}</p>
              <p className="text-sm font-semibold text-foreground leading-tight mt-0.5">
                {n.unit === 'INR' ? fmtINR(n.value) : n.value.toLocaleString('en-IN')}
                <span className="text-[10px] font-normal text-muted-foreground/50 ml-1">
                  {n.unit === 'INR' ? '' : n.unit}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Facts */}
      {displayFacts.length > 0 && (
        <div className="px-3 py-2 border-t border-border/30">
          {displayFacts.map((f, i) => (
            <p key={i} className="text-[11px] text-foreground/70 leading-relaxed">
              {f}
            </p>
          ))}
        </div>
      )}

      {/* Expand toggle if truncated */}
      {(data.facts.length > 4 || extraNumbers.length > 0) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-1.5 text-[10px] text-muted-foreground/60 hover:text-foreground/70 border-t border-border/20 transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Show less' : `Show more (${data.facts.length - 4 + extraNumbers.length} more)`}
        </button>
      )}

      {/* Expanded extra numbers */}
      {expanded && extraNumbers.length > 0 && (
        <div className="grid grid-cols-2 gap-px bg-border/30 border-t border-border/30">
          {extraNumbers.map((n, i) => (
            <div key={i} className="bg-background/80 px-3 py-2">
              <p className="text-[10px] text-muted-foreground/70 leading-tight truncate">{n.label}</p>
              <p className="text-sm font-semibold text-foreground leading-tight mt-0.5">
                {n.unit === 'INR' ? fmtINR(n.value) : n.value.toLocaleString('en-IN')}
                </p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Chat Message ───────────────────────────────────────────────────────────

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      variants={msgVariants}
      initial="hidden"
      animate="visible"
      layout
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="shrink-0 mt-1">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? 'order-first' : ''}`}>
        {!isUser && message.thoughtProcess && message.thoughtProcess.length > 0 && (
          <ThoughtProcess steps={message.thoughtProcess} />
        )}

        {!isUser && message.factCard && (
          <FactCardPanel data={message.factCard} />
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted/60 text-foreground rounded-bl-md'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.isStreaming ? (
            <div className="flex items-center gap-2">
              <p className="whitespace-pre-wrap [&_p]:text-gray-900 dark:[&_p]:text-gray-100">{message.content}</p>
              <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse rounded-sm" />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none [&_p]:text-gray-900 dark:[&_p]:text-gray-100 [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100 [&_li]:text-gray-900 dark:[&_li]:text-gray-100 [&_td]:text-gray-900 dark:[&_td]:text-gray-100 [&_th]:text-gray-900 dark:[&_th]:text-gray-100 [&_code]:text-gray-900 dark:[&_code]:text-gray-100">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && !message.isStreaming && (
          <p className="text-[10px] text-muted-foreground/50 mt-1 ml-1">
            {new Date(message.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {isUser && (
        <div className="shrink-0 mt-1">
          <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center">
            <User className="h-4 w-4 text-foreground/70" />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ─── Welcome Screen ─────────────────────────────────────────────────────────

function WelcomeScreen({ onQueryClick, isMobile }: { onQueryClick: (q: string) => void; isMobile: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center flex-1 px-4 py-8"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"
      >
        <Bot className="h-8 w-8 text-primary" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-xl font-bold text-foreground mb-1"
      >
        Dhanya OS Agent
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-sm text-muted-foreground text-center max-w-md mb-8"
      >
        Aapka smart business assistant. Orders, stock, production, finance — sab kuch ek jagah.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg"
      >
        {SUGGESTED_QUERIES.map((q, i) => (
          <motion.button
            key={q}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + i * 0.05 }}
            onClick={() => onQueryClick(q)}
            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/50 hover:bg-muted/50 px-4 py-3 text-left text-sm text-foreground/80 hover:text-foreground transition-colors group"
          >
            <MessageSquare className="h-4 w-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
            <span className="truncate">{q}</span>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  )
}

// ─── Typing Indicator ───────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3"
    >
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Soch raha hu...</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Confirmation Card (Yes/No gate for write operations) ──────────────────

function ConfirmationCard({
  toolLabel,
  toolParams,
  onConfirm,
  onDecline,
  isConfirming,
}: {
  toolLabel: string
  toolParams: Record<string, unknown>
  onConfirm: () => void
  onDecline: () => void
  isConfirming: boolean
}) {
  // Show a human-readable preview of key params
  const paramEntries = Object.entries(toolParams).filter(
    ([key]) => !['confirmationId', 'conversationId'].includes(key)
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-2xl border-2 border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-100/60 dark:bg-amber-900/30 border-b border-amber-200/50 dark:border-amber-800/30">
        <div className="h-8 w-8 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
          <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Confirmation Required</p>
          <p className="text-xs text-amber-700/70 dark:text-amber-300/60 truncate">{toolLabel}</p>
        </div>
      </div>

      {/* Preview */}
      {paramEntries.length > 0 && (
        <div className="px-4 py-3 border-b border-amber-200/30 dark:border-amber-800/20">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
          <div className="space-y-1.5">
            {paramEntries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground/60 font-medium min-w-[100px] shrink-0 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}:
                </span>
                <span className="text-foreground/80 break-all">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 bg-background/50">
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9 gap-1.5"
          onClick={onConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {isConfirming ? 'Processing...' : 'Yes, Proceed'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-9 gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800/50 dark:hover:bg-red-950/30"
          onClick={onDecline}
          disabled={isConfirming}
        >
          <XCircle className="h-3.5 w-3.5" />
          No, Cancel
        </Button>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function AIAgent() {
  // ─── State ─────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmationData | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [activeRole, setActiveRole] = useState<AgentRole>('founder')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ─── Derived ───────────────────────────────────────────────────────────
  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConvId) || null,
    [conversations, activeConvId]
  )
  const messages = activeConversation?.messages || []
  const groupedConvs = useMemo(() => groupByDate(conversations), [conversations])

  // ─── Mobile detection ──────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ─── Load from localStorage ────────────────────────────────────────────
  useEffect(() => {
    const loaded = loadConversations()
    setConversations(loaded)
  }, [])

  // ─── Save to localStorage ──────────────────────────────────────────────
  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  // ─── Auto-scroll to bottom ─────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Focus input on mount ──────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // ─── Update conversation helper ────────────────────────────────────────
  const updateConversation = useCallback((convId: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => c.id === convId ? updater(c) : c))
  }, [])

  // ─── Create new conversation ───────────────────────────────────────────
  const createConversation = useCallback((firstMessage?: string) => {
    const id = genId()
    const conv: Conversation = {
      id,
      title: firstMessage ? truncateTitle(firstMessage) : 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setConversations(prev => [conv, ...prev])
    setActiveConvId(id)
    return id
  }, [])

  // ─── Delete conversation ───────────────────────────────────────────────
  const deleteConversation = useCallback((convId: string) => {
    setConversations(prev => prev.filter(c => c.id !== convId))
    if (activeConvId === convId) {
      setActiveConvId(null)
    }
  }, [activeConvId])

  // ─── Send message ──────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isGenerating) return

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    let convId = activeConvId
    if (!convId) {
      convId = createConversation(text.trim())
    } else {
      // Update title if first message
      setConversations(prev => prev.map(c =>
        c.id === convId && c.messages.length === 0
          ? { ...c, title: truncateTitle(text.trim()), updatedAt: Date.now() }
          : c
      ))
    }

    // Add user message
    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() }
        : c
    ))

    // Add empty assistant message (for streaming)
    const assistantMsgId = genId()
    setConversations(prev => prev.map(c =>
      c.id === convId
        ? {
            ...c,
            messages: [...c.messages, {
              id: assistantMsgId,
              role: 'assistant' as const,
              content: '',
              thoughtProcess: [],
              timestamp: Date.now(),
              isStreaming: true,
            }],
            updatedAt: Date.now(),
          }
        : c
    ))

    setIsGenerating(true)
    setInput('')

    try {
      const abort = new AbortController()
      abortRef.current = abort

      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          conversationId: convId,
          stream: true,
          role: activeRole,
        }),
        signal: abort.signal,
      })

      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let thoughtSteps: ThoughtStep[] = []
      let confirmationRequested = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          try {
            const event: StreamEvent = JSON.parse(trimmed.slice(6))

            if (event.type === 'thinking') {
              const step: ThoughtStep = {
                id: genId(),
                type: 'thinking',
                content: event.content || 'Analyzing...',
                timestamp: Date.now(),
              }
              thoughtSteps = [...thoughtSteps, step]
              updateConversation(convId!, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, thoughtProcess: [...thoughtSteps] }
                    : m
                ),
              }))
            }

            else if (event.type === 'tool_call') {
              const step: ThoughtStep = {
                id: genId(),
                type: 'tool_call',
                content: event.content || `Calling ${event.tool}...`,
                tool: event.tool,
                timestamp: Date.now(),
              }
              thoughtSteps = [...thoughtSteps, step]
              updateConversation(convId!, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, thoughtProcess: [...thoughtSteps] }
                    : m
                ),
              }))
            }

            else if (event.type === 'tool_result') {
              // Update last tool_call step to show result
              const lastToolIdx = [...thoughtSteps].reverse().findIndex(s => s.type === 'tool_call' && s.tool === event.tool)
              if (lastToolIdx !== -1) {
                const actualIdx = thoughtSteps.length - 1 - lastToolIdx
                thoughtSteps = thoughtSteps.map((s, i) =>
                  i === actualIdx
                    ? { ...s, type: 'tool_result' as const, success: event.success, content: event.summary || event.content || s.content }
                    : s
                )
              } else {
                const step: ThoughtStep = {
                  id: genId(),
                  type: 'tool_result',
                  content: event.summary || event.content || 'Done',
                  tool: event.tool,
                  success: event.success,
                  timestamp: Date.now(),
                }
                thoughtSteps = [...thoughtSteps, step]
              }
              updateConversation(convId!, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, thoughtProcess: [...thoughtSteps] }
                    : m
                ),
              }))
            }

            else if (event.type === 'token' || event.type === 'response') {
              fullContent += (event.content || '')
              updateConversation(convId!, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: fullContent }
                    : m
                ),
              }))
            }

            else if (event.type === 'fact_card') {
              try {
                const fcData: FactCardData = JSON.parse(event.content || '{}')
                updateConversation(convId!, c => ({
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMsgId
                      ? { ...m, factCard: fcData }
                      : m
                  ),
                }))
              } catch { /* skip malformed fact card */ }
            }

            else if (event.type === 'confirmation_request') {
              // Store pending confirmation and mark assistant as waiting
              confirmationRequested = true
              setPendingConfirmation({
                confirmationId: event.confirmationId!,
                toolName: event.toolName || '',
                toolLabel: event.toolLabel || '',
                toolParams: event.toolParams || {},
                assistantMsgId,
              })
              updateConversation(convId!, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: '', isStreaming: false }
                    : m
                ),
              }))
            }

            else if (event.type === 'error') {
              // Error from backend — use the specific message, not a generic one
              const errorMsg = event.content || 'Kuch technical issue aa gaya. Dobara try karein.'
              if (!fullContent) {
                fullContent = errorMsg
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }

      // Finalize message (skip if confirmation is pending — it will be finalized after user responds)
      if (!confirmationRequested) {
        updateConversation(convId!, c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: fullContent || 'Koi response generate nahi ho paya. Kya aap apna sawal thoda detail me bata sakte hain?', isStreaming: false }
              : m
          ),
          updatedAt: Date.now(),
        }))
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled
        updateConversation(convId!, c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: m.content || '(Cancelled)', isStreaming: false }
              : m
          ),
        }))
      } else {
        updateConversation(convId!, c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: 'Maaf karo, kuch error aa gaya. Dobara try karein.', isStreaming: false }
              : m
          ),
        }))
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }, [isGenerating, activeConvId, createConversation, updateConversation])

  // ─── Stop generating ───────────────────────────────────────────────────
  const stopGenerating = useCallback(() => {
    abortRef.current?.abort()
    setPendingConfirmation(null)
  }, [])

  // ─── Handle confirmation response (Yes/No) ─────────────────────────────
  const handleConfirmationResponse = useCallback(async (confirmed: boolean) => {
    if (!pendingConfirmation || !activeConvId || isConfirming) return

    const cfmId = pendingConfirmation.confirmationId
    const msgId = pendingConfirmation.assistantMsgId
    setIsConfirming(true)

    try {
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationResponse: { confirmationId: cfmId, confirmed },
          conversationId: activeConvId,
          stream: true,
        }),
      })

      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      if (!res.body) throw new Error('No response body')

      // Mark as confirming
      updateConversation(activeConvId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === msgId
            ? { ...m, isStreaming: true, content: confirmed ? '✅ Action approved, processing...' : '❌ Action cancelled.' }
            : m
        ),
      }))

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let thoughtSteps: ThoughtStep[] = []
      let nextConfirmationRequested = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          try {
            const event: StreamEvent = JSON.parse(trimmed.slice(6))

            if (event.type === 'thinking' || event.type === 'tool_call' || event.type === 'tool_result') {
              const step: ThoughtStep = {
                id: genId(),
                type: event.type === 'thinking' ? 'thinking' as const : event.type as 'tool_call' | 'tool_result',
                content: event.type === 'thinking'
                  ? (event.content || 'Processing...')
                  : event.type === 'tool_call'
                    ? (event.content || `Calling ${event.tool}...`)
                    : (event.summary || event.content || 'Done'),
                tool: event.tool,
                success: event.success,
                timestamp: Date.now(),
              }
              if (event.type === 'tool_result') {
                const lastToolIdx = [...thoughtSteps].reverse().findIndex(s => s.type === 'tool_call' && s.tool === event.tool)
                if (lastToolIdx !== -1) {
                  const actualIdx = thoughtSteps.length - 1 - lastToolIdx
                  thoughtSteps = thoughtSteps.map((s, i) =>
                    i === actualIdx
                      ? { ...s, type: 'tool_result' as const, success: event.success, content: event.summary || event.content || s.content }
                      : s
                  )
                } else {
                  thoughtSteps = [...thoughtSteps, step]
                }
              } else {
                thoughtSteps = [...thoughtSteps, step]
              }
              updateConversation(activeConvId, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === msgId ? { ...m, thoughtProcess: [...thoughtSteps] } : m
                ),
              }))
            }

            else if (event.type === 'token' || event.type === 'response') {
              fullContent += (event.content || '')
              updateConversation(activeConvId, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === msgId ? { ...m, content: fullContent } : m
                ),
              }))
            }

            else if (event.type === 'fact_card') {
              try {
                const fcData: FactCardData = JSON.parse(event.content || '{}')
                updateConversation(activeConvId, c => ({
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === msgId ? { ...m, factCard: fcData } : m
                  ),
                }))
              } catch { /* skip */ }
            }

            // ── Handle chained confirmation (next write tool in multi-step workflow) ──
            else if (event.type === 'confirmation_request') {
              nextConfirmationRequested = true
              updateConversation(activeConvId, c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === msgId
                    ? { ...m, content: fullContent || (confirmed ? '✅ Previous action done. Next step needs approval:' : ''), isStreaming: false }
                    : m
                ),
              }))
              // Store the NEW pending confirmation — but DON'T clear isConfirming yet
              // because the finally block will do that
              setPendingConfirmation({
                confirmationId: event.confirmationId!,
                toolName: event.toolName || '',
                toolLabel: event.toolLabel || '',
                toolParams: event.toolParams || {},
                assistantMsgId: msgId,
              })
              // Don't finalize — leave the message waiting for the next confirmation
              return
            }

            else if (event.type === 'error') {
              const errorMsg = event.content || 'Confirmation processing me error.'
              if (!fullContent) fullContent = errorMsg
            }
          } catch { /* skip */ }
        }
      }

      // Finalize (only if no chained confirmation was requested)
      if (!nextConfirmationRequested) {
        updateConversation(activeConvId, c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === msgId
              ? { ...m, content: fullContent || (confirmed ? 'Action complete!' : 'Action cancelled.'), isStreaming: false }
              : m
          ),
          updatedAt: Date.now(),
        }))
      }
    } catch (err) {
      updateConversation(activeConvId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === msgId
            ? { ...m, content: 'Confirmation me error aa gaya. Dobara try karein.', isStreaming: false }
            : m
        ),
      }))
    } finally {
      setPendingConfirmation(null)
      setIsConfirming(false)
      inputRef.current?.focus()
    }
  }, [pendingConfirmation, activeConvId, isConfirming, updateConversation])

  // ─── Handle send ───────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    sendMessage(input)
  }, [input, sendMessage])

  // ─── Handle keydown (Enter to send, Shift+Enter for newline) ──────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ─── Auto-resize textarea ──────────────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [])

  // ─── New chat ──────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    setActiveConvId(null)
    setInput('')
    inputRef.current?.focus()
  }, [])

  // ─── Sidebar content (shared between desktop and mobile) ───────────────
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* New Chat Button */}
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-dashed"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      {/* Conversation List */}
      <ScrollArea className="flex-1 px-2 py-2">
        {groupedConvs.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center py-8 px-4">
            No conversations yet
          </p>
        )}
        {groupedConvs.map(group => (
          <div key={group.label} className="mb-3">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 mb-1.5">
              {group.label}
            </p>
            {group.items.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors text-sm ${
                  conv.id === activeConvId
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
                }`}
                onClick={() => {
                  setActiveConvId(conv.id)
                  if (isMobile) setSidebarOpen(false)
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="truncate flex-1 text-xs">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(conv.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="p-3">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Dhanya OS Agent v6.1
        </div>
      </div>
    </div>
  )

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* ─── Desktop Sidebar ─────────────────────────────────────── */}
        {!isMobile && (
          <motion.aside
            initial={false}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="shrink-0 border-r border-border bg-muted/20 flex flex-col h-full overflow-hidden"
          >
            {sidebarContent}
          </motion.aside>
        )}

        {/* ─── Mobile Sidebar Sheet ────────────────────────────────── */}
        {isMobile && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Chat History</SheetTitle>
              {sidebarContent}
            </SheetContent>
          </Sheet>
        )}

        {/* ─── Main Chat Area ──────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Top Bar */}
          <header className="shrink-0 flex items-center gap-2 h-12 border-b border-border bg-background/80 backdrop-blur-sm px-3">
            {isMobile ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
                <PanelLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
              </Tooltip>
            )}

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="font-semibold text-sm truncate">Dhanya OS Agent</span>
              <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded-full shrink-0">
                v6.2
              </span>
              {/* Role Selector */}
              <select
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value as AgentRole)}
                className="text-[10px] bg-muted/50 border-0 rounded-full px-1.5 py-0.5 text-muted-foreground cursor-pointer hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="founder">Founder</option>
                <option value="cfo">CFO</option>
                <option value="coo">COO</option>
                <option value="sales">Sales</option>
                <option value="purchase">Purchase</option>
              </select>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    // Navigate back to dashboard
                    const event = new CustomEvent('navigate-dashboard')
                    window.dispatchEvent(event)
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back to Dashboard</TooltipContent>
            </Tooltip>
          </header>

          {/* Messages / Welcome */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <WelcomeScreen
                onQueryClick={(q) => { setInput(q); setTimeout(() => sendMessage(q), 50) }}
                isMobile={isMobile}
              />
            ) : (
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                <AnimatePresence mode="popLayout">
                  {messages.map(msg => (
                    <ChatMessageBubble key={msg.id} message={msg} />
                  ))}
                </AnimatePresence>

                {/* Typing indicator when waiting for first token */}
                {isGenerating && messages[messages.length - 1]?.content === '' && messages[messages.length - 1]?.thoughtProcess?.length === 0 && !pendingConfirmation && (
                  <TypingIndicator />
                )}

                {/* Confirmation gate for write operations */}
                <AnimatePresence>
                  {pendingConfirmation && (
                    <motion.div className="flex justify-start">
                      <div className="max-w-[85%] sm:max-w-[75%] ml-10">
                        <ConfirmationCard
                          toolLabel={pendingConfirmation.toolLabel}
                          toolParams={pendingConfirmation.toolParams}
                          onConfirm={() => handleConfirmationResponse(true)}
                          onDecline={() => handleConfirmationResponse(false)}
                          isConfirming={isConfirming}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={pendingConfirmation ? "Confirm ya cancel karo pehle..." : "Kuch bhi puchho..."}
                  rows={1}
                  className="flex-1 bg-transparent resize-none text-sm outline-none placeholder:text-muted-foreground/50 min-h-[24px] max-h-[200px] py-1"
                  disabled={isGenerating || !!pendingConfirmation}
                />
                {isGenerating ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                    onClick={stopGenerating}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-30"
                    onClick={handleSend}
                    disabled={!input.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
                Dhanya OS Agent v6.1 — Real-time data from your database
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}