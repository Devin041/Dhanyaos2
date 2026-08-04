import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: catalog } = await supabase
      .from('ClientCatalog')
      .select('*, customer:customerId(id, companyName, phone, gstNumber, billingAddress), broker:brokerId(id, name, commissionPercent), items:ClientCatalogItem(*, costSheet:costSheetId(id, sheetNo, styleNo, styleName, totalCost, sellingPrice, profitPercent, image, description, sizeRange, fabricCost, trimCost, laborCost, washCost, packagingCost, overheadCost, otherCost))')
      .eq('id', id)
      .single()

    if (!catalog) {
      return NextResponse.json({ error: 'Catalog not found' }, { status: 404 })
    }

    return NextResponse.json(catalog)
  } catch (error) {
    console.error('GET /api/client-catalogs/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: catalog } = await supabase
      .from('ClientCatalog')
      .select('id, status')
      .eq('id', id)
      .single()

    if (!catalog) {
      return NextResponse.json({ error: 'Catalog not found' }, { status: 404 })
    }

    if (catalog.status === 'Converted') {
      return NextResponse.json(
        { error: 'Cannot delete a converted catalog' },
        { status: 400 }
      )
    }

    // Delete items first, then catalog
    await supabase.from('ClientCatalogItem').delete().eq('catalogId', id)
    await supabase.from('ClientCatalog').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/client-catalogs/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete catalog' }, { status: 500 })
  }
}
