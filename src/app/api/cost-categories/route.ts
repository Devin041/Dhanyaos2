import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const SEED_CATEGORIES = [
  { name: 'Fabric', colorIndex: 0, sortOrder: 1 },
  { name: 'Lining Fabric', colorIndex: 1, sortOrder: 2 },
  { name: 'Trims & Accessories', colorIndex: 2, sortOrder: 3 },
  { name: 'Hand Embroidery', colorIndex: 3, sortOrder: 4 },
  { name: 'Machine Embroidery', colorIndex: 4, sortOrder: 5 },
  { name: 'Printing', colorIndex: 5, sortOrder: 6 },
  { name: 'Dyeing & Washing', colorIndex: 6, sortOrder: 7 },
  { name: 'Stitching Labor', colorIndex: 7, sortOrder: 8 },
  { name: 'Cutting Labor', colorIndex: 8, sortOrder: 9 },
  { name: 'Finishing & Ironing', colorIndex: 9, sortOrder: 10 },
  { name: 'Packing & Packaging', colorIndex: 10, sortOrder: 11 },
  { name: 'Labels & Tags', colorIndex: 11, sortOrder: 12 },
  { name: 'Transport & Logistics', colorIndex: 12, sortOrder: 13 },
  { name: 'Overheads', colorIndex: 13, sortOrder: 14 },
  { name: 'Other', colorIndex: 14, sortOrder: 15 },
] as const

async function ensureSeeded() {
  const { count } = await supabase.from('CostCategory').select('*', { count: 'exact', head: true })
  if (!count || count === 0) {
    const ts = new Date().toISOString()
    await supabase.from('CostCategory').insert(SEED_CATEGORIES.map(c => ({ ...c, isSystem: true, createdAt: ts, updatedAt: ts })))
  }
}

export async function GET() {
  try {
    await ensureSeeded()
    const { data: categories, error } = await supabase.from('CostCategory').select('*').order('sortOrder', { ascending: true }).order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json(categories)
  } catch (error) {
    console.error('GET /api/cost-categories error:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, colorIndex } = body
    if (!name || typeof name !== 'string' || name.trim().length === 0) return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    const trimmed = name.trim()
    const { data: existing } = await supabase.from('CostCategory').select('id').eq('name', trimmed).single()
    if (existing) return NextResponse.json({ error: 'Category already exists' }, { status: 409 })
    const { data: maxSort } = await supabase.from('CostCategory').select('sortOrder').order('sortOrder', { ascending: false }).limit(1).single()
    const nextSort = ((maxSort as any)?.sortOrder ?? 0) + 1
    const ts = new Date().toISOString()
    const { data: category, error } = await supabase.from('CostCategory').insert({ name: trimmed, colorIndex: typeof colorIndex === 'number' ? colorIndex : Math.floor(Math.random() * 15), sortOrder: nextSort, isSystem: false, createdAt: ts, updatedAt: ts }).select().single()
    if (error) throw error
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('POST /api/cost-categories error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, colorIndex, sortOrder } = body
    if (!id) return NextResponse.json({ error: 'Category ID is required' }, { status: 400 })
    const { data: existing } = await supabase.from('CostCategory').select('*').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (name !== undefined) {
      const trimmed = name.trim()
      if (trimmed.length === 0) return NextResponse.json({ error: 'Category name cannot be empty' }, { status: 400 })
      const { data: dup } = await supabase.from('CostCategory').select('id').eq('name', trimmed).neq('id', id).single()
      if (dup) return NextResponse.json({ error: 'Category name already exists' }, { status: 409 })
      updateData.name = trimmed
    }
    if (colorIndex !== undefined) updateData.colorIndex = colorIndex
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    const { data: updated, error } = await supabase.from('CostCategory').update(updateData).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/cost-categories error:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Category ID is required' }, { status: 400 })
    const { data: existing } = await supabase.from('CostCategory').select('*').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    if ((existing as any).isSystem) return NextResponse.json({ error: 'System categories cannot be deleted. You can rename them instead.' }, { status: 403 })
    const { error } = await supabase.from('CostCategory').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/cost-categories error:', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
