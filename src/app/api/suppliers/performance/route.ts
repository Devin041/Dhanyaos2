import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { differenceInDays, parseISO, isValid } from 'date-fns'

/**
 * GET /api/suppliers/performance
 *
 * Supplier Performance Scorecard — aggregates supplier metrics across POs,
 * deliveries, quality (rating), and payment behavior.
 *
 * For each supplier computes:
 *   - Total PO count, total PO value, paid/unpaid breakdown
 *   - On-time delivery rate (POs delivered by expectedDelivery date)
 *   - Average lead time (createdAt → expectedDelivery)
 *   - Fill rate (receivedQty / orderedQty)
 *   - Outstanding payables
 *   - Quality rating (from Supplier.rating, 1-5)
 *   - Composite performance score (0-100)
 *
 * Returns ranked supplier list + summary stats.
 */

interface SupplierMetrics {
  id: string
  name: string
  supplierType: string
  contactPerson: string | null
  phone: string | null
  rating: number
  paymentTerms: number
  poCount: number
  totalPOValue: number
  paidAmount: number
  outstandingPayables: number
  deliveredCount: number
  pendingCount: number
  onTimeCount: number
  lateCount: number
  onTimeRate: number // percentage
  avgLeadTimeDays: number
  totalOrderedQty: number
  totalReceivedQty: number
  fillRate: number // percentage
  compositeScore: number // 0-100
  scoreGrade: 'A' | 'B' | 'C' | 'D'
  tier: 'Strategic' | 'Preferred' | 'Approved' | 'Conditional'
}

function computeCompositeScore(m: Omit<SupplierMetrics, 'compositeScore' | 'scoreGrade' | 'tier'>): number {
  // Weighted scoring (0-100):
  //   - On-time delivery: 30%
  //   - Fill rate: 25%
  //   - Quality rating: 25%
  //   - Payment discipline (paid/total): 10%
  //   - Volume (normalized): 10%

  const onTimeScore = m.poCount > 0 ? (m.onTimeRate) : 100
  const fillScore = m.totalOrderedQty > 0 ? m.fillRate : 100
  const qualityScore = (m.rating / 5) * 100
  const paymentScore = m.totalPOValue > 0 ? (m.paidAmount / m.totalPOValue) * 100 : 100
  // Volume: more POs = higher volume score (cap at 10 POs = 100%)
  const volumeScore = Math.min(100, (m.poCount / 10) * 100)

  const score = Math.round(
    onTimeScore * 0.30 +
    fillScore * 0.25 +
    qualityScore * 0.25 +
    paymentScore * 0.10 +
    volumeScore * 0.10
  )
  return Math.max(0, Math.min(100, score))
}

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  return 'D'
}

function getTier(score: number, poCount: number): 'Strategic' | 'Preferred' | 'Approved' | 'Conditional' {
  if (score >= 85 && poCount >= 3) return 'Strategic'
  if (score >= 70) return 'Preferred'
  if (score >= 50) return 'Approved'
  return 'Conditional'
}

export async function GET() {
  try {
    // ── 1. Fetch all suppliers ──
    const { data: suppliers, error: supErr } = await supabase
      .from('Supplier')
      .select('id, name, supplierType, contactPerson, phone, email, paymentTerms, rating, status')
      .eq('status', 'Active')
      .order('name', { ascending: true })

    if (supErr) {
      if (isMissingTableError(supErr)) {
        return NextResponse.json({ suppliers: [], summary: { totalSuppliers: 0, avgScore: 0, strategicCount: 0, totalOutstanding: 0 } })
      }
      throw supErr
    }

    // ── 2. Fetch all purchase orders ──
    const { data: pos, error: poErr } = await supabase
      .from('PurchaseOrder')
      .select('id, supplierId, poNumber, totalAmount, paidAmount, expectedDelivery, status, paymentStatus, quantity, receivedQty, createdAt')

    if (poErr) {
      if (isMissingTableError(poErr)) {
        return NextResponse.json({ suppliers: [], summary: { totalSuppliers: 0, avgScore: 0, strategicCount: 0, totalOutstanding: 0 } })
      }
      throw poErr
    }

    // ── 3. Group POs by supplier ──
    const poBySupplier: Record<string, any[]> = {}
    for (const po of pos || []) {
      if (!po.supplierId) continue
      if (!poBySupplier[po.supplierId]) poBySupplier[po.supplierId] = []
      poBySupplier[po.supplierId].push(po)
    }

    // ── 4. Compute metrics per supplier ──
    const now = new Date()
    const metrics: SupplierMetrics[] = []

    for (const sup of suppliers || []) {
      const poList = poBySupplier[sup.id] || []
      let totalPOValue = 0
      let paidAmount = 0
      let deliveredCount = 0
      let pendingCount = 0
      let onTimeCount = 0
      let lateCount = 0
      let totalLeadTime = 0
      let leadTimeCount = 0
      let totalOrderedQty = 0
      let totalReceivedQty = 0

      for (const po of poList) {
        totalPOValue += po.totalAmount || 0
        paidAmount += po.paidAmount || 0
        totalOrderedQty += po.quantity || 0
        totalReceivedQty += po.receivedQty || 0

        // Status: Partial or Received counts as "delivered" (at least partially)
        if (po.status === 'Partial' || po.status === 'Received' || po.status === 'Closed') {
          deliveredCount++
          // On-time check: compare expectedDelivery with now
          if (po.expectedDelivery) {
            const expected = parseISO(po.expectedDelivery)
            if (isValid(expected)) {
              if (expected >= now || po.receivedQty > 0) {
                onTimeCount++
              } else {
                lateCount++
              }
            }
          } else {
            onTimeCount++ // no expected date = neutral (count as on-time)
          }
        } else {
          pendingCount++
        }

        // Lead time: createdAt → expectedDelivery
        if (po.createdAt && po.expectedDelivery) {
          const created = parseISO(po.createdAt)
          const expected = parseISO(po.expectedDelivery)
          if (isValid(created) && isValid(expected)) {
            const lead = differenceInDays(expected, created)
            if (lead >= 0) {
              totalLeadTime += lead
              leadTimeCount++
            }
          }
        }
      }

      const outstandingPayables = Math.max(0, totalPOValue - paidAmount)
      const onTimeRate = deliveredCount > 0 ? Math.round((onTimeCount / deliveredCount) * 1000) / 10 : 100
      const avgLeadTimeDays = leadTimeCount > 0 ? Math.round(totalLeadTime / leadTimeCount) : 0
      const fillRate = totalOrderedQty > 0 ? Math.round((totalReceivedQty / totalOrderedQty) * 1000) / 10 : 0

      const base: Omit<SupplierMetrics, 'compositeScore' | 'scoreGrade' | 'tier'> = {
        id: sup.id,
        name: sup.name,
        supplierType: sup.supplierType || 'Unknown',
        contactPerson: sup.contactPerson,
        phone: sup.phone,
        rating: sup.rating || 3,
        paymentTerms: sup.paymentTerms || 15,
        poCount: poList.length,
        totalPOValue: Math.round(totalPOValue),
        paidAmount: Math.round(paidAmount),
        outstandingPayables: Math.round(outstandingPayables),
        deliveredCount,
        pendingCount,
        onTimeCount,
        lateCount,
        onTimeRate,
        avgLeadTimeDays,
        totalOrderedQty: Math.round(totalOrderedQty * 100) / 100,
        totalReceivedQty: Math.round(totalReceivedQty * 100) / 100,
        fillRate,
      }

      const compositeScore = computeCompositeScore(base)
      metrics.push({
        ...base,
        compositeScore,
        scoreGrade: getGrade(compositeScore),
        tier: getTier(compositeScore, poList.length),
      })
    }

    // Sort by composite score descending
    metrics.sort((a, b) => b.compositeScore - a.compositeScore)

    // ── 5. Summary ──
    const totalSuppliers = metrics.length
    const avgScore = totalSuppliers > 0 ? Math.round(metrics.reduce((s, m) => s + m.compositeScore, 0) / totalSuppliers) : 0
    const strategicCount = metrics.filter(m => m.tier === 'Strategic').length
    const preferredCount = metrics.filter(m => m.tier === 'Preferred').length
    const approvedCount = metrics.filter(m => m.tier === 'Approved').length
    const conditionalCount = metrics.filter(m => m.tier === 'Conditional').length
    const totalOutstanding = metrics.reduce((s, m) => s + m.outstandingPayables, 0)
    const totalPOValue = metrics.reduce((s, m) => s + m.totalPOValue, 0)
    const avgOnTimeRate = totalSuppliers > 0 ? Math.round(metrics.reduce((s, m) => s + m.onTimeRate, 0) / totalSuppliers * 10) / 10 : 0
    const avgFillRate = totalSuppliers > 0 ? Math.round(metrics.reduce((s, m) => s + m.fillRate, 0) / totalSuppliers * 10) / 10 : 0
    const avgRating = totalSuppliers > 0 ? Math.round(metrics.reduce((s, m) => s + m.rating, 0) / totalSuppliers * 10) / 10 : 0

    // Grade distribution
    const gradeDist = { A: 0, B: 0, C: 0, D: 0 }
    for (const m of metrics) gradeDist[m.scoreGrade]++

    return NextResponse.json({
      summary: {
        totalSuppliers,
        avgScore,
        avgOnTimeRate,
        avgFillRate,
        avgRating,
        totalPOValue: Math.round(totalPOValue),
        totalOutstanding: Math.round(totalOutstanding),
        strategicCount,
        preferredCount,
        approvedCount,
        conditionalCount,
        gradeDist,
      },
      suppliers: metrics,
    })
  } catch (error) {
    console.error('Supplier performance API error:', error)
    return NextResponse.json({ error: 'Failed to load supplier performance data' }, { status: 500 })
  }
}
