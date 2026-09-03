// ─── Phase 6 E2E (Task 22 / original Task 9 family) ─────────────────────────
// Dispatch color-wise persistence + deliver lastDispatchDate + fg-stock
// lastDispatch shape — with FULL CLEANUP and exact-count restoration.
// Creates a TEMP sales order (with colorBreakdown rows) + a TEMP dispatch
// against the LIVE Supabase DB, exercises every Phase 6 behavior, then
// hard-deletes everything (children first) and restores the FG bin snapshot.
import { supabase } from '../src/lib/supabase-db'

const API = 'http://localhost:3000'
const STYLE = 'EL-TEST-002'
const STYLE_NAME = 'Test Production with Fabric'
// Real customer (referenced only — never modified): Petals
const CUSTOMER_ID = 'a4e3196e-6576-4aa6-931a-592dfd3f89fd'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${detail ? '— ' + detail : ''}`) }
}
async function jfetch(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json: any = null
  try { json = await res.json() } catch { /* no body */ }
  return { status: res.status, json }
}
async function counts() {
  const tables = ['Dispatch', 'DispatchItem', 'SalesOrder', 'OrderItem',
    'OrderItemColor', 'FGStockMovement', 'FGStockBin']
  const out: Record<string, number> = {}
  for (const t of tables) {
    const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
    out[t] = count ?? -1
  }
  return out
}

async function main() {
  const baseline = await counts()
  console.log('BASELINE:', JSON.stringify(baseline))

  // ── Snapshot the live FG bin (exact restore later) ──────────────────────
  const { data: binSnapRows } = await supabase.from('FGStockBin').select('*').eq('styleNo', STYLE)
  const binSnap = (binSnapRows || [])[0] as any
  check('live FG bin snapshot found (EL-TEST-002)', !!binSnap,
    `availableQty=${binSnap?.availableQty} lastDispatchDate=${binSnap?.lastDispatchDate}`)

  // ── 1. Temp order with colorBreakdown rows ──────────────────────────────
  const orderRes = await jfetch('POST', '/api/orders', {
    customerId: CUSTOMER_ID,
    items: [{
      styleNo: STYLE,
      styleName: STYLE_NAME,
      unitPrice: 100,
      unitCost: 60,
      colors: [
        { color: 'Free', size: 'Free', quantity: 2 },
        { color: 'TestRed', size: 'M', quantity: 3 },
        { color: 'Maroon', size: 'L', quantity: 1 },
      ],
    }],
    notes: 'TEMP Phase 6 E2E — delete me',
  })
  check('POST /api/orders → 201', orderRes.status === 201, `status=${orderRes.status} ${JSON.stringify(orderRes.json).slice(0, 200)}`)
  const orderId = orderRes.json?.order?.id as string
  const orderNo = orderRes.json?.order?.orderNo as string

  // Verify colorBreakdown is exposed by the API (Phase 2 FIX 5)
  const { data: tempItems } = await supabase.from('OrderItem').select('id').eq('salesOrderId', orderId)
  const tempItemIds = ((tempItems || []) as any[]).map(i => i.id)
  const { data: tempOic } = await supabase.from('OrderItemColor').select('color, size, quantity').in('orderItemId', tempItemIds)
  check('temp order created with 3 OrderItemColor rows', (tempOic || []).length === 3, JSON.stringify(tempOic))

  // ── 2. POST /api/dispatch with color/colorCode/size items ───────────────
  const dispatchRes = await jfetch('POST', '/api/dispatch', {
    salesOrderId: orderId,
    customerId: CUSTOMER_ID,
    transporter: 'E2E-Phase6',
    notes: 'TEMP Phase 6 E2E dispatch — delete me',
    items: [
      { styleNo: STYLE, styleName: STYLE_NAME, orderedQty: 2, dispatchedQty: 2, color: 'Free', size: 'Free' },          // colorCode auto → EL-TEST-002-FR-01
      { styleNo: STYLE, styleName: STYLE_NAME, orderedQty: 3, dispatchedQty: 2, color: 'TestRed', size: 'M' },          // colorCode auto → EL-TEST-002-TE-01
      { styleNo: STYLE, styleName: STYLE_NAME, orderedQty: 1, dispatchedQty: 1, color: 'Maroon', size: 'L', colorCode: 'EL-TEST-002-MR-01' }, // explicit
    ],
  })
  check('POST /api/dispatch → 201', dispatchRes.status === 201, `status=${dispatchRes.status} ${JSON.stringify(dispatchRes.json).slice(0, 300)}`)
  const dispatchId = dispatchRes.json?.id as string
  const dispatchNo = dispatchRes.json?.dispatchNo as string

  // Verify DispatchItem persistence directly
  const { data: dItems } = await supabase.from('DispatchItem').select('*').eq('dispatchId', dispatchId).order('createdAt', { ascending: true })
  const items = (dItems || []) as any[]
  check('3 DispatchItem rows persisted', items.length === 3, `n=${items.length}`)
  const freeRow = items.find(i => i.color === 'Free')
  const redRow = items.find(i => i.color === 'TestRed')
  const maroonRow = items.find(i => i.color === 'Maroon')
  check('color persisted (Free/TestRed/Maroon)', !!freeRow && !!redRow && !!maroonRow)
  check('size persisted (Free/M/L)', freeRow?.size === 'Free' && redRow?.size === 'M' && maroonRow?.size === 'L',
    `sizes=${items.map(i => i.size).join(',')}`)
  check('colorCode AUTO-DERIVED Free → EL-TEST-002-FR-01', freeRow?.colorCode === 'EL-TEST-002-FR-01', `got=${freeRow?.colorCode}`)
  check('colorCode AUTO-DERIVED TestRed → EL-TEST-002-TE-01', redRow?.colorCode === 'EL-TEST-002-TE-01', `got=${redRow?.colorCode}`)
  check('colorCode EXPLICIT preserved (EL-TEST-002-MR-01)', maroonRow?.colorCode === 'EL-TEST-002-MR-01', `got=${maroonRow?.colorCode}`)
  check('totalDispatchedQty = 5', dispatchRes.json?.totalDispatchedQty === 5, `got=${dispatchRes.json?.totalDispatchedQty}`)

  // GET /api/dispatch exposes color columns
  const listRes = await jfetch('GET', '/api/dispatch')
  const listed = (listRes.json?.dispatches || []).find((d: any) => d.id === dispatchId)
  check('GET /api/dispatch lists temp dispatch with colored items',
    !!listed && (listed.dispatchItems || []).some((i: any) => i.color === 'TestRed'),
    `items=${JSON.stringify(listed?.dispatchItems?.map((i: any) => i.color))}`)

  // ── 3. lastDispatch BEFORE delivery (movement-less bin) ────────────────
  const fgBefore = await jfetch('GET', `/api/fg-stock?styleNo=${encodeURIComponent(STYLE)}`)
  const binBefore = (fgBefore.json?.bins || []).find((b: any) => b.color === 'Free' && b.size === 'Free')
  check('fg-stock lastDispatch null before delivery', binBefore?.lastDispatch === null, JSON.stringify(binBefore?.lastDispatch))

  // ── 4. Deliver: deduct + movement + lastDispatchDate stamp ─────────────
  const deliverRes = await jfetch('POST', `/api/dispatch/${dispatchId}/deliver`)
  check('POST /deliver → 200', deliverRes.status === 200, `status=${deliverRes.status} ${JSON.stringify(deliverRes.json).slice(0, 200)}`)
  check('deliver status → Delivered', deliverRes.json?.dispatch?.status === 'Delivered')
  const warnings: string[] = deliverRes.json?.warnings || []
  check('warnings include no-bin items (TestRed/Maroon)',
    warnings.some(w => /EL-TEST-002/.test(w)) && warnings.length >= 2, JSON.stringify(warnings))

  // Bin: 10 → 8 (Free/Free item qty 2), lastDispatchDate stamped
  const { data: binAfterRows } = await supabase.from('FGStockBin').select('*').eq('styleNo', STYLE).eq('color', 'Free').eq('size', 'Free').single()
  const binAfter = binAfterRows as any
  check(`bin availableQty ${binSnap?.availableQty} → ${binSnap?.availableQty - 2}`,
    binAfter?.availableQty === (binSnap?.availableQty ?? 0) - 2, `got=${binAfter?.availableQty}`)
  check('bin lastDispatchDate stamped by deliver', !!binAfter?.lastDispatchDate, `got=${binAfter?.lastDispatchDate}`)

  // Outward movement ledger row with dispatch references
  const { data: mvtRows } = await supabase.from('FGStockMovement').select('*').eq('referenceId', dispatchId)
  const mvts = (mvtRows || []) as any[]
  check('1 Outward Dispatch movement written', mvts.length === 1 && mvts[0]?.movementType === 'Outward', `n=${mvts.length}`)
  check('movement carries referenceNo=dispatchNo + partyName=Petals + positive qty',
    mvts[0]?.referenceType === 'Dispatch' && mvts[0]?.referenceNo === dispatchNo &&
    mvts[0]?.partyName === 'Petals' && mvts[0]?.quantity === 2 && mvts[0]?.previousQty === binSnap?.availableQty && mvts[0]?.newQty === (binSnap?.availableQty ?? 0) - 2,
    JSON.stringify(mvts[0] ? { referenceType: mvts[0].referenceType, referenceNo: mvts[0].referenceNo, partyName: mvts[0].partyName, quantity: mvts[0].quantity, previousQty: mvts[0].previousQty, newQty: mvts[0].newQty } : null))

  // ── 5. fg-stock lastDispatch DATA SHAPE (the Phase 6 visibility source) ─
  const fgAfter = await jfetch('GET', `/api/fg-stock?styleNo=${encodeURIComponent(STYLE)}`)
  const binVisible = (fgAfter.json?.bins || []).find((b: any) => b.color === 'Free' && b.size === 'Free')
  const ld = binVisible?.lastDispatch
  check('fg-stock lastDispatch present after delivery',
    !!ld && typeof ld === 'object', JSON.stringify(ld))
  check('lastDispatch shape {partyName, dispatchNo, date, qty}',
    ld?.partyName === 'Petals' && ld?.dispatchNo === dispatchNo && !!ld?.date && ld?.qty === 2,
    JSON.stringify(ld))
  check('fg-stock bin lastDispatchDate column exposed', !!binVisible?.lastDispatchDate)

  // ── CLEANUP (children first, exact restore) ─────────────────────────────
  console.log('\nCLEANUP:')
  await supabase.from('FGStockMovement').delete().eq('referenceId', dispatchId)
  const { data: mvtLeft } = await supabase.from('FGStockMovement').select('id').eq('referenceId', dispatchId)
  check('FGStockMovement deleted', (mvtLeft || []).length === 0)

  // Restore the bin EXACTLY from the snapshot
  await supabase.from('FGStockBin').update({
    availableQty: binSnap.availableQty,
    lastDispatchDate: binSnap.lastDispatchDate,
    lastMovementDate: binSnap.lastMovementDate,
    updatedAt: binSnap.updatedAt,
  }).eq('id', binSnap.id)

  await supabase.from('DispatchItem').delete().eq('dispatchId', dispatchId)
  const { data: dItemLeft } = await supabase.from('DispatchItem').select('id').eq('dispatchId', dispatchId)
  check('DispatchItem deleted', (dItemLeft || []).length === 0)

  await supabase.from('Dispatch').delete().eq('id', dispatchId)
  const { data: dLeft } = await supabase.from('Dispatch').select('id').eq('id', dispatchId)
  check('Dispatch deleted', (dLeft || []).length === 0)

  await supabase.from('OrderItemColor').delete().in('orderItemId', tempItemIds)
  await supabase.from('OrderItem').delete().eq('salesOrderId', orderId)
  await supabase.from('SalesOrder').delete().eq('id', orderId)
  const { data: oLeft } = await supabase.from('SalesOrder').select('id').eq('id', orderId)
  check('temp SalesOrder + items + colors deleted', (oLeft || []).length === 0)

  // ── Exact-count verification ─────────────────────────────────────────────
  const after = await counts()
  console.log('AFTER:   ', JSON.stringify(after))
  const tablesOk = Object.keys(baseline).every(t => baseline[t] === after[t])
  check('ALL table counts restored exactly', tablesOk,
    Object.keys(baseline).filter(t => baseline[t] !== after[t]).map(t => `${t}: ${baseline[t]}→${after[t]}`).join(', '))

  // Bin snapshot equality
  const { data: binFinalRows } = await supabase.from('FGStockBin').select('*').eq('id', binSnap.id).single()
  const binFinal = binFinalRows as any
  check('FG bin restored exactly (qty/lastDispatchDate/lastMovementDate)',
    binFinal?.availableQty === binSnap.availableQty &&
    binFinal?.lastDispatchDate === binSnap.lastDispatchDate &&
    binFinal?.lastMovementDate === binSnap.lastMovementDate,
    JSON.stringify({ availableQty: binFinal?.availableQty, lastDispatchDate: binFinal?.lastDispatchDate, lastMovementDate: binFinal?.lastMovementDate }))

  console.log(`\n${pass} passed, ${fail} failed${fail > 0 ? ' — ⚠️ CHECK CLEANUP' : ' — clean'}`)
  console.log(`orderNo: ${orderNo} | dispatchNo: ${dispatchNo} (both deleted)`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('E2E crashed:', e)
  process.exit(1)
})
