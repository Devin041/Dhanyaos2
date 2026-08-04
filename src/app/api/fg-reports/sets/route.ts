import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET() {
  try {
    const { data: bins, error } = await supabase
      .from('FGStockBin')
      .select('*')
      .order('styleNo', { ascending: true })
      .order('color', { ascending: true })
      .order('size', { ascending: true })
    if (error) throw error

    // Group by styleNo + colorCode
    const groups = new Map<string, {
      styleNo: string
      styleName: string
      colorCode: string
      color: string
      sizes: { size: string; availableQty: number; binId: string }[]
    }>()

    for (const bin of (bins || [])) {
      const key = `${bin.styleNo}|${bin.colorCode}`
      const existing = groups.get(key) || {
        styleNo: bin.styleNo,
        styleName: bin.styleName,
        colorCode: bin.colorCode,
        color: bin.color,
        sizes: [],
      }
      existing.sizes.push({ size: bin.size, availableQty: bin.availableQty, binId: bin.id })
      groups.set(key, existing)
    }

    const result = []
    for (const [, group] of groups) {
      const sizeCount = group.sizes.length
      const fullSets = sizeCount > 0 ? Math.min(...group.sizes.map((s) => s.availableQty)) : 0
      const totalPieces = group.sizes.reduce((s, sz) => s + sz.availableQty, 0)
      const orphanPieces = Math.max(0, totalPieces - fullSets * sizeCount)

      result.push({
        styleNo: group.styleNo,
        styleName: group.styleName,
        colorCode: group.colorCode,
        color: group.color,
        sizeCount,
        fullSets,
        totalPieces,
        orphanPieces,
        sizes: group.sizes,
      })
    }

    // Sort by orphanPieces desc (worst first)
    result.sort((a, b) => b.orphanPieces - a.orphanPieces)

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
