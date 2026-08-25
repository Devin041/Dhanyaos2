-- ============================================================
-- Dhanya OS Migration: Fabric Receipt Ledger + Payment Terms
-- Adds: FabricReceipt table, FabricStock.color, PurchaseOrder.paymentTerms/dueDate, GrnItem.color/lotNumber
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- ============ 1. FabricStock table — add color column ============
ALTER TABLE "FabricStock" 
ADD COLUMN IF NOT EXISTS "color" TEXT;

-- ============ 2. New FabricReceipt table (receipt ledger) ============
CREATE TABLE IF NOT EXISTS "FabricReceipt" (
  "id" TEXT PRIMARY KEY,
  "fabricStockId" TEXT NOT NULL REFERENCES "FabricStock"("id") ON DELETE CASCADE,
  "poId" TEXT REFERENCES "PurchaseOrder"("id"),
  "grnId" TEXT REFERENCES "GrnNote"("id"),
  "supplierId" TEXT,
  "fabricName" TEXT NOT NULL,
  "color" TEXT,
  "lotNumber" TEXT,
  "receivedQty" FLOAT NOT NULL DEFAULT 0,
  "acceptedQty" FLOAT NOT NULL DEFAULT 0,
  "ratePerUnit" FLOAT NOT NULL DEFAULT 0,
  "totalValue" FLOAT NOT NULL DEFAULT 0,
  "receivedDate" TIMESTAMP NOT NULL DEFAULT NOW(),
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "FabricReceipt_fabricStockId_idx" ON "FabricReceipt"("fabricStockId");
CREATE INDEX IF NOT EXISTS "FabricReceipt_poId_idx" ON "FabricReceipt"("poId");
CREATE INDEX IF NOT EXISTS "FabricReceipt_grnId_idx" ON "FabricReceipt"("grnId");

-- ============ 3. PurchaseOrder — payment terms + due date ============
ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "paymentTerms" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "paymentDueDate" TIMESTAMP;

-- ============ 4. GrnItem — color + lotNumber (for multi-color GRN) ============
ALTER TABLE "GrnItem" 
ADD COLUMN IF NOT EXISTS "color" TEXT;

ALTER TABLE "GrnItem" 
ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;

-- ============ 5. Verify ============
SELECT 
  'FabricStock columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'FabricStock'
UNION ALL
SELECT 
  'FabricReceipt columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'FabricReceipt'
UNION ALL
SELECT 
  'PurchaseOrder columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'PurchaseOrder'
UNION ALL
SELECT 
  'GrnItem columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'GrnItem';

-- Expected:
--   FabricStock should include "color"
--   FabricReceipt should be a new table with all listed columns
--   PurchaseOrder should include "paymentTerms" and "paymentDueDate"
--   GrnItem should include "color" and "lotNumber"
