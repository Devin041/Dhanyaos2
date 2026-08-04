import type { ToolDef } from './tools'

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS ONLY — 4 GST COMPLIANCE TOOLS (lightweight, no db import)
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS_GST: ToolDef[] = [
  {
    name: 'get_gst_summary',
    description: 'Get GST liability summary — total taxable value, CGST, SGST, IGST collected, and input tax credit available for a period.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_gstr1_draft',
    description: 'Get GSTR-1 draft with outward supply details — B2B invoices, B2C invoices, HSN summary. For GST filing reference.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_gstr3b_draft',
    description: 'Get GSTR-3B return draft — output GST, input credit, net tax liability, late fees if any.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
  {
    name: 'get_gst_hsn_summary',
    description: 'Get HSN-code wise GST summary — total taxable value and tax collected per HSN code.',
    parameters: {
      period: { type: 'string', description: 'Reporting period', enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'], required: true },
      fromDate: { type: 'string', description: 'Start date (only for custom period)' },
      toDate: { type: 'string', description: 'End date (only for custom period)' },
    },
  },
]