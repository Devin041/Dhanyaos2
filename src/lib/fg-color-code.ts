import { supabase } from './supabase-db'

// Color prefix mapping
const COLOR_PREFIXES: Record<string, string> = {
  pink: 'PK', red: 'RD', blue: 'BL', green: 'GR', navy: 'NV',
  maroon: 'MR', yellow: 'YL', orange: 'OR', purple: 'PU', white: 'WH',
  black: 'BK', beige: 'BE', cream: 'CR', grey: 'GY', gray: 'GY',
  gold: 'GO', brown: 'BR', teal: 'TE', olive: 'OL', peach: 'PE', silver: 'SI',
}

export function getColorPrefix(color: string): string {
  const key = color.trim().toLowerCase()
  return COLOR_PREFIXES[key] || key.substring(0, 2).toUpperCase()
}

export async function generateColorCode(
  styleNo: string,
  color: string
): Promise<string> {
  const prefix = getColorPrefix(color)
  const pattern = `${styleNo}-${prefix}`

  const { data: existing } = await supabase
    .from('FGStockBin')
    .select('colorCode')
    .ilike('colorCode', `${pattern}%`)
    .order('colorCode', { ascending: true })

  let maxSeq = 0
  for (const bin of (existing || [])) {
    const afterPrefix = (bin as any).colorCode.substring(pattern.length)
    const seq = parseInt(afterPrefix, 10)
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq
  }

  return `${pattern}${String(maxSeq + 1).padStart(2, '0')}`
}

export function generateMovementNo(): string {
  const d = new Date()
  const dateStr =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `FGM-${dateStr}-${rand}`
}

export function generateGrnNo(): string {
  const d = new Date()
  const dateStr =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `FGRN-${dateStr}-${rand}`
}

export function generateReservationNo(): string {
  const d = new Date()
  const dateStr =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `FGRV-${dateStr}-${rand}`
}

export type StockBinWithComputed = {
  id: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  availableQty: number
  reservedQty: number
  qcPendingQty: number
  underRepairQty: number
  defectiveQty: number
  scrappedQty: number
  exhibitionQty: number
  unitCost: number
  unitSellPrice: number
  image: string | null
  firstInDate: string | null
  lastMovementDate: string | null
  location: string
  notes: string | null
  createdAt: string
  updatedAt: string
  totalPieces: number
  stockValue: number
  sellValue: number
  health: string
}

export function computeBinHealth(bin: {
  availableQty: number
  reservedQty: number
  qcPendingQty: number
  underRepairQty: number
  defectiveQty: number
  scrappedQty: number
  exhibitionQty: number
}): string {
  if (bin.defectiveQty > 0 || bin.scrappedQty > 0) return 'DeadStock'
  const total = bin.availableQty + bin.reservedQty + bin.qcPendingQty + bin.underRepairQty + bin.exhibitionQty
  if (total === 0) return 'Empty'
  if (bin.availableQty >= 50) return 'Healthy'
  if (bin.availableQty >= 10) return 'LowStock'
  return 'Critical'
}

export function withComputedFields(bin: any): StockBinWithComputed {
  const totalPieces =
    bin.availableQty + bin.reservedQty + bin.qcPendingQty +
    bin.underRepairQty + bin.defectiveQty + bin.scrappedQty + bin.exhibitionQty
  return {
    ...bin,
    totalPieces,
    stockValue: totalPieces * (bin.unitCost || 0),
    sellValue: totalPieces * (bin.unitSellPrice || 0),
    health: computeBinHealth(bin),
  }
}
