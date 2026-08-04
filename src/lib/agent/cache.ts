// ─── In-Memory LRU Cache with TTL Expiration ───────────────────────────────────

interface CacheEntry<T = unknown> {
  value: T
  expiresAt: number
}

export class AgentCache {
  private store = new Map<string, CacheEntry>()
  private readonly maxSize: number

  constructor(maxSize = 100) {
    this.maxSize = maxSize
  }

  /** Retrieve a cached value. Returns null on miss or expiration. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    // LRU: re-insert to move to end (most recently used)
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value as T
  }

  /** Store a value with a TTL in milliseconds. Evicts LRU entry if at capacity. */
  set(key: string, value: unknown, ttlMs: number): void {
    // Remove existing entry first so size is accurate
    if (this.store.has(key)) this.store.delete(key)

    // Evict least-recently-used (first map entry) if at capacity
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }

    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  /** Invalidate entries. With no pattern, clears all. With a pattern (substring match), removes matching keys. */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.store.clear()
      return
    }
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) this.store.delete(key)
    }
  }

  /** Return cache stats: current size, max size, and hit/miss counts. */
  stats() {
    const now = Date.now()
    let alive = 0
    let expired = 0
    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) expired++
      else alive++
    }
    return { size: this.store.size, maxSize: this.maxSize, alive, expired }
  }
}

// ─── Singleton Instances ───────────────────────────────────────────────────────

/** Tool results cache — max 100 entries, short TTL (2 min default) */
export const resultCache = new AgentCache(100)

/** Proactive alerts cache — max 10 entries, longer TTL (10 min) */
export const alertCache = new AgentCache(10)

/** User intent classification cache — max 50 entries, medium TTL (5 min) */
export const classCache = new AgentCache(50)

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic hash of tool name + params for cache keys. */
export function hashParams(params: Record<string, unknown>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('&')
  // Simple DJB2-style hash — fast, good distribution, no external deps
  let hash = 5381
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash + sorted.charCodeAt(i)) & 0x7fffffff
  }
  return `${hash.toString(36)}`
}