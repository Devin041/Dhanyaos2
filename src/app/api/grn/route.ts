import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: List GRN notes ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Build main query
    let query = supabase
      .from('GrnNote')
      .select('*', { count: 'exact' })

    if (status && status !== 'All') {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.or(`grnNo.ilike.%${search}%,supplierName.ilike.%${search}%`)
    }

    // Count query (same filters)
    let countQ = supabase.from('GrnNote').select('*', { count: 'exact', head: true })
    if (status && status !== 'All') countQ = countQ.eq('status', status)
    if (search) countQ = countQ.or(`grnNo.ilike.%${search}%,supplierName.ilike.%${search}%`)

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.order('createdAt', { ascending: false }).range(from, to)

    const [grnsRes, totalRes, statusCountsRes, summaryRes] = await Promise.all([
      query,
      countQ,
      supabase.from('GrnNote').select('status'),
      supabase.from('GrnNote').select('totalReceivedQty, acceptedQty, rejectedQty'),
    ])

    if (grnsRes.error) throw grnsRes.error
    if (totalRes.error) throw totalRes.error
    if (statusCountsRes.error) throw statusCountsRes.error
    if (summaryRes.error) throw summaryRes.error

    const grns = grnsRes.data || []
    const total = totalRes.count ?? 0

    // Compute status counts in JS
    const allStatusRows = statusCountsRes.data || []
    const counts: Record<string, number> = { All: total, Draft: 0, Inspected: 0, Approved: 0, Rejected: 0 }
    for (const sc of allStatusRows) {
      if (sc.status && counts[sc.status] !== undefined) counts[sc.status]++
    }

    // Summary stats in JS
    const allGrns = summaryRes.data || []
    const summary = {
      totalReceived: allGrns.reduce((s: number, g: any) => s + (g.totalReceivedQty || 0), 0),
      totalAccepted: allGrns.reduce((s: number, g: any) => s + (g.acceptedQty || 0), 0),
      totalRejected: allGrns.reduce((s: number, g: any) => s + (g.rejectedQty || 0), 0),
    }

    // Fetch GRN items for each GRN
    const grnIds = grns.map((g: any) => g.id)
    let grnItemsMap: Record<string, any[]> = {}
    if (grnIds.length > 0) {
      const { data: allItems } = await supabase
        .from('GrnItem')
        .select('*')
        .in('grnId', grnIds)
        .order('createdAt', { ascending: true })
      if (allItems) {
        grnItemsMap = allItems.reduce((acc: Record<string, any[]>, item: any) => {
          if (!acc[item.grnId]) acc[item.grnId] = []
          acc[item.grnId].push(item)
          return acc
        }, {})
      }
    }

    // Fetch PO references
    const poIds = grns.map((g: any) => g.poId).filter(Boolean)
    let poMap: Record<string, any> = {}
    if (poIds.length > 0) {
      const { data: pos } = await supabase
        .from('PurchaseOrder')
        .select('id, poNumber, fabricName')
        .in('id', poIds)
      if (pos) {
        poMap = Object.fromEntries(pos.map((p: any) => [p.id, p]))
      }
    }

    // Build response with relations
    const grnsWithRelations = grns.map((g: any) => ({
      ...g,
      purchaseOrder: g.poId ? poMap[g.poId] || null : null,
      grnItems: grnItemsMap[g.id] || [],
    }))

    return NextResponse.json({
      grns: grnsWithRelations,
      total,
      page,
      limit,
      statusCounts: counts,
      summary,
    })
  } catch (error) {
    console.error('GRN list error:', error)
    return NextResponse.json({ error: 'Failed to fetch GRN notes' }, { status: 500 })
  }
}

// ─── POST: Create GRN note ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      poId,
      supplierId,
      supplierName,
      receivedDate,
      status = 'Draft',
      notes,
      qualityRemarks,
      items = [],
    } = body

    if (!supplierName) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    // Generate GRN number: GRN-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')
    const prefix = `GRN-${dateStr}-`

    const { data: lastGrns } = await supabase
      .from('GrnNote')
      .select('grnNo')
      .ilike('grnNo', `${prefix}%`)
      .order('grnNo', { ascending: false })
      .limit(1)

    let seq = 1
    if (lastGrns && lastGrns.length > 0) {
      const parts = lastGrns[0].grnNo.split('-')
      seq = parseInt(parts[2]) + 1
    }
    const grnNo = `${prefix}${String(seq).padStart(3, '0')}`

    // Calculate totals from items
    let totalReceivedQty = 0
    let totalAcceptedQty = 0
    let totalRejectedQty = 0
    const grnItems = items.map((item: Record<string, unknown>) => {
      const receivedQty = Number(item.receivedQty) || 0
      const acceptedQty = Number(item.acceptedQty) || 0
      const rejectedQty = Number(item.rejectedQty) || 0
      const ratePerUnit = Number(item.ratePerUnit) || 0
      const totalValue = acceptedQty * ratePerUnit

      totalReceivedQty += receivedQty
      totalAcceptedQty += acceptedQty
      totalRejectedQty += rejectedQty

      return {
        fabricName: String(item.fabricName || ''),
        orderedQty: Number(item.orderedQty) || 0,
        receivedQty,
        acceptedQty,
        rejectedQty,
        defectNotes: item.defectNotes ? String(item.defectNotes) : null,
        ratePerUnit,
        totalValue,
      }
    })

    const now = new Date().toISOString()

    // Create GRN note
    const { data: grn, error } = await supabase
      .from('GrnNote')
      .insert({
        grnNo,
        poId: poId || null,
        supplierId: supplierId || null,
        supplierName,
        receivedDate: receivedDate ? new Date(receivedDate).toISOString() : now,
        status,
        totalReceivedQty,
        acceptedQty: totalAcceptedQty,
        rejectedQty: totalRejectedQty,
        qualityRemarks: qualityRemarks || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    // Create GRN items
    const itemsToInsert = grnItems.map((item: any) => ({
      ...item,
      grnId: grn.id,
      createdAt: now,
      updatedAt: now,
    }))

    const { data: insertedItems, error: itemsError } = await supabase
      .from('GrnItem')
      .insert(itemsToInsert)
      .select()

    if (itemsError) throw itemsError

    // Fetch PO reference
    let purchaseOrder = null
    if (grn.poId) {
      const { data: po } = await supabase
        .from('PurchaseOrder')
        .select('poNumber, fabricName')
        .eq('id', grn.poId)
        .single()
      purchaseOrder = po || null
    }

    return NextResponse.json({
      grn: { ...grn, purchaseOrder, grnItems: insertedItems || [] },
    }, { status: 201 })
  } catch (error) {
    console.error('GRN create error:', error)
    return NextResponse.json({ error: 'Failed to create GRN note' }, { status: 500 })
  }
}
