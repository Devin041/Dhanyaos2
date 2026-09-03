import { NextRequest, NextResponse } from 'next/server'
import { computeBomRequirement } from '@/lib/bom-requirement'

/**
 * GET /api/boms/requirement?styleNo=EL-024&qty=120
 *
 * Material planning endpoint — how much of each BOM material is needed to
 * produce `qty` pieces, checked against fabric stock availability.
 *
 * Responses:
 *   400 — missing styleNo, or qty not a positive number
 *   404 — { error: 'No active BOM' }
 *   200 — {
 *     requirement: {
 *       lines: [{ materialType, materialName, color, unit, qtyPerPiece,
 *                 wastagePercent, requiredQty, availableQty, gap,
 *                 status: 'OK' | 'SHORT' | 'UNKNOWN' }],
 *       summary: { totalLines, ok, short, unknown }
 *     }
 *   }
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const styleNo = searchParams.get('styleNo')?.trim() || ''
    const qtyRaw = searchParams.get('qty')
    const qty = Number(qtyRaw)

    if (!styleNo) {
      return NextResponse.json({ error: 'styleNo is required' }, { status: 400 })
    }
    if (qtyRaw === null || qtyRaw === '' || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: 'qty is required and must be a positive number' },
        { status: 400 },
      )
    }

    const outcome = await computeBomRequirement(styleNo, qty)

    if (outcome.ok === false) {
      if (outcome.reason === 'no-active-bom') {
        return NextResponse.json(
          { error: 'No active BOM' },
          { status: 404 },
        )
      }
      if (outcome.reason === 'missing-params') {
        return NextResponse.json(
          { error: 'styleNo is required and qty must be a positive number' },
          { status: 400 },
        )
      }
      return NextResponse.json(
        { error: outcome.message || 'Failed to compute requirement' },
        { status: 500 },
      )
    }

    return NextResponse.json({ requirement: outcome.requirement })
  } catch (error: any) {
    console.error('[boms/requirement GET]', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to compute requirement' },
      { status: 500 },
    )
  }
}
