import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: original, error: fetchErr } = await supabase
      .from('CostSheet')
      .select('*, CostItem(*)')
      .eq('id', id)
      .single()
    if (!original || fetchErr) return NextResponse.json({ error: 'Cost sheet not found' }, { status: 404 })
    const orig = original as any

    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const prefix = `CS-${y}${m}${d}-`
    const { data: last } = await supabase.from('CostSheet').select('sheetNo').ilike('sheetNo', `${prefix}%`).order('sheetNo', { ascending: false }).limit(1).single()
    const nextNum = last ? parseInt((last as any).sheetNo.slice(prefix.length), 10) + 1 : 1
    const newSheetNo = `${prefix}${String(nextNum).padStart(3, '0')}`
    const newDescription = orig.description ? `Copy of ${orig.description}` : null
    const ts = new Date().toISOString()

    const { data: dup, error } = await supabase.from('CostSheet').insert({
      sheetNo: newSheetNo, styleNo: orig.styleNo, styleName: orig.styleName, customerId: orig.customerId,
      description: newDescription, sizeRange: orig.sizeRange, targetQty: orig.targetQty,
      fabricCost: orig.fabricCost, trimCost: orig.trimCost, laborCost: orig.laborCost,
      washCost: orig.washCost, packagingCost: orig.packagingCost, overheadCost: orig.overheadCost,
      otherCost: orig.otherCost, totalCost: orig.totalCost, profitPercent: orig.profitPercent,
      sellingPrice: orig.sellingPrice, status: 'Draft', notes: orig.notes,
      createdAt: ts, updatedAt: ts,
    }).select('*, customer:customerId(id, companyName)').single()
    if (error) throw error

    if (orig.CostItem && orig.CostItem.length > 0) {
      await supabase.from('CostItem').insert(orig.CostItem.map((item: any) => ({
        costSheetId: dup!.id, category: item.category, itemName: item.itemName, description: item.description,
        consumption: item.consumption, unit: item.unit, unitRate: item.unitRate, wastagePercent: item.wastagePercent,
        itemCost: item.itemCost, notes: item.notes, createdAt: ts, updatedAt: ts,
      })))
    }

    const { data: fullDup } = await supabase.from('CostSheet').select('*, customer:customerId(id, companyName), CostItem(*)').eq('id', dup!.id).single()
    const result = { ...fullDup } as any
    if (result.CostItem) result.CostItem.sort((a: any, b: any) => a.category.localeCompare(b.category) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    result.costItems = result.CostItem
    delete result.CostItem
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('POST /api/cost-sheets/[id]/duplicate error:', error)
    return NextResponse.json({ error: 'Failed to duplicate cost sheet' }, { status: 500 })
  }
}
