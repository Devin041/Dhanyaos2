/**
 * Style Image Resolution — Server-Side (Supabase)
 *
 * Single source of truth for resolving product images across the entire lifecycle.
 * Resolution chain: Sample → CostSheet → FinishedGood → null
 *
 * Usage (in API routes):
 *   import { resolveStyleImage, batchResolveStyleImages, clearImageCache } from '@/lib/style-image'
 *   const { url, source } = await resolveStyleImage('DH-01')
 *   const images = await batchResolveStyleImages(['DH-01', 'DH-02', 'DH-03'])
 */

import { supabase } from './supabase-db'

// ─── In-Memory Cache ─────────────────────────────────────────────────────────
const cache = new Map<string, { url: string | null; source: string; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached(styleNo: string): { url: string | null; source: string } | null {
  const entry = cache.get(styleNo)
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return { url: entry.url, source: entry.source }
  }
  cache.delete(styleNo)
  return null
}

function setCache(styleNo: string, url: string | null, source: string) {
  cache.set(styleNo, { url, source, ts: Date.now() })
}

export function clearImageCache(styleNo?: string) {
  if (styleNo) {
    cache.delete(styleNo)
  } else {
    cache.clear()
  }
}

// ─── Single Style Resolution ─────────────────────────────────────────────────

export interface StyleImageResult {
  url: string | null
  source: 'sample' | 'costsheet' | 'fgstock' | null
}

export async function resolveStyleImage(styleNo: string): Promise<StyleImageResult> {
  if (!styleNo) return { url: null, source: null }

  // Check cache
  const cached = getCached(styleNo)
  if (cached) return cached

  // 1. Check Sample → SamplePhoto (primary source — first photo by sortOrder)
  try {
    const { data: sample } = await supabase
      .from('Sample')
      .select('id, photos:SamplePhoto(imageUrl, sortOrder)')
      .eq('styleNo', styleNo)
      .limit(1)
      .single()

    if (sample?.photos && sample.photos.length > 0) {
      const sorted = [...sample.photos].sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      const url = sorted[0].imageUrl
      if (url) {
        setCache(styleNo, url, 'sample')
        return { url, source: 'sample' }
      }
    }
  } catch {
    // Continue to next source
  }

  // 2. Check CostSheet
  try {
    const { data: costSheet } = await supabase
      .from('CostSheet')
      .select('image')
      .eq('styleNo', styleNo)
      .limit(1)
      .single()

    if (costSheet?.image) {
      setCache(styleNo, costSheet.image, 'costsheet')
      return { url: costSheet.image, source: 'costsheet' }
    }
  } catch {
    // Continue
  }

  // 3. Check FinishedGood
  try {
    const { data: fg } = await supabase
      .from('FinishedGood')
      .select('id, styleNo')
      .eq('styleNo', styleNo)
      .order('createdAt', { ascending: true })
      .limit(1)
      .single()

    // FinishedGood doesn't have an image field, but we cache the match
    if (fg) {
      // No image on FinishedGood itself, but we note it exists
      setCache(styleNo, null, 'fgstock')
      return { url: null, source: 'fgstock' }
    }
  } catch {
    // No image found
  }

  setCache(styleNo, null, 'null')
  return { url: null, source: null }
}

// ─── Batch Resolution ────────────────────────────────────────────────────────

export async function batchResolveStyleImages(
  styleNos: string[]
): Promise<Record<string, StyleImageResult>> {
  const results: Record<string, StyleImageResult> = {}
  const remaining: string[] = []

  // Check cache first
  for (const styleNo of styleNos) {
    const cached = getCached(styleNo)
    if (cached) {
      results[styleNo] = cached as StyleImageResult
    } else {
      results[styleNo] = { url: null, source: null }
      remaining.push(styleNo)
    }
  }

  if (remaining.length === 0) return results

  // Batch query Samples with their photos
  try {
    const { data: samples } = await supabase
      .from('Sample')
      .select('styleNo, photos:SamplePhoto(imageUrl, sortOrder)')
      .in('styleNo', remaining)

    if (samples) {
      for (const sample of samples) {
        if (sample.photos && sample.photos.length > 0 && remaining.includes(sample.styleNo)) {
          const sorted = [...sample.photos].sort((a: any, b: any) => a.sortOrder - b.sortOrder)
          const url = sorted[0].imageUrl
          if (url) {
            results[sample.styleNo] = { url, source: 'sample' }
            setCache(sample.styleNo, url, 'sample')
            const idx = remaining.indexOf(sample.styleNo)
            if (idx > -1) remaining.splice(idx, 1)
          }
        }
      }
    }
  } catch {
    // Continue
  }

  if (remaining.length === 0) return results

  // Batch query CostSheets
  try {
    const { data: costSheets } = await supabase
      .from('CostSheet')
      .select('styleNo, image')
      .in('styleNo', remaining)

    if (costSheets) {
      for (const cs of costSheets) {
        if (cs.image && remaining.includes(cs.styleNo)) {
          results[cs.styleNo] = { url: cs.image, source: 'costsheet' }
          setCache(cs.styleNo, cs.image, 'costsheet')
          const idx = remaining.indexOf(cs.styleNo)
          if (idx > -1) remaining.splice(idx, 1)
        }
      }
    }
  } catch {
    // Continue
  }

  // Cache remaining as null
  for (const styleNo of remaining) {
    setCache(styleNo, null, 'null')
  }

  return results
}
