-- Add notes column to PurchaseOrder (was missing from the original universal PO migration)
ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "notes" TEXT;
