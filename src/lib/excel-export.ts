import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import type { ColumnDef } from './excel-columns'

/**
 * Resolve a dot-notation key path against a plain object.
 * e.g. getNestedValue({ a: { b: 1 } }, 'a.b') → 1
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    obj,
  )
}

/**
 * Format a raw value into a cell-friendly value (string or number).
 * Currency / number / percent values are kept as numeric so Excel can sum/format them.
 */
function formatCellValue(value: unknown, fmt?: string): string | number {
  if (value === null || value === undefined) return ''
  switch (fmt) {
    case 'currency':
      return typeof value === 'number' ? Math.round(value * 100) / 100 : value
    case 'number':
      return typeof value === 'number' ? Math.round(value) : value
    case 'percent':
      return typeof value === 'number' ? Math.round(value * 100) / 100 : value
    case 'date':
      return value instanceof Date ? format(value, 'dd-MMM-yyyy') : String(value)
    default:
      return String(value)
  }
}

/**
 * Generate an XLSX workbook buffer from one or more sheets.
 *
 * @param data  Map of sheet name → { rows, columns }
 * @returns     Node.js Buffer containing the .xlsx file
 */
export function generateExcel(
  data: Record<string, { rows: Record<string, unknown>[]; columns: ColumnDef[] }>,
): Buffer {
  const wb = XLSX.utils.book_new()

  for (const [sheetName, { rows, columns }] of Object.entries(data)) {
    // Header row
    const headers = columns.map((c) => c.header)

    // Data rows — resolve dot-notation keys and apply formatting
    const dataRows = rows.map((row) =>
      columns.map((col) => {
        const raw = getNestedValue(row, col.key)
        return formatCellValue(raw, col.format)
      }),
    )

    const wsData = [headers, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Set column widths
    ws['!cols'] = columns.map((c) => ({ wch: c.width || 15 }))

    // Auto-filter on the entire range (header + data)
    if (wsData.length > 0 && headers.length > 0) {
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: wsData.length - 1, c: headers.length - 1 },
        }),
      }
    }

    // Excel sheet names are limited to 31 characters
    const truncatedName = sheetName.substring(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, truncatedName)
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}