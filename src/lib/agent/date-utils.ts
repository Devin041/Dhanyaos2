// ─── Date Utilities for AI Agent (IST timezone) ────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Get current date/time in IST */
export function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS)
}

/** Get today's date string in YYYY-MM-DD format (IST) */
export function istToday(): string {
  return istDateStr(new Date())
}

/** Get yesterday's date string (IST) */
export function istYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return istDateStr(d)
}

/** Get start of current week (Monday) in IST */
export function istWeekStart(): string {
  const d = istNow()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

/** Get start of current month (IST) */
export function istMonthStart(): string {
  const d = istNow()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Get start of current quarter (IST) */
export function istQuarterStart(): string {
  const d = istNow()
  const q = Math.floor(d.getMonth() / 3) * 3
  return `${d.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`
}

/** Get start of current year (IST) */
export function istYearStart(): string {
  const d = istNow()
  return `${d.getFullYear()}-01-01`
}

/** Format a Date to YYYY-MM-DD string in IST */
export function istDateStr(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  return ist.toISOString().split('T')[0]
}

/** Parse a date string or relative keyword to a Date object (IST-aware) */
export function parseDateInput(input: string | undefined): Date | undefined {
  if (!input) return undefined
  const s = String(input).trim().toLowerCase()

  switch (s) {
    case 'today':
    case 'aaj': {
      const ist = istNow()
      ist.setHours(0, 0, 0, 0)
      return new Date(ist.getTime() - IST_OFFSET_MS) // Convert back to UTC for Prisma
    }
    case 'yesterday':
    case 'kal': {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const ist = new Date(d.getTime() + IST_OFFSET_MS)
      ist.setHours(0, 0, 0, 0)
      return new Date(ist.getTime() - IST_OFFSET_MS)
    }
    case 'last_7_days':
    case 'pichle_7_din': {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      const ist = new Date(d.getTime() + IST_OFFSET_MS)
      ist.setHours(0, 0, 0, 0)
      return new Date(ist.getTime() - IST_OFFSET_MS)
    }
    case 'this_week':
    case 'is_hafte': {
      const start = istWeekStart()
      return new Date(start + 'T00:00:00.000Z')
    }
    case 'this_month':
    case 'is_mahine': {
      const start = istMonthStart()
      return new Date(start + 'T00:00:00.000Z')
    }
    case 'this_quarter':
    case 'is_quarter': {
      const start = istQuarterStart()
      return new Date(start + 'T00:00:00.000Z')
    }
    case 'this_year':
    case 'is_saal': {
      const start = istYearStart()
      return new Date(start + 'T00:00:00.000Z')
    }
    default: {
      // Try parsing as YYYY-MM-DD
      const parsed = new Date(s)
      if (!isNaN(parsed.getTime())) return parsed
      return undefined
    }
  }
}

/** Get end of today in IST (for Prisma lt: filter) */
export function istTodayEnd(): Date {
  const ist = istNow()
  ist.setHours(23, 59, 59, 999)
  return new Date(ist.getTime() - IST_OFFSET_MS)
}

/** Build Prisma date filter from fromDate/toDate inputs */
export function buildDateFilter(
  field: string,
  fromDate?: unknown,
  toDate?: unknown,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  const start = parseDateInput(fromDate as string | undefined)
  const end = parseDateInput(toDate as string | undefined)

  if (start || end) {
    const dateFilter: Record<string, unknown> = {}
    if (start) dateFilter.gte = start
    if (end) dateFilter.lte = end
    filter[field] = dateFilter
  }
  return filter
}

/** Get day of week name */
export function istDayName(): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[istNow().getDay()]
}

/** Get month name */
export function istMonthName(): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return months[istNow().getMonth()]
}

/** Human-readable relative time */
export function timeAgo(date: Date): string {
  const now = Date.now()
  const then = date.getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}