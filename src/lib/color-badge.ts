// ─── Color badge classes — SHARED color map (Phase 5a) ───────────────────────
//
// ONE source of truth for color→badge-class mapping across modules:
//   - src/components/modules/production.tsx (kanban cards, group headers,
//     detail dialogs, New Job color matrix)
//   - src/components/modules/quality-control.tsx (QC row badges)
//   - src/components/modules/product-tracker.tsx (Phase 6 — future import)
//
// Deliberately React-free: class STRINGS only, no JSX/React import, so API
// routes / server code could import it too if they ever need to classify a
// color. Do not add React types here.

/**
 * Tailwind class bundles per known garment color. Keys are lowercase; lookup
 * is case-insensitive (exact match first, then substring so "Deep Red" finds
 * "red"). Unknown colors fall back to a neutral primary-tinted pill.
 */
export const COLOR_BADGE_CLASSES: Record<string, string> = {
  red: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  wine: 'bg-rose-900/15 text-rose-700 dark:text-rose-300 border-rose-900/30',
  maroon: 'bg-red-900/15 text-red-800 dark:text-red-300 border-red-900/30',
  blue: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  navy: 'bg-blue-900/15 text-blue-800 dark:text-blue-300 border-blue-900/30',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  black: 'bg-zinc-800/15 text-zinc-800 dark:text-zinc-300 border-zinc-800/30',
  white: 'bg-white text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-500/50',
  yellow: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  pink: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30',
  purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  orange: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  grey: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
  gray: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
}

/** Neutral fallback for colors not in the map (still a real color job). */
export const COLOR_BADGE_FALLBACK_CLASSES =
  'bg-primary/10 text-foreground/70 border-border'

/** Longest-first key order for substring matching (stable within a length). */
const SUBSTRING_ORDER = Object.keys(COLOR_BADGE_CLASSES).sort(
  (a, b) => b.length - a.length
)

/**
 * Class string for a color name. Case-insensitive:
 *   1. exact map hit — 'Navy' → navy classes
 *   2. substring hit (longest key first) — 'Deep Red' → red classes,
 *      'Baby Pink' → pink classes
 *   3. fallback — neutral primary/10 pill
 */
export function colorNameToClasses(color?: string | null): string {
  const name = String(color || '').trim().toLowerCase()
  if (!name) return COLOR_BADGE_FALLBACK_CLASSES
  if (COLOR_BADGE_CLASSES[name]) return COLOR_BADGE_CLASSES[name]
  for (const key of SUBSTRING_ORDER) {
    if (name.includes(key)) return COLOR_BADGE_CLASSES[key]
  }
  return COLOR_BADGE_FALLBACK_CLASSES
}

/**
 * True when a job/row carries an actual garment color. 'Free' (the default
 * for legacy one-color jobs), null, '' and the literal string 'null' are all
 * "no color" → badges suppressed.
 */
export function isColorJob(color?: string | null): boolean {
  const c = String(color || '').trim().toLowerCase()
  return c !== '' && c !== 'free' && c !== 'null'
}
