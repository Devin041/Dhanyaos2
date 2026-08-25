-- Add styleName + costSheetId columns to POItem (were missing from the original universal PO migration)
ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "styleName" TEXT;

ALTER TABLE "POItem" 
ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;

ALTER TABLE "PurchaseOrder" 
ADD COLUMN IF NOT EXISTS "notes" TEXT;
