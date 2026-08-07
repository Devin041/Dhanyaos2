-- ═══════════════════════════════════════════════════════════════════════════
-- Dhanya OS — Complete Supabase Migration Script
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- This creates ALL tables and columns needed for the full product lifecycle system
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. PURCHASE ORDER: Add product linkage columns ─────────────────────────
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "styleNo" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "styleName" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;

-- ─── 2. PO ITEM: New table for multi-fabric/color line items ───────────────
CREATE TABLE IF NOT EXISTS "POItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE,
  "styleNo" TEXT,
  "fabricName" TEXT NOT NULL,
  "color" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT DEFAULT 'meters',
  "ratePerUnit" DOUBLE PRECISION NOT NULL,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "receivedQty" DOUBLE PRECISION DEFAULT 0,
  "status" TEXT DEFAULT 'Pending',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. PRODUCTION JOB: Add cost tracking columns ──────────────────────────
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "actualFabricCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "actualLaborCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "actualOverheadCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "totalActualCost" DOUBLE PRECISION DEFAULT 0;

-- ─── 4. DISPATCH: Add production job link ──────────────────────────────────
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "productionJobId" TEXT;

-- ─── 5. COMPANY SETTINGS: New table for white-label branding ───────────────
CREATE TABLE IF NOT EXISTS "CompanySettings" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "companyName" TEXT NOT NULL DEFAULT 'Dhanya Lifestyle LLP',
  "brandName" TEXT,
  "tagline" TEXT,
  "location" TEXT NOT NULL DEFAULT 'Surat, Gujarat, India',
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "gstNumber" TEXT,
  "logoUrl" TEXT,
  "primaryColor" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row
INSERT INTO "CompanySettings" ("id", "companyName", "location")
VALUES ('default', 'Dhanya Lifestyle LLP', 'Surat, Gujarat, India')
ON CONFLICT ("id") DO NOTHING;

-- ─── 6. INVOICE: New table for billing ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "invoiceNo" TEXT UNIQUE NOT NULL,
  "salesOrderId" TEXT,
  "dispatchId" TEXT REFERENCES "Dispatch"("id"),
  "customerId" TEXT,
  "totalAmount" DOUBLE PRECISION DEFAULT 0,
  "paidAmount" DOUBLE PRECISION DEFAULT 0,
  "paymentStatus" TEXT DEFAULT 'Unpaid',
  "paymentTerms" INTEGER DEFAULT 0,
  "dueDate" TIMESTAMPTZ,
  "invoiceDate" TIMESTAMPTZ DEFAULT NOW(),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Invoice_salesOrderId_idx" ON "Invoice"("salesOrderId");
CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX IF NOT EXISTS "Invoice_paymentStatus_idx" ON "Invoice"("paymentStatus");

-- ─── 7. PAYMENT: New table for payment tracking ────────────────────────────
CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paymentNo" TEXT UNIQUE NOT NULL,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "amount" DOUBLE PRECISION DEFAULT 0,
  "paymentDate" TIMESTAMPTZ DEFAULT NOW(),
  "paymentMode" TEXT DEFAULT 'Cash',
  "referenceNo" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- ─── 8. SAMPLING: Add product linkage columns ──────────────────────────────
-- Note: Sampling uses the Sample table, so we add columns to Sample
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "sampleType" TEXT DEFAULT 'PP Sample';
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "clientPhotoUrl" TEXT;
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "ourPhotoUrl" TEXT;

-- ─── 9. SALES ORDER ITEM: Add product/image linkage ────────────────────────
-- Check if SalesOrderItem table exists and add columns
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "sampleId" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "image" TEXT;

-- ─── 10. ENABLE RLS ON ALL NEW TABLES ──────────────────────────────────────
ALTER TABLE "POItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanySettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;

-- Allow all operations (since we use service role key)
CREATE POLICY "Allow all POItem" ON "POItem" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all CompanySettings" ON "CompanySettings" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all Invoice" ON "Invoice" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all Payment" ON "Payment" FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE! After running this script:
-- 1. All new tables (POItem, Invoice, Payment, CompanySettings) will exist
-- 2. All new columns (styleNo, costSheetId, actualCost fields, etc.) will be added
-- 3. RLS policies will allow full access via service role key
-- 4. The app will use Supabase as the SINGLE database — no SQLite needed
-- ═══════════════════════════════════════════════════════════════════════════
