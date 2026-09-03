-- ============================================================
-- Dhanya OS Migration: COLOR-PRODUCTION
-- Color-wise production: child jobs per OrderItemColor, multi-vendor stage splits
--
-- STATUS: ALREADY APPLIED to the live Supabase DB (verified 2026-09-02):
--   * All ADD COLUMNs are live
--   * unique(productionJobId, stageName) on StageTracking is DROPPED
--   * OrderItemColor has 0 duplicate (orderItemId, color, size) rows
--   * ProductionJob.color backfilled ('Free' on 16 legacy jobs)
-- Every statement below is idempotent (IF NOT EXISTS / conditional / no-op
-- when already applied), so re-running is safe. This file documents live-DB
-- state for fresh environments.
-- ============================================================

-- SECTION 1: Schema — new columns
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "color" TEXT DEFAULT 'Free';
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "parentJobId" UUID REFERENCES "ProductionJob"("id");
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "orderItemColorId" UUID REFERENCES "OrderItemColor"("id");
ALTER TABLE "StageTracking" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "QualityCheck" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "DispatchItem" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "DispatchItem" ADD COLUMN IF NOT EXISTS "colorCode" TEXT;
ALTER TABLE "DispatchItem" ADD COLUMN IF NOT EXISTS "size" TEXT;
ALTER TABLE "BOMLine" ADD COLUMN IF NOT EXISTS "wastagePercent" DECIMAL(5,2) DEFAULT 0;
ALTER TABLE "FGStockBin" ADD COLUMN IF NOT EXISTS "lastDispatchDate" TIMESTAMP;

-- SECTION 2: Drop StageTracking unique(productionJobId, stageName)
-- One stage can now carry N vendor/color split rows (Phase 5-b).
-- The rows are an ordered list keyed by id; uniqueness is enforced by the API.
-- v4 fix: pg_attribute.attname is type "name" — BOTH sides cast to text[]
-- (the v1-v3 DO blocks failed with 42801 operator does not exist: name[] = text[])
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname::text
  INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'StageTracking'
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['productionJobId', 'stageName']::text[]
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "StageTracking" DROP CONSTRAINT %I', v_conname);
    RAISE NOTICE 'Dropped: %', v_conname;
  ELSE
    RAISE NOTICE 'StageTracking: no unique(productionJobId, stageName) — already clean';
  END IF;
END $$;

-- SECTION 3: Dedupe OrderItemColor (keep lowest id per orderItemId+color+size)
-- NOTE: same color with DIFFERENT sizes (S/M/L/XL/XXL) are NOT duplicates.
DELETE FROM "OrderItemColor" a
USING "OrderItemColor" b
WHERE a.id > b.id
  AND a."orderItemId" = b."orderItemId"
  AND a.color = b.color
  AND COALESCE(a.size, '') = COALESCE(b.size, '');

-- SECTION 4: Backfill legacy rows
UPDATE "ProductionJob" SET "color" = 'Free' WHERE "color" IS NULL;

-- SECTION 5: Verify (read-only)
SELECT 'StageTracking unique constraints' AS item,
       COALESCE(string_agg(conname::text, ', ' ORDER BY conname), 'NONE - dropped OK') AS value
FROM pg_constraint
WHERE conrelid = '"StageTracking"'::regclass
  AND contype = 'u'
UNION ALL
SELECT 'ProductionJob jobs with color = Free', COUNT(*)::text
FROM "ProductionJob"
WHERE color = 'Free'
UNION ALL
SELECT 'OrderItemColor duplicate groups (expect 0)', COUNT(*)::text
FROM (
  SELECT "orderItemId", color, size
  FROM "OrderItemColor"
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1
) d;
