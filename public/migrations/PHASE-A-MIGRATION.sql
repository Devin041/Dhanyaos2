-- ═══════════════════════════════════════════════════════════════════════════
-- DHANYA OS — PHASE A MIGRATION: Double-Entry GL + Payments Out + Cheques +
-- Expenses (auto-ledger foundation)
--
-- Run ONCE in Supabase SQL Editor (sql.supabase.com → your project → New query)
-- Everything is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
-- After running, open the app → Banking → "Initialize Ledger" (or POST
-- /api/gl-setup) to seed system accounts + opening balances.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Chart of Accounts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GlAccount" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE,
  name        text NOT NULL,
  "accountType" text NOT NULL,                  -- ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
  "subType"   text,                             -- BANK, CASH, RECEIVABLE, CHEQUES_IN_HAND, INVENTORY,
                                                -- PAYABLE, VENDOR_BILL_PAYABLE, BROKER_PAYABLE,
                                                -- GST_OUT, GST_IN, TDS_PAYABLE, CHEQUES_ISSUED,
                                                -- CAPITAL, SALES, DIRECT_EXPENSE, INDIRECT_EXPENSE, SUSPENSE
  "isSystem"  boolean NOT NULL DEFAULT false,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Journal Entries (double-entry header) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "JournalEntry" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entryNo"     text UNIQUE,
  "entryDate"   timestamptz NOT NULL,
  description   text,
  "sourceType"  text,                           -- OPENING, PAYMENT_IN, PAYMENT_OUT, EXPENSE,
                                                -- TRANSFER, GST_PAYMENT, CHEQUE_CLEAR, CHEQUE_BOUNCE,
                                                -- WRITE_OFF, INVOICE, MANUAL
  "sourceId"    text,
  amount        numeric NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'Posted', -- Posted | Reversed
  "reversalOfId" uuid,
  "reversedById" uuid,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Journal Lines (the double entry itself) ───────────────────────────
CREATE TABLE IF NOT EXISTS "JournalLine" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "journalEntryId" uuid NOT NULL REFERENCES "JournalEntry"(id) ON DELETE CASCADE,
  "glAccountId"    uuid REFERENCES "GlAccount"(id),
  "glAccountCode"  text,
  "glAccountName"  text,
  debit            numeric NOT NULL DEFAULT 0,
  credit           numeric NOT NULL DEFAULT 0,
  "partyType"      text,                        -- CUSTOMER | SUPPLIER | VENDOR | BROKER | GOVT | OTHER
  "partyId"        text,
  "partyName"      text,
  memo             text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

-- (JournalLine createdAt/updatedAt were missing in v1 — patch also included
--  below in section 7 for databases already migrated)

CREATE INDEX IF NOT EXISTS idx_journalline_entry   ON "JournalLine"("journalEntryId");
CREATE INDEX IF NOT EXISTS idx_journalline_account ON "JournalLine"("glAccountId");
CREATE INDEX IF NOT EXISTS idx_journalline_party   ON "JournalLine"("partyType", "partyId");
CREATE INDEX IF NOT EXISTS idx_journalentry_date   ON "JournalEntry"("entryDate");
CREATE INDEX IF NOT EXISTS idx_journalentry_source ON "JournalEntry"("sourceType", "sourceId");

-- ─── 4. Cheque Register ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Cheque" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chequeNo"     text NOT NULL,
  direction      text NOT NULL,                 -- RECEIVED | ISSUED
  "partyType"    text, "partyId" text, "partyName" text,
  amount         numeric NOT NULL,
  "issueDate"    timestamptz,
  "bankName"     text,
  status         text NOT NULL DEFAULT 'In Hand', -- In Hand | Deposited | Cleared | Bounced
  "depositDate"  timestamptz,
  "clearanceDate" timestamptz,
  "bounceDate"   timestamptz,
  "bounceReason" text,
  "bankAccountId" uuid,
  "paymentId"    uuid,                          -- link: Payment row (RECEIVED)
  "paymentOutId" uuid,                          -- link: PaymentOut row (ISSUED)
  "journalEntryId" uuid,
  "clearJournalEntryId" uuid,
  "bounceJournalEntryId" uuid,
  notes          text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheque_status ON "Cheque"(status);

-- ─── 5. Expense Vouchers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ExpenseVoucher" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "voucherNo"    text UNIQUE,
  "expenseDate"  timestamptz NOT NULL,
  category       text NOT NULL,                 -- Rent, Salary, Freight Outward, Packing, Petty, ...
  description    text,
  amount         numeric NOT NULL,              -- total (incl. GST if any)
  "gstAmount"    numeric NOT NULL DEFAULT 0,
  "directType"   text NOT NULL DEFAULT 'INDIRECT', -- DIRECT (order-linked) | INDIRECT
  "salesOrderId" uuid, "styleNo" text, "styleName" text,
  "paidFromType" text NOT NULL DEFAULT 'BANK', -- BANK | CASH
  "bankAccountId" uuid,
  "referenceNo"  text,
  "isRecurring"  boolean NOT NULL DEFAULT false,
  recurrence     text,                          -- MONTHLY | QUARTERLY
  "journalEntryId" uuid,
  notes          text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_date ON "ExpenseVoucher"("expenseDate");

-- ─── 6. PaymentOut — ALL outbound money (supplier PO / vendor bill / broker /
--        GST / other) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PaymentOut" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentNo"    text UNIQUE,
  "paymentDate"  timestamptz NOT NULL,
  "payeeType"    text NOT NULL,                 -- SUPPLIER | VENDOR_BILL | BROKER | GOVT_GST | OTHER
  "payeeId"      text, "payeeName" text,
  "poId"         uuid,                          -- supplier PO link
  "vendorBillId" uuid,                          -- vendor bill link
  "costSheetId"  uuid,                          -- broker commission source
  amount         numeric NOT NULL,              -- gross applied to payee
  "tdsAmount"    numeric NOT NULL DEFAULT 0,    -- TDS deducted at source
  "tdsSection"   text,                          -- 194H, 194C, ...
  "netPaidAmount" numeric NOT NULL DEFAULT 0,   -- amount − tds (money actually left the bank)
  "paymentMode"  text NOT NULL,                 -- NEFT | RTGS | UPI | Cash | Cheque
  "bankAccountId" uuid,
  "chequeId"     uuid,
  "referenceNo"  text, notes text,
  "journalEntryId" uuid,
  status         text NOT NULL DEFAULT 'Completed', -- Completed | Bounced
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paymentout_payee ON "PaymentOut"("payeeType", "payeeId");
CREATE INDEX IF NOT EXISTS idx_paymentout_date  ON "PaymentOut"("paymentDate");

-- ─── 7. Existing tables: linkage columns ──────────────────────────────────
-- Cash book (Transaction) links to the GL journal that spawned it
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "journalEntryId" uuid;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "bankAccountId"   uuid;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "sourceType"      text;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "sourceId"        text;

-- Customer payments-in: bank/cheque/GL links + TDS + short-payment adjustment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankAccountId"    uuid;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "journalEntryId"   uuid;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "chequeId"         uuid;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsAmount"        numeric NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsSection"       text;   -- 194H, 194C, ...
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustmentAmount" numeric NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustmentNote"   text;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status"           text NOT NULL DEFAULT 'Completed';

-- Invoices: short-payment write-off (settle balance with reason)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "writeOffAmount" numeric NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "writeOffReason" text;

-- Vendor bills: keep status in sync with payments
-- (paidAmount already exists)

-- JournalLine timestamps (was missing in v1 of this migration — harmless if
-- you already created the table without them; ADD IF NOT EXISTS covers it)
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- ─── 8. Seed the SYSTEM chart of accounts (idempotent) ───────────────────
INSERT INTO "GlAccount" (code, name, "accountType", "subType", "isSystem") VALUES
  ('1000', 'Bank Accounts',            'ASSET',     'BANK',             true),
  ('1001', 'Cash in Hand',             'ASSET',     'CASH',             true),
  ('1100', 'Accounts Receivable',      'ASSET',     'RECEIVABLE',       true),
  ('1150', 'Cheques in Hand',          'ASSET',     'CHEQUES_IN_HAND',  true),
  ('1200', 'Inventory — Fabric & FG',  'ASSET',     'INVENTORY',        true),
  ('1300', 'GST Input Credit (ITC)',   'ASSET',     'GST_IN',           true),
  ('2000', 'Accounts Payable — Suppliers', 'LIABILITY', 'PAYABLE',      true),
  ('2100', 'Vendor Bill Payable',      'LIABILITY', 'VENDOR_BILL_PAYABLE', true),
  ('2200', 'Broker Commission Payable','LIABILITY', 'BROKER_PAYABLE',   true),
  ('2300', 'GST Output Payable',       'LIABILITY', 'GST_OUT',          true),
  ('2400', 'TDS Payable',              'LIABILITY', 'TDS_PAYABLE',      true),
  ('2500', 'Cheques Issued (Outstanding)', 'LIABILITY', 'CHEQUES_ISSUED', true),
  ('3000', 'Owner Capital',            'EQUITY',    'CAPITAL',          true),
  ('4000', 'Sales',                    'INCOME',    'SALES',            true),
  ('5100', 'Direct Expenses (Order-linked)', 'EXPENSE', 'DIRECT_EXPENSE', true),
  ('5200', 'Indirect Expenses (Admin & Overhead)', 'EXPENSE', 'INDIRECT_EXPENSE', true),
  ('9000', 'Suspense',                 'EXPENSE',   'SUSPENSE',         true)
ON CONFLICT (code) DO NOTHING;

-- ─── DONE ─────────────────────────────────────────────────────────────────
-- Verification query (optional):
--   SELECT code, name FROM "GlAccount" ORDER BY code;   → should list 17 accounts
--   SELECT * FROM "JournalEntry" LIMIT 1;               → no error = table exists
