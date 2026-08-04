'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, Loader2, Package, Users, ShoppingBag, Scissors, Factory, FileText, Warehouse, ArrowRight, Truck } from 'lucide-react'
import { useDashboardStore, type DashboardView } from '@/store/dashboard-store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string
  type: 'order' | 'customer' | 'supplier' | 'style' | 'production' | 'purchase_order' | 'quotation' | 'fabric'
  title: string
  subtitle: string
  meta: string
  view: string
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  order: { icon: <ShoppingBag className="h-3.5 w-3.5" />, label: 'Sales Order', color: 'oklch(0.78 0.14 85)' },
  customer: { icon: <Users className="h-3.5 w-3.5" />, label: 'Customer', color: 'oklch(0.72 0.18 145)' },
  supplier: { icon: <Truck className="h-3.5 w-3.5" />, label: 'Supplier', color: 'oklch(0.7 0.15 250)' },
  style: { icon: <Scissors className="h-3.5 w-3.5" />, label: 'Style', color: 'oklch(0.75 0.15 25)' },
  production: { icon: <Factory className="h-3.5 w-3.5" />, label: 'Production Job', color: 'oklch(0.7 0.12 300)' },
  purchase_order: { icon: <Package className="h-3.5 w-3.5" />, label: 'Purchase Order', color: 'oklch(0.65 0.18 155)' },
  quotation: { icon: <FileText className="h-3.5 w-3.5" />, label: 'Quotation', color: 'oklch(0.68 0.2 30)' },
  fabric: { icon: <Warehouse className="h-3.5 w-3.5" />, label: 'Fabric Stock', color: 'oklch(0.8 0.15 75)' },
}

const TYPE_LABELS: Record<string, string> = {
  order: 'Sales Order',
  customer: 'Customer',
  supplier: 'Supplier',
  style: 'Style',
  production: 'Production',
  purchase_order: 'Purchase Order',
  quotation: 'Quotation',
  fabric: 'Fabric Stock',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { setActiveView } = useDashboardStore()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Keyboard shortcut: Ctrl+K / Cmd+K to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setIsLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      const results: SearchResult[] = Array.isArray(data.results) ? data.results : []
      setResults(results)
      setIsOpen(results.length > 0)
      setHighlightIndex(-1)
    } catch {
      if (abortRef.current?.signal.aborted) return
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setQuery(val)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        fetchResults(val)
      }, 250)
    },
    [fetchResults]
  )

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setActiveView(result.view as DashboardView)
      setIsOpen(false)
      setQuery('')
      setResults([])
    },
    [setActiveView]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex])
        }
      }
    },
    [isOpen, results, highlightIndex, handleSelect]
  )

  const handleClear = useCallback(() => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    setHighlightIndex(-1)
    inputRef.current?.focus()
  }, [])

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.length >= 2 && results.length > 0) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search orders, customers, styles..."
          className="w-full rounded-lg border border-border bg-muted/50 pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
        />
        {/* Right side: loading or clear */}
        {isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground animate-spin" />
        ) : query ? (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 text-[10px] font-medium text-muted-foreground/60 pointer-events-none">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-xl border border-border/60 bg-popover shadow-xl shadow-black/20 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="max-h-80 overflow-y-auto">
            {results.map((result, i) => {
              const config = TYPE_CONFIG[result.type]
              const isHighlighted = i === highlightIndex
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                    isHighlighted ? 'bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  {/* Type icon */}
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${config?.color || 'oklch(0.5 0.05 260)'}20`, color: config?.color }}
                  >
                    {config?.icon}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{result.title}</span>
                      <span className="shrink-0 rounded-full border border-border/60 bg-muted/60 px-1.5 py-0 text-[9px] font-medium text-muted-foreground">
                        {TYPE_LABELS[result.type]}
                      </span>
                    </div>
                    {result.subtitle && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{result.subtitle}</p>
                    )}
                  </div>

                  {/* Meta + Arrow */}
                  <div className="shrink-0 flex items-center gap-2">
                    {result.meta && (
                      <span className="hidden sm:block text-[11px] text-muted-foreground tabular-nums">{result.meta}</span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 px-3.5 py-2 flex items-center justify-between text-[10px] text-muted-foreground/60">
            <span>{results.length} result{results.length !== 1 ? 's' : ''} found</span>
            <div className="flex items-center gap-2">
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>Esc Close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}