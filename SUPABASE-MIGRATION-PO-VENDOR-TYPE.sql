-- ============================================================
-- Dhanya OS Migration: PO Vendor linkage + Vendor type field
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Make supplierId nullable on PurchaseOrder (so a PO can be vendor-only)
ALTER TABLE "PurchaseOrder" 
ALTER COLUMN "supplierId" DROP NOT NULL;

-- 2. Add vendorId column to PurchaseOrder (FK to Vendor, nullable)
ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "vendorId" TEXT;

-- Add FK constraint (idempotent — check if exists first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseOrder_vendorId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder" 
    ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" 
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"(id);
  END IF;
END $$;

-- 3. Add vendorType column to Vendor (customizable type like supplier)
ALTER TABLE "Vendor" 
ADD COLUMN IF NOT EXISTS "vendorType" TEXT NOT NULL DEFAULT 'Job Worker';

-- 4. Verify
SELECT 
  'PurchaseOrder columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'PurchaseOrder'
UNION ALL
SELECT 
  'Vendor columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'Vendor';

-- Expected: PurchaseOrder should include "vendorId" and supplierId should be nullable.
-- Vendor should include "vendorType".
