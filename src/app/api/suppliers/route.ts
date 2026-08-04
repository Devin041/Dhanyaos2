import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    const status = searchParams.get('status') || ''
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 50

    // Build the main suppliers query
    let query = supabase
      .from('Supplier')
      .select('*, PurchaseOrder(totalAmount, status, paymentStatus, paidAmount), FabricStock(totalValue)')

    if (status && status !== 'All') {
      query = query.eq('status', status)
    }

    if (type) {
      query = query.eq('supplierType', type)
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,contactPerson.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,supplierType.ilike.%${search}%`
      )
    }

    query = query.order('createdAt', { ascending: false })
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: suppliers, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to load suppliers' },
        { status: 500 }
      )
    }

    const suppliersWithMetrics = (suppliers || []).map((s: any) => {
      const purchaseOrders = s.PurchaseOrder || []
      const fabricStock = s.FabricStock || []
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

      const { PurchaseOrder: _pos, FabricStock: _fs, ...supplierData } = s

      return {
        ...supplierData,
        totalPOValue,
        poCount,
        pendingPOCount,
        fabricStockValue,
        fabricItems,
      }
    })

    // Count by type for filter badges (with search applied)
    let typeQuery = supabase
      .from('Supplier')
      .select('supplierType, status')

    if (search) {
      typeQuery = typeQuery.or(
        `name.ilike.%${search}%,contactPerson.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,supplierType.ilike.%${search}%`
      )
    }

    const { data: allSuppliers } = await typeQuery

    const typeCounts: Record<string, number> = {}
    const statusCounts: Record<string, number> = { Active: 0, Inactive: 0 }

    for (const s of allSuppliers || []) {
      typeCounts[s.supplierType] = (typeCounts[s.supplierType] || 0) + 1
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1
    }

    // Summary across all suppliers (not filtered by search)
    const { data: allSuppliersFull, error: fullError } = await supabase
      .from('Supplier')
      .select('*, PurchaseOrder(totalAmount, status, paymentStatus, paidAmount)')

    if (fullError) {
      console.error('Supabase error:', fullError)
      return NextResponse.json(
        { error: 'Failed to load suppliers summary' },
        { status: 500 }
      )
    }

    const totalSuppliers = (allSuppliersFull || []).length
    const activeCount = (allSuppliersFull || []).filter((s: any) => s.status === 'Active').length
    const grandTotalPOValue = (allSuppliersFull || []).reduce(
      (sum: number, s: any) => sum + (s.PurchaseOrder || []).reduce((pSum: number, po: any) => pSum + po.totalAmount, 0),
      0
    )
    const avgRating =
      totalSuppliers > 0
        ? Math.round(
            ((allSuppliersFull || []).reduce((sum: number, s: any) => sum + s.rating, 0) / totalSuppliers) * 10
          ) / 10
        : 0
    const uniqueTypes = new Set((allSuppliersFull || []).map((s: any) => s.supplierType)).size
    const pendingPayments = (allSuppliersFull || []).reduce(
      (sum: number, s: any) =>
        sum +
        (s.PurchaseOrder || []).reduce(
          (pSum: number, po: any) => pSum + (po.totalAmount - po.paidAmount),
          0
        ),
      0
    )

    return NextResponse.json({
      suppliers: suppliersWithMetrics,
      total: suppliersWithMetrics.length,
      typeCounts,
      statusCounts,
      summary: {
        totalSuppliers,
        activeCount,
        totalPOValue: grandTotalPOValue,
        avgRating,
        uniqueTypes,
        pendingPayments,
      },
    })
  } catch (error) {
    console.error('Suppliers GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load suppliers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      supplierType = 'Fabric',
      contactPerson,
      phone,
      email,
      paymentTerms = 15,
      rating = 3,
    } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Supplier name is required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    const { data: supplier, error } = await supabase
      .from('Supplier')
      .insert({
        name: name.trim(),
        supplierType: supplierType || 'Fabric',
        contactPerson: contactPerson?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        paymentTerms: Number(paymentTerms) || 15,
        rating: Math.min(5, Math.max(1, Number(rating) || 3)),
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create supplier' },
        { status: 500 }
      )
    }

    return NextResponse.json({ supplier }, { status: 201 })
  } catch (error) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create supplier' },
      { status: 500 }
    )
  }
}
