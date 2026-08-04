import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'

// ─── GET: Consumption summary / aggregate stats ──────────────────────────────
export async function GET() {
  try {
    // Fetch all consumption records for aggregation
    const { data: allConsumptions, error } = await supabase
      .from('FabricConsumption')
      .select('*')

    if (error) throw error
    const rows = allConsumptions || []

    // Overall averages
    const totalConsumed = rows.reduce((s: number, c: any) => s + (c.consumedQty || 0), 0)
    const totalWastage = rows.reduce((s: number, c: any) => s + (c.wastageQty || 0), 0)
    const totalIssued = rows.reduce((s: number, c: any) => s + (c.issuedQty || 0), 0)
    const avgWastage = rows.length > 0
      ? rows.reduce((s: number, c: any) => s + (c.wastagePercent || 0), 0) / rows.length
      : 0
    const highWasteCount = rows.filter((c: any) => (c.wastagePercent || 0) > 8).length

    // Wastage by fabric type (group in JS)
    const fabricMap: Record<string, { totalWastage: number; totalConsumed: number; totalIssued: number; wastagePercentSum: number; count: number }> = {}
    for (const c of rows) {
      const key = c.fabricName || 'Unknown'
      if (!fabricMap[key]) {
        fabricMap[key] = { totalWastage: 0, totalConsumed: 0, totalIssued: 0, wastagePercentSum: 0, count: 0 }
      }
      fabricMap[key].totalWastage += c.wastageQty || 0
      fabricMap[key].totalConsumed += c.consumedQty || 0
      fabricMap[key].totalIssued += c.issuedQty || 0
      fabricMap[key].wastagePercentSum += c.wastagePercent || 0
      fabricMap[key].count++
    }

    const wastageByFabric = Object.entries(fabricMap)
      .map(([fabricName, m]) => ({
        fabricName,
        totalWastageMeters: m.totalWastage,
        avgWastagePercent: m.wastagePercentSum / m.count,
        totalConsumedMeters: m.totalConsumed,
        records: m.count,
      }))
      .sort((a, b) => b.avgWastagePercent - a.avgWastagePercent)
      .slice(0, 10)

    // Wastage by reason (group in JS)
    const reasonMap: Record<string, { totalWastage: number; totalIssued: number; wastagePercentSum: number; count: number }> = {}
    for (const c of rows) {
      if (!c.wastageReason) continue
      if (!reasonMap[c.wastageReason]) {
        reasonMap[c.wastageReason] = { totalWastage: 0, totalIssued: 0, wastagePercentSum: 0, count: 0 }
      }
      reasonMap[c.wastageReason].totalWastage += c.wastageQty || 0
      reasonMap[c.wastageReason].totalIssued += c.issuedQty || 0
      reasonMap[c.wastageReason].wastagePercentSum += c.wastagePercent || 0
      reasonMap[c.wastageReason].count++
    }

    const wastageByReason = Object.entries(reasonMap)
      .map(([reason, m]) => ({
        reason,
        totalWastageMeters: m.totalWastage,
        avgWastagePercent: m.wastagePercentSum / m.count,
        records: m.count,
      }))
      .sort((a, b) => b.totalWastageMeters - a.totalWastageMeters)

    // Consumption per piece by fabric
    const mpcMap: Record<string, { totalConsumedQty: number; totalOutputQty: number; consumptionPerPcSum: number; count: number }> = {}
    for (const c of rows) {
      const key = c.fabricName || 'Unknown'
      if (!mpcMap[key]) {
        mpcMap[key] = { totalConsumedQty: 0, totalOutputQty: 0, consumptionPerPcSum: 0, count: 0 }
      }
      mpcMap[key].totalConsumedQty += c.consumedQty || 0
      mpcMap[key].totalOutputQty += c.outputQty || 0
      mpcMap[key].consumptionPerPcSum += c.consumptionPerPc || 0
      mpcMap[key].count++
    }

    const mtrsPerPcByFabric = Object.entries(mpcMap)
      .map(([fabricName, m]) => ({
        fabricName,
        avgMetersPerPiece: m.consumptionPerPcSum / m.count,
        totalOutputPieces: m.totalOutputQty,
        totalConsumedMeters: m.totalConsumedQty,
      }))
      .sort((a, b) => b.avgMetersPerPiece - a.avgMetersPerPiece)
      .slice(0, 10)

    return NextResponse.json({
      overall: {
        avgWastagePercent: avgWastage,
        totalConsumedMeters: totalConsumed,
        totalWastageMeters: totalWastage,
        totalIssuedMeters: totalIssued,
        highWasteAlerts: highWasteCount,
      },
      wastageByFabric,
      wastageByReason,
      mtrsPerPcByFabric,
    })
  } catch (error) {
    console.error('Error fetching consumption summary:', error)
    return NextResponse.json({ error: 'Failed to fetch consumption summary' }, { status: 500 })
  }
}
