import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { getModuleSpec, getModuleKeys, type ModuleExportSpec } from '@/lib/excel-columns'
import { generateExcel } from '@/lib/excel-export'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // Single module: ?module=sales-orders
  const singleModule = searchParams.get('module')
  // Multi-module: ?modules=sales-orders,customers
  const multiModules = searchParams.get('modules')

  // Collect the keys the caller wants
  let keys: string[] = []
  if (singleModule) {
    keys = [singleModule]
  } else if (multiModules) {
    keys = multiModules.split(',').map((k) => k.trim()).filter(Boolean)
  }

  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'Query param "module" or "modules" is required' },
      { status: 400 },
    )
  }

  // Validate all keys
  const validKeys = getModuleKeys()
  for (const k of keys) {
    if (!validKeys.includes(k)) {
      return NextResponse.json(
        { error: `Unknown module "${k}". Available: ${validKeys.join(', ')}` },
        { status: 404 },
      )
    }
  }

  try {
    // Fetch data for each module in parallel
    const sheetData: Record<string, { rows: Record<string, unknown>[]; columns: ModuleExportSpec['columns'] }> = {}

    const entries = await Promise.all(
      keys.map(async (k) => {
        const spec = getModuleSpec(k)!
        const rows = (await spec.fetchAll()) as Record<string, unknown>[]
        return [k, { rows, columns: spec.columns }] as const
      }),
    )

    for (const [k, data] of entries) {
      sheetData[k] = data
    }

    // Generate the XLSX buffer
    const buffer = generateExcel(sheetData)

    // Build filename
    const today = format(new Date(), 'yyyy-MM-dd')
    const moduleLabel = keys.length === 1 ? keys[0] : 'multi'
    const filename = `DhanyaOS_${moduleLabel}_${today}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[Excel Export Error]', error)
    return NextResponse.json(
      { error: 'Failed to generate Excel file', details: String(error) },
      { status: 500 },
    )
  }
}