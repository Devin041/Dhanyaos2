import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

function mapCategoryToLegacy(category: string): 'fabricCost' | 'trimCost' | 'laborCost' | 'washCost' | 'packagingCost' | 'overheadCost' | 'otherCost' {
  const cat = (category || '').toLowerCase()
  if (cat.includes('fabric') || cat.includes('lining')) return 'fabricCost'
  if (cat.includes('trim') || cat.includes('accessor') || cat.includes('label') || cat.includes('tag') || cat.includes('button') || cat.includes('zip')) return 'trimCost'
  if (cat.includes('embroid') || cat.includes('stitch') || cat.includes('cutting') || cat.includes('labor') || cat.includes('finishing') || cat.includes('iron') || cat.includes('print')) return 'laborCost'
  if (cat.includes('dye') || cat.includes('wash')) return 'washCost'
  if (cat.includes('pack')) return 'packagingCost'
  if (cat.includes('overhead') || cat.includes('transport') || cat.includes('logistic')) return 'overheadCost'
  return 'otherCost'
}

function calcItemsSummary(items: Record<string, unknown>[]) {
  const costs = { fabricCost: 0, trimCost: 0, laborCost: 0, washCost: 0, packagingCost: 0, overheadCost: 0, otherCost: 0 }
  let totalCost = 0
  for (const item of items) {
    const cost = Number(item.consumption ?? 0) * Number(item.unitRate ?? 0) * (1 + Number(item.wastagePercent ?? 5) / 100)
    totalCost += cost
    const legacy = mapCategoryToLegacy(item.category as string)
    costs[legacy] += cost
  }
  return { ...costs, totalCost }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: costSheet, error } = await supabase
      .from('CostSheet')
      .select('*, customer:customerId(id, companyName), CostItem(*), CostSheetColor(*)')
      .eq('id', id)
      .single()
    if (!costSheet || error) return NextResponse.json({ error: 'Cost sheet not found' }, { status: 404 })
    const result = { ...costSheet } as any
    if (result.CostItem) result.CostItem.sort((a: any, b: any) => a.category.localeCompare(b.category) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (result.CostSheetColor) result.CostSheetColor.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    result.costItems = result.CostItem
    result.colorBreakdown = result.CostSheetColor
    delete result.CostItem
    delete result.CostSheetColor
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/cost-sheets/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch cost sheet' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { data: existing, error: fetchErr } = await supabase.from('CostSheet').select('*').eq('id', id).single()
    if (!existing || fetchErr) return NextResponse.json({ error: 'Cost sheet not found' }, { status: 404 })
    const ex = existing as any
    const profitPercent = body.profitPercent ?? ex.profitPercent
    const brokerCommissionPercent = body.brokerCommissionPercent ?? ex.brokerCommissionPercent ?? 0
    let costs = { fabricCost: ex.fabricCost, trimCost: ex.trimCost, laborCost: ex.laborCost, washCost: ex.washCost, packagingCost: ex.packagingCost, overheadCost: ex.overheadCost, otherCost: ex.otherCost, totalCost: ex.totalCost }
    if (body.items && Array.isArray(body.items)) costs = calcItemsSummary(body.items)
    const sellingPrice = costs.totalCost * (1 + profitPercent / 100)
    const brokerCommissionAmount = Math.round(sellingPrice * (brokerCommissionPercent / 100) * 100) / 100
    if (body.items && Array.isArray(body.items)) await supabase.from('CostItem').delete().eq('costSheetId', id)
    const updateData: Record<string, unknown> = {
      fabricCost: costs.fabricCost, trimCost: costs.trimCost, laborCost: costs.laborCost,
      washCost: costs.washCost, packagingCost: costs.packagingCost, overheadCost: costs.overheadCost,
      otherCost: costs.otherCost, totalCost: costs.totalCost, profitPercent, sellingPrice,
      brokerCommissionPercent, brokerCommissionAmount, updatedAt: new Date().toISOString(),
    }
    if (body.styleNo !== undefined) updateData.styleNo = body.styleNo
    if (body.styleName !== undefined) updateData.styleName = body.styleName
    if (body.customerId !== undefined) updateData.customerId = body.customerId || null
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.sizeRange !== undefined) updateData.sizeRange = body.sizeRange || null
    if (body.targetQty !== undefined) updateData.targetQty = body.targetQty
    if (body.status !== undefined) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.image !== undefined) updateData.image = body.image || null
    if (body.colorBreakdown && Array.isArray(body.colorBreakdown)) await supabase.from('CostSheetColor').delete().eq('costSheetId', id)
    const { error } = await supabase.from('CostSheet').update(updateData).eq('id', id)
    if (error) throw error
    if (body.colorBreakdown && Array.isArray(body.colorBreakdown)) {
      const now = new Date().toISOString()
      await supabase.from('CostSheetColor').insert(body.colorBreakdown.map((c: { color: string; quantity: number }) => ({ costSheetId: id, color: c.color || '', quantity: c.quantity || 0, createdAt: now, updatedAt: now })))
    }
    if (body.items && Array.isArray(body.items)) {
      const now = new Date().toISOString()
      await supabase.from('CostItem').insert(body.items.map((item: Record<string, unknown>) => ({
        costSheetId: id, category: item.category || 'Other', itemName: item.itemName || '',
        description: item.description || null, consumption: item.consumption ?? 0, unit: item.unit || 'pcs',
        unitRate: item.unitRate ?? 0, wastagePercent: item.wastagePercent ?? 5,
        itemCost: Number(item.consumption ?? 0) * Number(item.unitRate ?? 0) * (1 + Number(item.wastagePercent ?? 5) / 100),
        notes: item.notes || null, createdAt: now, updatedAt: now,
      })))
    }
    const { data: fullSheet } = await supabase.from('CostSheet').select('*, customer:customerId(id, companyName), CostItem(*), CostSheetColor(*)').eq('id', id).single()
    const result = { ...fullSheet } as any
    if (result.CostItem) result.CostItem.sort((a: any, b: any) => a.category.localeCompare(b.category) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (result.CostSheetColor) result.CostSheetColor.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    result.costItems = result.CostItem
    result.colorBreakdown = result.CostSheetColor
    delete result.CostItem
    delete result.CostSheetColor
    return NextResponse.json(result)
  } catch (error) {
    console.error('PATCH /api/cost-sheets/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update cost sheet' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: existing } = await supabase.from('CostSheet').select('id').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'Cost sheet not found' }, { status: 404 })
    await supabase.from('CostItem').delete().eq('costSheetId', id)
    await supabase.from('CostSheetColor').delete().eq('costSheetId', id)
    await supabase.from('CostSheet').delete().eq('id', id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/cost-sheets/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete cost sheet' }, { status: 500 })
  }
}
