import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { format } from 'date-fns'

const execFileAsync = promisify(execFile)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: po, error } = await supabase
      .from('PurchaseOrder')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !po) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 })
    }

    // Fetch supplier
    let supplier: Record<string, unknown> | null = null
    if (po.supplierId) {
      const { data: s } = await supabase
        .from('Supplier')
        .select('id, name, supplierType, contactPerson, phone, email, paymentTerms')
        .eq('id', po.supplierId)
        .single()
      supplier = s || null
    }

    // Build PO data for PDF generation
    const poData = {
      poNumber: po.poNumber,
      supplier: supplier,
      fabricName: po.fabricName,
      quantity: po.quantity,
      unit: po.unit,
      ratePerUnit: po.ratePerUnit,
      totalAmount: po.totalAmount,
      expectedDelivery: po.expectedDelivery ? format(new Date(po.expectedDelivery), 'yyyy-MM-dd') : null,
      paymentDueDate: po.paymentDueDate ? format(new Date(po.paymentDueDate), 'yyyy-MM-dd') : null,
      status: po.status,
      paymentStatus: po.paymentStatus,
      paidAmount: po.paidAmount,
      paymentTerms: (supplier as any)?.paymentTerms,
      createdAt: po.createdAt,
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'generate-po-pdf.py')
    const { stdout } = await execFileAsync('python3', [scriptPath, JSON.stringify(poData)], {
      maxBuffer: 10 * 1024 * 1024,
    })

    const pdfBuffer = Buffer.from(stdout)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${po.poNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('PO PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PO PDF' },
      { status: 500 }
    )
  }
}
