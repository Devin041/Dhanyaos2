-- ============================================================
-- SUPABASE MIGRATION: FabricStock product stamping
-- GRN approve par PO ka styleNo stock row pe stamp hota hai,
-- taaki Fabric Stock page pe product photo dikhe.
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE "FabricStock" ADD COLUMN IF NOT EXISTS "styleNo" TEXT;
CREATE INDEX IF NOT EXISTS "FabricStock_styleNo_idx" ON "FabricStock"("styleNo");

-- ============================================================
-- DONE! Verify with:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'FabricStock' AND column_name = 'styleNo';
-- ============================================================
