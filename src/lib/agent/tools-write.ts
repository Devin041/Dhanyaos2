import { supabase } from '@/lib/supabase-db'
import type { ToolDef, ToolResult } from './tools'
import { istToday, parseDateInput } from './date-utils'

// ─── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const rnd = (n: number) => Math.round(n * 100) / 100

/** Generate next sequential number for a prefix pattern */
async function nextSeq(prefix: string, table: string, field: string): Promise<number> {
  const { data: last } = await supabase.from(table)
    .select(field)
    .ilike(field, `${prefix}%`)
    .order(field, { ascending: false })
    .limit(1)
    .single()
  return last ? parseInt((last as any)[field].slice(prefix.length), 10) + 1 : 1
}

/** Generate a simple sequential number (no date prefix) */
async function nextSimpleSeq(prefix: string, table: string, field: string): Promise<number> {
  const { count } = await supabase.from(table)
    .select('*', { count: 'exact', head: true })
    .ilike(field, `${prefix}%`)
  return (count || 0) + 1
}

function todayPrefix(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
