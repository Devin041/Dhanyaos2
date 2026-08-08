-- ═══════════════════════════════════════════════════════════════════════════
-- Dhanya OS — Finance Module: Complete Supabase Migration
-- Run in Supabase Dashboard → SQL Editor
-- Phase 1: GST Invoice + AR Aging + Job Costing
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. INVOICE: Add GST + customer + bank fields ───────────────────────────
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerGstNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "placeOfSupply" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gstType" TEXT DEFAULT 'IntraState';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gstPercent" DOUBLE PRECISION DEFAULT 5;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxableAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cgstAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "sgstAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "igstAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "totalGst" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "roundOff" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "poReference" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "dispatchReference" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankIfsc" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "termsConditions" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "financialYear" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Sent';

-- ─── 2. INVOICE ITEM: Itemized billing with GST ─────────────────────────────
CREATE TABLE IF NOT EXISTS "InvoiceItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "styleNo" TEXT,
  "styleName" TEXT,
  "hsnCode" TEXT DEFAULT '6104',
  "quantity" INTEGER NOT NULL,
  "unit" TEXT DEFAULT 'pcs',
  "ratePerUnit" DOUBLE PRECISION NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "discountPercent" DOUBLE PRECISION DEFAULT 0,
  "taxableAmount" DOUBLE PRECISION NOT NULL,
  "gstPercent" DOUBLE PRECISION DEFAULT 5,
  "gstAmount" DOUBLE PRECISION NOT NULL,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- ─── 3. COLLECTION FOLLOWUP: Payment follow-up log ──────────────────────────
CREATE TABLE IF NOT EXISTS "CollectionFollowup" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "customerId" TEXT,
  "invoiceId" TEXT,
  "followupDate" TIMESTAMPTZ DEFAULT NOW(),
  "followupType" TEXT,
  "response" TEXT,
  "promisedAmount" DOUBLE PRECISION DEFAULT 0,
  "promisedDate" DATE,
  "notes" TEXT,
  "nextFollowupDate" DATE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "CollectionFollowup_customerId_idx" ON "CollectionFollowup"("customerId");

-- ─── 4. LABOR TIMESHEET: Worker hours per job ───────────────────────────────
CREATE TABLE IF NOT EXISTS "LaborTimesheet" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productionJobId" TEXT,
  "workerId" TEXT,
  "workerName" TEXT,
  "date" DATE,
  "hoursWorked" DOUBLE PRECISION,
  "wagePerHour" DOUBLE PRECISION,
  "totalCost" DOUBLE PRECISION,
  "stage" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "LaborTimesheet_jobId_idx" ON "LaborTimesheet"("productionJobId");

-- ─── 5. BANK ACCOUNT: Multiple bank/cash accounts ──────────────────────────
CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountName" TEXT NOT NULL,
  "accountNumber" TEXT,
  "bankName" TEXT,
  "branch" TEXT,
  "ifscCode" TEXT,
  "accountType" TEXT DEFAULT 'Current',
  "openingBalance" DOUBLE PRECISION DEFAULT 0,
  "currentBalance" DOUBLE PRECISION DEFAULT 0,
  "status" TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. CUSTOMER: Add credit fields ────────────────────────────────────────
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "openingBalance" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER DEFAULT 30;

-- ─── 7. SUPPLIER: Add credit + TDS fields ──────────────────────────────────
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "openingBalance" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER DEFAULT 15;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "tdsSection" TEXT DEFAULT '194C';
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "tdsRate" DOUBLE PRECISION DEFAULT 1;

-- ─── 8. COMPANY SETTINGS: Add GST fields ───────────────────────────────────
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "gstNumber" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "stateCode" TEXT DEFAULT '24';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "defaultGstPercent" DOUBLE PRECISION DEFAULT 5;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "bankIfsc" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "termsConditions" TEXT;

-- Update CompanySettings with default values
UPDATE "CompanySettings" SET 
  "gstNumber" = COALESCE("gstNumber", ''),
  "stateCode" = COALESCE("stateCode", '24'),
  "defaultGstPercent" = COALESCE("defaultGstPercent", 5),
  "bankName" = COALESCE("bankName", ''),
  "bankAccountNo" = COALESCE("bankAccountNo", ''),
  "bankIfsc" = COALESCE("bankIfsc", ''),
  "termsConditions" = COALESCE("termsConditions", '1. Goods once sold are not returnable.\n2. Interest @18% p.a. on overdue payments.\n3. Subject to Surat jurisdiction.')
WHERE "id" = 'default';

-- ─── 9. ENABLE RLS ON ALL NEW TABLES ───────────────────────────────────────
ALTER TABLE "InvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollectionFollowup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LaborTimesheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all InvoiceItem" ON "InvoiceItem" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all CollectionFollowup" ON "CollectionFollowup" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all LaborTimesheet" ON "LaborTimesheet" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all BankAccount" ON "BankAccount" FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE! Run this script, then tell the AI to continue development.
-- ═══════════════════════════════════════════════════════════════════════════
