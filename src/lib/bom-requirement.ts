import { supabase } from './supabase-db'

/**
 * BOM Requirement Computation — shared lib
 *
 * Used by:
 *   - /api/boms/requirement (material planning endpoint)
 *   - /api/production (plannedFabricMeters derivation)
 *   - /api/production/[id]/fabric-issue-data (Phase 4 — requirement chips)
 *
 * Computes, for a style + qty, how much of each BOM material is required
 * (qty × qtyPerPiece × (1 + wastage/100)) and — for FABRIC lines measured in
 * meters — how much fabric is physically in stock (FabricStock, case-insensitive
 * fabricName match, color-aware).
 *
 * All reads are defensive: select('*') + `wastagePercent || 0` so a DB missing
 * the wastagePercent column degrades to 0 instead of crashing.
 */

export interface BomLineRow {
  id?: string
  materialType?: string | null
  materialName?: string | null
  color?: string | null
  unit?: string | null
  qtyPerPiece?: number | null
  wastagePercent?: number | null
  applicableColors?: string | null
}

export interface BomRow {
  id: string
  styleNo?: string | null
  version?: number | null
  isActive?: boolean | null
  notes?: string | null
}

export interface RequirementLine {
  materialType: string
  materialName: string
  color: string | null
  unit: string
  qtyPerPiece: number
  wastagePercent: number
  requiredQty: number
  availableQty: number | null
  gap: number | null
  status: 'OK' | 'SHORT' | 'UNKNOWN'
}

export interface RequirementSummary {
  totalLines: number
  ok: number
  short: number
  unknown: number
}

export interface BomRequirement {
  lines: RequirementLine[]
  summary: RequirementSummary
}

export type ComputeOutcome =
  | { ok: false; reason: 'missing-params' }
  | { ok: false; reason: 'no-active-bom' }
  | { ok: false; reason: 'error'; message: string }
  | { ok: true; bom: BomRow; requirement: BomRequirement }

/** Clamp a wastage percent into 0-100, defensive against null/NaN. */
export function clampWastage(v: any): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 100) return 100
  return n
}

/**
 * Latest active BOM for a style (isActive=true, highest version).
 * Returns null when the style has no active BOM.
 */
export async function getActiveBom(styleNo: string): Promise<BomRow | null> {
  if (!styleNo || !String(styleNo).trim()) return null
  try {
    const { data, error } = await supabase
      .from('BOM')
      .select('*')
      .eq('styleNo', String(styleNo).trim())
      .eq('isActive', true)
      .order('version', { ascending: false })
      .limit(1)
    if (error) return null
    if (!data || data.length === 0) return null
    const b = data[0] as BomRow
    // Defensive: a row that exists but lacks version/isActive still counts as
    // the active BOM (older rows in live DB may pre-date the activation flag).
    return { ...b, version: b.version ?? 1, isActive: b.isActive ?? true }
  } catch {
    return null
  }
}

/**
 * Compute per-line requirement for `qty` pieces of a style.
 *
 * Discriminated union outcome:
 *   { ok: false, reason: 'missing-params' }     — bad styleNo / qty
 *   { ok: false, reason: 'no-active-bom' }      — style has no active BOM
 *   { ok: false, reason: 'error', message }     — DB error while reading lines
 *   { ok: true, bom, requirement }              — success
 */
export async function computeBomRequirement(
  styleNo: string,
  qty: number,
): Promise<ComputeOutcome> {
  const cleanStyle = String(styleNo || '').trim()
  const qtyNum = Number(qty)
  if (!cleanStyle || !Number.isFinite(qtyNum) || qtyNum <= 0) {
    return { ok: false, reason: 'missing-params' }
  }

  const bom = await getActiveBom(cleanStyle)
  if (!bom) return { ok: false, reason: 'no-active-bom' }

  let lineRows: BomLineRow[] = []
  try {
    const { data: lines, error } = await supabase
      .from('BOMLine')
      .select('*')
      .eq('bomId', bom.id)
      .order('createdAt', { ascending: true })
    if (error) return { ok: false, reason: 'error', message: error.message || String(error) }
    lineRows = (lines || []) as BomLineRow[]
  } catch (err: any) {
    return { ok: false, reason: 'error', message: err?.message || 'Failed to read BOM lines' }
  }

  // One FabricStock fetch — reused for every FABRIC/meters line (JS matching).
  let fabricStock: Array<{ fabricName?: string | null; color?: string | null; availableMeters?: number | null }> = []
  try {
    const { data: stock, error: stockErr } = await supabase
      .from('FabricStock')
      .select('*')
    if (!stockErr && stock) fabricStock = stock
  } catch {
    // Stock availability is best-effort — degrade to UNKNOWN below.
  }

  const result: RequirementLine[] = []
  const summary: RequirementSummary = { totalLines: 0, ok: 0, short: 0, unknown: 0 }

  for (const l of lineRows) {
    const materialName = String(l.materialName || '').trim()
    if (!materialName) continue

    const materialType = String(l.materialType || 'FABRIC')
    const unit = String(l.unit || 'meters')
    const qtyPerPiece = Number(l.qtyPerPiece) || 0
    const wastagePercent = clampWastage(l.wastagePercent ?? 0)

    const requiredQty = round2(qtyNum * qtyPerPiece * (1 + wastagePercent / 100))

    // Stock availability only applies to fabric measured in meters.
    const stockEligible =
      materialType.toUpperCase() === 'FABRIC' && unit.toLowerCase() === 'meters'

    let availableQty: number | null = null
    let matchedAny = false

    if (stockEligible && fabricStock.length > 0) {
      const lcName = materialName.toLowerCase()
      const lcColor = l.color ? String(l.color).trim().toLowerCase() : null
      let total = 0
      for (const s of fabricStock) {
        const stockName = String(s.fabricName || '').trim().toLowerCase()
        if (stockName !== lcName) continue // case-insensitive EXACT name match
        // Line color null → any stock color counts; else color must match.
        if (lcColor) {
          const stockColor = s.color ? String(s.color).trim().toLowerCase() : null
          if (!stockColor || stockColor !== lcColor) continue
        }
        matchedAny = true
        total += Number(s.availableMeters) || 0
      }
      if (matchedAny) availableQty = round2(total)
    }

    const status: RequirementLine['status'] =
      availableQty === null ? 'UNKNOWN' : availableQty >= requiredQty ? 'OK' : 'SHORT'
    const gap = availableQty === null ? null : round2(availableQty - requiredQty)

    result.push({
      materialType,
      materialName,
      color: l.color ? String(l.color).trim() : null,
      unit,
      qtyPerPiece,
      wastagePercent,
      requiredQty,
      availableQty,
      gap,
      status,
    })

    summary.totalLines += 1
    if (status === 'OK') summary.ok += 1
    else if (status === 'SHORT') summary.short += 1
    else summary.unknown += 1
  }

  return { ok: true, bom, requirement: { lines: result, summary } }
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}
