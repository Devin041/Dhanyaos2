import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync(new URL('../.env', import.meta.url), 'utf-8')
const get = (k: string) => {
  const line = env.split('\n').find((l) => l.startsWith(`${k}=`))
  return line ? line.split('=').slice(1).join('=').trim() : ''
}

const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Missing Supabase credentials in .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function backfill() {
  console.log('=== BACKFILL: PO header styleNo + FabricStock product stamp ===\n')

  // ── Step 1: PO headers — styleNo from first line item that has one ──
  const { data: pos, error: poErr } = await supabase
    .from('PurchaseOrder')
    .select('id, poNumber, styleNo')
  if (poErr) throw poErr

  const poIdsNeeding = (pos || []).filter((p: any) => !p.styleNo).map((p: any) => p.id)
  console.log(`POs total: ${pos?.length ?? 0}, missing styleNo: ${poIdsNeeding.length}`)

  const itemStyleByPo: Record<string, string> = {}
  if (poIdsNeeding.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from('POItem')
      .select('purchaseOrderId, styleNo, createdAt')
      .in('purchaseOrderId', poIdsNeeding)
      .not('styleNo', 'is', null)
      .order('createdAt', { ascending: true })
    if (itemsErr) throw itemsErr
    for (const it of items || []) {
      if (!itemStyleByPo[it.purchaseOrderId] && it.styleNo) {
        itemStyleByPo[it.purchaseOrderId] = it.styleNo
      }
    }
  }

  let poFixed = 0
  for (const [poId, styleNo] of Object.entries(itemStyleByPo)) {
    const { error } = await supabase
      .from('PurchaseOrder')
      .update({ styleNo, updatedAt: new Date().toISOString() })
      .eq('id', poId)
    if (!error) poFixed++
    else console.error(`PO ${poId} update failed:`, error.message)
  }
  console.log(`PO headers fixed: ${poFixed}\n`)

  // ── Step 2: FabricStock — styleNo via FabricReceipt ledger → PO → item ──
  const { data: stocks, error: stockErr } = await supabase
    .from('FabricStock')
    .select('id, fabricName, color, styleNo')
  if (stockErr) throw stockErr

  const stocksNeeding = (stocks || []).filter((s: any) => !s.styleNo)
  console.log(`FabricStock total: ${stocks?.length ?? 0}, missing styleNo: ${stocksNeeding.length}`)

  const stockIds = stocksNeeding.map((s: any) => s.id)
  const receiptByStock: Record<string, string> = {}
  if (stockIds.length > 0) {
    const { data: receipts, error: rcErr } = await supabase
      .from('FabricReceipt')
      .select('fabricStockId, poId, receivedDate')
      .in('fabricStockId', stockIds)
      .not('poId', 'is', null)
      .order('receivedDate', { ascending: false })
    if (rcErr) {
      console.log(`FabricReceipt ledger unavailable (${rcErr.message}) — trying GRN chain instead`)
    } else {
      for (const rc of receipts || []) {
        if (!receiptByStock[rc.fabricStockId] && rc.poId) {
          receiptByStock[rc.fabricStockId] = rc.poId
        }
      }
    }

    // Fallback chain: stock row ← GRN items (fabricName+color match) ← GrnNote.poId
    // (older receipts were never written to the FabricReceipt ledger)
    const stillNeeding = stockIds.filter((sid: string) => !receiptByStock[sid])
    if (stillNeeding.length > 0) {
      const stockById = Object.fromEntries(stocksNeeding.map((s: any) => [s.id, s]))
      const { data: grnNotes, error: gnErr } = await supabase
        .from('GrnNote')
        .select('id, poId')
        .not('poId', 'is', null)
        .eq('status', 'Approved')
      if (!gnErr && grnNotes) {
        const grnIds = grnNotes.map((g: any) => g.id)
        if (grnIds.length > 0) {
          const { data: grnItems } = await supabase
            .from('GrnItem')
            .select('grnId, fabricName, color')
            .in('grnId', grnIds)
          const poByGrn: Record<string, string> = {}
          for (const g of grnNotes || []) poByGrn[g.id] = g.poId
          for (const gi of grnItems || []) {
            const poId = poByGrn[gi.grnId]
            if (!poId) continue
            for (const sid of stillNeeding) {
              if (receiptByStock[sid]) continue
              const s = stockById[sid]
              const nameMatch = (s.fabricName || '').trim().toLowerCase() === (gi.fabricName || '').trim().toLowerCase()
              const colorMatch = !s.color || !gi.color || s.color.trim().toLowerCase() === gi.color.trim().toLowerCase()
              if (nameMatch && colorMatch) {
                receiptByStock[sid] = poId
              }
            }
          }
        }
      }
    }
  }

  // PO styleNo lookup (after step 1 fixes)
  const { data: pos2 } = await supabase.from('PurchaseOrder').select('id, styleNo')
  const styleByPo: Record<string, string> = {}
  for (const p of pos2 || []) {
    if (p.styleNo) styleByPo[p.id] = p.styleNo
  }
  // Also item-level fallback for POs still missing header styleNo
  const stillMissingPoIds = [...new Set(Object.values(receiptByStock))].filter((pid) => !styleByPo[pid])
  if (stillMissingPoIds.length > 0) {
    const { data: items2 } = await supabase
      .from('POItem')
      .select('purchaseOrderId, styleNo')
      .in('purchaseOrderId', stillMissingPoIds)
      .not('styleNo', 'is', null)
      .order('createdAt', { ascending: true })
    for (const it of items2 || []) {
      if (it.styleNo && !styleByPo[it.purchaseOrderId]) styleByPo[it.purchaseOrderId] = it.styleNo
    }
  }

  let stockFixed = 0
  for (const s of stocksNeeding) {
    const poId = receiptByStock[s.id]
    if (!poId) continue
    const styleNo = styleByPo[poId]
    if (!styleNo) continue
    const { error } = await supabase
      .from('FabricStock')
      .update({ styleNo, updatedAt: new Date().toISOString() })
      .eq('id', s.id)
    if (!error) {
      stockFixed++
      console.log(`  Stamped: ${s.fabricName}${s.color ? ` (${s.color})` : ''} → ${styleNo}`)
    } else {
      console.error(`  Stock ${s.id} update failed:`, error.message)
    }
  }
  console.log(`\nFabricStock rows stamped: ${stockFixed}`)
  console.log('\n=== BACKFILL COMPLETE ===')
}

backfill().catch((e) => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
