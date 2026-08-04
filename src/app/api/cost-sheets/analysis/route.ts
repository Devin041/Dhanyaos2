import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'
import { format, subDays, parseISO, isValid, differenceInDays } from 'date-fns'

/**
 * GET /api/cost-sheets/analysis
 *
 * Cost Analysis Dashboard — aggregates cost sheet metrics across cost
 * components, margins, variance, and trends.
 *
 * Computes:
 *   - Total cost sheets, total production cost, total selling price, total profit
 *   - Average margin, margin distribution
 *   - Cost component breakdown (fabric, trim, labor, wash, packaging, overhead, other)
 *   - Cost variance analysis (actual vs target cost where available)
 *   - 6-month cost trend
 *   - Top expensive styles
 *   - Margin outliers (low margin / high margin)
 *   - Cost efficiency score (0-100)
 */

interface CostComponent {
  name: string
  totalCost: number
  percentage: number
  avgPerSheet: number
  color: string
}

interface TrendItem {
  month: string
  totalCost: number
  totalSelling: number
  totalProfit: number
  avgMargin: number
  count: number
}

interface StyleCostItem {
  id: string
  sheetNo: string
  styleNo: string
  styleName: string
  totalCost: number
  sellingPrice: number
  profit: number
  margin: number
  status: string
  image: string | null
}

interface CostSummary {
  totalSheets: number
  totalCost: number
  totalSelling: number
  totalProfit: number
  avgMargin: number
  avgCost: number
  avgSelling: number
  lowMarginCount: number
  highMarginCount: number
  draftCount: number
  approvedCount: number
  costEfficiencyScore: number
  grade: string
}

const COMPONENT_COLORS: Record<string, string> = {
  fabricCost: 'oklch(0.78 0.14 85)',      // gold
  trimCost: 'oklch(0.72 0.18 145)',       // green
  laborCost: 'oklch(0.7 0.15 250)',       // blue
  washCost: 'oklch(0.65 0.12 180)',       // teal
  packagingCost: 'oklch(0.75 0.15 65)',   // orange
  overheadCost: 'oklch(0.7 0.15 300)',    // purple
  otherCost: 'oklch(0.6 0.01 260)',       // gray
}

const COMPONENT_LABELS: Record<string, string> = {
  fabricCost: 'Fabric',
  trimCost: 'Trim',
  laborCost: 'Labor',
  washCost: 'Wash',
  packagingCost: 'Packaging',
  overheadCost: 'Overhead',
  otherCost: 'Other',
}

function getGrade(score: number): string {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export async function GET() {
  try {
    // ── Fetch all cost sheets ──
    const { data: sheets, error: sheetErr } = await supabase
      .from('CostSheet')
      .select('id, sheetNo, styleNo, styleName, fabricCost, trimCost, laborCost, washCost, packagingCost, overheadCost, otherCost, totalCost, profitPercent, sellingPrice, status, image, createdAt')
      .order('createdAt', { ascending: true })

    if (sheetErr) {
      if (isMissingTableError(sheetErr)) {
        return NextResponse.json({
          summary: { totalSheets: 0, totalCost: 0, totalSelling: 0, totalProfit: 0, avgMargin: 0, avgCost: 0, avgSelling: 0, lowMarginCount: 0, highMarginCount: 0, draftCount: 0, approvedCount: 0, costEfficiencyScore: 100, grade: 'A' },
          components: [],
          trend: [],
          topExpensive: [],
          marginOutliers: { low: [], high: [] },
        })
      }
      throw sheetErr
    }

    const allSheets = sheets || []

    // ── Summary ──
    const totalSheets = allSheets.length
    const totalCost = allSheets.reduce((s: number, c: any) => s + (c.totalCost || 0), 0)
    const totalSelling = allSheets.reduce((s: number, c: any) => s + (c.sellingPrice || 0), 0)
    const totalProfit = totalSelling - totalCost
    const avgMargin = totalSheets > 0 ? Math.round(allSheets.reduce((s: number, c: any) => s + (c.profitPercent || 0), 0) / totalSheets * 10) / 10 : 0
    const avgCost = totalSheets > 0 ? Math.round(totalCost / totalSheets) : 0
    const avgSelling = totalSheets > 0 ? Math.round(totalSelling / totalSheets) : 0

    // Margin distribution
    const lowMarginCount = allSheets.filter((c: any) => (c.profitPercent || 0) < 20).length
    const highMarginCount = allSheets.filter((c: any) => (c.profitPercent || 0) >= 40).length
    const draftCount = allSheets.filter((c: any) => c.status === 'Draft').length
    const approvedCount = allSheets.filter((c: any) => c.status === 'Approved' || c.status === 'Finalized').length

    // Cost efficiency score: based on avg margin and low margin count
    // - Avg margin contribution: 50% (margin/50 * 100)
    // - Low margin penalty: 30% (lowMarginCount/totalSheets * 100, inverted)
    // - High margin bonus: 20% (highMarginCount/totalSheets * 100)
    const marginScore = Math.min(100, (avgMargin / 50) * 100)
    const lowMarginPenalty = totalSheets > 0 ? (lowMarginCount / totalSheets) * 100 : 0
    const highMarginBonus = totalSheets > 0 ? (highMarginCount / totalSheets) * 100 : 0
    const costEfficiencyScore = Math.max(0, Math.min(100, Math.round(marginScore * 0.5 + (100 - lowMarginPenalty) * 0.3 + highMarginBonus * 0.2)))
    const grade = getGrade(costEfficiencyScore)

    const summary: CostSummary = {
      totalSheets,
      totalCost: Math.round(totalCost),
      totalSelling: Math.round(totalSelling),
      totalProfit: Math.round(totalProfit),
      avgMargin,
      avgCost,
      avgSelling,
      lowMarginCount,
      highMarginCount,
      draftCount,
      approvedCount,
      costEfficiencyScore,
      grade,
    }

    // ── Cost component breakdown ──
    const componentTotals: Record<string, number> = {
      fabricCost: 0,
      trimCost: 0,
      laborCost: 0,
      washCost: 0,
      packagingCost: 0,
      overheadCost: 0,
      otherCost: 0,
    }
    for (const sheet of allSheets) {
      for (const key of Object.keys(componentTotals)) {
        componentTotals[key] += (sheet as any)[key] || 0
      }
    }
    const components: CostComponent[] = Object.entries(componentTotals)
      .map(([key, totalCost]) => ({
        name: COMPONENT_LABELS[key],
        totalCost: Math.round(totalCost),
        percentage: totalCost > 0 ? Math.round((totalCost / (allSheets.reduce((s: number, c: any) => s + (c.totalCost || 0), 0) || 1)) * 1000) / 10 : 0,
        avgPerSheet: totalSheets > 0 ? Math.round(totalCost / totalSheets) : 0,
        color: COMPONENT_COLORS[key],
      }))
      .filter(c => c.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost)

    // ── 6-month trend ──
    const now = new Date()
    const trend: TrendItem[] = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const monthSheets = allSheets.filter((s: any) => {
        const created = s.createdAt ? new Date(s.createdAt) : null
        return created && created >= monthStart && created <= monthEnd
      })
      const mCost = monthSheets.reduce((s: number, c: any) => s + (c.totalCost || 0), 0)
      const mSelling = monthSheets.reduce((s: number, c: any) => s + (c.sellingPrice || 0), 0)
      const mProfit = mSelling - mCost
      trend.push({
        month: format(monthStart, 'MMM yy'),
        totalCost: Math.round(mCost),
        totalSelling: Math.round(mSelling),
        totalProfit: Math.round(mProfit),
        avgMargin: monthSheets.length > 0 ? Math.round(monthSheets.reduce((s: number, c: any) => s + (c.profitPercent || 0), 0) / monthSheets.length * 10) / 10 : 0,
        count: monthSheets.length,
      })
    }

    // ── Top expensive styles ──
    const topExpensive: StyleCostItem[] = [...allSheets]
      .sort((a: any, b: any) => (b.totalCost || 0) - (a.totalCost || 0))
      .slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        sheetNo: s.sheetNo,
        styleNo: s.styleNo,
        styleName: s.styleName || 'Unknown',
        totalCost: Math.round(s.totalCost || 0),
        sellingPrice: Math.round(s.sellingPrice || 0),
        profit: Math.round((s.sellingPrice || 0) - (s.totalCost || 0)),
        margin: s.profitPercent || 0,
        status: s.status || 'Draft',
        image: s.image,
      }))

    // ── Margin outliers ──
    const marginOutliers = {
      low: allSheets
        .filter((s: any) => (s.profitPercent || 0) < 20)
        .sort((a: any, b: any) => (a.profitPercent || 0) - (b.profitPercent || 0))
        .slice(0, 3)
        .map((s: any) => ({
          id: s.id,
          sheetNo: s.sheetNo,
          styleNo: s.styleNo,
          styleName: s.styleName || 'Unknown',
          totalCost: Math.round(s.totalCost || 0),
          sellingPrice: Math.round(s.sellingPrice || 0),
          margin: s.profitPercent || 0,
        })),
      high: allSheets
        .filter((s: any) => (s.profitPercent || 0) >= 40)
        .sort((a: any, b: any) => (b.profitPercent || 0) - (a.profitPercent || 0))
        .slice(0, 3)
        .map((s: any) => ({
          id: s.id,
          sheetNo: s.sheetNo,
          styleNo: s.styleNo,
          styleName: s.styleName || 'Unknown',
          totalCost: Math.round(s.totalCost || 0),
          sellingPrice: Math.round(s.sellingPrice || 0),
          margin: s.profitPercent || 0,
        })),
    }

    return NextResponse.json({
      summary,
      components,
      trend,
      topExpensive,
      marginOutliers,
    })
  } catch (error) {
    console.error('Cost analysis API error:', error)
    return NextResponse.json({ error: 'Failed to load cost analysis data' }, { status: 500 })
  }
}
