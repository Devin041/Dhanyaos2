-- ============================================================
-- SUPABASE MIGRATION: BOM (Bill of Materials) System
-- Phase 1 — Product + color-level BOM with applicable colors
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. BOM header: one product can have multiple versions, one active
CREATE TABLE IF NOT EXISTS "BOM" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "styleNo" TEXT NOT NULL,
  "version" INT NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "BOM_styleNo_version_key" ON "BOM"("styleNo", "version");
CREATE INDEX IF NOT EXISTS "BOM_styleNo_idx" ON "BOM"("styleNo");

-- 2. BOM lines: material requirements per piece
--    applicableColors = JSON array string, e.g. '["Red","Maroon","Navy","Black"]'
--    NULL or empty array means the material applies to ALL colors of the product.
CREATE TABLE IF NOT EXISTS "BOMLine" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "bomId" TEXT NOT NULL REFERENCES "BOM"("id") ON DELETE CASCADE,
  "materialType" TEXT NOT NULL DEFAULT 'FABRIC',
  "materialName" TEXT NOT NULL,
  "color" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'meters',
  "qtyPerPiece" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "applicableColors" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "BOMLine_bomId_idx" ON "BOMLine"("bomId");

-- 3. Row Level Security (same pattern as other tables)
ALTER TABLE "BOM" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BOMLine" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all BOM" ON "BOM";
CREATE POLICY "Allow all BOM" ON "BOM" FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all BOMLine" ON "BOMLine";
CREATE POLICY "Allow all BOMLine" ON "BOMLine" FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DONE! Verify with:
-- SELECT COUNT(*) FROM "BOM";
-- ============================================================
