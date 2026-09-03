-- ============================================================
-- SUPABASE MIGRATION: GRN ↔ POItem Link + LaborTimesheet safety
-- Phase 0 — Pipeline Integrity Fixes
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. GrnItem.poItemId: line-level link so each GRN row maps to its PO line
ALTER TABLE "GrnItem" ADD COLUMN IF NOT EXISTS "poItemId" TEXT;
CREATE INDEX IF NOT EXISTS "GrnItem_poItemId_idx" ON "GrnItem"("poItemId");

-- 2. Safety net: ensure LaborTimesheet exists (already created by
--    FINANCE-MIGRATION.sql — harmless if it already exists)
CREATE TABLE IF NOT EXISTS "LaborTimesheet" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productionJobId" TEXT,
  "workerId" TEXT,
  "workerName" TEXT,
  "date" DATE,
  "hoursWorked" DOUBLE PRECISION,
  "wagePerHour" DOUBLE PRECISION,
  "totalCost" DOUBLE PRECISION,
  "stage" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "LaborTimesheet_jobId_idx" ON "LaborTimesheet"("productionJobId");
ALTER TABLE "LaborTimesheet" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- DONE! Verify with:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'GrnItem' AND column_name = 'poItemId';
-- ============================================================
