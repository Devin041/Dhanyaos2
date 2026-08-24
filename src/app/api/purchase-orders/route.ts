import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format, startOfMonth, endOfMonth } from 'date-fns'

// ─── GET: List purchase orders with filtering, search, pagination ─────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const paymentStatus = searchParams.get('paymentStatus')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    // Build query
    let query = supabase.from('PurchaseOrder').select('*', { count: 'exact' })

    if (status && status !== 'All') {
      query = query.eq('status', status)
    }
    if (paymentStatus && paymentStatus !== 'All') {
      query = query.eq('paymentStatus', paymentStatus)
    }

    // Search across poNumber, fabricName, supplier name (need separate supplier lookup)
    if (search) {
      query = query.or(`poNumber.ilike.%${search}%,fabricName.ilike.%${search}%`)
    }

    // Count query with same filters (for total)
    const countQuery = supabase.from('PurchaseOrder').select('*', { count: 'exact', head: true })
    if (status && status !== 'All') countQuery.eq('status', status)
    if (paymentStatus && paymentStatus !== 'All') countQuery.eq('paymentStatus', paymentStatus)
    if (search) countQuery.or(`poNumber.ilike.%${search}%,fabricName.ilike.%${search}%`)

    query = query.order('createdAt', { ascending: false }).range((page - 1) * limit, (page - 1) * limit + limit - 1)

    const [ordersRes, totalRes, statusCountsRes] = await Promise.all([
      query,
      countQuery,
      supabase.from('PurchaseOrder').select('status'),
    ])

    if (ordersRes.error) throw ordersRes.error
    if (totalRes.error) throw totalRes.error
    if (statusCountsRes.error) throw statusCountsRes.error

    const ordersRaw = ordersRes.data || []
    const total = totalRes.count ?? 0

    // Compute status counts in JS
    const allStatusRows = statusCountsRes.data || []
    const counts: Record<string, number> = {
      All: total,
      Pending: 0,
      Approved: 0,
      Ordered: 0,
      Received: 0,
      Cancelled: 0,
    }
    for (const sc of allStatusRows) {
      if (sc.status && counts[sc.status] !== undefined) counts[sc.status]++
    }

    // Fetch supplier details for orders
    const supplierIds = [...new Set(ordersRaw.map((o: any) => o.supplierId).filter(Boolean))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, rating, paymentTerms')
        .in('id', supplierIds)
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
      }
    }

    // Fetch vendor details for orders (vendor-only POs have vendorId set)
    const vendorIds = [...new Set(ordersRaw.map((o: any) => o.vendorId).filter(Boolean))]
    let vendorMap: Record<string, any> = {}
    if (vendorIds.length > 0) {
      const { data: vendors } = await supabase
        .from('Vendor')
        .select('id, vendorName, vendorType, contactPerson, phone, paymentTerms')
        .in('id', vendorIds)
      if (vendors) {
        vendorMap = Object.fromEntries(vendors.map((v: any) => [v.id, v]))
      }
    }

    // Summary KPIs
    const now = new Date()
    const monthStart = startOfMonth(now).toISOString()
    const monthEnd = endOfMonth(now).toISOString()

    const [totalValueRes, pendingValueRes, receivedMonthRes, unpaidRes] = await Promise.all([
      supabase.from('PurchaseOrder').select('totalAmount'),
      supabase.from('PurchaseOrder').select('totalAmount').eq('status', 'Pending'),
      supabase.from('PurchaseOrder').select('totalAmount').eq('status', 'Received').gte('updatedAt', monthStart).lte('updatedAt', monthEnd),
      supabase.from('PurchaseOrder').select('totalAmount, paidAmount').in('paymentStatus', ['Unpaid', 'Partial']),
    ])

    const totalValueAgg = (totalValueRes.data || []).reduce((s: number, t: any) => s + (t.totalAmount || 0), 0)
    const pendingValueAgg = (pendingValueRes.data || []).reduce((s: number, t: any) => s + (t.totalAmount || 0), 0)
    const receivedMonthAgg = (receivedMonthRes.data || []).reduce((s: number, t: any) => s + (t.totalAmount || 0), 0)
    const unpaidTotal = (unpaidRes.data || []).reduce(
      (acc: { totalAmount: number; paidAmount: number }, t: any) => {
        acc.totalAmount += t.totalAmount || 0
        acc.paidAmount += t.paidAmount || 0
        return acc
      },
      { totalAmount: 0, paidAmount: 0 },
    )

    const summary = {
      totalPOValue: Math.round(totalValueAgg),
      pendingAmount: Math.round(pendingValueAgg),
      receivedThisMonth: Math.round(receivedMonthAgg),
      unpaidAmount: Math.round(unpaidTotal.totalAmount - unpaidTotal.paidAmount),
    }

    return NextResponse.json({
      orders: ordersRaw.map((o: any) => ({
        id: o.id,
        poNumber: o.poNumber,
        supplierId: o.supplierId,
        supplier: o.supplierId ? supplierMap[o.supplierId] || null : null,
        // Vendor linkage (for vendor-only POs)
        vendorId: o.vendorId || null,
        vendor: o.vendorId ? vendorMap[o.vendorId] || null : null,
        styleNo: o.styleNo || null,
        styleName: o.styleName || null,
        costSheetId: o.costSheetId || null,
        fabricName: o.fabricName,
        quantity: o.quantity,
        unit: o.unit,
        ratePerUnit: o.ratePerUnit,
        totalAmount: o.totalAmount,
        expectedDelivery: o.expectedDelivery ? format(new Date(o.expectedDelivery), 'yyyy-MM-dd') : null,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paidAmount: o.paidAmount,
        receivedQty: o.receivedQty,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
      total,
      page,
      limit,
      statusCounts: counts,
      summary,
    })
  } catch (error) {
    console.error('Purchase Orders API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load purchase orders' },
      { status: 500 }
    )
  }
}

// ─── POST: Create a new purchase order ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      supplierId,
      vendorId,           // NEW: a PO can be raised against a Vendor instead of a Supplier
      fabricName,
      quantity,
      unit,
      ratePerUnit,
      expectedDelivery,
      notes,
      // NEW: Product linkage fields
      styleNo,
      styleName,
      costSheetId,
      // NEW: Multi-fabric line items
      items,
    } = body

    // Support both legacy single-fabric and new multi-fabric mode
    const hasItems = items && Array.isArray(items) && items.length > 0
    const hasLegacy = fabricName && quantity && ratePerUnit

    // Either supplierId OR vendorId must be set (a PO needs a counterparty).
    if ((!supplierId && !vendorId) || (!hasItems && !hasLegacy)) {
      return NextResponse.json(
        { error: 'Either supplierId or vendorId, and (items[] OR fabricName+quantity+ratePerUnit) are required' },
        { status: 400 }
      )
    }

    // Auto-generate PO number: PO-YYYYMMDD-XXX
    const today = format(new Date(), 'yyyyMMdd')
    const todayPrefix = `PO-${today}-`
    const { data: lastPOs } = await supabase
      .from('PurchaseOrder')
      .select('poNumber')
      .ilike('poNumber', `${todayPrefix}%`)
      .order('poNumber', { ascending: false })
      .limit(1)
    let seq = 1
    if (lastPOs && lastPOs.length > 0) {
      const lastSeq = parseInt(lastPOs[0].poNumber.slice(todayPrefix.length), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const poNumber = `${todayPrefix}${String(seq).padStart(3, '0')}`

    // Calculate total from items or legacy fields
    let totalAmount = 0
    let primaryFabric = fabricName || ''
    let primaryQty = Number(quantity) || 0
    let primaryRate = Number(ratePerUnit) || 0
    let primaryUnit = unit || 'meters'

    if (hasItems) {
      totalAmount = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0) * (Number(it.ratePerUnit) || 0), 0)
      // Use first item as primary (for legacy compat)
      primaryFabric = items[0].fabricName || fabricName || ''
      primaryQty = Number(items[0].quantity) || 0
      primaryRate = Number(items[0].ratePerUnit) || 0
      primaryUnit = items[0].unit || unit || 'meters'
    } else {
      totalAmount = Number(quantity) * Number(ratePerUnit)
    }

    const now = new Date().toISOString()

    // Insert PO. supplierId is now nullable (a vendor-only PO has supplierId=null).
    // vendorId is a new column — try with it first; fall back without if column missing.
    const insertBase: Record<string, any> = {
      poNumber,
      fabricName: primaryFabric,
      quantity: primaryQty,
      unit: primaryUnit,
      ratePerUnit: primaryRate,
      taxableAmount: 0,
      totalAmount,
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery).toISOString() : null,
      status: 'Pending',
      paymentStatus: 'Unpaid',
      paidAmount: 0,
      receivedQty: 0,
      createdAt: now,
      updatedAt: now,
    }
    // Only set supplierId if provided (else it stays null for vendor-only POs)
    if (supplierId) insertBase.supplierId = supplierId

    let po: any = null
    let error: any = null
    // First attempt: WITH vendorId column (requires migration)
    if (vendorId) {
      const { data: po1, error: e1 } = await supabase
        .from('PurchaseOrder')
        .insert({ ...insertBase, vendorId })
        .select()
        .single()
      if (e1) {
        const msg = String(e1.message || '')
        if (/vendorId|column .* does not exist/i.test(msg)) {
          // Fallback: insert without vendorId (migration not yet applied)
          const { data: po2, error: e2 } = await supabase
            .from('PurchaseOrder')
            .insert(insertBase)
            .select()
            .single()
          if (e2) throw e2
          po = po2
        } else {
          throw e1
        }
      } else {
        po = po1
      }
    } else {
      // No vendorId — plain insert (supplier-only or legacy PO)
      const { data: po3, error: e3 } = await supabase
        .from('PurchaseOrder')
        .insert(insertBase)
        .select()
        .single()
      if (e3) throw e3
      po = po3
    }
    error = null

    // Insert multi-fabric line items if provided
    if (hasItems) {
      const itemRows = items.map((it: any) => ({
        purchaseOrderId: po.id,
        styleNo: styleNo || null,
        fabricName: it.fabricName || '',
        color: it.color || null,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'meters',
        ratePerUnit: Number(it.ratePerUnit) || 0,
        totalAmount: (Number(it.quantity) || 0) * (Number(it.ratePerUnit) || 0),
        receivedQty: 0,
        status: 'Pending',
        createdAt: now,
        updatedAt: now,
      }))
      const { error: itemsErr } = await supabase.from('POItem').insert(itemRows)
      if (itemsErr) console.error('POItem insert error:', itemsErr)
    }

    // Fetch supplier for response (if a supplier was set)
    let supplier: any = null
    if (po.supplierId) {
      const { data: sup } = await supabase
        .from('Supplier')
        .select('name, supplierType, rating, paymentTerms')
        .eq('id', po.supplierId)
        .single()
      supplier = sup || null
    }

    // Fetch vendor for response (if a vendor was set — PO can be vendor-only)
    let vendor: any = null
    if (po.vendorId) {
      const { data: ven } = await supabase
        .from('Vendor')
        .select('vendorName, vendorType, contactPerson, phone, paymentTerms')
        .eq('id', po.vendorId)
        .single()
      vendor = ven || null
    }

    return NextResponse.json(
      {
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplier: supplier || null,
        vendorId: po.vendorId || null,
        vendor: vendor || null,
        styleNo: styleNo || null,
        styleName: styleName || null,
        costSheetId: costSheetId || null,
        fabricName: po.fabricName,
        quantity: po.quantity,
        unit: po.unit,
        ratePerUnit: po.ratePerUnit,
        totalAmount: po.totalAmount,
        expectedDelivery: po.expectedDelivery
          ? format(new Date(po.expectedDelivery), 'yyyy-MM-dd')
          : null,
        status: po.status,
        paymentStatus: po.paymentStatus,
        paidAmount: po.paidAmount,
        receivedQty: po.receivedQty,
        items: hasItems ? items : undefined,
        createdAt: po.createdAt,
        updatedAt: po.updatedAt,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Purchase Orders API POST error:', error)
    // Surface a helpful message for the common "supplierId NOT NULL" case
    // (means the PO-VENDOR-TYPE migration hasn't been run yet — vendor-only
    // POs require supplierId to be nullable).
    const msg = String(error?.message || '')
    if (/null value in column "supplierId"/i.test(msg)) {
      return NextResponse.json(
        {
          error: 'Vendor-only purchase orders require a database migration. Please run SUPABASE-MIGRATION-PO-VENDOR-TYPE.sql in the Supabase SQL Editor (it makes supplierId nullable so POs can be vendor-only).',
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to create purchase order' },
      { status: 500 }
    )
  }
}
