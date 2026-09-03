import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

const PRODUCTION_STAGES = [
  'Fabric Issue', 'Cutting', 'Embroidery', 'Printing', 'Stitching',
  'Finishing', 'Quality Check', 'Packing', 'Dispatch Ready', 'Dispatched',
] as const

// ─── Phase 5b — MULTI-VENDOR STAGE SPLITS ───────────────────────────────────
//
// One stage of a production job can now carry N split rows ("Cutting me Red
// vendor A ko, Maroon vendor B ko"): each split has its own color, vendor,
// dates, quantities, rate and amount.
//
// PATCH body (new shape):
//   { stageName, rows: [{
//       id?, color?, locationType, vendorId?,
//       sentDate?, expectedReturnDate?, receivedDate?,
//       sentQty, receivedQty, defectiveQty, perPieceRate, status?, notes?
//   }] }
//
// REPLACE semantics: rows of the stage absent from the payload ids are
// DELETED — but refused with a 400 naming the row when vendor bills are
// attached to it. Rows with an id are UPDATED in place; rows without an id
// are INSERTED (requires the StageTracking unique(job, stage) constraint to
// be dropped — see the graded 23505 handler below).
//
// BACK-COMPAT: a legacy flat body (no `rows[]`) is auto-mapped to a
// one-element rows array; the response keeps the legacy top-level shape
// (first row's fields at the top level) plus `rows` and `deleted`.

interface SplitRowPayload {
  id?: string | null
  color?: string | null
  locationType?: string | null
  vendorId?: string | null
  sentDate?: string | null
  expectedReturnDate?: string | null
  receivedDate?: string | null
  sentQty?: number | string | null
  receivedQty?: number | string | null
  defectiveQty?: number | string | null
  perPieceRate?: number | string | null
  status?: string | null
  notes?: string | null
}

const NUMERIC_SPLIT_FIELDS = ['sentQty', 'receivedQty', 'defectiveQty', 'perPieceRate'] as const

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string }
  return e?.code === '23505' ||
    String(e?.message || error || '').includes('duplicate key value violates unique constraint')
}

// Graded 400 for the live unique(jobId, stageName) object — explains exactly
// what to run so multi-row inserts start working. IMPORTANT: the uniqueness
// can exist as a CONSTRAINT *or* as a bare UNIQUE INDEX (Prisma db push from
// old local code creates a UNIQUE INDEX with the constraint-style name, which
// `ALTER TABLE DROP CONSTRAINT` silently no-ops on). The message below gives
// BOTH statements so either form is removed.
function uniqueViolationResponse(error: unknown): NextResponse {
  const detail = String((error as { message?: string })?.message || error || '')
  return NextResponse.json({
    error: `Saving multiple rows for one stage hit the live database unique key "StageTracking_productionJobId_stageName_key" — the multi-vendor splits feature needs it dropped. The uniqueness may exist as an INDEX (created by an old prisma db push) or as a CONSTRAINT, so run BOTH of these lines in the Supabase SQL Editor: DROP INDEX IF EXISTS public."StageTracking_productionJobId_stageName_key"; ALTER TABLE public."StageTracking" DROP CONSTRAINT IF EXISTS "StageTracking_productionJobId_stageName_key"; — then retry. No code change is required. Also: do not run prisma db push against this database from an old checkout, it re-creates the unique key. (${detail})`,
  }, { status: 400 })
}

// Fetch the stage rows of a job ordered (sequence, createdAt) with the
// vendor join, vendor-bill embed and the derived hasBills lock flag.
async function fetchStageRowsWithBills(jobId: string) {
  const { data: rows, error } = await supabase
    .from('StageTracking')
    .select('*, vendor:vendorId(id, vendorName, phone), _bills:VendorBill(id, billNo, totalAmount, status)')
    .eq('productionJobId', jobId)
    .order('sequence', { ascending: true })
    .order('createdAt', { ascending: true })
  if (error) throw error
  return (rows || []).map((r: Record<string, unknown>) => ({
    ...r,
    hasBills: Array.isArray(r._bills) && (r._bills as unknown[]).length > 0,
  }))
}

// Phase 2 FIX 1 (PRESERVED): the stage dialog merges Vendors AND Suppliers
// into one picker, so a Supplier id can arrive in a row's vendorId. Resolve
// it: find the Supplier, then match (by name) or auto-create the
// corresponding Vendor row so the StageTracking vendorId FK (and the
// VendorBill relation) stays valid. Returns the resolved Vendor id, null
// when nothing to resolve, or an error message string.
async function resolveVendorId(
  vendorId: string,
  rowLabel: string
): Promise<string | null | { error: string }> {
  const { data: vendor } = await supabase.from('Vendor').select('id').eq('id', vendorId).single()
  if (vendor) return (vendor as { id: string }).id

  const { data: supplier } = await supabase
    .from('Supplier')
    .select('id, name, contactPerson, phone, email')
    .eq('id', vendorId)
    .single()
  if (supplier) {
    const s = supplier as {
      name: string; contactPerson: string | null; phone: string | null; email: string | null
    }
    // Dedupe: reuse an existing Vendor with the same name (case-insensitive)
    const { data: existingVendor } = await supabase
      .from('Vendor')
      .select('id')
      .ilike('vendorName', s.name)
      .limit(1)
    if (existingVendor && existingVendor.length > 0) {
      return (existingVendor[0] as { id: string }).id
    }
    const now = new Date().toISOString()
    const newVendor: Record<string, unknown> = {
      vendorName: s.name,
      contactPerson: s.contactPerson || null,
      phone: s.phone || null,
      email: s.email || null,
      // Supplier has no gstNumber/state columns — null-safe
      gstNumber: null,
      state: null,
      vendorType: 'Job Worker',
      specialization: 'Synced from Supplier',
      paymentTerms: 30,
      status: 'Active',
      createdAt: now,
      updatedAt: now,
    }
    let { data: created } = await supabase.from('Vendor').insert(newVendor).select('id').single()
    if (!created) {
      // gstNumber/state/vendorType columns may not exist in the live DB yet
      // (VENDOR-GST migration pending) — retry without them.
      const { gstNumber: _g, state: _st, vendorType: _vt, ...fallbackVendor } = newVendor
      const retry = await supabase.from('Vendor').insert(fallbackVendor).select('id').single()
      created = retry.data
    }
    if (!created) return { error: `${rowLabel}: Vendor not found` }
    return (created as { id: string }).id
  }
  return { error: `${rowLabel}: Vendor not found` }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: job } = await supabase.from('ProductionJob').select('id, stage').eq('id', id).single()
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })

    let { data: stages, error } = await supabase
      .from('StageTracking')
      .select('*, vendor:vendorId(id, vendorName, phone)')
      .eq('productionJobId', id)
      .order('sequence', { ascending: true })
    if (error) throw error

    // Self-heal backfill: a job with no stage rows gets all 10 canonical rows
    if (!stages || stages.length === 0) {
      const ts = new Date().toISOString()
      await supabase.from('StageTracking').insert(
        PRODUCTION_STAGES.map((stageName, index) => ({
          productionJobId: id, stageName, sequence: index,
          status: index === 0 && (job as { stage?: string }).stage === 'Fabric Issue' ? 'In Progress' : 'Pending',
          createdAt: ts, updatedAt: ts,
        }))
      )
      const res = await supabase
        .from('StageTracking')
        .select('*, vendor:vendorId(id, vendorName, phone)')
        .eq('productionJobId', id)
        .order('sequence', { ascending: true })
      stages = res.data
    }

    // Phase 5b: rows ordered (sequence, createdAt) for stable split order +
    // per-row vendor-bill embed → hasBills lock flag for the UI.
    const rows = await fetchStageRowsWithBills(id)
    return NextResponse.json({ stages: rows })
  } catch (error) {
    console.error('GET /api/production/[id]/stages error:', error)
    return NextResponse.json({ error: 'Failed to fetch stage trackings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const stageName = body?.stageName
    if (!stageName) return NextResponse.json({ error: 'stageName is required' }, { status: 400 })

    // Back-compat: legacy flat body (no rows[]) → single-element rows array
    const isLegacyFlat = !Array.isArray(body?.rows)
    const rawRows: SplitRowPayload[] = isLegacyFlat
      ? [{ ...body, stageName: undefined, rows: undefined }]
      : body.rows
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 })
    }

    const { data: job } = await supabase
      .from('ProductionJob')
      .select('id, targetQty, color')
      .eq('id', id)
      .single()
    if (!job) return NextResponse.json({ error: 'Production job not found' }, { status: 404 })
    const jobColor = (job as { color?: string | null }).color || null
    const targetQty = Number((job as { targetQty?: number }).targetQty) || 0

    // Existing rows of this stage, ordered for stable split order
    const { data: existingRowsData, error: fetchErr } = await supabase
      .from('StageTracking')
      .select('*')
      .eq('productionJobId', id)
      .eq('stageName', stageName)
      .order('sequence', { ascending: true })
      .order('createdAt', { ascending: true })
    if (fetchErr) throw fetchErr
    const existingRows = (existingRowsData || []) as Array<Record<string, any>>
    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'Stage tracking not found' }, { status: 404 })
    }
    const existingById = new Map(existingRows.map((r) => [r.id as string, r]))

    // ── Row-level validation (fail BEFORE any DB mutation) ──────────────
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i] || {}
      const label = `Row ${i + 1}`

      if (row.locationType !== undefined && row.locationType !== null &&
          !['In-House', 'Outsourced'].includes(String(row.locationType))) {
        return NextResponse.json({ error: `${label}: locationType must be "In-House" or "Outsourced"` }, { status: 400 })
      }
      if (row.color !== undefined && row.color !== null) {
        if (typeof row.color !== 'string' || row.color.trim() === '') {
          return NextResponse.json({ error: `${label}: color must be a non-empty string (or omit it)` }, { status: 400 })
        }
      }
      for (const f of NUMERIC_SPLIT_FIELDS) {
        const v = (row as Record<string, unknown>)[f]
        if (v !== undefined && v !== null) {
          const n = Number(v)
          if (isNaN(n) || n < 0) {
            return NextResponse.json({ error: `${label}: ${f} must be a non-negative number` }, { status: 400 })
          }
        }
      }
      if (row.id) {
        if (typeof row.id !== 'string' || !existingById.has(row.id)) {
          return NextResponse.json({ error: `${label}: split not found for this stage` }, { status: 400 })
        }
      }
    }

    // ── Vendor validation per row (Vendor → Supplier fallback kept) ────
    // undefined = "not provided" (keep existing / default null); null = cleared
    const resolvedVendors: Array<string | null | undefined> = []
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i] || {}
      const label = `Row ${i + 1}`
      const vid = row.vendorId
      if (vid === undefined || vid === null || vid === '') {
        resolvedVendors.push(vid === undefined ? undefined : null)
        continue
      }
      const resolved = await resolveVendorId(String(vid), label)
      if (typeof resolved === 'object' && resolved !== null && 'error' in (resolved as object)) {
        return NextResponse.json({ error: (resolved as { error: string }).error }, { status: 400 })
      }
      resolvedVendors.push(resolved as string | null)
    }

    // ── Σ sentQty guard: total sent across splits ≤ 1.5× job target ────
    const effectiveSent = rawRows.map((row) => {
      if (row.sentQty !== undefined && row.sentQty !== null) return Number(row.sentQty)
      const ex = row.id ? existingById.get(row.id as string) : null
      return Number(ex?.sentQty) || 0
    })
    const totalSent = effectiveSent.reduce((s, n) => s + n, 0)
    const maxSent = targetQty * 1.5
    if (totalSent > maxSent) {
      return NextResponse.json({
        error: `Total sent qty ${fmtQty(totalSent)} exceeds 1.5× job target (${fmtQty(maxSent)} for ${fmtQty(targetQty)} pcs)`,
      }, { status: 400 })
    }

    // ── REPLACE plan: rows of the stage absent from payload ids ────────
    const payloadIds = new Set(
      rawRows.map((r) => r.id).filter((v): v is string => typeof v === 'string' && !!v)
    )
    const toDelete = existingRows.filter((r) => !payloadIds.has(r.id as string))
    if (toDelete.length > 0) {
      // Delete-protection: a split with vendor bills attached cannot be removed
      const { data: bills } = await supabase
        .from('VendorBill')
        .select('id, stageTrackingId')
        .in('stageTrackingId', toDelete.map((r) => r.id as string))
      const billedIds = new Set((bills || []).map((b) => (b as { stageTrackingId: string }).stageTrackingId))
      if (billedIds.size > 0) {
        const blocked = toDelete.find((r) => billedIds.has(r.id as string))!
        const rowColor = (blocked as { color?: string | null }).color || jobColor || 'Free'
        const sent = Number((blocked as { sentQty?: number }).sentQty) || 0
        return NextResponse.json({
          error: `Cannot remove split — ${stageName} row (${rowColor}, ${fmtQty(sent)} pcs sent) has vendor bills attached.`,
        }, { status: 400 })
      }
    }

    // ── Sequence: preserved from the existing rows (canonical fallback) ─
    const canonicalIdx = PRODUCTION_STAGES.indexOf(stageName as (typeof PRODUCTION_STAGES)[number])
    const stageSequence = existingRows.length > 0
      ? Number(existingRows[0].sequence) || 0
      : (canonicalIdx >= 0 ? canonicalIdx : 0)

    // ── Apply: deletes → updates → inserts ─────────────────────────────
    const now = new Date().toISOString()
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('StageTracking')
        .delete()
        .in('id', toDelete.map((r) => r.id as string))
      if (delErr) throw delErr
    }

    const savedRowIds: string[] = []
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i] || {}
      const ex = row.id ? existingById.get(row.id as string) : null

      // Effective values: payload value > existing row value > default
      const num = (v: unknown, fallback: number) =>
        (v !== undefined && v !== null && !isNaN(Number(v))) ? Number(v) : fallback
      const sentQty = num(row.sentQty, Number(ex?.sentQty) || 0)
      const receivedQty = num(row.receivedQty, Number(ex?.receivedQty) || 0)
      const defectiveQty = num(row.defectiveQty, Number(ex?.defectiveQty) || 0)
      const perPieceRate = num(row.perPieceRate, Number(ex?.perPieceRate) || 0)

      // Per-row color defaulting: explicit > existing row color > job color
      let color: string | null = null
      if (typeof row.color === 'string' && row.color.trim() !== '') color = row.color.trim()
      else if (ex?.color) color = ex.color
      else if (jobColor) color = jobColor

      // Per-row status: explicit > date-derived
      let status: string
      if (row.status !== undefined && row.status !== null && String(row.status).trim() !== '') {
        status = String(row.status)
      } else {
        const recvDate = row.receivedDate !== undefined && row.receivedDate !== null
          ? row.receivedDate : ex?.receivedDate
        const sentDate = row.sentDate !== undefined && row.sentDate !== null
          ? row.sentDate : ex?.sentDate
        status = recvDate ? 'Completed' : sentDate ? 'Sent Out' : 'In Progress'
      }

      const dateOr = (v: unknown, fallback: string | null | undefined) =>
        v !== undefined ? (v ? new Date(String(v)).toISOString() : null) : (fallback ?? null)

      const vendorValue = resolvedVendors[i] === undefined
        ? (ex?.vendorId ?? null)
        : (resolvedVendors[i] || null)

      const record: Record<string, unknown> = {
        productionJobId: id,
        stageName,
        sequence: ex ? Number(ex.sequence) || stageSequence : stageSequence,
        locationType: row.locationType ?? ex?.locationType ?? 'In-House',
        vendorId: vendorValue,
        sentDate: dateOr(row.sentDate, ex?.sentDate),
        expectedReturnDate: dateOr(row.expectedReturnDate, ex?.expectedReturnDate),
        receivedDate: dateOr(row.receivedDate, ex?.receivedDate),
        sentQty, receivedQty, defectiveQty, perPieceRate,
        color,
        status,
        notes: row.notes !== undefined ? (row.notes || null) : (ex?.notes ?? null),
        totalAmount: Math.round(receivedQty * perPieceRate * 100) / 100,
        updatedAt: now,
      }

      if (ex) {
        const { data: updated, error } = await supabase
          .from('StageTracking')
          .update(record)
          .eq('id', row.id as string)
          .select('id')
          .single()
        if (error) {
          if (isUniqueViolation(error)) return uniqueViolationResponse(error)
          throw error
        }
        savedRowIds.push((updated as { id: string }).id)
      } else {
        record.createdAt = now
        const { data: inserted, error } = await supabase
          .from('StageTracking')
          .insert(record)
          .select('id')
          .single()
        if (error) {
          if (isUniqueViolation(error)) return uniqueViolationResponse(error)
          throw error
        }
        savedRowIds.push((inserted as { id: string }).id)
      }
    }

    // ── Response: full ordered rows + deleted count + legacy shape ─────
    const finalRows = await fetchStageRowsWithBills(id)
    const stageRows = finalRows.filter((r) => (r as { stageName?: string }).stageName === stageName)
    const responseBody: Record<string, unknown> = {
      rows: stageRows,
      deleted: toDelete.length,
    }
    // Legacy top-level shape: first row's fields spread at the top level
    if (stageRows.length > 0) {
      Object.assign(responseBody, stageRows[0])
    }
    return NextResponse.json(responseBody)
  } catch (error) {
    console.error('PATCH /api/production/[id]/stages error:', error)
    return NextResponse.json({ error: 'Failed to update stage tracking' }, { status: 500 })
  }
}
