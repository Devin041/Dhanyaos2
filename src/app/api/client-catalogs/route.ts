import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

function generateCatalogNo(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `CAT-${y}${m}${d}-`
}

async function getNextCatalogNo(): Promise<string> {
  const prefix = generateCatalogNo()

  const { data: last } = await supabase
    .from('ClientCatalog')
    .select('catalogNo')
    .ilike('catalogNo', `${prefix}%`)
    .order('catalogNo', { ascending: false })
    .limit(1)
    .single()

  const nextNum = last ? parseInt(last.catalogNo.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(nextNum).padStart(3, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const customerId = searchParams.get('customer')

    let query = supabase
      .from('ClientCatalog')
      .select('*, customer:customerId(id, companyName, phone, gstNumber, billingAddress), broker:brokerId(id, name, commissionPercent)')

    if (customerId) {
      query = query.eq('customerId', customerId)
    }

    const { data: catalogs } = await query.order('createdAt', { ascending: false })

    // Get item counts
    const enrichedCatalogs = await Promise.all((catalogs || []).map(async (cat) => {
      const { count } = await supabase
        .from('ClientCatalogItem')
        .select('*', { count: 'exact', head: true })
        .eq('catalogId', cat.id)
      return { ...cat, _count: { items: count || 0 } }
    }))

    return NextResponse.json(enrichedCatalogs)
  } catch (error) {
    console.error('GET /api/client-catalogs error:', error)
    return NextResponse.json({ error: 'Failed to fetch catalogs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customerId, brokerId, notes, items } = body

    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one cost sheet must be selected' }, { status: 400 })
    }

    const catalogNo = await getNextCatalogNo()
    const now = new Date().toISOString()

    const { data: catalog, error } = await supabase
      .from('ClientCatalog')
      .insert({
        catalogNo,
        customerId,
        brokerId: brokerId || null,
        notes: notes || null,
        date: now,
        createdAt: now,
        updatedAt: now,
      })
      .select('*, customer:customerId(id, companyName, phone, gstNumber, billingAddress), broker:brokerId(id, name, commissionPercent)')
      .single()

    if (error) throw error

    // Insert items
    if (catalog) {
      const itemRows = items.map((item: { costSheetId: string; discountPercent: number }) => ({
        catalogId: catalog.id,
        costSheetId: item.costSheetId,
        discountPercent: item.discountPercent ?? 0,
        createdAt: now,
        updatedAt: now,
      }))
      await supabase.from('ClientCatalogItem').insert(itemRows)
    }

    // Re-fetch with items
    const { data: finalCatalog } = await supabase
      .from('ClientCatalog')
      .select('*, customer:customerId(id, companyName, phone, gstNumber, billingAddress), broker:brokerId(id, name, commissionPercent), items:ClientCatalogItem(*, costSheet:costSheetId(id, sheetNo, styleNo, styleName, totalCost, sellingPrice, profitPercent, image, description, sizeRange, fabricCost, trimCost, laborCost, washCost, packagingCost, overheadCost, otherCost))')
      .eq('id', catalog.id)
      .single()

    return NextResponse.json(finalCatalog, { status: 201 })
  } catch (error) {
    console.error('POST /api/client-catalogs error:', error)
    return NextResponse.json({ error: 'Failed to create catalog' }, { status: 500 })
  }
}
