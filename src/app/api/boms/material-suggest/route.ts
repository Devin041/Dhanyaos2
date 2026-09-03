import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'

/**
 * GET /api/boms/material-suggest
 *
 * Distinct BOMLine.materialName UNION distinct FabricStock.fabricName,
 * sorted alphabetically, capped at 200. Used by the BOM line editor's
 * HTML <datalist> autocomplete.
 */

const MAX_NAMES = 200

export async function GET() {
  try {
    const names = new Set<string>()

    // 1. Every material name already used on a BOM line
    try {
      const { data: lines } = await supabase
        .from('BOMLine')
        .select('materialName')
      for (const l of lines || []) {
        const n = String(l?.materialName || '').trim()
        if (n) names.add(n)
      }
    } catch {
      // Best-effort — continue with fabric stock names
    }

    // 2. Every fabric in stock (grn-received / PO-created)
    try {
      const { data: stock } = await supabase
        .from('FabricStock')
        .select('fabricName')
      for (const s of stock || []) {
        const n = String(s?.fabricName || '').trim()
        if (n) names.add(n)
      }
    } catch {
      // Best-effort — continue with what we have
    }

    const sorted = [...names].sort((a, b) => a.localeCompare(b)).slice(0, MAX_NAMES)

    return NextResponse.json({ names: sorted })
  } catch (error: any) {
    console.error('[boms/material-suggest GET]', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch material suggestions' },
      { status: 500 },
    )
  }
}
