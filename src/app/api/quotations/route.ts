import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { format, startOfDay } from 'date-fns'
import { batchResolveStyleImages } from '@/lib/style-image'

// ─── GET /api/quotations ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'desc'

    const allowedSortFields = ['createdAt', 'quotationDate', 'totalAmount', 'validUntil', 'quotationNo']
    const sortField = allowedSortFields.includes(sort) ? sort : 'createdAt'
    const sortOrder = order === 'asc' ? 'asc' : 'desc'

    // ── status counts (groupBy equivalent) ──
    const { data: statusRows, error: statusErr } = await supabase
      .from('Quotation')
      .select('status')
    if (statusErr) throw statusErr

    const statusCounts: Record<string, number> = {}
    for (const row of statusRows ?? []) {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1
    }

    // ── count with filters ──
    let countQuery = supabase.from('Quotation').select('*', { count: 'exact', head: true })
    if (status) countQuery = countQuery.eq('status', status)

    const { count: total, error: countErr } = await countQuery
    if (countErr) throw countErr

    // ── data query ──
    let dataQuery = supabase
      .from('Quotation')
      .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:QuotationItem(*)')
      .order(sortField, { ascending: sortOrder === 'asc' })
      .range((page - 1) * limit, (page - 1) * limit + limit - 1)

    if (status) dataQuery = dataQuery.eq('status', status)

    // Search: quotationNo or customer.companyName or customer.buyerName
    if (search) {
      dataQuery = dataQuery.or(`quotationNo.ilike.%${search}%`)
    }

    const { data: quotations, error: dataErr } = await dataQuery
    if (dataErr) throw dataErr

    // If search, also look up by customer name
    let filteredQuotations = quotations ?? []
    if (search) {
      const { data: customerMatches } = await supabase
        .from('Customer')
        .select('id')
        .or(`companyName.ilike.%${search}%,buyerName.ilike.%${search}%`)
      const customerIds = new Set((customerMatches ?? []).map(c => c.id))
      if (customerIds.size > 0) {
        let custQuery = supabase
          .from('Quotation')
          .select('*, customer:customerId(id,companyName,buyerName,phone,email), items:QuotationItem(*)')
          .in('customerId', Array.from(customerIds))
          .order(sortField, { ascending: sortOrder === 'asc' })
          .range((page - 1) * limit, (page - 1) * limit + limit - 1)
        if (status) custQuery = custQuery.eq('status', status)
        const { data: custQuotations } = await custQuery
        filteredQuotations = [...filteredQuotations, ...(custQuotations ?? [])]
        // Deduplicate by id
        const seen = new Set<string>()
        filteredQuotations = filteredQuotations.filter(q => {
          if (seen.has(q.id)) return false
          seen.add(q.id)
          return true
        })
      }
    }

    // Batch-resolve style images for quotation items
    const allItems = filteredQuotations.flatMap((q: any) => q.items || q.quotationItems || [])
    const styleNos = [...new Set(allItems.map((i: any) => {
      const sno = i.styleNo || ''
      if (sno) return sno
      const match = i.styleName?.match(/^[A-Z]{2,}-\d+/)
      return match ? match[0] : ''
    }).filter(Boolean))]
    if (styleNos.length > 0) {
      const images = await batchResolveStyleImages(styleNos)
      for (const q of filteredQuotations) {
        const items = q.items || q.quotationItems || []
        for (const item of items) {
          const sno = item.styleNo || (item.styleName?.match(/^[A-Z]{2,}-\d+/)?.[0]) || ''
          ;(item as any)._image = images[sno]?.url || null
        }
      }
    }

    return NextResponse.json({
      quotations: filteredQuotations.map((q: any) => ({
        id: q.id,
        quotationNo: q.quotationNo,
        customerId: q.customerId,
        customer: q.customer,
        quotationDate: q.quotationDate,
        validUntil: q.validUntil,
        status: q.status,
        totalAmount: q.totalAmount,
        totalCost: q.totalCost,
        discountPercent: q.discountPercent,
        brokerName: q.brokerName || null,
        brokerCommissionPercent: q.brokerCommissionPercent || 0,
        notes: q.notes,
        convertedOrderId: q.convertedOrderId,
        itemCount: q.items?.length ?? 0,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
      total: total ?? 0,
      statusCounts,
    })
  } catch (error) {
    console.error('GET /api/quotations error:', error)
    return NextResponse.json({ error: 'Failed to fetch quotations' }, { status: 500 })
  }
}

// ─── POST /api/quotations ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, validUntil, items, discountPercent = 0, notes, brokerName, brokerCommissionPercent = 0 } = body

    if (!customerId || !validUntil || !items?.length) {
      return NextResponse.json(
        { error: 'customerId, validUntil, and items are required' },
        { status: 400 }
      )
    }

    // Generate quotation number: QT-YYYYMMDD-XXX
    const today = startOfDay(new Date())
    const dateStr = format(today, 'yyyyMMdd')
    const todayStart = new Date(today)
    const todayEnd = new Date(today)
    todayEnd.setDate(todayEnd.getDate() + 1)

    const { count: todayCount, error: countErr } = await supabase
      .from('Quotation')
      .select('*', { count: 'exact', head: true })
      .gte('quotationDate', todayStart.toISOString())
      .lt('quotationDate', todayEnd.toISOString())
    if (countErr) throw countErr

    const quotationNo = `QT-${dateStr}-${String((todayCount ?? 0) + 1).padStart(3, '0')}`

    // Calculate item totals with per-item discount
    const quotationItems = items.map((item: {
      styleName: string; quantity: number; unitPrice: number; unitCost: number;
      itemDiscountPercent?: number; sampleId?: string;
    }) => {
      const disc = item.itemDiscountPercent || 0
      const discountedUnitPrice = item.unitPrice * (1 - disc / 100)
      const totalAmount = item.quantity * discountedUnitPrice
      const totalCost = item.quantity * item.unitCost
      return {
        styleName: item.styleName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        itemDiscountPercent: disc,
        sampleId: item.sampleId || null,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        profit: Math.round((totalAmount - totalCost) * 100) / 100,
      }
    })

    const subtotal = quotationItems.reduce((sum: number, item: { totalAmount: number }) => sum + item.totalAmount, 0)
    const totalCost = quotationItems.reduce((sum: number, item: { totalCost: number }) => sum + item.totalCost, 0)
    const totalAmount = subtotal * (1 - discountPercent / 100)

    // Create quotation
    const { data: quotation, error: qErr } = await supabase
      .from('Quotation')
      .insert({
        quotationNo,
        customerId,
        validUntil: new Date(validUntil).toISOString(),
        status: 'Draft',
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        discountPercent,
        brokerName: brokerName || null,
        brokerCommissionPercent: brokerCommissionPercent || 0,
        notes: notes || null,
      })
      .select('*, customer:customerId(id,companyName,buyerName)')
      .single()
    if (qErr) throw qErr

    // Create items
    const itemsWithQuotationId = quotationItems.map(item => ({
      ...item,
      quotationId: quotation.id,
    }))
    const { data: createdItems, error: itemsErr } = await supabase
      .from('QuotationItem')
      .insert(itemsWithQuotationId)
      .select('*')
    if (itemsErr) {
      await supabase.from('Quotation').delete().eq('id', quotation.id)
      throw itemsErr
    }

    return NextResponse.json({ ...quotation, items: createdItems }, { status: 201 })
  } catch (error) {
    console.error('POST /api/quotations error:', error)
    return NextResponse.json({ error: 'Failed to create quotation' }, { status: 500 })
  }
}
