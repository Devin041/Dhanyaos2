-- ═══════════════════════════════════════════════════════════════════════════
-- Dhanya OS — CORRECTED Supabase Migration Script (Part 2)
-- Run this in Supabase Dashboard → SQL Editor
-- This fixes the SalesOrderItem issue (actual table name is "OrderItem")
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 9. ORDER ITEM: Add product/image linkage columns ──────────────────────
-- NOTE: The actual table name in Supabase is "OrderItem", NOT "SalesOrderItem"
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sampleId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "styleNo" TEXT;

-- ─── Verify all other migrations were successful ───────────────────────────
-- Check if POItem table was created
-- SELECT * FROM "POItem" LIMIT 0;
-- Check if Invoice table was created  
-- SELECT * FROM "Invoice" LIMIT 0;
-- Check if Payment table was created
-- SELECT * FROM "Payment" LIMIT 0;
-- Check if CompanySettings was created
-- SELECT * FROM "CompanySettings" LIMIT 0;
-- Check if PurchaseOrder has styleNo column
-- SELECT "styleNo" FROM "PurchaseOrder" LIMIT 0;
-- Check if ProductionJob has costSheetId column
-- SELECT "costSheetId" FROM "ProductionJob" LIMIT 0;
-- Check if Dispatch has productionJobId column
-- SELECT "productionJobId" FROM "Dispatch" LIMIT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE! After running this:
-- 1. OrderItem table now has sampleId, costSheetId, image, styleNo columns
-- 2. All other tables from Part 1 should already be created
-- 3. The app will now fully work with Supabase as single database
-- ═══════════════════════════════════════════════════════════════════════════
