import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { randomUUID } from 'crypto'

async function getNextSheetNo(): Promise<string> {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const prefix = `CS-${y}${m}${d}-`

  const { data: last } = await supabase
    .from('CostSheet')
    .select('sheetNo')
    .ilike('sheetNo', `${prefix}%`)
    .order('sheetNo', { ascending: false })
    .limit(1)
    .single()

  const nextNum = last ? parseInt((last as any).sheetNo.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(nextNum).padStart(3, '0')}`
}

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const customer = searchParams.get('customer')

    const { data: costSheetsRaw, error } = await supabase
      .from('CostSheet')
      .select('*, customer:customerId(id, companyName)')
      .order('createdAt', { ascending: false })

    if (error) throw error

    let costSheets = costSheetsRaw || []

    if (status) {
      costSheets = costSheets.filter((cs: any) => cs.status === status)
    }
    if (customer) {
      costSheets = costSheets.filter((cs: any) => cs.customerId === customer)
    }
    if (search) {
      const term = search.toLowerCase()
      costSheets = costSheets.filter((cs: any) =>
        (cs.styleNo || '').toLowerCase().includes(term) ||
        (cs.styleName || '').toLowerCase().includes(term) ||
        (cs.sheetNo || '').toLowerCase().includes(term)
      )
    }

    const sheetIds = costSheets.map((cs: any) => cs.id)
    let itemCountMap: Record<string, number> = {}
    let colorCountMap: Record<string, number> = {}
    const colorQtyMap: Record<string, number> = {}

    if (sheetIds.length > 0) {
      const [itemsRes, colorsRes] = await Promise.all([
        supabase.from('CostItem').select('costSheetId'),
        supabase.from('CostSheetColor').select('costSheetId, quantity'),
      ])

      for (const item of (itemsRes.data || [])) {
        const i = item as any
        itemCountMap[i.costSheetId] = (itemCountMap[i.costSheetId] || 0) + 1
      }
      for (const cd of (colorsRes.data || [])) {
        const c = cd as any
        colorCountMap[c.costSheetId] = (colorCountMap[c.costSheetId] || 0) + 1
        colorQtyMap[c.costSheetId] = (colorQtyMap[c.costSheetId] || 0) + (c.quantity || 0)
      }
    }

    const styleNosWithoutImage = [...new Set(
      costSheets.filter((cs: any) => !cs.image).map((cs: any) => cs.styleNo)
    )]
    const samplePhotoMap: Record<string, string | null> = {}
    if (styleNosWithoutImage.length > 0) {
      const { data: samples } = await supabase
        .from('Sample')
        .select('id, styleNo')
        .in('styleNo', styleNosWithoutImage)
      const sampleIds = (samples || []).map((s: any) => s.id)

      if (sampleIds.length > 0) {
        const { data: photos } = await supabase
          .from('SamplePhoto')
          .select('sampleId, imageUrl, sortOrder')
          .in('sampleId', sampleIds)
          .order('sortOrder', { ascending: true })

        const samplePhoto: Record<string, string | null> = {}
        for (const p of (photos || [])) {
          const ph = p as any
          if (!samplePhoto[ph.sampleId]) {
            samplePhoto[ph.sampleId] = ph.imageUrl
          }
        }
        for (const s of (samples || [])) {
          const sa = s as any
          if (samplePhoto[sa.id]) {
            samplePhotoMap[sa.styleNo] = samplePhoto[sa.id]
          }
        }
      }
    }

    const sheetsWithCount = costSheets.map((cs: any) => ({
      ...cs,
      image: cs.image || samplePhotoMap[cs.styleNo] || null,
      itemCount: itemCountMap[cs.id] || 0,
      colorCount: colorCountMap[cs.id] || 0,
      lotQty: colorQtyMap[cs.id] || 0,
    }))

    let allForCounts = costSheetsRaw || []
    if (search) {
      const term = search.toLowerCase()
      allForCounts = allForCounts.filter((cs: any) =>
        (cs.styleNo || '').toLowerCase().includes(term) ||
        (cs.styleName || '').toLowerCase().includes(term) ||
        (cs.sheetNo || '').toLowerCase().includes(term)
      )
    }

    const statusCounts: Record<string, number> = {}
    for (const s of allForCounts) {
      statusCounts[(s as any).status] = (statusCounts[(s as any).status] || 0) + 1
    }

    return NextResponse.json({
      costSheets: sheetsWithCount,
      total: costSheets.length,
      statusCounts,
    })
  } catch (error) {
    console.error('GET /api/cost-sheets error:', error)
    return NextResponse.json({ error: 'Failed to fetch cost sheets' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { styleNo, styleName, customerId, description, sizeRange, targetQty, profitPercent, brokerCommissionPercent, notes, image, items, colorBreakdown } = body

    if (!styleNo || !styleName) {
      return NextResponse.json({ error: 'styleNo and styleName are required' }, { status: 400 })
    }

    const sheetNo = await getNextSheetNo()
    const pp = profitPercent ?? 30
    const bcp = brokerCommissionPercent ?? 0

    let costs = { fabricCost: 0, trimCost: 0, laborCost: 0, washCost: 0, packagingCost: 0, overheadCost: 0, otherCost: 0, totalCost: 0 }
    if (items && items.length > 0) {
      costs = calcItemsSummary(items)
    }

    const sellingPrice = costs.totalCost * (1 + pp / 100)
    const brokerCommissionAmount = Math.round(sellingPrice * (bcp / 100) * 100) / 100

    const now = new Date().toISOString()

    // Generate a unique id — Supabase CostSheet table doesn't have a default id generator
    const id = randomUUID()

    const { data: costSheet, error } = await supabase
      .from('CostSheet')
      .insert({
        id,
        sheetNo, styleNo, styleName,
        customerId: customerId || null,
        description: description || null,
        sizeRange: sizeRange || null,
        targetQty: targetQty ?? 0,
        fabricCost: costs.fabricCost,
        trimCost: costs.trimCost,
        laborCost: costs.laborCost,
        washCost: costs.washCost,
        packagingCost: costs.packagingCost,
        overheadCost: costs.overheadCost,
        otherCost: costs.otherCost,
        totalCost: costs.totalCost,
        profitPercent: pp,
        sellingPrice,
        brokerCommissionPercent: bcp,
        brokerCommissionAmount,
        image: image || null,
        notes: notes || null,
        status: 'Draft',
        createdAt: now, updatedAt: now,
      })
      .select('*, customer:customerId(id, companyName)')
      .single()

    if (error) throw error

    if (items && items.length > 0) {
      const itemRows = items.map((item: Record<string, unknown>) => ({
        id: randomUUID(),
        costSheetId: costSheet!.id,
        category: item.category || 'Other',
        itemName: item.itemName || '',
        description: item.description || null,
        consumption: item.consumption ?? 0,
        unit: item.unit || 'pcs',
        unitRate: item.unitRate ?? 0,
        wastagePercent: item.wastagePercent ?? 5,
        itemCost: Number(item.consumption ?? 0) * Number(item.unitRate ?? 0) * (1 + Number(item.wastagePercent ?? 5) / 100),
        notes: item.notes || null,
        createdAt: now, updatedAt: now,
      }))
      const { error: itemsErr } = await supabase.from('CostItem').insert(itemRows)
      if (itemsErr) console.error('CostItem insert error:', itemsErr)
    }

    if (colorBreakdown && colorBreakdown.length > 0) {
      const colorRows = colorBreakdown.map((c: { color: string; quantity: number }) => ({
        id: randomUUID(),
        costSheetId: costSheet!.id, color: c.color || '', quantity: c.quantity || 0,
        createdAt: now, updatedAt: now,
      }))
      const { error: colorsErr } = await supabase.from('CostSheetColor').insert(colorRows)
      if (colorsErr) console.error('CostSheetColor insert error:', colorsErr)
    }

    const { data: fullSheet } = await supabase
      .from('CostSheet')
      .select('*, customer:customerId(id, companyName), CostItem(*), CostSheetColor(*)')
      .eq('id', costSheet!.id)
      .single()

    const result = { ...fullSheet } as any
    if (result.CostItem) result.CostItem.sort((a: any, b: any) => a.category.localeCompare(b.category) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (result.CostSheetColor) result.CostSheetColor.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    result.costItems = result.CostItem
    result.colorBreakdown = result.CostSheetColor
    delete result.CostItem
    delete result.CostSheetColor

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('POST /api/cost-sheets error:', error)
    return NextResponse.json({ error: 'Failed to create cost sheet' }, { status: 500 })
  }
}
