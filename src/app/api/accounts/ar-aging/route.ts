import { NextRequest, NextResponse } from 'next/server'
import { supabase, isMissingTableError } from '@/lib/supabase-db'
import { differenceInDays } from 'date-fns'

/**
 * GET /api/accounts/ar-aging
 *
 * Accounts Receivable Aging Report — shows customer-wise outstanding
 * broken down by age buckets (0-30, 31-60, 61-90, 90+ days).
 *
 * Also includes:
 *   - Credit limit vs outstanding comparison
 *   - Overdue invoices list
 *   - Collection priority ranking
 */

export async function GET() {
  try {
    // Fetch all unpaid/partial invoices
    const { data: invoices, error } = await supabase
      .from('Invoice')
      .select('id, invoiceNo, customerId, customerName, totalAmount, paidAmount, dueDate, invoiceDate, paymentStatus, paymentTerms')
      .in('paymentStatus', ['Unpaid', 'Partial'])

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ customers: [], summary: { totalOutstanding: 0, customerCount: 0, overdueCount: 0 } })
      }
      throw error
    }

    // Fetch customers for credit limit info
    const { data: customers } = await supabase
      .from('Customer')
      .select('id, companyName, creditLimit, creditDays, phone, email')
      .eq('status', 'Active')

    const customerMap: Record<string, any> = {}
    for (const c of (customers || [])) {
      customerMap[c.id] = c
    }

    const now = new Date()

    // Build per-customer aging
    const agingMap: Record<string, {
      customerId: string
      customerName: string
      phone: string | null
      email: string | null
      creditLimit: number
      bucket30: number
      bucket60: number
      bucket90: number
      bucket90Plus: number
      total: number
      invoiceCount: number
      overdueInvoices: any[]
    }> = {}

    let totalOutstanding = 0
    let overdueCount = 0

    for (const inv of (invoices || [])) {
      const custId = inv.customerId || 'unknown'
      const custName = inv.customerName || customerMap[custId]?.companyName || 'Unknown'
      const outstanding = (inv.totalAmount || 0) - (inv.paidAmount || 0)
      if (outstanding <= 0) continue

      totalOutstanding += outstanding

      // Calculate age from invoice date
      const invDate = new Date(inv.invoiceDate)
      const ageDays = differenceInDays(now, invDate)

      // Calculate if overdue
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null
      const isOverdue = dueDate && now > dueDate
      if (isOverdue) overdueCount++

      if (!agingMap[custId]) {
        agingMap[custId] = {
          customerId: custId,
          customerName: custName,
          phone: customerMap[custId]?.phone || null,
          email: customerMap[custId]?.email || null,
          creditLimit: customerMap[custId]?.creditLimit || 0,
          bucket30: 0, bucket60: 0, bucket90: 0, bucket90Plus: 0,
          total: 0, invoiceCount: 0, overdueInvoices: [],
        }
      }

      const a = agingMap[custId]
      a.total += outstanding
      a.invoiceCount++

      if (ageDays <= 30) a.bucket30 += outstanding
      else if (ageDays <= 60) a.bucket60 += outstanding
      else if (ageDays <= 90) a.bucket90 += outstanding
      else a.bucket90Plus += outstanding

      if (isOverdue) {
        a.overdueInvoices.push({
          invoiceNo: inv.invoiceNo,
          outstanding: Math.round(outstanding),
          dueDate: inv.dueDate,
          daysOverdue: differenceInDays(now, dueDate!),
          paymentTerms: inv.paymentTerms,
        })
      }
    }

    // Convert to array and sort by total outstanding (descending)
    const customerList = Object.values(agingMap).map((a: any) => ({
      ...a,
      bucket30: Math.round(a.bucket30),
      bucket60: Math.round(a.bucket60),
      bucket90: Math.round(a.bucket90),
      bucket90Plus: Math.round(a.bucket90Plus),
      total: Math.round(a.total),
      creditUtilization: a.creditLimit > 0 ? Math.round((a.total / a.creditLimit) * 1000) / 10 : 0,
      creditExceeded: a.creditLimit > 0 && a.total > a.creditLimit,
    })).sort((a: any, b: any) => b.total - a.total)

    return NextResponse.json({
      customers: customerList,
      summary: {
        totalOutstanding: Math.round(totalOutstanding),
        customerCount: customerList.length,
        overdueCount,
        bucket30Total: customerList.reduce((s: number, c: any) => s + c.bucket30, 0),
        bucket60Total: customerList.reduce((s: number, c: any) => s + c.bucket60, 0),
        bucket90Total: customerList.reduce((s: number, c: any) => s + c.bucket90, 0),
        bucket90PlusTotal: customerList.reduce((s: number, c: any) => s + c.bucket90Plus, 0),
        creditExceededCount: customerList.filter((c: any) => c.creditExceeded).length,
      },
    })
  } catch (error) {
    console.error('AR Aging API error:', error)
    return NextResponse.json({ error: 'Failed to load AR aging' }, { status: 500 })
  }
}
