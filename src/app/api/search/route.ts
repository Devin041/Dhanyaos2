import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

// ─── GET /api/search?q=... ────────────────────────────────────────────────────
// Global search across all major entities.
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim()
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const results: Array<{
      id: string
      type: string
      title: string
      subtitle: string
      meta: string
      view: string
    }> = []

    const query = q

    // ── Sales Orders ────────────────────────────────────────────────────
    const { data: orders } = await supabase
      .from('SalesOrder')
      .select('id, orderNo, totalAmount, status, orderDate, customer:customerId(companyName)')
      .or(`orderNo.ilike.%${query}%,notes.ilike.%${query}%`)
      .limit(5)
    for (const o of (orders || [])) {
      results.push({
        id: o.id, type: 'order', title: o.orderNo,
        subtitle: o.customer?.companyName || '',
        meta: `₹${o.totalAmount.toLocaleString('en-IN')} · ${o.status}`,
        view: 'orders',
      })
    }

    // ── Customers ───────────────────────────────────────────────────────
    const { data: customers } = await supabase
      .from('Customer')
      .select('id, companyName, buyerName, status')
      .or(`companyName.ilike.%${query}%,buyerName.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5)
    for (const c of (customers || [])) {
      results.push({
        id: c.id, type: 'customer', title: c.companyName,
        subtitle: c.buyerName || '', meta: c.status, view: 'customers',
      })
    }

    // ── Suppliers ───────────────────────────────────────────────────────
    const { data: suppliers } = await supabase
      .from('Supplier')
      .select('id, name, supplierType, status')
      .or(`name.ilike.%${query}%,contactPerson.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(5)
    for (const s of (suppliers || [])) {
      results.push({
        id: s.id, type: 'supplier', title: s.name,
        subtitle: s.supplierType, meta: s.status, view: 'suppliers',
      })
    }

    // ── Styles ──────────────────────────────────────────────────────────
    const { data: styles } = await supabase
      .from('Style')
      .select('id, styleNo, category, status, sellPrice')
      .or(`styleNo.ilike.%${query}%,collectionName.ilike.%${query}%,category.ilike.%${query}%,brand.ilike.%${query}%`)
      .limit(5)
    for (const s of (styles || [])) {
      results.push({
        id: s.id, type: 'style', title: s.styleNo,
        subtitle: s.category || '', meta: `₹${s.sellPrice.toLocaleString('en-IN')}`, view: 'styles',
      })
    }

    // ── Production Jobs ─────────────────────────────────────────────────
    const { data: jobs } = await supabase
      .from('ProductionJob')
      .select('id, jobNo, styleName, status, stage, targetQty')
      .or(`jobNo.ilike.%${query}%,styleNo.ilike.%${query}%,styleName.ilike.%${query}%`)
      .limit(5)
    for (const j of (jobs || [])) {
      results.push({
        id: j.id, type: 'production', title: j.jobNo,
        subtitle: j.styleName, meta: `${j.stage} · ${j.targetQty} pcs`, view: 'production',
      })
    }

    // ── Purchase Orders ─────────────────────────────────────────────────
    const { data: pos } = await supabase
      .from('PurchaseOrder')
      .select('id, poNumber, fabricName, status, totalAmount, supplier:supplierId(name)')
      .or(`poNumber.ilike.%${query}%,fabricName.ilike.%${query}%`)
      .limit(5)
    for (const p of (pos || [])) {
      results.push({
        id: p.id, type: 'purchase_order', title: p.poNumber,
        subtitle: `${p.fabricName} · ${p.supplier?.name || ''}`,
        meta: `₹${p.totalAmount.toLocaleString('en-IN')} · ${p.status}`,
        view: 'pos',
      })
    }

    // ── Quotations ──────────────────────────────────────────────────────
    const { data: quotations } = await supabase
      .from('Quotation')
      .select('id, quotationNo, status, totalAmount, customer:customerId(companyName)')
      .or(`quotationNo.ilike.%${query}%,notes.ilike.%${query}%`)
      .limit(5)
    for (const q of (quotations || [])) {
      results.push({
        id: q.id, type: 'quotation', title: q.quotationNo,
        subtitle: q.customer?.companyName || '',
        meta: `₹${q.totalAmount.toLocaleString('en-IN')} · ${q.status}`,
        view: 'quotations',
      })
    }

    // ── Fabric Stock ────────────────────────────────────────────────────
    const { data: fabrics } = await supabase
      .from('FabricStock')
      .select('id, fabricName, availableMeters, gsm')
      .or(`fabricName.ilike.%${query}%,lotNumber.ilike.%${query}%`)
      .limit(5)
    for (const f of (fabrics || [])) {
      results.push({
        id: f.id, type: 'fabric', title: f.fabricName,
        subtitle: f.gsm ? `${f.gsm} GSM` : '',
        meta: `${f.availableMeters}m available`, view: 'fabric',
      })
    }

    // ── FG Stock ────────────────────────────────────────────────────
    const { data: fgBins } = await supabase
      .from('FGStockBin')
      .select('id, styleNo, styleName, colorCode, color, availableQty, unitSellPrice, image')
      .or(`styleNo.ilike.%${query}%,styleName.ilike.%${query}%,colorCode.ilike.%${query}%,color.ilike.%${query}%`)
      .limit(5)

    // Group by styleNo to avoid duplicates
    const seen = new Set<string>()
    for (const bin of fgBins) {
      if (seen.has(bin.styleNo)) continue
      seen.add(bin.styleNo)
      const totalAvail = fgBins.filter(b => b.styleNo === bin.styleNo).reduce((sum, b) => sum + b.availableQty, 0)
      results.push({
        id: bin.id,
        type: 'fg_stock',
        title: `${bin.styleNo} — ${bin.styleName}`,
        subtitle: `${bin.colorCode} · ${bin.color}`,
        meta: `${totalAvail} pcs available · ₹${bin.unitSellPrice.toLocaleString('en-IN')}`,
        view: 'fg-inventory',
      })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ results: [] })
  }
}
