export function parseBomLine(line: any) {
  const colors = Array.isArray(line.applicableColors)
    ? line.applicableColors.filter((c: any) => typeof c === 'string' && c.trim())
    : []
  return {
    materialType: ['FABRIC', 'ACCESSORY', 'TRIM', 'SERVICE', 'OTHER'].includes(line.materialType)
      ? line.materialType
      : 'FABRIC',
    materialName: String(line.materialName || '').trim(),
    color: line.color ? String(line.color).trim() : null,
    unit: line.unit ? String(line.unit).trim() : 'meters',
    qtyPerPiece: Number(line.qtyPerPiece) || 0,
    applicableColors: colors.length > 0 ? JSON.stringify(colors) : null,
    wastagePercent: clampWastage(line.wastagePercent),
  }
}

/** Clamp a wastage percent into 0-100, defensive against null/NaN/undefined. */
export function clampWastage(v: any): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 100) return 100
  return n
}

/**
 * Detects a PostgREST "column does not exist" error (e.g. BOMLine.wastagePercent
 * missing because SUPABASE-MIGRATION-COLOR-PRODUCTION.sql wasn't run yet).
 * PGRST204: "Could not find the 'x' column of 'y' in the schema cache"
 * 42703: PostgreSQL undefined_column
 */
export function isMissingColumnError(error: any): boolean {
  if (!error) return false
  const code = (error as any)?.code || (error as any)?.error_code
  if (code === 'PGRST204' || code === '42703') return true
  const msg = String((error as any)?.message || (error as any)?.hint || '')
  return /column .* does not exist|does not exist in the schema cache|could not find the .* column/i.test(msg)
}

/** Strips wastagePercent from BOMLine row objects (pre-migration insert fallback). */
export function stripWastage<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((r) => {
    const { wastagePercent: _omit, ...rest } = r
    return rest as T
  })
}

export const WASTAGE_MIGRATION_HINT =
  'wastagePercent not saved — run SUPABASE-MIGRATION-COLOR-PRODUCTION.sql'

export function decorateBom(bom: any, lines: any[]) {
  return {
    ...bom,
    lines: (lines || []).map((l) => ({
      ...l,
      applicableColorsList: l.applicableColors ? (() => {
        try { return JSON.parse(l.applicableColors) } catch { return [] }
      })() : [],
    })),
  }
}
