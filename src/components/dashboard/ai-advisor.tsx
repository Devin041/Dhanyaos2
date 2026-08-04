'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Crown,
  IndianRupee,
  Factory,
  Scissors,
  ShoppingBag,
  Cog,
  Warehouse,
  ShoppingCart,
  Palette,
  Send,
  Trash2,
  Sparkles,
  ChevronRight,
  X,
  MessageSquare,
  Bot,
  AlertCircle,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  role: string
  description: string
  icon: string
  color: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  agent?: string
  agentRole?: string
  timestamp: Date
  isError?: boolean
}

// ─── Agent Config ────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ReactNode> = {
  founder: <Crown className="h-4 w-4" />,
  cfo: <IndianRupee className="h-4 w-4" />,
  coo: <Factory className="h-4 w-4" />,
  merchandising: <Scissors className="h-4 w-4" />,
  purchase: <ShoppingBag className="h-4 w-4" />,
  production: <Cog className="h-4 w-4" />,
  inventory: <Warehouse className="h-4 w-4" />,
  sales: <ShoppingCart className="h-4 w-4" />,
  brand: <Palette className="h-4 w-4" />,
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'founder',
    name: 'Founder AI',
    role: 'Strategic Advisor',
    description: 'Executive decisions, growth strategy & investor relations',
    icon: 'Crown',
    color: 'oklch(0.78 0.14 85)',
  },
  {
    id: 'cfo',
    name: 'CFO AI',
    role: 'Finance Expert',
    description: 'Cash flow, P&L analysis & working capital optimization',
    icon: 'IndianRupee',
    color: 'oklch(0.72 0.18 145)',
  },
  {
    id: 'coo',
    name: 'COO AI',
    role: 'Operations Lead',
    description: 'Production planning, capacity & efficiency management',
    icon: 'Factory',
    color: 'oklch(0.7 0.15 250)',
  },
  {
    id: 'merchandising',
    name: 'Merchandising AI',
    role: 'Product Strategist',
    description: 'Collection planning, trend analysis & range building',
    icon: 'Scissors',
    color: 'oklch(0.75 0.15 25)',
  },
  {
    id: 'purchase',
    name: 'Purchase AI',
    role: 'Procurement Specialist',
    description: 'Fabric sourcing, vendor management & PO tracking',
    icon: 'ShoppingBag',
    color: 'oklch(0.7 0.12 300)',
  },
  {
    id: 'production',
    name: 'Production AI',
    role: 'Manufacturing Expert',
    description: 'Job tracking, quality control & delivery schedules',
    icon: 'Cog',
    color: 'oklch(0.65 0.18 155)',
  },
  {
    id: 'inventory',
    name: 'Inventory AI',
    role: 'Stock Manager',
    description: 'Stock levels, fabric inventory & warehouse optimization',
    icon: 'Warehouse',
    color: 'oklch(0.8 0.15 75)',
  },
  {
    id: 'sales',
    name: 'Sales AI',
    role: 'Revenue Analyst',
    description: 'Order pipeline, collections & customer insights',
    icon: 'ShoppingCart',
    color: 'oklch(0.68 0.2 30)',
  },
  {
    id: 'brand',
    name: 'Brand AI',
    role: 'Creative Director',
    description: 'Brand positioning, design feedback & market presence',
    icon: 'Palette',
    color: 'oklch(0.75 0.18 320)',
  },
]

const SUGGESTED_PROMPTS = [
  { text: "What's my cash position today?", agent: 'cfo' },
  { text: 'Which orders need immediate attention?', agent: 'coo' },
  { text: 'How can I improve gross margins?', agent: 'cfo' },
  { text: 'What are the top risks right now?', agent: 'founder' },
]

// ─── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="glass-card rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

// ─── Welcome Screen ──────────────────────────────────────────────────────────

function WelcomeScreen({ onPromptClick }: { onPromptClick: (text: string, agent: string) => void }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-4 py-4 md:py-12 overflow-y-auto">
      {/* Branding */}
      <div className="flex flex-col items-center gap-2 md:gap-3 text-center">
        <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <Sparkles className="h-6 w-6 md:h-8 md:w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg md:text-2xl font-bold gold-shimmer">Dhanya OS AI Advisor</h2>
          <p className="mt-1 md:mt-2 text-xs md:text-sm text-muted-foreground">
            Ask anything about your business — powered by 9 AI agents
          </p>
        </div>
      </div>

      {/* Suggested prompts */}
      <div className="w-full max-w-lg space-y-2 md:space-y-3">
        <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground/60 text-center">
          Quick prompts
        </p>
        <div className="grid gap-1.5 md:gap-2">
          {SUGGESTED_PROMPTS.map((prompt, i) => {
            const agent = DEFAULT_AGENTS.find((a) => a.id === prompt.agent)
            return (
              <button
                key={i}
                onClick={() => onPromptClick(prompt.text, prompt.agent)}
                className="group flex items-center gap-2.5 md:gap-3 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 md:px-4 md:py-3 text-left text-sm transition-all hover:border-primary/30 hover:bg-primary/5"
              >
                <span className="flex h-6 w-6 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary/80 transition-colors group-hover:bg-primary/15">
                  {AGENT_ICONS[prompt.agent]}
                </span>
                <span className="flex-1 text-foreground/80 group-hover:text-foreground transition-colors text-xs md:text-sm">
                  {prompt.text}
                </span>
                <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom hint */}
      <p className="text-[10px] md:text-xs text-muted-foreground/50 mt-2">
        Select an AI agent or type your question below
      </p>
    </div>
  )
}

// ─── Chat Message Bubble ─────────────────────────────────────────────────────

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-3 px-4 py-1.5">
        <div className="max-w-[85%] sm:max-w-[70%]">
          <div className="rounded-2xl rounded-tr-sm bg-muted/80 border border-border/50 px-4 py-3 text-sm leading-relaxed">
            {message.content}
          </div>
          <p className="mt-1 text-right text-[10px] text-muted-foreground/50">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 px-4 py-1.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
        {message.agent ? AGENT_ICONS[message.agent] || <Bot className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div className="max-w-[85%] sm:max-w-[75%]">
        {/* Agent name + badge */}
        {message.agent && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground/80">
              {DEFAULT_AGENTS.find((a) => a.id === message.agent)?.name || message.agent}
            </span>
            {message.agentRole && (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] font-normal rounded-full bg-primary/10 text-primary/80 border-0"
              >
                {message.agentRole}
              </Badge>
            )}
          </div>
        )}
        {/* Message bubble */}
        {message.isError ? (
          <div className="rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/5 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive/90">{message.content}</p>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-2xl rounded-tl-sm border border-primary/10 px-4 py-3">
            <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-foreground/85 prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground/85 prose-code:text-primary prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground/50">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// ─── Agent Card (sidebar) ───────────────────────────────────────────────────

function AgentCard({
  agent,
  isActive,
  onClick,
}: {
  agent: Agent
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
        isActive
          ? 'border-primary/50 bg-primary/10 shadow-[0_0_12px_oklch(0.78_0.14_85/0.08)]'
          : 'border-border/40 bg-muted/20 hover:border-border/80 hover:bg-muted/40'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            isActive ? 'bg-primary/20 text-primary' : 'bg-muted/60 text-muted-foreground group-hover:text-foreground/80'
          }`}
          style={isActive ? { color: agent.color } : undefined}
        >
          {AGENT_ICONS[agent.id]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`text-xs font-semibold truncate transition-colors ${isActive ? 'text-foreground' : 'text-foreground/70'}`}>
              {agent.name}
            </p>
            {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
          </div>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{agent.role}</p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground/70 line-clamp-2 leading-relaxed pl-[42px]">
        {agent.description}
      </p>
    </button>
  )
}

// ─── Mobile Agent Chip ───────────────────────────────────────────────────────

function AgentChip({
  agent,
  isActive,
  onClick,
}: {
  agent: Agent
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
        isActive
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border/40 bg-muted/30 text-muted-foreground hover:border-border/70 hover:text-foreground/80'
      }`}
    >
      {AGENT_ICONS[agent.id]}
      <span>{agent.name}</span>
    </button>
  )
}

// ─── Main AI Advisor Component ───────────────────────────────────────────────

export function AIAdvisor() {
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS)
  const [activeAgent, setActiveAgent] = useState<string>('founder')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isMobileAgentsOpen, setIsMobileAgentsOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)

  // Fetch agents on mount
  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/ai-advisor')
        if (res.ok) {
          const data = await res.json()
          if (data.agents && data.agents.length > 0) {
            setAgents(data.agents)
          }
        }
      } catch {
        // Use default agents
      }
    }
    fetchAgents()
  }, [])

  // Auto-scroll to bottom (only within the chat ScrollArea, never the outer page)
  useEffect(() => {
    if (messagesEndRef.current) {
      // Find the nearest scrollable viewport (Radix ScrollArea viewport) and scroll it
      // instead of using scrollIntoView which can scroll the entire page/iframe
      const viewport = messagesEndRef.current.closest('[data-radix-scroll-area-viewport]')
        || messagesEndRef.current.closest('.overflow-y-auto')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  const sendMessage = useCallback(
    async (text: string, agentId?: string) => {
      const messageText = text.trim()
      if (!messageText || isLoading) return

      const targetAgent = agentId || activeAgent

      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setIsLoading(true)

      try {
        const res = await fetch('/api/ai-advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageText,
            agent: targetAgent,
            conversationId,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to get response')
        }

        // Update conversation ID
        if (data.conversationId) {
          setConversationId(data.conversationId)
        }

        const agentData = agents.find((a) => a.id === targetAgent)

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response || data.message || 'I apologize, I could not generate a response.',
          agent: targetAgent,
          agentRole: agentData?.role,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
          agent: targetAgent,
          agentRole: agents.find((a) => a.id === targetAgent)?.role,
          timestamp: new Date(),
          isError: true,
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
        textareaRef.current?.focus()
      }
    },
    [activeAgent, isLoading, conversationId, agents]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      sendMessage(input)
    },
    [sendMessage, input]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(input)
      }
    },
    [sendMessage, input]
  )

  const handleClearChat = useCallback(() => {
    setMessages([])
    setConversationId(null)
  }, [])

  const handlePromptClick = useCallback(
    (text: string, agent: string) => {
      setActiveAgent(agent)
      sendMessage(text, agent)
    },
    [sendMessage]
  )

  const activeAgentData = agents.find((a) => a.id === activeAgent)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/50">
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Panel: Agent Selector (desktop) ─────────────── */}
        <aside className="hidden md:flex w-[280px] shrink-0 flex-col border-r border-border/50 bg-muted/10">
          {/* Panel header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">AI Agents</h3>
              <p className="text-[10px] text-muted-foreground">{agents.length} specialists available</p>
            </div>
          </div>

          {/* Agent list */}
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-1.5 pb-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isActive={activeAgent === agent.id}
                  onClick={() => setActiveAgent(agent.id)}
                />
              ))}
            </div>
          </ScrollArea>

          {/* Panel footer */}
          <div className="border-t border-border/30 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              All agents online · Dhanya OS
            </div>
          </div>
        </aside>

        {/* ─── Main Chat Panel ──────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile agent selector */}
          <div className="md:hidden border-b border-border/30 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground shrink-0"
                onClick={() => setIsMobileAgentsOpen(!isMobileAgentsOpen)}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                {activeAgentData?.name || 'Select Agent'}
                <ChevronRight className={`h-3 w-3 ml-1 transition-transform ${isMobileAgentsOpen ? 'rotate-90' : ''}`} />
              </Button>
              <ScrollArea className="flex-1">
                <div className="flex gap-1 pb-0.5">
                  {agents.map((agent) => (
                    <AgentChip
                      key={agent.id}
                      agent={agent}
                      isActive={activeAgent === agent.id}
                      onClick={() => {
                        setActiveAgent(agent.id)
                        setIsMobileAgentsOpen(false)
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
            {/* Mobile expanded agent list */}
            {isMobileAgentsOpen && (
              <div className="border-t border-border/30 bg-muted/10 px-3 py-2">
                <div className="space-y-1.5">
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isActive={activeAgent === agent.id}
                      onClick={() => {
                        setActiveAgent(agent.id)
                        setIsMobileAgentsOpen(false)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat header */}
          <div className="hidden md:flex items-center gap-3 border-b border-border/30 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                {activeAgentData ? AGENT_ICONS[activeAgentData.id] : <Bot className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{activeAgentData?.name || 'AI Advisor'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{activeAgentData?.role || 'Select an agent'}</p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={handleClearChat}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear Chat
              </Button>
            )}
          </div>

          {/* Messages area */}
          {messages.length === 0 ? (
            <WelcomeScreen onPromptClick={handlePromptClick} />
          ) : (
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-1 py-4">
                {messages.map((msg, i) => (
                  <ChatMessageBubble key={i} message={msg} />
                ))}
                {isLoading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}

          {/* Input area — always visible at bottom */}
          <div ref={inputContainerRef} className="shrink-0 border-t border-border/30 bg-background/50 backdrop-blur-sm">
            {/* Active agent indicator (mobile) */}
            <div className="md:hidden flex items-center justify-between px-3 pt-1.5">
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {activeAgentData ? AGENT_ICONS[activeAgentData.id] : <Bot className="h-3 w-3" />}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {activeAgentData?.name || 'AI Advisor'}
                </span>
              </div>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={handleClearChat}
                >
                  <Trash2 className="h-3 w-3 mr-0.5" />
                  Clear
                </Button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-1.5 md:gap-2 p-2 md:p-4">
              <div className="relative flex-1">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask ${activeAgentData?.name || 'the AI'} anything...`}
                  disabled={isLoading}
                  rows={1}
                  className="resize-none rounded-xl border-border/50 bg-muted/30 pr-10 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary/30 focus-visible:border-primary/30 min-h-[38px] md:min-h-[40px] max-h-[120px] py-2 md:py-2.5"
                />
                {!input && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                )}
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_oklch(0.78_0.14_85/0.15)] disabled:opacity-40 disabled:shadow-none transition-all"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </form>

            {/* Branding (hidden on mobile to save space) */}
            <div className="hidden md:flex items-center justify-center gap-1.5 px-4 pb-2">
              <Sparkles className="h-3 w-3 text-primary/40" />
              <span className="text-[10px] text-muted-foreground/40 font-medium tracking-wide">
                Dhanya OS AI Advisor · Elysé by Dhanya
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}