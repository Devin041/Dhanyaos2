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
  }
}

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
