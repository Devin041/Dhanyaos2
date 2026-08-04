import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Full inventory overview (raw materials + finished goods + WIP) ──
export async function GET() {
  try {
    const [fabricStockRes, finishedGoodsRes, wipJobsRes, fabricAggRes, finishedAggRes, lowStockRes] =
      await Promise.all([
        supabase.from('FabricStock').select('*').order('createdAt', { ascending: false }),
        supabase.from('FinishedGood').select('*').order('createdAt', { ascending: false }),
        supabase.from('ProductionJob').select('*').eq('status', 'In Progress').order('createdAt', { ascending: false }),
        supabase.from('FabricStock').select('totalValue'),
        supabase.from('FinishedGood').select('totalValue, quantity'),
        supabase.from('FabricStock').select('id').lt('availableMeters', 50),
      ])

    if (fabricStockRes.error) throw fabricStockRes.error
    if (finishedGoodsRes.error) throw finishedGoodsRes.error
    if (wipJobsRes.error) throw wipJobsRes.error
    if (fabricAggRes.error) throw fabricAggRes.error
    if (finishedAggRes.error) throw finishedAggRes.error

    const fabricStock = fabricStockRes.data || []
    const finishedGoods = finishedGoodsRes.data || []
    const wipJobs = wipJobsRes.data || []

    // Fetch linked order numbers for WIP jobs
    const jobIdsWithOrders = wipJobs.filter((j: any) => j.salesOrderId).map((j: any) => j.salesOrderId)
    let linkedOrders: Record<string, string> = {}
    if (jobIdsWithOrders.length > 0) {
      const { data: orders } = await supabase
        .from('SalesOrder')
        .select('id, orderNo')
        .in('id', jobIdsWithOrders)
      if (orders) {
        linkedOrders = Object.fromEntries(orders.map((o: any) => [o.id, o.orderNo]))
      }
    }

    // Fetch supplier details for fabric stock
    const supplierIds = [...new Set(fabricStock.map((s: any) => s.supplierId).filter(Boolean))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('Supplier')
        .select('id, name, supplierType')
        .in('id', supplierIds)
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map((s: any) => [s.id, s]))
      }
    }

    // Calculate WIP value estimate
    const avgUnitCost =
      finishedGoods.length > 0
        ? finishedGoods.reduce((sum: number, fg: any) => sum + (fg.unitCost || 0), 0) / finishedGoods.length
        : 0
    const totalWIPUnits = wipJobs.reduce((sum: number, job: any) => sum + (job.completedQty || 0), 0)
    const wipValue = Math.round(totalWIPUnits * avgUnitCost)

    const uniqueStyles = new Set(finishedGoods.map((fg: any) => fg.styleNo)).size
    const totalWIPCount = wipJobs.length
    const totalWIPRemaining = wipJobs.reduce(
      (sum: number, job: any) => sum + ((job.targetQty || 0) - (job.completedQty || 0)),
      0
    )

    const allFabricStock = fabricAggRes.data || []
    const allFinishedGoods = finishedAggRes.data || []
    const totalRawMaterialValue = Math.round(allFabricStock.reduce((s: number, f: any) => s + (f.totalValue || 0), 0))
    const totalFinishedGoodsValue = Math.round(allFinishedGoods.reduce((s: number, fg: any) => s + (fg.totalValue || 0), 0))
    const totalFinishedUnits = Math.round(allFinishedGoods.reduce((s: number, fg: any) => s + (fg.quantity || 0), 0))
    const totalInventoryValue = totalRawMaterialValue + totalFinishedGoodsValue + wipValue

    return NextResponse.json({
      fabricStock: fabricStock.map((s: any) => ({
        id: s.id,
        supplierId: s.supplierId,
        supplier: s.supplierId ? supplierMap[s.supplierId] || null : null,
        fabricName: s.fabricName,
        gsm: s.gsm,
        width: s.width,
        lotNumber: s.lotNumber,
        availableMeters: s.availableMeters,
        reservedMeters: s.reservedMeters,
        averageCost: s.averageCost,
        totalValue: s.totalValue,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      finishedGoods: finishedGoods.map((fg: any) => ({
        id: fg.id,
        styleNo: fg.styleNo,
        styleName: fg.styleName,
        quantity: fg.quantity,
        unitCost: fg.unitCost,
        totalValue: fg.totalValue,
        status: fg.status,
        createdAt: fg.createdAt,
        updatedAt: fg.updatedAt,
      })),
      wipJobs: wipJobs.map((job: any) => ({
        id: job.id,
        jobNo: job.jobNo,
        salesOrderId: job.salesOrderId,
        orderNo: job.salesOrderId ? linkedOrders[job.salesOrderId] || null : null,
        styleNo: job.styleNo,
        styleName: job.styleName,
        targetQty: job.targetQty,
        completedQty: job.completedQty,
        stage: job.stage,
        startDate: job.startDate,
        endDate: job.endDate || null,
        status: job.status,
      })),
      stats: {
        totalRawMaterialValue,
        totalFinishedGoodsValue,
        totalWIPCount,
        totalWIPUnits,
        totalWIPRemaining,
        wipValue,
        totalInventoryValue,
        totalFinishedUnits,
        uniqueStyles,
        lowStockItems: lowStockRes.data?.length ?? 0,
      },
    })
  } catch (error) {
    console.error('Inventory API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load inventory' },
      { status: 500 }
    )
  }
}

// ─── POST: Add finished goods entry ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { styleNo, styleName, quantity, unitCost } = body

    if (!styleNo || !styleName || quantity === undefined || unitCost === undefined) {
      return NextResponse.json(
        { error: 'styleNo, styleName, quantity, and unitCost are required' },
        { status: 400 }
      )
    }

    const qty = parseInt(quantity, 10)
    const cost = parseFloat(unitCost)

    if (isNaN(qty) || qty < 0) {
      return NextResponse.json(
        { error: 'quantity must be a non-negative number' },
        { status: 400 }
      )
    }

    if (isNaN(cost) || cost < 0) {
      return NextResponse.json(
        { error: 'unitCost must be a non-negative number' },
        { status: 400 }
      )
    }

    const totalValue = Math.round(qty * cost)
    const now = new Date().toISOString()

    const { data: finishedGood, error } = await supabase
      .from('FinishedGood')
      .insert({
        styleNo,
        styleName,
        quantity: qty,
        unitCost: cost,
        totalValue,
        status: 'In Stock',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      {
        id: finishedGood.id,
        styleNo: finishedGood.styleNo,
        styleName: finishedGood.styleName,
        quantity: finishedGood.quantity,
        unitCost: finishedGood.unitCost,
        totalValue: finishedGood.totalValue,
        status: finishedGood.status,
        createdAt: finishedGood.createdAt,
        updatedAt: finishedGood.updatedAt,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Inventory API POST error:', error)
    return NextResponse.json(
      { error: 'Failed to add finished goods' },
      { status: 500 }
    )
  }
}
