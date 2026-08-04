import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subDays, addDays, startOfDay } from 'date-fns'

export async function GET() {
  try {
    const today = startOfDay(new Date())
    const todayISO = today.toISOString()
    const next7Days = addDays(today, 7)
    const next14Days = addDays(today, 14)
    const next30Days = addDays(today, 30)

    // === Pending Purchase Orders ===
    const { data: pendingPOs } = await supabase
      .from('PurchaseOrder')
      .select('*, supplier:supplierId(name, rating)')
      .in('status', ['Pending', 'Approved', 'Ordered'])
      .order('createdAt', { ascending: false })
      .limit(10)

    // === Fabric Stock Overview ===
    const { data: fabricStock } = await supabase
      .from('FabricStock')
      .select('*')
      .order('availableMeters', { ascending: true })

    const lowStockThreshold = 50
    const lowStockItems = (fabricStock || []).filter(f => f.availableMeters <= lowStockThreshold)
    const totalStockValue = (fabricStock || []).reduce((s, f) => s + f.totalValue, 0)
    const totalAvailableMeters = (fabricStock || []).reduce((s, f) => s + f.availableMeters, 0)

    // === Supplier Performance ===
    const { data: suppliers } = await supabase
      .from('Supplier')
      .select('*, purchaseOrders:PurchaseOrder(status, totalAmount, expectedDelivery, createdAt, receivedQty, quantity)')
      .eq('status', 'Active')

    const supplierPerformance = (suppliers || []).map(s => {
      const pos = s.purchaseOrders || []
      const totalPOs = pos.length
      const completedPOs = pos.filter(p => p.status === 'Received').length
      const onTimePOs = pos.filter(p => {
        if (!p.expectedDelivery || p.status === 'Pending' || p.status === 'Ordered') return false
        return new Date(p.updatedAt) <= addDays(new Date(p.expectedDelivery), 2)
      }).length
      const totalSpent = pos.reduce((sum, p) => sum + p.totalAmount, 0)
      const reliability = totalPOs > 0 ? Math.round((completedPOs / totalPOs) * 10000) / 100 : 0

      return {
        id: s.id,
        name: s.name,
        rating: s.rating,
        totalPOs,
        completedPOs,
        totalSpent: Math.round(totalSpent),
        reliability,
        pendingPOs: pos.filter(p => p.status === 'Pending' || p.status === 'Ordered').length,
      }
    })

    // === Upcoming Payments ===
    const { data: upcomingPayments } = await supabase
      .from('PurchaseOrder')
      .select('*, supplier:supplierId(name)')
      .in('paymentStatus', ['Unpaid', 'Partial'])
      .lte('expectedDelivery', next30Days.toISOString())
      .order('expectedDelivery', { ascending: true })
      .limit(8)

    // === Material Requirement Planning ===
    const { data: allFabricStock } = await supabase.from('FabricStock').select('fabricName, availableMeters, reservedMeters, totalValue')
    const fabricSummary = new Map<string, { availableMeters: number; reservedMeters: number; totalValue: number }>()
    for (const f of (allFabricStock || [])) {
      const existing = fabricSummary.get(f.fabricName) || { availableMeters: 0, reservedMeters: 0, totalValue: 0 }
      existing.availableMeters += f.availableMeters || 0
      existing.reservedMeters += f.reservedMeters || 0
      existing.totalValue += f.totalValue || 0
      fabricSummary.set(f.fabricName, existing)
    }

    const { data: pendingPOByFabric } = await supabase
      .from('PurchaseOrder')
      .select('fabricName, quantity, totalAmount')
      .in('status', ['Pending', 'Ordered', 'Approved'])

    const poByFabricMap = new Map<string, { quantity: number; totalAmount: number }>()
    for (const p of (pendingPOByFabric || [])) {
      const existing = poByFabricMap.get(p.fabricName) || { quantity: 0, totalAmount: 0 }
      existing.quantity += p.quantity || 0
      existing.totalAmount += p.totalAmount || 0
      poByFabricMap.set(p.fabricName, existing)
    }

    const materialPlanning = Array.from(fabricSummary.entries()).map(([fabricName, f]) => {
      const poInfo = poByFabricMap.get(fabricName)
      const available = f.availableMeters
      const reserved = f.reservedMeters
      const incoming = poInfo?.quantity || 0
      const netAvailable = available + incoming - reserved

      return {
        fabricName,
        availableMeters: Math.round(available),
        reservedMeters: Math.round(reserved),
        incomingMeters: Math.round(incoming),
        netAvailable: Math.round(netAvailable),
        stockValue: Math.round(f.totalValue),
        status: netAvailable <= lowStockThreshold ? 'Critical' : netAvailable <= lowStockThreshold * 3 ? 'Low' : 'Adequate',
      }
    })

    // === KPIs ===
    const { data: allPOs } = await supabase.from('PurchaseOrder').select('totalAmount')
    const { data: unpaidPOsData } = await supabase.from('PurchaseOrder').select('totalAmount').eq('paymentStatus', 'Unpaid')
    const { count: pendingPOCount } = await supabase
      .from('PurchaseOrder')
      .select('*', { count: 'exact', head: true })
      .in('status', ['Pending', 'Ordered'])

    const totalPOValue = (allPOs || []).reduce((s, p) => s + (p.totalAmount || 0), 0)
    const unpaidPOValue = (unpaidPOsData || []).reduce((s, p) => s + (p.totalAmount || 0), 0)

    return NextResponse.json({
      pendingPOs: (pendingPOs || []).map(po => ({
        poNumber: po.poNumber,
        supplier: po.supplier?.name || 'Unknown',
        supplierRating: po.supplier?.rating,
        fabricName: po.fabricName,
        quantity: po.quantity,
        unit: po.unit,
        amount: po.totalAmount,
        status: po.status,
        paymentStatus: po.paymentStatus,
        expectedDelivery: po.expectedDelivery ? format(new Date(po.expectedDelivery), 'dd MMM yyyy') : 'TBD',
        receivedQty: po.receivedQty,
      })),
      fabricStock: (fabricStock || []).map(f => ({
        id: f.id,
        fabricName: f.fabricName,
        gsm: f.gsm,
        width: f.width,
        lotNumber: f.lotNumber,
        availableMeters: Math.round(f.availableMeters),
        reservedMeters: Math.round(f.reservedMeters),
        averageCost: f.averageCost,
        totalValue: Math.round(f.totalValue),
        isLowStock: f.availableMeters <= lowStockThreshold,
      })),
      lowStockCount: lowStockItems.length,
      totalStockValue: Math.round(totalStockValue),
      totalAvailableMeters: Math.round(totalAvailableMeters),
      supplierPerformance,
      upcomingPayments: (upcomingPayments || []).map(up => ({
        poNumber: up.poNumber,
        supplier: up.supplier?.name || 'Unknown',
        amount: up.totalAmount,
        paidAmount: up.paidAmount,
        balance: up.totalAmount - up.paidAmount,
        paymentStatus: up.paymentStatus,
        expectedDelivery: up.expectedDelivery ? format(new Date(up.expectedDelivery), 'dd MMM yyyy') : 'TBD',
        daysUntilDue: up.expectedDelivery
          ? Math.max(0, Math.ceil((new Date(up.expectedDelivery).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
          : null,
      })),
      materialPlanning: materialPlanning.sort((a, b) => a.netAvailable - b.netAvailable),
      kpis: {
        totalPOValue: Math.round(totalPOValue),
        unpaidPOValue: Math.round(unpaidPOValue),
        pendingPOCount: pendingPOCount || 0,
        activeSuppliers: (suppliers || []).length,
        totalFabrics: (fabricStock || []).length,
        lowStockAlerts: lowStockItems.length,
      },
    })
  } catch (error) {
    console.error('Purchase Dashboard API error:', error)
    return NextResponse.json({ error: 'Failed to load purchase dashboard data' }, { status: 500 })
  }
}
