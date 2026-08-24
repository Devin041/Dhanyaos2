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

    // Fetch POItem line items for all orders (universal — each item has its own type)
    const poIds = ordersRaw.map((o: any) => o.id)
    let itemsByPo: Record<string, any[]> = {}
    if (poIds.length > 0) {
      const { data: items } = await supabase
        .from('POItem')
        .select('*')
        .in('purchaseOrderId', poIds)
        .order('createdAt', { ascending: true })
      if (items) {
        for (const it of items) {
          if (!itemsByPo[it.purchaseOrderId]) itemsByPo[it.purchaseOrderId] = []
          itemsByPo[it.purchaseOrderId].push(it)
        }
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
        // Universal PO type
        poType: o.poType || 'GENERAL',
        supplierId: o.supplierId,
        supplier: o.supplierId ? supplierMap[o.supplierId] || null : null,
        // Vendor linkage (for vendor-only POs)
        vendorId: o.vendorId || null,
        vendor: o.vendorId ? vendorMap[o.vendorId] || null : null,
        styleNo: o.styleNo || null,
        styleName: o.styleName || null,
        costSheetId: o.costSheetId || null,
        // Legacy single-fabric fields (kept for backward compat — old POs use these)
        fabricName: o.fabricName,
        quantity: o.quantity,
        unit: o.unit,
        ratePerUnit: o.ratePerUnit,
        // GST fields
        gstType: o.gstType || 'IntraState',
        gstPercent: o.gstPercent || 18,
        taxableAmount: o.taxableAmount || 0,
        totalGst: o.totalGst || 0,
        totalAmount: o.totalAmount,
        // Broker / commission
        brokerName: o.brokerName || null,
        commissionPercent: o.commissionPercent || 0,
        commissionAmount: o.commissionAmount || 0,
        netAmount: o.netAmount || 0,
        // Payment terms (NEW)
        paymentTerms: o.paymentTerms || 30,
        paymentDueDate: o.paymentDueDate ? format(new Date(o.paymentDueDate), 'yyyy-MM-dd') : null,
        // Sales Order linkage (NEW — PO can be linked to a SO for tracking)
        salesOrderId: o.salesOrderId || null,
        // Universal line items (each item has its own type)
        items: itemsByPo[o.id] || [],
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
      vendorId,           // a PO can be raised against a Vendor instead of a Supplier
      // PO Type (universal classification — auto-derived from items if not provided)
      poType,
      // Legacy single-fabric fields (kept for backward compat with old create form)
      fabricName,
      quantity,
      unit,
      ratePerUnit,
      expectedDelivery,
      notes,
      // Product linkage fields (PO-level)
      styleNo,
      styleName,
      costSheetId,
      // Universal line items (preferred — each item has its own type)
      items,
      // GST fields
      gstType,
      gstPercent,
      // Broker / commission
      brokerName,
      brokerCommissionPercent,
      // Discount
      discountPercent,
      // Payment terms (NEW — copied from supplier, editable)
      paymentTerms,
      // Sales Order linkage (NEW — PO can be linked to a SO for tracking)
      salesOrderId,
    } = body

    // Support both legacy single-fabric and new universal line items
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

    // ── Normalize universal line items ──
    // Each item: { itemType, name, color?, size?, styleNo?, styleName?, costSheetId?,
    //              description?, quantity, unit, ratePerUnit }
    // For legacy mode, fabricName/qty/rate become a single FABRIC item.
    let normalizedItems: any[] = []
    if (hasItems) {
      normalizedItems = items.map((it: any) => ({
        itemType: it.itemType || 'FABRIC',
        styleNo: it.styleNo || null,
        styleName: it.styleName || null,
        costSheetId: it.costSheetId || null,
        name: it.name || it.fabricName || '',
        description: it.description || null,
        color: it.color || null,
        size: it.size || null,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'meters',
        ratePerUnit: Number(it.ratePerUnit) || 0,
      }))
    } else if (hasLegacy) {
      normalizedItems = [{
        itemType: 'FABRIC',
        styleNo: styleNo || null,
        styleName: styleName || null,
        costSheetId: costSheetId || null,
        name: fabricName,
        description: null,
        color: null,
        size: null,
        quantity: Number(quantity),
        unit: unit || 'meters',
        ratePerUnit: Number(ratePerUnit),
      }]
    }

    // Calculate subtotal from line items
    const subtotal = normalizedItems.reduce((s: number, it: any) => s + it.quantity * it.ratePerUnit, 0)
    const discount = Number(discountPercent) || 0
    const taxableAmount = Math.round(subtotal * (1 - discount / 100) * 100) / 100

    // GST calculation
    const gstTypeVal = gstType === 'InterState' ? 'InterState' : 'IntraState'
    const gstPercentVal = Number(gstPercent) || 18
    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0, totalGst = 0
    if (gstTypeVal === 'IntraState') {
      const halfRate = gstPercentVal / 2 / 100
      const half = Math.round(taxableAmount * halfRate * 100) / 100
      cgstAmount = half
      sgstAmount = half
      totalGst = Math.round((cgstAmount + sgstAmount) * 100) / 100
    } else {
      igstAmount = Math.round(taxableAmount * gstPercentVal / 100 * 100) / 100
      totalGst = igstAmount
    }
    const grandTotal = Math.round((taxableAmount + totalGst) * 100) / 100

    // Broker commission
    const commissionPercent = Number(brokerCommissionPercent) || 0
    const commissionAmount = Math.round(grandTotal * commissionPercent / 100 * 100) / 100
    const netAmount = Math.round((grandTotal - commissionAmount) * 100) / 100

    // Auto-derive poType if not provided
    let poTypeVal = poType
    if (!poTypeVal) {
      const types = new Set(normalizedItems.map((it: any) => it.itemType))
      if (types.size === 1) {
        poTypeVal = Array.from(types)[0]
      } else if (types.size > 1) {
        poTypeVal = 'MIXED'
      } else {
        poTypeVal = 'GENERAL'
      }
    }

    // Legacy primary fields (for backward compat with old PO code paths)
    const firstItem = normalizedItems[0] || {}
    const primaryFabric = firstItem.name || fabricName || ''
    const primaryQty = firstItem.quantity || Number(quantity) || 0
    const primaryRate = firstItem.ratePerUnit || Number(ratePerUnit) || 0
    const primaryUnit = firstItem.unit || unit || 'meters'

    const now = new Date().toISOString()

    // Build PO insert payload (with all universal fields — defensive fallback
    // if columns don't exist yet via migration)
    const insertBase: Record<string, any> = {
      poNumber,
      fabricName: primaryFabric,
      quantity: primaryQty,
      unit: primaryUnit,
      ratePerUnit: primaryRate,
      // GST
      gstType: gstTypeVal,
      gstPercent: gstPercentVal,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalGst,
      totalAmount: grandTotal,
      // Broker / commission
      brokerName: brokerName || null,
      commissionPercent,
      commissionAmount,
      netAmount,
      // Payment terms + due date (NEW)
      paymentTerms: Number(paymentTerms) || 30,
      paymentDueDate: (() => {
        const days = Number(paymentTerms) || 30
        const due = new Date(now)
        due.setDate(due.getDate() + days)
        return due.toISOString()
      })(),
      // Other
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery).toISOString() : null,
      status: 'Pending',
      paymentStatus: 'Unpaid',
      paidAmount: 0,
      receivedQty: 0,
      createdAt: now,
      updatedAt: now,
    }
    // poType column may not exist yet (migration pending) — try with it, fall back without
    if (poTypeVal) insertBase.poType = poTypeVal
    if (supplierId) insertBase.supplierId = supplierId
    if (notes) insertBase.notes = notes
    if (salesOrderId) insertBase.salesOrderId = salesOrderId

    let po: any = null
    // Insert with retry-without-new-columns fallback
    const tryInsert = async (payload: Record<string, any>) => {
      const { data, error } = await supabase
        .from('PurchaseOrder')
        .insert(payload)
        .select()
        .single()
      return { data, error }
    }
    // Strip fields not yet present in DB. We try the FULL payload first; if
    // PostgREST complains about a missing column (PGRST204 / "Could not find
    // the 'X' column"), we progressively strip the offending columns and retry.
    // This makes the API resilient to migrations not being applied yet.
    const NEW_COLUMNS = ['poType', 'vendorId', 'brokerName', 'commissionPercent', 'commissionAmount', 'netAmount', 'notes', 'paymentTerms', 'paymentDueDate', 'salesOrderId']

    if (vendorId) insertBase.vendorId = vendorId
    let currentPayload = { ...insertBase }
    let lastError: any = null
    for (let attempt = 0; attempt < NEW_COLUMNS.length + 1; attempt++) {
      const { data, error } = await tryInsert(currentPayload)
      if (!error) {
        po = data
        break
      }
      lastError = error
      const msg = String(error.message || '')
      // Find which column is missing and strip it
      const missingCol = NEW_COLUMNS.find(col => msg.includes(`'${col}'`))
      if (missingCol) {
        delete currentPayload[missingCol]
        continue
      }
      // If we can't identify a specific column, throw
      throw error
    }
    if (!po) throw lastError

    // Insert universal line items into POItem
    if (normalizedItems.length > 0) {
      const itemRows = normalizedItems.map((it: any) => ({
        purchaseOrderId: po.id,
        itemType: it.itemType,
        styleNo: it.styleNo,
        styleName: it.styleName,
        costSheetId: it.costSheetId,
        name: it.name,
        description: it.description,
        color: it.color,
        size: it.size,
        quantity: it.quantity,
        unit: it.unit,
        ratePerUnit: it.ratePerUnit,
        totalAmount: Math.round(it.quantity * it.ratePerUnit * 100) / 100,
        receivedQty: 0,
        status: 'Pending',
        // Legacy fabricName (kept populated for old code paths)
        fabricName: it.name || '',
        createdAt: now,
        updatedAt: now,
      }))
      // Try with universal columns; fall back to fabricName-only schema
      const { error: itemsErr1 } = await supabase.from('POItem').insert(itemRows)
      if (itemsErr1) {
        const msg = String(itemsErr1.message || '')
        if (/itemType|name|size|description|costSheetId|styleName|column .* does not exist/i.test(msg)) {
          // Strip new columns and retry
          const strippedRows = itemRows.map((r: any) => {
            const s = { ...r }
            if (/itemType/.test(msg)) delete s.itemType
            if (/\bname\b/.test(msg)) delete s.name
            if (/size/.test(msg)) delete s.size
            if (/description/.test(msg)) delete s.description
            if (/costSheetId/.test(msg)) delete s.costSheetId
            if (/styleName/.test(msg)) delete s.styleName
            return s
          })
          const { error: itemsErr2 } = await supabase.from('POItem').insert(strippedRows)
          if (itemsErr2) console.error('POItem insert error (fallback):', itemsErr2.message)
        } else {
          console.error('POItem insert error:', itemsErr1.message)
        }
      }
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

    // Fetch created line items for response (so frontend has the persisted rows
    // with their IDs and universal fields)
    let createdItems: any[] = []
    try {
      const { data: itemsData } = await supabase
        .from('POItem')
        .select('*')
        .eq('purchaseOrderId', po.id)
        .order('createdAt', { ascending: true })
      createdItems = itemsData || []
    } catch { /* ignore — items fetch is best-effort */ }

    return NextResponse.json(
      {
        id: po.id,
        poNumber: po.poNumber,
        poType: po.poType || poTypeVal || 'GENERAL',
        supplierId: po.supplierId,
        supplier: supplier || null,
        vendorId: po.vendorId || null,
        vendor: vendor || null,
        salesOrderId: po.salesOrderId || salesOrderId || null,
        styleNo: styleNo || null,
        styleName: styleName || null,
        costSheetId: costSheetId || null,
        fabricName: po.fabricName,
        quantity: po.quantity,
        unit: po.unit,
        ratePerUnit: po.ratePerUnit,
        // GST
        gstType: gstTypeVal,
        gstPercent: gstPercentVal,
        taxableAmount,
        totalGst,
        totalAmount: grandTotal,
        // Broker / commission
        brokerName: brokerName || null,
        commissionPercent,
        commissionAmount,
        netAmount,
        expectedDelivery: po.expectedDelivery
          ? format(new Date(po.expectedDelivery), 'yyyy-MM-dd')
          : null,
        status: po.status,
        paymentStatus: po.paymentStatus,
        paidAmount: po.paidAmount,
        receivedQty: po.receivedQty,
        // Universal line items (with their itemType, name, color, size, etc.)
        items: createdItems,
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
