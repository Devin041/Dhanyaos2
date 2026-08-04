// GST Calculation Utility for Indian GST
// IntraState (within Gujarat): CGST = SGST = gstPercent / 2
// InterState (outside Gujarat): IGST = gstPercent

export interface GstBreakup {
  gstType: 'IntraState' | 'InterState'
  gstPercent: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalGst: number
}

export function calculateGST(
  taxableAmount: number,
  gstPercent: number = 18,
  gstType: string = 'IntraState'
): GstBreakup {
  const totalGst = taxableAmount * (gstPercent / 100)

  if (gstType === 'InterState') {
    return {
      gstType: 'InterState',
      gstPercent,
      taxableAmount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: Math.round(totalGst * 100) / 100,
      totalGst: Math.round(totalGst * 100) / 100,
    }
  }

  // IntraState: split into CGST + SGST (derived from totalGst to avoid rounding mismatch)
  const half = Math.round((totalGst / 2) * 100) / 100
  const otherHalf = Math.round((totalGst - half) * 100) / 100
  return {
    gstType: 'IntraState',
    gstPercent,
    taxableAmount,
    cgstAmount: half,
    sgstAmount: otherHalf,
    igstAmount: 0,
    totalGst: Math.round(totalGst * 100) / 100,
  }
}