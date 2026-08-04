import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, addDays, startOfDay } from 'date-fns'

/**
 * GET /api/cashflow/forecast?days=30
 *
 * Generates a forward-looking cash flow forecast based on:
 *   1. Current cash balance (latest DailySnapshot)
 *   2. Historical average daily net cash flow (last 30 days)
 *   3. Upcoming confirmed inflows (SalesOrders with deliveryDate in future, unpaid)
 *   4. Upcoming confirmed outflows (PurchaseOrders with expectedDelivery in future, unpaid)
 *
 * Returns day-by-day projected balance for the next `days` days,
 * plus burn-rate metrics (runway, breakeven day, min balance).
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 7), 90)

    const today = startOfDay(new Date())
    const todayISO = today.toISOString()
    const thirtyDaysAgoISO = addDays(today, -30).toISOString()
    const forecastEndISO = addDays(today, days).toISOString()

    // ── 1. Current cash balance (latest snapshot) ──
    const { data: latestSnap, error: snapErr } = await supabase
      .from('DailySnapshot')
      .select('cashBalance, date')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    let currentBalance = 0
    if (snapErr) {
      if (isMissingTableError(snapErr)) {
        // Fallback: derive from dashboard KPI
        const { data: dash } = await supabase
          .from('SalesOrder')
          .select('totalAmount, paidAmount')
          .in('status', ['Dispatched', 'Delivered'])
        const rev = (dash || []).reduce((s: number, o: any) => s + ((o.totalAmount || 0) - (o.paidAmount || 0)), 0)
        currentBalance = Math.round(rev * 0.15) // rough estimate
      } else {
        throw snapErr
      }
    } else if (latestSnap) {
      currentBalance = latestSnap.cashBalance || 0
    }

    // ── 2. Historical avg daily net flow (last 30 days) ──
    const { data: histSnaps, error: histErr } = await supabase
      .from('DailySnapshot')
      .select('cashIn, cashOut')
      .gte('date', thirtyDaysAgoISO)
      .lte('date', todayISO)

    let avgDailyIn = 0
    let avgDailyOut = 0
    if (histErr) {
      if (!isMissingTableError(histErr)) throw histErr
    } else if (histSnaps && histSnaps.length > 0) {
      const totalIn = histSnaps.reduce((s: number, x: any) => s + (x.cashIn || 0), 0)
      const totalOut = histSnaps.reduce((s: number, x: any) => s + (x.cashOut || 0), 0)
      avgDailyIn = Math.round(totalIn / histSnaps.length)
      avgDailyOut = Math.round(totalOut / histSnaps.length)
    }
    const avgDailyNet = avgDailyIn - avgDailyOut

    // ── 3. Upcoming inflows (SalesOrders unpaid, with future deliveryDate) ──
    const { data: upcomingOrders, error: ordErr } = await supabase
      .from('SalesOrder')
      .select('totalAmount, paidAmount, deliveryDate')
      .neq('paymentStatus', 'Paid')
      .gte('deliveryDate', todayISO)
      .lte('deliveryDate', forecastEndISO)
      .order('deliveryDate', { ascending: true })

    if (ordErr && !isMissingTableError(ordErr)) throw ordErr

    // Group upcoming inflows by date
    const inflowByDate: Record<string, number> = {}
    for (const o of upcomingOrders || []) {
      if (!o.deliveryDate) continue
      const dateKey = format(new Date(o.deliveryDate), 'yyyy-MM-dd')
      const amount = (o.totalAmount || 0) - (o.paidAmount || 0)
      inflowByDate[dateKey] = (inflowByDate[dateKey] || 0) + amount
    }

    // ── 4. Upcoming outflows (PurchaseOrders unpaid, with future expectedDelivery) ──
    const { data: upcomingPOs, error: poErr } = await supabase
      .from('PurchaseOrder')
      .select('totalAmount, paidAmount, expectedDelivery')
      .neq('paymentStatus', 'Paid')
      .gte('expectedDelivery', todayISO)
      .lte('expectedDelivery', forecastEndISO)
      .order('expectedDelivery', { ascending: true })

    if (poErr && !isMissingTableError(poErr)) throw poErr

    // Group upcoming outflows by date
    const outflowByDate: Record<string, number> = {}
    for (const p of upcomingPOs || []) {
      if (!p.expectedDelivery) continue
      const dateKey = format(new Date(p.expectedDelivery), 'yyyy-MM-dd')
      const amount = (p.totalAmount || 0) - (p.paidAmount || 0)
      outflowByDate[dateKey] = (outflowByDate[dateKey] || 0) + amount
    }

    // ── 5. Build day-by-day forecast ──
    const forecast: Array<{
      date: string
      projectedInflow: number
      projectedOutflow: number
      netFlow: number
      balance: number
      isBreakeven: boolean
    }> = []

    let runningBalance = currentBalance
    let minBalance = currentBalance
    let minBalanceDate = format(today, 'yyyy-MM-dd')
    let breakevenDay: string | null = null
    let totalProjectedInflow = 0
    let totalProjectedOutflow = 0

    for (let i = 0; i < days; i++) {
      const day = addDays(today, i)
      const dateKey = format(day, 'yyyy-MM-dd')

      // Base flow = historical average + scheduled transactions for this day
      const scheduledIn = inflowByDate[dateKey] || 0
      const scheduledOut = outflowByDate[dateKey] || 0
      // Use historical avg as the "baseline" expected flow, plus scheduled items on top
      const dayIn = avgDailyIn + scheduledIn
      const dayOut = avgDailyOut + scheduledOut
      const net = dayIn - dayOut

      runningBalance += net

      if (runningBalance < minBalance) {
        minBalance = runningBalance
        minBalanceDate = dateKey
      }

      // Breakeven = first day balance drops below 0
      if (breakevenDay === null && runningBalance < 0) {
        breakevenDay = dateKey
      }

      totalProjectedInflow += dayIn
      totalProjectedOutflow += dayOut

      forecast.push({
        date: dateKey,
        projectedInflow: Math.round(dayIn),
        projectedOutflow: Math.round(dayOut),
        netFlow: Math.round(net),
        balance: Math.round(runningBalance),
        isBreakeven: runningBalance < 0,
      })
    }

    // ── 6. Compute runway (days until cash runs out) ──
    let runwayDays: number | null = null
    if (avgDailyNet < 0) {
      // Burning cash — calculate days until balance hits 0
      runwayDays = Math.floor(currentBalance / Math.abs(avgDailyNet))
    } else {
      runwayDays = null // infinite (cash growing)
    }

    // ── 7. Summary ──
    const totalNetFlow = totalProjectedInflow - totalProjectedOutflow
    const projectedClosingBalance = currentBalance + totalNetFlow

    return NextResponse.json({
      summary: {
        currentBalance: Math.round(currentBalance),
        avgDailyIn,
        avgDailyOut,
        avgDailyNet,
        runwayDays,
        breakevenDay,
        minBalance: Math.round(minBalance),
        minBalanceDate,
        projectedClosingBalance: Math.round(projectedClosingBalance),
        totalProjectedInflow: Math.round(totalProjectedInflow),
        totalProjectedOutflow: Math.round(totalProjectedOutflow),
        forecastDays: days,
      },
      forecast,
      upcomingInflowsCount: Object.keys(inflowByDate).length,
      upcomingOutflowsCount: Object.keys(outflowByDate).length,
    })
  } catch (error) {
    console.error('Cash flow forecast API error:', error)
    return NextResponse.json({ error: 'Failed to generate cash flow forecast' }, { status: 500 })
  }
}
