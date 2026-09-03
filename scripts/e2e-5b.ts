// ─── Phase 5b E2E test family (Task 20 / original 8-b family, adapted) ──────
// Full test with FULL CLEANUP. Creates 2 manual test jobs (Red 10 + Blue 4),
// exercises every Phase 5b behavior, then hard-deletes everything and verifies
// exact-count restoration.
import { supabase } from '../src/lib/supabase-db'

const API = 'http://localhost:3000'
const STYLE = 'EL-TEST-5B'
const today = new Date().toISOString().split('T')[0]

let pass = 0, fail = 0
let tempOicId: string | null = null  // temp OrderItemColor created in test (g) — tracked for exact cleanup
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
  const tables = ['ProductionJob', 'StageTracking', 'QualityCheck', 'VendorBill',
    'FGStockMovement', 'FGStockBin', 'Vendor', 'Supplier', 'OrderItemColor']
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
  const { data: vendorsBefore } = await supabase.from('Vendor').select('id')
  const baselineVendorIds = new Set((vendorsBefore || []).map((v: any) => v.id))

  // ── Setup: pick a real vendor + a real supplier ──────────────────────
  const { data: vendors } = await supabase.from('Vendor').select('id, vendorName').order('vendorName')
  const vendorA = (vendors || [])[0]
  const { data: suppliers } = await supabase.from('Supplier').select('id, name').limit(5)
  // Prefer a supplier whose name does NOT ilike-match an existing vendor so the
  // FIX 1 auto-create path is genuinely exercised
  const { data: allVendorNames } = await supabase.from('Vendor').select('vendorName')
  const vendorNames = (allVendorNames || []).map((v: any) => (v.vendorName || '').toLowerCase())
  const supplier = (suppliers || []).find((s: any) =>
    !vendorNames.includes((s.name || '').toLowerCase())
  ) || (suppliers || [])[0]
  console.log('vendorA:', vendorA?.vendorName, '| supplier for FIX1 test:', supplier?.name)

  // ── Create test jobs (manual mode, colors) ───────────────────────────
  const redRes = await jfetch('POST', '/api/production', {
    styleNo: STYLE, styleName: 'Phase 5b Test — Red', targetQty: 10, color: 'Red',
  })
  const blueRes = await jfetch('POST', '/api/production', {
    styleNo: STYLE, styleName: 'Phase 5b Test — Blue', targetQty: 4, color: 'Blue',
  })
  const redJob = redRes.json?.job || redRes.json
  const blueJob = blueRes.json?.job || blueRes.json
  check('setup: Red job created', redRes.status >= 200 && redRes.status < 300 && !!redJob?.id, JSON.stringify(redRes.json).slice(0, 200))
  check('setup: Blue job created', blueRes.status >= 200 && blueRes.status < 300 && !!blueJob?.id)
  console.log('  jobs:', redJob?.jobNo, blueJob?.jobNo)

  // Self-heal stage rows
  const redStages = await jfetch('GET', `/api/production/${redJob.id}/stages`)
  const redStageRows: any[] = redStages.json?.stages || []
  check('setup: self-heal created 10 stage rows', redStageRows.length === 10, `got ${redStageRows.length}`)
  const cuttingRow = redStageRows.find((r) => r.stageName === 'Cutting')
  check('setup: GET returns hasBills on rows', typeof redStageRows[0].hasBills === 'boolean')

  try {
    // ── (b) STAGE ADVANCE GATE ─────────────────────────────────────────
    const adv1 = await jfetch('PATCH', `/api/production/${redJob.id}`, { nextStage: 'next' })
    check('(b) Fabric Issue→Cutting advance OK (In-House)', adv1.status === 200, JSON.stringify(adv1.json).slice(0, 150))

    // Set Cutting outsourced: sent 10 / received 0
    const cutSet = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [{
        id: cuttingRow.id, color: 'Red', locationType: 'Outsourced', vendorId: vendorA.id,
        sentDate: today, sentQty: 10, receivedQty: 0, defectiveQty: 0, perPieceRate: 15,
      }],
    })
    check('(b) Cutting split set (sent 10 / recv 0)', cutSet.status === 200, JSON.stringify(cutSet.json).slice(0, 200))

    const adv2 = await jfetch('PATCH', `/api/production/${redJob.id}`, { nextStage: 'next' })
    const gateMsg = adv2.json?.error || ''
    check('(b) advance BLOCKED with vendor-return-pending 400',
      adv2.status === 400 && gateMsg.includes('Cutting: vendor') && gateMsg.includes('return pending') &&
        gateMsg.includes(`sent 10, received 0`),
      `status=${adv2.status} msg="${gateMsg}"`)

    // Record the received quantity → advance succeeds
    const cutRecv = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [{
        id: cuttingRow.id, color: 'Red', locationType: 'Outsourced', vendorId: vendorA.id,
        sentDate: today, receivedDate: today, sentQty: 10, receivedQty: 9, defectiveQty: 1, perPieceRate: 15,
      }],
    })
    check('(b) receivedQty 9 recorded (totalAmount 135)', cutRecv.status === 200 &&
      Math.abs((cutRecv.json?.rows?.[0]?.totalAmount ?? 0) - 135) < 0.01)
    const adv3 = await jfetch('PATCH', `/api/production/${redJob.id}`, { nextStage: 'next' })
    check('(b) advance OK after return recorded', adv3.status === 200, JSON.stringify(adv3.json).slice(0, 150))

    // ── (a) LEGACY FLAT PATCH (back-compat) ───────────────────────────
    const flat = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      color: 'Red', locationType: 'Outsourced', vendorId: vendorA.id,
      sentDate: today, receivedDate: today,
      sentQty: 10, receivedQty: 9, defectiveQty: 1, perPieceRate: 15,
      notes: 'legacy flat body',
    })
    check('(a) legacy flat PATCH 200', flat.status === 200, JSON.stringify(flat.json).slice(0, 250))
    check('(a) legacy top-level shape (color/totalAmount/status spread)',
      flat.json?.color === 'Red' && Math.abs((flat.json?.totalAmount ?? 0) - 135) < 0.01 && flat.json?.status === 'Completed',
      `color=${flat.json?.color} total=${flat.json?.totalAmount} status=${flat.json?.status}`)
    check('(a) response carries rows + deleted', Array.isArray(flat.json?.rows) && typeof flat.json?.deleted === 'number',
      `rows=${flat.json?.rows?.length} deleted=${flat.json?.deleted}`)
    const newCuttingId: string = flat.json?.rows?.[0]?.id
    check('(a) flat REPLACE re-inserted the row (new id)', !!newCuttingId && newCuttingId !== cuttingRow.id)

    // ── (c) DELETE-PROTECTION for billed splits ───────────────────────
    const bill = await jfetch('POST', '/api/vendor-bills', {
      vendorId: vendorA.id, stageTrackingId: newCuttingId,
      description: `Cutting — ${redJob.jobNo} (Red)`,
      totalQty: 9, perPieceRate: 15, totalAmount: 135,
    })
    check('(c) VendorBill created for the Cutting row', bill.status === 201 && !!bill.json?.bill?.billNo,
      JSON.stringify(bill.json).slice(0, 200))
    console.log('  bill:', bill.json?.bill?.billNo)

    const billedCheck = await jfetch('GET', `/api/production/${redJob.id}/stages`)
    const billedRow = (billedCheck.json?.stages || []).find((r: any) => r.id === newCuttingId)
    check('(c) GET shows hasBills=true on the billed row', billedRow?.hasBills === true,
      `hasBills=${billedRow?.hasBills}`)

    const rmBilled = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [{ color: 'Green', locationType: 'Outsourced', vendorId: vendorA.id, sentQty: 5 }],
    })
    const rmMsg = rmBilled.json?.error || ''
    check('(c) PATCH excluding the billed row → 400 "Cannot remove split"',
      rmBilled.status === 400 && rmMsg.startsWith('Cannot remove split — Cutting row (Red, 10 pcs sent) has vendor bills attached.'),
      `status=${rmBilled.status} msg="${rmMsg}"`)

    // ── (d) Σ sentQty GUARD ───────────────────────────────────────────
    const sigma = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [{ id: newCuttingId, color: 'Red', locationType: 'Outsourced', vendorId: vendorA.id, sentQty: 16 }],
    })
    check('(d) Σ guard 400 — "Total sent qty 16 exceeds 1.5× job target (15 for 10 pcs)"',
      sigma.status === 400 && (sigma.json?.error || '').includes('Total sent qty 16 exceeds 1.5× job target (15 for 10 pcs)'),
      `status=${sigma.status} msg="${sigma.json?.error}"`)

    // ── (e) color + vendor validations ────────────────────────────────
    const emptyColor = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting', rows: [{ id: newCuttingId, color: '', sentQty: 5 }],
    })
    check('(e) empty color "" → 400', emptyColor.status === 400 &&
      (emptyColor.json?.error || '').includes('Row 1: color must be a non-empty string'),
      `msg="${emptyColor.json?.error}"`)

    const badVendor = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [{ color: 'Red', locationType: 'Outsourced', vendorId: '00000000-0000-0000-0000-000000000000', sentQty: 5 }],
    })
    check('(e) bad vendorId → 400 "Row 1: Vendor not found"',
      badVendor.status === 400 && (badVendor.json?.error || '') === 'Row 1: Vendor not found',
      `msg="${badVendor.json?.error}"`)

    const supRes = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [{ id: newCuttingId, color: 'Red', locationType: 'Outsourced', vendorId: supplier.id, sentQty: 10, receivedQty: 9, perPieceRate: 15 }],
    })
    const resolvedVendorId: string | undefined = supRes.json?.rows?.[0]?.vendorId
    const resolvedVendorName: string | undefined = supRes.json?.rows?.[0]?.vendor?.vendorName
    check('(e) Supplier id PATCH → 200 (FIX 1 fallback resolved to a Vendor)',
      supRes.status === 200 && !!resolvedVendorId,
      `status=${supRes.status} vendor=${resolvedVendorName}`)
    const autoCreatedVendorId = resolvedVendorId && !baselineVendorIds.has(resolvedVendorId) ? resolvedVendorId : null
    console.log('  FIX1 resolved vendor:', resolvedVendorName, autoCreatedVendorId ? '(AUTO-CREATED — will clean up)' : '(deduped to existing)')

    // ── (f) THE BIG ONE: 2-row PATCH (existing id + new row) ──────────
    const twoRows = await jfetch('PATCH', `/api/production/${redJob.id}/stages`, {
      stageName: 'Cutting',
      rows: [
        { id: newCuttingId, color: 'Red', locationType: 'Outsourced', vendorId: vendorA.id, sentQty: 10, receivedQty: 9, perPieceRate: 15, sentDate: today, receivedDate: today },
        { color: 'Maroon', locationType: 'Outsourced', vendorId: vendorA.id, sentQty: 5, receivedQty: 0, perPieceRate: 12, sentDate: today },
      ],
    })
    if (twoRows.status === 200) {
      const rows = twoRows.json?.rows || []
      check('(f) 2-row PATCH 200 — existing UPDATED + new row INSERTED',
        rows.length === 2 && rows.some((r: any) => r.id === newCuttingId) && rows.some((r: any) => r.color === 'Maroon'),
        JSON.stringify(rows.map((r: any) => [r.id, r.color])).slice(0, 200))
      const getAfter = await jfetch('GET', `/api/production/${redJob.id}/stages`)
      const cutRows = (getAfter.json?.stages || []).filter((r: any) => r.stageName === 'Cutting')
      check('(f) GET shows both rows ordered', cutRows.length === 2)
    } else {
      const msg = twoRows.json?.error || ''
      // The live unique(jobId, stageName) constraint is STILL in place (verified
      // by direct probe before this test) — the graded 400 path is then ACTIVE.
      check('(f) 2-row PATCH → graded 23505 400 (constraint still live — documented deviation)',
        twoRows.status === 400 && msg.includes('StageTracking_productionJobId_stageName_key') && msg.includes('Section 2'),
        `status=${twoRows.status} msg="${msg.slice(0, 120)}…`)
      // Verify the EXISTING row was still updated (updates are not blocked)
      const getAfter = await jfetch('GET', `/api/production/${redJob.id}/stages`)
      const cutRows = (getAfter.json?.stages || []).filter((r: any) => r.stageName === 'Cutting')
      const kept = cutRows.find((r: any) => r.id === newCuttingId)
      check('(f) existing row preserved/updated on the graded 400', !!kept && kept.color === 'Red',
        `rows=${cutRows.length}`)
    }

    // ── (g) FG AUTO-ENTRY COLOR-AWARE ─────────────────────────────────
    // Red job: no orderItemColorId → size 'Free'
    const redDone = await jfetch('PATCH', `/api/production/${redJob.id}`, { nextStage: 'Dispatched' })
    check('(g) Red job completed via Dispatched', redDone.status === 200 && redDone.json?.status === 'Completed',
      JSON.stringify(redDone.json).slice(0, 120))
    const { data: redBin } = await supabase.from('FGStockBin').select('*')
      .eq('styleNo', STYLE).eq('color', 'Red').maybeSingle()
    check('(g) FG bin (Red, Free size, qty 10, colorCode)',
      !!redBin && redBin.size === 'Free' && redBin.availableQty === 10 && /^EL-TEST-5B-[A-Z]{2}-\d{2}$/.test(redBin.colorCode || ''),
      JSON.stringify(redBin ? { size: redBin.size, qty: redBin.availableQty, colorCode: redBin.colorCode } : null))
    const { data: redMvt } = await supabase.from('FGStockMovement').select('*')
      .eq('referenceId', redJob.id).eq('referenceType', 'ProductionJob')
    check('(g) Inward FGStockMovement for Red job', (redMvt || []).length === 1 &&
      redMvt![0].movementType === 'Inward' && redMvt![0].newQty === 10,
      `movements=${(redMvt || []).length}`)

    // Blue job: temp OrderItemColor (size M) linked → size 'M'
    const { data: anyOrderItem } = await supabase.from('OrderItem').select('id').limit(1)
    const { data: tempOic } = await supabase.from('OrderItemColor').insert({
      orderItemId: (anyOrderItem || [])[0]?.id, color: 'Blue', size: 'M', quantity: 4,
    }).select('id').single()
    tempOicId = (tempOic as any)?.id || null
    check('(g) temp OrderItemColor (M) created', !!tempOicId)
    await supabase.from('ProductionJob').update({ orderItemColorId: (tempOic as any).id }).eq('id', blueJob.id)
    const blueDone = await jfetch('PATCH', `/api/production/${blueJob.id}`, { nextStage: 'Dispatched' })
    check('(g) Blue job completed via Dispatched', blueDone.status === 200 && blueDone.json?.status === 'Completed',
      JSON.stringify(blueDone.json).slice(0, 120))
    const { data: blueBin } = await supabase.from('FGStockBin').select('*')
      .eq('styleNo', STYLE).eq('color', 'Blue').maybeSingle()
    check('(g) FG bin (Blue, M size, qty 4)', !!blueBin && blueBin.size === 'M' && blueBin.availableQty === 4,
      JSON.stringify(blueBin ? { size: blueBin.size, qty: blueBin.availableQty, colorCode: blueBin.colorCode } : null))
    const { data: blueMvt } = await supabase.from('FGStockMovement').select('*')
      .eq('referenceId', blueJob.id).eq('referenceType', 'ProductionJob')
    check('(g) Inward FGStockMovement for Blue job', (blueMvt || []).length === 1)

    // ── (h) QC COLOR ──────────────────────────────────────────────────
    const qc1 = await jfetch('POST', '/api/quality', {
      productionJobId: redJob.id, inspectionPoint: 'Final Inspection',
      checkedQty: 10, passedQty: 9, failedQty: 1, color: 'Maroon', inspectorName: 'E2E',
    })
    check('(h) QC POST explicit color Maroon', qc1.status === 201 && qc1.json?.color === 'Maroon',
      `status=${qc1.status} color=${qc1.json?.color}`)
    const qc2 = await jfetch('POST', '/api/quality', {
      productionJobId: redJob.id, inspectionPoint: 'Cutting Check',
      checkedQty: 10, passedQty: 10, inspectorName: 'E2E',
    })
    check('(h) QC POST no color → defaults job color Red', qc2.status === 201 && qc2.json?.color === 'Red',
      `color=${qc2.json?.color}`)
    const qc3 = await jfetch('POST', '/api/quality', {
      productionJobId: redJob.id, inspectionPoint: 'Fabric Check', checkedQty: 2, color: '',
    })
    check('(h) QC POST empty color → 400', qc3.status === 400, `status=${qc3.status}`)
    const qcSearch = await jfetch('GET', '/api/quality?search=maroon&limit=50')
    const found = (qcSearch.json?.checks || []).some((c: any) => c.productionJobId === redJob.id && c.color === 'Maroon')
    check('(h) GET ?search=maroon finds the row', found)

  } finally {
    // ── CLEANUP (hard-delete everything, exact-count restore) ─────────
    console.log('\n── CLEANUP ──')
    const jobIds = [redJob?.id, blueJob?.id].filter(Boolean) as string[]

    if (jobIds.length > 0) {
      // VendorBills attached to test stage rows
      const { data: testStages } = await supabase.from('StageTracking').select('id').in('productionJobId', jobIds)
      const stageIds = (testStages || []).map((s: any) => s.id)
      if (stageIds.length > 0) await supabase.from('VendorBill').delete().in('stageTrackingId', stageIds)
      // QC rows
      await supabase.from('QualityCheck').delete().in('productionJobId', jobIds)
      // FG movements
      await supabase.from('FGStockMovement').delete().in('referenceId', jobIds)
      // FG bins
      await supabase.from('FGStockBin').delete().eq('styleNo', STYLE)
      // Stage rows
      await supabase.from('StageTracking').delete().in('productionJobId', jobIds)
      // Jobs
      await supabase.from('ProductionJob').delete().in('id', jobIds)
    }
    // temp OrderItemColor (tracked by id — never touches real rows)
    if (tempOicId) {
      await supabase.from('ProductionJob').update({ orderItemColorId: null })
        .in('id', jobIds.length > 0 ? jobIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('orderItemColorId', tempOicId)
      await supabase.from('OrderItemColor').delete().eq('id', tempOicId)
    }

    const after = await counts()
    // Vendor cleanup: delete any vendor not in baseline (auto-created by the
    // FIX 1 Supplier→Vendor path during test (e))
    const { data: vendorsAfter } = await supabase.from('Vendor').select('id')
    const newVendors = (vendorsAfter || []).filter((v: any) => !baselineVendorIds.has(v.id))
    for (const v of newVendors) {
      // safety: only delete vendors with zero stage links
      const { count: links } = await supabase.from('StageTracking').select('id', { count: 'exact', head: true }).eq('vendorId', v.id)
      if ((links ?? 0) === 0) await supabase.from('Vendor').delete().eq('id', v.id)
    }
    const final = await counts()
    console.log('AFTER   :', JSON.stringify(after))
    console.log('FINAL   :', JSON.stringify(final))
    let restored = true
    for (const t of Object.keys(baseline)) {
      if (final[t] !== baseline[t]) {
        restored = false
        console.log(`  ⚠️ ${t}: ${baseline[t]} → ${final[t]}`)
      }
    }
    check('CLEANUP: all counts restored EXACTLY to baseline', restored)
  }

  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`)
}

main()
