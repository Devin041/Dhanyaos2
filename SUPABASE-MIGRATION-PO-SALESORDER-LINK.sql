-- ============================================================
-- Dhanya OS Migration: PO → Sales Order Linkage
-- Adds: PurchaseOrder.salesOrderId (nullable FK to SalesOrder)
-- This enables product-wise and order-wise procurement tracking.
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Add salesOrderId column to PurchaseOrder (nullable — PO can be without SO)
ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "salesOrderId" TEXT;

-- 2. Add FK constraint (idempotent — check if exists first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PurchaseOrder_salesOrderId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder" 
    ADD CONSTRAINT "PurchaseOrder_salesOrderId_fkey" 
    FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id");
  END IF;
END $$;

-- 3. Create index for faster lookups (when querying "all POs for SO-001")
CREATE INDEX IF NOT EXISTS "PurchaseOrder_salesOrderId_idx" ON "PurchaseOrder"("salesOrderId");

-- 4. Verify
SELECT 
  'PurchaseOrder columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'PurchaseOrder';

-- Expected: PurchaseOrder should now include "salesOrderId"
