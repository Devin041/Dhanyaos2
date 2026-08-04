'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { Separator } from '@/components/ui/separator'
import { Moon, Sun, Bot, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { useDashboardStore, type DashboardView } from '@/store/dashboard-store'
import { NotificationPanel } from '@/components/notification-panel'
import { GlobalSearch } from '@/components/global-search'

// ─── AI Agent — loaded as full-page component ─────────────────────────────
const AIAgentFull = dynamic(
  () => import('@/components/dashboard/ai-agent').then(m => ({ default: m.AIAgent })),
  { ssr: false, loading: () => <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> }
)

// ─── Eval Harness — loaded as full-page component ──────────────────────────
const EvalDashboardFull = dynamic(
  () => import('@/components/dashboard/eval-dashboard').then(m => ({ default: m.EvalDashboard })),
  { ssr: false, loading: () => <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> }
)

// ─── Single dynamic import: the module resolver handles all 30+ views ─────
const ModuleResolver = dynamic(
  () => import('@/components/module-resolver').then(m => ({ default: m.ModuleResolver })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Initializing Dhanya OS…</p>
      </div>
    ),
  }
)

// ─── Theme Toggle ─────────────────────────────────────────────────────────

function ThemeToggle() {
  const { setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

// ─── Live Clock ───────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setDate(now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-xs font-mono font-medium tabular-nums text-foreground/90">{time}</span>
      <span className="text-[10px] text-muted-foreground">IST · {date}</span>
    </div>
  )
}

// ─── Main Page Shell ──────────────────────────────────────────────────────

export default function Home() {
  const { activeView, setActiveView } = useDashboardStore()
  const isFullHeightView = activeView === 'ai-advisor' || activeView === 'eval'

  // Listen for "back to dashboard" from AI Agent full-page view
  useEffect(() => {
    const handler = () => setActiveView('founder')
    window.addEventListener('navigate-dashboard', handler)
    return () => window.removeEventListener('navigate-dashboard', handler)
  }, [setActiveView])

  // AI Agent renders as FULL PAGE — no sidebar, no header, no footer
  if (activeView === 'ai-agent') {
    return <AIAgentFull />
  }

  if (activeView === 'eval') {
    return <EvalDashboardFull />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className={`flex flex-col ${isFullHeightView ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
          {/* ─── Top Bar ─────────────────────────────────────────── */}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />

            {/* Search */}
            <div className="hidden max-w-md flex-1 md:block">
              <GlobalSearch />
            </div>

            {/* Live Clock */}
            <div className="hidden lg:flex items-center gap-3 mr-2">
              <LiveClock />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 text-xs"
                onClick={() => setActiveView('ai-advisor')}
              >
                <Bot className="h-3.5 w-3.5" />
                AI Advisor
              </Button>
            </div>

            {/* Right actions */}
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationPanel />

              <ThemeToggle />

              <Separator orientation="vertical" className="mx-1 h-6" />

              {/* User Avatar */}
              <div className="flex items-center gap-2.5 pl-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                  D
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium leading-tight">Founder</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">Dhanya Lifestyle</p>
                </div>
              </div>
            </div>
          </header>

          {/* ─── Main Content ─────────────────────────────────────── */}
          <main className={`flex-1 p-4 lg:p-6 ${isFullHeightView ? 'overflow-hidden !min-h-0' : ''}`}>
            <ModuleResolver />
          </main>

          {/* ─── Sticky Footer ────────────────────────────────────── */}
          {!isFullHeightView && (
          <footer className="shrink-0 border-t border-border bg-background/60 backdrop-blur-sm px-4 py-3 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  System Online
                </span>
                <span>Dhanya OS v1.0 Enterprise</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Project Dhanya 2030</span>
              </div>
              <div className="flex items-center gap-4">
                <span>Dhanya Lifestyle LLP</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Elysé by Dhanya</span>
                <span className="hidden sm:inline">·</span>
                <span>Ahmedabad, Gujarat</span>
              </div>
            </div>
          </footer>
          )}
        </SidebarInset>
      </SidebarProvider>
  )
}