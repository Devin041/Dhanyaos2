import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

// ============================================================================
// Real Supabase Client — connected to live PostgreSQL database
// Lazy initialization to avoid crash during build (env vars not available)
// Falls back to a no-op mock client when Supabase is not configured, so the
// app runs in "demo mode" with empty data instead of throwing 500 errors.
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// Lazy singleton — only creates client when first accessed at runtime
let _supabase: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL and Anon Key are required. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env')
    }
    _supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
    })
  }
  return _supabase
}

// ============================================================================
// Insert Auto-ID Wrapper
// ============================================================================
// The Supabase tables were originally created by Prisma which auto-generates
// `id` values via @default(cuid()).  When the app calls supabase.from('X')
// .insert({...}) directly (bypassing Prisma), the `id` column has no default
// in PostgreSQL, causing "null value in column id violates not-null
// constraint" errors.
//
// This wrapper intercepts every .insert() call and automatically injects
// `id: randomUUID()` and `updatedAt: now` if not already present in the
// payload.  This fixes ALL 57+ API routes at once without modifying each one.

// Tables known to NOT have an `updatedAt` column (verified from schema.prisma).
// Inserting `updatedAt` into these would throw "column updatedAt does not exist".
// All other tables DO have `updatedAt DateTime @updatedAt` (NOT NULL) and need
// it to be set explicitly on every insert (Prisma's @updatedAt has no DB trigger).
const TABLES_WITHOUT_UPDATED_AT = new Set([
  'FGStockMovement',
  'Alert',
  'AgentFeedback',
  'AuditLog',
  'EvalRun',
  'EvalResult',
  'Payment',
])

function wrapQueryBuilder(qb: any, table: string): any {
  return new Proxy(qb, {
    get(target: any, prop: string, receiver: any) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      // Intercept .insert() to inject id + updatedAt
      if (prop === 'insert') {
        return (payload: any) => {
          const now = new Date().toISOString()
          // Prisma's @updatedAt is enforced ONLY at the Prisma-client level —
          // it does NOT create a DB trigger. So every Supabase table that has
          // `updatedAt DateTime @updatedAt` (NOT NULL) will reject inserts
          // that don't set updatedAt explicitly, throwing:
          //   "null value in column updatedAt of relation X violates not-null constraint"
          // We auto-inject `updatedAt` for every table EXCEPT a small blocklist
          // of tables that don't have the column at all.
          const shouldAddUpdatedAt = !TABLES_WITHOUT_UPDATED_AT.has(table)
          const inject = (row: any) => {
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              if (!row.id) row.id = randomUUID()
              // Auto-populate updatedAt unless the caller already set it
              // (explicit values win) or the table doesn't have the column.
              if (shouldAddUpdatedAt && row.updatedAt === undefined) {
                row.updatedAt = now
              }
            }
            return row
          }
          if (Array.isArray(payload)) {
            payload = payload.map(inject)
          } else {
            payload = inject(payload)
          }
          return wrapQueryBuilder(value.call(target, payload), table)
        }
      }

      // For all other methods (select, eq, order, etc.), wrap the returned
      // query builder so chained .insert() calls also get intercepted
      return (...args: any[]) => wrapQueryBuilder(value.apply(target, args), table)
    },
  })
}

function wrapClient(client: SupabaseClient): SupabaseClient {
  return new Proxy(client as any, {
    get(target: any, prop: string, receiver: any) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      // Intercept .from('table') to wrap the returned query builder.
      // We carry the table name through so the insert wrapper knows whether
      // the table has an updatedAt column.
      if (prop === 'from') {
        return (table: string) => wrapQueryBuilder(value.call(target, table), table)
      }

      return value.bind(target)
    },
  }) as SupabaseClient
}

// ============================================================================
// Mock Supabase Client — used when Supabase env vars are not set.
// Returns empty results for all queries so the app runs in demo mode.
// ============================================================================
function createMockSupabaseQuery() {
  // A thenable object that also supports method chaining
  const result = { data: null as any, error: null as any, count: undefined as number | undefined }

  const chainable: any = {
    // Make it thenable so `await supabase.from('X').select(...)` resolves to { data, error, count }
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(result).then(onFulfilled, onRejected)
    },
    // Also support .catch and .finally
    catch(onRejected: any) {
      return Promise.resolve(result).catch(onRejected)
    },
    finally(onFinally: any) {
      return Promise.resolve(result).finally(onFinally)
    },
  }

  // Proxy that returns itself for any property access or method call (chaining)
  const proxy = new Proxy(chainable, {
    get(_target, prop, receiver) {
      // Return existing property (like `then`, `catch`, `data`, etc.)
      if (prop in chainable) {
        return Reflect.get(chainable, prop, receiver)
      }
      // For any method call, return a function that returns the proxy (for chaining)
      if (typeof prop === 'string') {
        return (..._args: any[]) => proxy
      }
      return undefined
    },
  })

  return proxy
}

function createMockSupabaseClient(): any {
  return new Proxy({} as any, {
    get(_target, prop, receiver) {
      // `from('TableName')` returns a query builder
      if (prop === 'from') {
        return (_table: string) => createMockSupabaseQuery()
      }
      // `channel` returns a mock channel object
      if (prop === 'channel') {
        return (_name: string) => ({
          on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
          subscribe: () => ({ unsubscribe: () => {} }),
        })
      }
      // `auth` returns a mock auth object
      if (prop === 'auth') {
        return {
          getUser: async () => ({ data: { user: null }, error: null }),
          getSession: async () => ({ data: { session: null }, error: null }),
          signOut: async () => ({ error: null }),
        }
      }
      // For any other property, return a function that returns a mock query
      if (typeof prop === 'string') {
        return (..._args: any[]) => createMockSupabaseQuery()
      }
      return undefined
    },
  })
}

// Export a proxy that returns the real client (with auto-id wrapper) or the mock client
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = isSupabaseConfigured ? wrapClient(getSupabaseClient()) : createMockSupabaseClient() as SupabaseClient
    const value = Reflect.get(client, prop, receiver)
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

// ============================================================================
// Paginated Query Helper
// ============================================================================

export interface PaginatedQueryOptions {
  page?: number
  limit?: number
  search?: string
  searchFields?: string[]
  filters?: Record<string, any>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResult<T = any> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function paginatedQuery<T = any>(
  table: string,
  options: PaginatedQueryOptions = {},
): Promise<PaginatedResult<T>> {
  const page = options.page || 1
  const limit = Math.min(100, Math.max(1, options.limit || 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase.from(table).select('*', { count: 'exact' })

  // Search filter
  if (options.search && options.searchFields?.length) {
    const orClauses = options.searchFields
      .map(f => `${f}.ilike.%${options.search}%`)
      .join(',')
    query = query.or(orClauses)
  }

  // Column filters
  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      if (value !== undefined && value !== null && value !== '') {
        query = query.eq(key, value)
      }
    }
  }

  // Sort
  const sortBy = options.sortBy || 'createdAt'
  const sortOrder = options.sortOrder || 'desc'
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  // Pagination
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: (data || []) as T[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// ============================================================================
// Count Helper
// ============================================================================

export async function countRows(
  table: string,
  where?: Record<string, any>,
): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })

  if (where) {
    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    }
  }

  const { count, error } = await query
  if (error) {
    console.error(`[countRows] Error on ${table}:`, error)
    return 0
  }
  return count || 0
}

// ============================================================================
// Sequential Execution Helper
// ============================================================================

export async function runSequential<T>(
  operations: (() => Promise<T>)[],
): Promise<T[]> {
  const results: T[] = []
  for (const op of operations) {
    results.push(await op())
  }
  return results
}

// ============================================================================
// Search Filter Helper
// ============================================================================

export function searchFilter(field: string, term: string) {
  return { field, term }
}

// ============================================================================
// Table Existence / Missing-Table Helper
// ============================================================================
// When a table does not yet exist in the Supabase database, the PostgREST
// server returns error code PGRST205 ("schemaCacheMiss" / "Could not find the
// table").  These helpers let API routes gracefully degrade to empty results
// instead of returning HTTP 500, so the UI can render an "empty state".

export function isMissingTableError(error: any): boolean {
  if (!error) return false
  const code = (error as any)?.code || (error as any)?.error_code
  if (code === 'PGRST205' || code === '42P01') return true
  const msg = String((error as any)?.message || (error as any)?.hint || '')
  return /could not find the table|does not exist|perhaps you meant/i.test(msg)
}

/**
 * Wraps a Supabase query promise. If the underlying error is a missing-table
 * error, returns an empty result instead of throwing. Otherwise re-throws.
 */
export async function safeSelect<T = any>(
  promise: Promise<{ data: T | null; error: any; count?: number }>,
  fallback: T = [] as unknown as T,
): Promise<{ data: T; error: null; count: number }> {
  try {
    const res = await promise
    if (res.error) {
      if (isMissingTableError(res.error)) {
        return { data: fallback, error: null, count: 0 }
      }
      throw res.error
    }
    return { data: (res.data ?? fallback) as T, error: null, count: res.count ?? 0 }
  } catch (error) {
    if (isMissingTableError(error)) {
      return { data: fallback, error: null, count: 0 }
    }
    throw error
  }
}
