import { supabase } from '@/lib/supabase-db'
import { batchResolveStyleImages } from '@/lib/style-image'
import { NextRequest, NextResponse } from 'next/server'
import { format, startOfDay } from 'date-fns'

// ─── GET /api/orders ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'desc'

    const allowedSortFields = ['createdAt', 'orderDate', 'totalAmount', 'status', 'orderNo']
    const sortField = allowedSortFields.includes(sort) ? sort : 'createdAt'
    const sortOrder = order === 'asc' ? 'asc' : 'desc'

    // ── status counts (groupBy equivalent) ──
    const { data: statusRows, error: statusErr } = await supabase
      .from('SalesOrder')
      .select('status')
    if (statusErr) throw statusErr

    const statuses: Record<string, number> = {}
    for (const row of statusRows ?? []) {
      statuses[row.status] = (statuses[row.status] || 0) + 1
    }

    // ── count with filters ──
    let countQuery = supabase.from('SalesOrder').select('*', { count: 'exact', head: true })
    if (status) countQuery = countQuery.eq('status', status)

    const { count: total, error: countErr } = await countQuery
    if (countErr) throw countErr

    // ── data query ──
    let dataQuery = supabase
      .from('SalesOrder')
      .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:OrderItem(*, style:styleId(styleNo,collectionName,category))')
      .order(sortField, { ascending: sortOrder === 'asc' })
      .range((page - 1) * limit, (page - 1) * limit + limit - 1)

    if (status) dataQuery = dataQuery.eq('status', status)

    // Search across orderNo and customer.companyName
    // Supabase doesn't support OR across relations natively, so we do an ILIKE on orderNo
    // and a separate customer name lookup, then merge.
    if (search) {
      dataQuery = dataQuery.or(`orderNo.ilike.%${search}%`)
    }

    const { data: orders, error: ordersErr } = await dataQuery
    if (ordersErr) throw ordersErr

    // If search term exists, also look up customer names and filter
    let filteredOrders = orders ?? []
    if (search) {
      const { data: customerMatches } = await supabase
        .from('Customer')
        .select('id')
        .ilike('companyName', `%${search}%`)
      const customerIds = new Set((customerMatches ?? []).map(c => c.id))
      const { data: ordersByCustomer } = customerIds.size > 0
        ? await supabase
            .from('SalesOrder')
            .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:OrderItem(*, style:styleId(styleNo,collectionName,category))')
            .in('customerId', Array.from(customerIds))
            .order(sortField, { ascending: sortOrder === 'asc' })
            .range((page - 1) * limit, (page - 1) * limit + limit - 1)
        : { data: [] as any[] }
      if (status) {
        const { data: ordersByCustomerFiltered } = customerIds.size > 0
          ? await supabase
              .from('SalesOrder')
              .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:OrderItem(*, style:styleId(styleNo,collectionName,category))')
              .in('customerId', Array.from(customerIds))
              .eq('status', status)
              .order(sortField, { ascending: sortOrder === 'asc' })
              .range((page - 1) * limit, (page - 1) * limit + limit - 1)
          : { data: [] as any[] }
        filteredOrders = [...(ordersByCustomerFiltered ?? []), ...filteredOrders]
      } else {
        filteredOrders = [...(ordersByCustomer ?? []), ...filteredOrders]
      }
      // Deduplicate by id
      const seen = new Set<string>()
      filteredOrders = filteredOrders.filter(o => {
        if (seen.has(o.id)) return false
        seen.add(o.id)
        return true
      })
    }

    // Fetch quotation numbers for orders that have a quotationId
    const quotationIds = filteredOrders.map((o: any) => o.quotationId).filter(Boolean) as string[]
    const quotationMap: Record<string, string> = {}
    if (quotationIds.length > 0) {
      const { data: quotations } = await supabase
        .from('Quotation')
        .select('id,quotationNo')
        .in('id', quotationIds)
      for (const q of quotations ?? []) {
        quotationMap[q.id] = q.quotationNo
      }
    }

    // Resolve images + FG stock for all order items
    const allItems = filteredOrders.flatMap((o: any) => o.items || [])
    const styleNos = [...new Set(allItems.map((i: any) => i.style?.styleNo || i.styleNo).filter(Boolean))]

    // Batch resolve product images
    const images = styleNos.length > 0
      ? await batchResolveStyleImages(styleNos)
      : {}

    // Batch resolve FG stock availability
    let stockMap: Record<string, number> = {}
    if (styleNos.length > 0) {
      const { data: fgBins } = await supabase
        .from('FGStockBin')
        .select('styleNo, availableQty')
        .in('styleNo', styleNos)
      for (const bin of (fgBins || [])) {
        stockMap[bin.styleNo] = (stockMap[bin.styleNo] || 0) + (bin.availableQty ?? 0)
      }
    }

    return NextResponse.json({
      orders: filteredOrders.map((o: any) => ({
        id: o.id,
        orderNo: o.orderNo,
        customerId: o.customerId,
        customer: o.customer,
        orderDate: o.orderDate,
        deliveryDate: o.deliveryDate,
        status: o.status,
        totalAmount: o.totalAmount,
        totalCost: o.totalCost,
        grossProfit: o.grossProfit,
        grossMargin: o.grossMargin,
        paymentStatus: o.paymentStatus,
        paidAmount: o.paidAmount,
        discountPercent: o.discountPercent,
        notes: o.notes,
        quotationId: o.quotationId,
        quotationNo: o.quotationId ? quotationMap[o.quotationId] || null : null,
        items: (o.items ?? []).map((item: any) => ({
          id: item.id,
          styleId: item.styleId,
          styleName: item.styleName,
          styleNo: item.style?.styleNo || null,
          collectionName: item.style?.collectionName || null,
          category: item.style?.category || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          totalAmount: item.totalAmount,
          totalCost: item.totalCost,
          profit: item.profit,
          _image: images[item.style?.styleNo || item.styleNo]?.url || null,
          _fgStockAvailable: stockMap[item.style?.styleNo || item.styleNo] || 0,
        })),
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
      total: total ?? 0,
      page,
      limit,
      statuses,
    })
  } catch (error) {
    console.error('Orders API GET error:', error)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }
}

// ─── POST /api/orders ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, items, deliveryDate, discountPercent, notes } = body

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Customer and at least one item are required' }, { status: 400 })
    }

    // Validate customer exists
    const { data: customer, error: custErr } = await supabase
      .from('Customer')
      .select('id')
      .eq('id', customerId)
      .single()
    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // ── Resolve styleId for each item ────────────────────────────────────────
    // The sales-order create dialog lets users pick a product from the *Sample
    // Catalog* (`/api/samples`). A Sample row's `id` is NOT a `Style.id`, so
    // inserting it into `OrderItem.styleId` (which has an FK → Style.id) throws
    // a 23503 foreign-key violation. We therefore:
    //   1. Collect every incoming styleId + styleNo.
    //   2. Query the Style table once for matching IDs AND styleNos.
    //   3. For each item: keep the styleId if it really is a Style row;
    //      otherwise fall back to a Style matched by styleNo; otherwise set
    //      styleId = null (the column is nullable) so the order still creates.
    const incomingStyleIds: string[] = []
    const incomingStyleNos: string[] = []
    for (const it of items as any[]) {
      if (it?.styleId) incomingStyleIds.push(String(it.styleId))
      if (it?.styleNo) incomingStyleNos.push(String(it.styleNo))
    }

    const validStyleIds = new Set<string>()
    const styleNoToId = new Map<string, string>()

    if (incomingStyleIds.length > 0) {
      const { data: matchedById } = await supabase
        .from('Style')
        .select('id, styleNo')
        .in('id', incomingStyleIds)
      for (const s of matchedById ?? []) {
        validStyleIds.add(s.id)
        if (s.styleNo) styleNoToId.set(s.styleNo, s.id)
      }
    }
    if (incomingStyleNos.length > 0) {
      const { data: matchedByNo } = await supabase
        .from('Style')
        .select('id, styleNo')
        .in('styleNo', incomingStyleNos)
      for (const s of matchedByNo ?? []) {
        validStyleIds.add(s.id)
        if (s.styleNo) styleNoToId.set(s.styleNo, s.id)
      }
    }

    // Calculate totals for each item
    const calculatedItems = items.map((item: { styleId?: string; styleNo?: string; styleName: string; quantity: number; unitPrice: number; unitCost: number }) => {
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      const unitCost = Number(item.unitCost) || 0
      const totalAmount = quantity * unitPrice
      const totalCost = quantity * unitCost
      const profit = totalAmount - totalCost

      // Resolve a valid Style FK: prefer the incoming styleId if it is a real
      // Style row, else fall back to styleNo lookup, else null.
      let resolvedStyleId: string | null = null
      if (item.styleId && validStyleIds.has(item.styleId)) {
        resolvedStyleId = item.styleId
      } else if (item.styleNo && styleNoToId.has(item.styleNo)) {
        resolvedStyleId = styleNoToId.get(item.styleNo)!
      }

      return {
        styleId: resolvedStyleId,
        styleName: item.styleName,
        quantity,
        unitPrice,
        unitCost,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        profit: Math.round(profit * 100) / 100,
      }
    })

    // Calculate order totals
    const totalAmount = calculatedItems.reduce((sum: number, item: { totalAmount: number }) => sum + item.totalAmount, 0)
    const totalCost = calculatedItems.reduce((sum: number, item: { totalCost: number }) => sum + item.totalCost, 0)
    const discount = Number(discountPercent) || 0
    const discountedAmount = totalAmount * (1 - discount / 100)
    const grossProfit = discountedAmount - totalCost
    const grossMargin = discountedAmount > 0 ? Math.round((grossProfit / discountedAmount) * 10000) / 100 : 0

    // Generate order number: SO-YYYYMMDD-XXX
    const today = startOfDay(new Date())
    const dateStr = format(today, 'yyyyMMdd')
    const { data: todayOrders, error: seqErr } = await supabase
      .from('SalesOrder')
      .select('orderNo')
      .ilike('orderNo', `SO-${dateStr}%`)
      .order('orderNo', { ascending: false })
      .limit(1)
    if (seqErr) throw seqErr

    let seq = 1
    if (todayOrders && todayOrders.length > 0) {
      const lastOrderNo = todayOrders[0].orderNo
      const parts = lastOrderNo.split('-')
      seq = parseInt(parts[2], 10) + 1
    }
    const orderNo = `SO-${dateStr}-${String(seq).padStart(3, '0')}`

    // Create order first
    // NOTE: Supabase does NOT have a DB-level trigger for @updatedAt (that is a
    // Prisma-only feature). The `updatedAt` column is NOT NULL, so we MUST set
    // it explicitly on every INSERT, otherwise we hit a 23502 constraint violation.
    const nowIso = new Date().toISOString()
    const { data: order, error: orderErr } = await supabase
      .from('SalesOrder')
      .insert({
        orderNo,
        customerId,
        orderDate: nowIso,
        deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
        status: 'Pending',
        totalAmount: Math.round(discountedAmount * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMargin,
        paymentStatus: 'Unpaid',
        paidAmount: 0,
        discountPercent: discount,
        notes: notes || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .select('*, customer:customerId(id,companyName,buyerName)')
      .single()
    if (orderErr) throw orderErr

    // Create items sequentially
    // NOTE: OrderItem also has a NOT NULL `updatedAt` column (Prisma @updatedAt),
    // so we must set createdAt + updatedAt explicitly for each row.
    const itemsWithOrderId = calculatedItems.map(item => ({
      ...item,
      salesOrderId: order.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    }))
    const { data: createdItems, error: itemsErr } = await supabase
      .from('OrderItem')
      .insert(itemsWithOrderId)
      .select('*')
    if (itemsErr) {
      // Rollback: delete the order we just created
      await supabase.from('SalesOrder').delete().eq('id', order.id)
      throw itemsErr
    }

    return NextResponse.json({ order: { ...order, items: createdItems } }, { status: 201 })
  } catch (error: any) {
    console.error('Orders API POST error:', error)
    // Surface the real DB error so the frontend can show a meaningful message
    // instead of a generic "Failed to create order".
    const detail = error?.message || 'Failed to create order'
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}
