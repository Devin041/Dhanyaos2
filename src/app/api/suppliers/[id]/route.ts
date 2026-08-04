import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: supplier, error } = await supabase
      .from('Supplier')
      .select('*, PurchaseOrder(*), FabricStock(*)')
      .eq('id', id)
      .single()

    if (error || !supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    const purchaseOrders = supplier.PurchaseOrder || []
    const fabricStock = supplier.FabricStock || []
    const poCount = purchaseOrders.length
    const totalPOValue = purchaseOrders.reduce(
      (sum: number, po: any) => sum + po.totalAmount,
      0
    )
    const pendingPOCount = purchaseOrders.filter((po: any) =>
      ['Pending', 'Approved', 'Ordered'].includes(po.status)
    ).length
    const fabricStockValue = fabricStock.reduce(
      (sum: number, fs: any) => sum + fs.totalValue,
      0
    )
    const fabricItems = fabricStock.length

    const { PurchaseOrder, FabricStock, ...supplierData } = supplier

    return NextResponse.json({
      supplier: {
        ...supplierData,
        totalPOValue,
        poCount,
        pendingPOCount,
        fabricStockValue,
        fabricItems,
      },
      purchaseOrders,
      fabricStock,
    })
  } catch (error) {
    console.error('Supplier GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load supplier' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: existing, error: findError } = await supabase
      .from('Supplier')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'supplierType',
      'contactPerson',
      'phone',
      'email',
      'paymentTerms',
      'rating',
      'status',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'paymentTerms') {
          updateData[field] = Number(body[field]) || 15
        } else if (field === 'rating') {
          updateData[field] = Math.min(5, Math.max(1, Number(body[field]) || 3))
        } else if (
          field === 'name' ||
          field === 'contactPerson' ||
          field === 'phone' ||
          field === 'email'
        ) {
          updateData[field] = body[field]?.trim() || null
          if (field === 'name' && !updateData[field]) {
            return NextResponse.json(
              { error: 'Supplier name is required' },
              { status: 400 }
            )
          }
        } else {
          updateData[field] = body[field]
        }
      }
    }

    updateData.updatedAt = new Date().toISOString()

    const { data: supplier, error } = await supabase
      .from('Supplier')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to update supplier' },
        { status: 500 }
      )
    }

    return NextResponse.json({ supplier })
  } catch (error) {
    console.error('Supplier PATCH error:', error)
    return NextResponse.json(
      { error: 'Failed to update supplier' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: existing, error: findError } = await supabase
      .from('Supplier')
      .select('id')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('Supplier')
      .update({ status: 'Inactive', updatedAt: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to deactivate supplier' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Supplier DELETE error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate supplier' },
      { status: 500 }
    )
  }
}
