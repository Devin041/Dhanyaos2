-- ============================================================
-- Dhanya OS Migration: Universal Purchase Order
-- Adds: poType, broker fields on PurchaseOrder; itemType, name, description, size, costSheetId on POItem.
-- Old POItem.fabricName column is replaced by `name` (we ADD `name` and backfill from fabricName).
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- ============ 1. PurchaseOrder table ============

-- 1a. Add poType column (universal PO classification)
ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "poType" TEXT NOT NULL DEFAULT 'GENERAL';

-- 1b. Add broker / commission columns (universal)
ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "brokerName" TEXT;

ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "commissionPercent" FLOAT NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "commissionAmount" FLOAT NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "netAmount" FLOAT NOT NULL DEFAULT 0;

-- ============ 2. POItem table ============

-- 2a. Add itemType column (FABRIC | GOODS | ACCESSORY | SERVICE | OTHER)
ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "itemType" TEXT NOT NULL DEFAULT 'FABRIC';

-- 2b. Add universal `name` column (will hold fabric name for old POItems, or product/service name for new ones)
ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "name" TEXT;

-- Backfill: copy existing fabricName into `name` for old POItems (if any exist)
UPDATE "POItem" 
SET "name" = "fabricName" 
WHERE "name" IS NULL AND "fabricName" IS NOT NULL;

-- Set default to '' for any rows that still have NULL name (shouldn't happen but safe)
UPDATE "POItem" SET "name" = '' WHERE "name" IS NULL;

-- Make name NOT NULL now that it's backfilled
ALTER TABLE "POItem" 
ALTER COLUMN "name" SET NOT NULL;

-- 2c. Add size column (for goods — S/M/L/XL/XXL)
ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "size" TEXT;

-- 2d. Add description column (optional extra details)
ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "description" TEXT;

-- 2e. Add costSheetId column (link to costing for goods items)
ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;

-- NOTE: We keep the old `fabricName` column for backward compatibility with
-- existing code paths, but new POs will use `name` instead. The fabricName
-- column will be deprecated in a future cleanup.

-- ============ 3. Verify ============
SELECT 
  'PurchaseOrder columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'PurchaseOrder'
UNION ALL
SELECT 
  'POItem columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'POItem';

-- Expected: PurchaseOrder should include poType, brokerName, commissionPercent, commissionAmount, netAmount
-- POItem should include itemType, name, size, description, costSheetId (alongside existing fabricName)
