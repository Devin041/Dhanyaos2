import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { differenceInDays } from 'date-fns'

/**
 * GET /api/accounts/ap-aging
 *
 * Accounts Payable Aging Report — supplier-wise outstanding by age buckets.
 * Tracks what we owe to suppliers, broken down by 0-30/31-60/61-90/90+ days.
 */

export async function GET() {
  try {
    // Fetch all unpaid purchase orders
    const { data: pos, error } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, supplierId, supplier:supplierId(name, supplierType, phone, creditDays, tdsSection, tdsRate), totalAmount, paidAmount, status, paymentStatus, expectedDelivery, createdAt')
      .neq('paymentStatus', 'Paid')

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ suppliers: [], summary: { totalOutstanding: 0, supplierCount: 0, overdueCount: 0 } })
      }
      throw error
    }

    const now = new Date()
    const agingMap: Record<string, any> = {}
    let totalOutstanding = 0
    let overdueCount = 0

    for (const po of (pos || [])) {
      const supId = po.supplierId || 'unknown'
      const supName = (po.supplier as any)?.name || 'Unknown'
      const outstanding = (po.totalAmount || 0) - (po.paidAmount || 0)
      if (outstanding <= 0) continue

      totalOutstanding += outstanding

      const poDate = new Date(po.createdAt)
      const ageDays = differenceInDays(now, poDate)
      const expectedDate = po.expectedDelivery ? new Date(po.expectedDelivery) : null
      const isOverdue = expectedDate && now > expectedDate
      if (isOverdue) overdueCount++

      if (!agingMap[supId]) {
        agingMap[supId] = {
          supplierId: supId,
          supplierName: supName,
          supplierType: (po.supplier as any)?.supplierType || 'Unknown',
          phone: (po.supplier as any)?.phone || null,
          creditDays: (po.supplier as any)?.creditDays || 15,
          tdsSection: (po.supplier as any)?.tdsSection || '194C',
          tdsRate: (po.supplier as any)?.tdsRate || 1,
          bucket30: 0, bucket60: 0, bucket90: 0, bucket90Plus: 0,
          total: 0, poCount: 0, overduePOs: [],
        }
      }

      const a = agingMap[supId]
      a.total += outstanding
      a.poCount++

      if (ageDays <= 30) a.bucket30 += outstanding
      else if (ageDays <= 60) a.bucket60 += outstanding
      else if (ageDays <= 90) a.bucket90 += outstanding
      else a.bucket90Plus += outstanding

      if (isOverdue) {
        a.overduePOs.push({
          poNumber: po.poNumber,
          outstanding: Math.round(outstanding),
          expectedDate: po.expectedDelivery,
          daysOverdue: differenceInDays(now, expectedDate!),
        })
      }
    }

    const supplierList = Object.values(agingMap).map((a: any) => ({
      ...a,
      bucket30: Math.round(a.bucket30),
      bucket60: Math.round(a.bucket60),
      bucket90: Math.round(a.bucket90),
      bucket90Plus: Math.round(a.bucket90Plus),
      total: Math.round(a.total),
      // Calculate TDS amount on total outstanding
      tdsAmount: Math.round(a.total * a.tdsRate / 100),
      netPayable: Math.round(a.total * (1 - a.tdsRate / 100)),
    })).sort((a: any, b: any) => b.total - a.total)

    return NextResponse.json({
      suppliers: supplierList,
      summary: {
        totalOutstanding: Math.round(totalOutstanding),
        supplierCount: supplierList.length,
        overdueCount,
        bucket30Total: supplierList.reduce((s: number, c: any) => s + c.bucket30, 0),
        bucket60Total: supplierList.reduce((s: number, c: any) => s + c.bucket60, 0),
        bucket90Total: supplierList.reduce((s: number, c: any) => s + c.bucket90, 0),
        bucket90PlusTotal: supplierList.reduce((s: number, c: any) => s + c.bucket90Plus, 0),
        totalTDS: supplierList.reduce((s: number, c: any) => s + c.tdsAmount, 0),
        totalNetPayable: supplierList.reduce((s: number, c: any) => s + c.netPayable, 0),
      },
    })
  } catch (error) {
    console.error('AP Aging API error:', error)
    return NextResponse.json({ error: 'Failed to load AP aging' }, { status: 500 })
  }
}
