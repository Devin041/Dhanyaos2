# Dhanya OS — Finance Module: Deep Architecture Plan
## "Product-Wise Financial Tracking — From Thread to Profit"

> **Core Philosophy:** Har rupee ka pata hona chahiye — kis product pe, kis stage pe, kis cost mein laga. Ek garment birth (fabric purchase) se death (payment collected) tak financially traceable honi chahiye. Product-wise P&L, product-wise cost variance, product-wise outstanding — sab ek ID se connected.

---

## 📐 CURRENT SYSTEM — PRODUCT FLOW (ALREADY CONNECTED)

```
Sample Catalog (EL-007 + photo) ← styleNo is the universal key
    ↓ styleNo
Costing (₹500 cost, ₹800 sell) ← Estimated cost
    ↓ styleNo + costSheetId
Purchase Order (fabric ordered, supplier, qty, rate) ← Material cost source
    ↓ poId + styleNo
GRN (fabric received, qty verified) ← Actual material received
    ↓ styleNo + fabricStockId
Sampling (PP sample made, approved) ← Pre-production
    ↓ sampleId + styleNo
Sales Order (customer, qty, price, colors) ← Revenue source
    ↓ salesOrderId + styleNo
Production Job (fabric issued, labor, stages) ← Actual manufacturing
    ↓ productionJobId + styleNo
Dispatch (shipped to customer) ← Delivery
    ↓ dispatchId + salesOrderId
Invoice (billed to customer, GST, terms) ← Billing
    ↓ invoiceId + salesOrderId
Payment (collected, UPI/cash/cheque) ← Cash inflow
    ↓
PROFIT = Revenue - Actual Cost (per product, per piece)
```

**This flow is ALREADY connected.** Ab finance module isi flow ke upar build hoga.

---

## 🔥 DEEP FINANCE GAPS — PRODUCT-WISE ANALYSIS

### Gap 1: Job Costing — Actual Cost Per Product Per Piece

**Problem:** Abhi estimated cost (CostSheet) hai. Actual cost pata nahi.

```
Estimated (CostSheet):          Actual (Missing):
┌────────────────────┐          ┌─────────────────────────────────┐
│ Fabric: ₹250/piece │          │ Fabric: ₹235/piece (from PO+GRN)│
│ Trim: ₹50/piece    │          │ Trim: ₹55/piece (actual purchase)│
│ Labor: ₹100/piece  │          │ Labor: ₹120/piece (actual wages) │
│ Overhead: ₹50/piece│          │ Overhead: ₹45/piece (allocated)  │
│ Other: ₹50/piece   │          │ Embroidery: ₹30/piece (outsourced)│
│ Total: ₹500/piece  │          │ Wastage: ₹15/piece (scrap)       │
│                    │          │ Total: ₹500/piece → ACTUAL ₹500  │
│ Margin: 37.5%     │          │ Actual Margin: 37.5% vs Est 37.5%│
└────────────────────┘          └─────────────────────────────────┘
```

**What's Needed:**

| Cost Element | Source | How to Calculate |
|-------------|--------|-----------------|
| **Actual Fabric Cost** | PO + GRN | (PO rate × actual consumed qty) ÷ pieces produced |
| **Actual Trim Cost** | PO + GRN | Same as fabric — trims purchased separately |
| **Actual Labor Cost** | Production Job + Worker Timesheet | Worker daily wage × hours on this job ÷ pieces |
| **Actual Overhead** | Monthly expenses (rent, electricity) ÷ total pieces | (Monthly overhead ÷ total production pieces) × this job's pieces |
| **Outsourced Cost** | Vendor Bill (embroidery, printing) | Direct from vendor bill linked to production job |
| **Wastage Cost** | Fabric issued - Fabric consumed | (Issued meters - consumed meters) × rate per meter |
| **Packaging Cost** | PO or direct expense | Per piece packaging material cost |

**Database Changes Needed:**

```sql
-- Production Job: Already has cost tracking columns (added in Sprint 1)
-- Need to populate them:

-- 1. Fabric Consumption (already exists)
-- FabricConsumption table: productionJobId, fabricStockId, issuedQty, consumedQty
-- Cost = consumedQty × fabricStock.ratePerUnit

-- 2. Labor Timesheet (NEW TABLE)
CREATE TABLE "LaborTimesheet" (
  "id" TEXT PRIMARY KEY,
  "productionJobId" TEXT REFERENCES "ProductionJob"("id"),
  "workerId" TEXT,                    -- which worker
  "workerName" TEXT,
  "date" DATE,
  "hoursWorked" FLOAT,               -- hours on this job
  "wagePerHour" FLOAT,               -- worker's hourly rate
  "totalCost" FLOAT,                 -- hoursWorked × wagePerHour
  "stage" TEXT,                      -- cutting, stitching, etc.
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Overhead Allocation (calculated, not stored — derived from monthly expenses)
-- Formula: (Total monthly overhead ÷ Total monthly production pieces) × Job pieces

-- 4. Vendor Bill linkage to Job (already exists — VendorBill + StageTracking)
-- But need direct link: VendorBill.productionJobId

-- 5. Wastage tracking (already exists in FabricConsumption: issuedQty - consumedQty)
```

---

### Gap 2: Invoice — GST-Compliant & Itemized

**Problem:** Current invoice is just {invoiceNo, totalAmount, paymentTerms}. No GST, no items, no customer details.

**What Manufacturing Needs:**

```
┌─────────────────────────────────────────────────────────────┐
│                    TAX INVOICE                              │
│                                                             │
│  Dhanya Lifestyle LLP          │  Bill To:                  │
│  GST: 24ABCDE1234F1Z5          │  Rajshree                  │
│  Surat, Gujarat                │  GST: 29XYZAB6789G1Z2     │
│  Phone: +91 98765 43210        │  Lucknow, UP               │
│─────────────────────────────────────────────────────────────│
│  Invoice No: INV-2026-001     │  Date: 07 Aug 2026         │
│  PO No: PO-2026-015            │  Due Date: 06 Sep 2026     │
│  Dispatch No: DC-2026-003      │  Terms: 30 Days Credit     │
│─────────────────────────────────────────────────────────────│
│  # │ Style    │ Qty │ Rate  │ Amount  │ GST% │ GST Amt │   │
│  1 │ EL-007   │ 80  │ ₹800  │ ₹64,000 │ 5%   │ ₹3,200  │   │
│  2 │ EL-009   │ 50  │ ₹1,200│ ₹60,000 │ 5%   │ ₹3,000  │   │
│─────────────────────────────────────────────────────────────│
│  Subtotal: ₹1,24,000                                         │
│  CGST (2.5%): ₹3,100    SGST (2.5%): ₹3,100                │
│  (OR IGST 5%: ₹6,200 if inter-state)                        │
│  Round Off: ₹0                                              │
│  Grand Total: ₹1,30,200                                     │
│─────────────────────────────────────────────────────────────│
│  Bank: HDFC Bank │ A/C: 1234567890 │ IFSC: HDFC0001234     │
│  Terms: 1. Goods once sold not returnable                   │
│         2. Interest @18% p.a. on overdue                    │
│         3. Subject to Surat jurisdiction                    │
└─────────────────────────────────────────────────────────────┘
```

**Database Changes Needed:**

```sql
-- Invoice: Add GST + customer + billing fields
ALTER TABLE "Invoice" ADD COLUMN "customerGstNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "customerName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "customerAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billingAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shippingAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "placeOfSupply" TEXT;  -- state code
ALTER TABLE "Invoice" ADD COLUMN "gstType" TEXT DEFAULT 'IntraState'; -- IntraState/InterState
ALTER TABLE "Invoice" ADD COLUMN "gstPercent" FLOAT DEFAULT 5; -- 5% for garments
ALTER TABLE "Invoice" ADD COLUMN "taxableAmount" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "cgstAmount" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "sgstAmount" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "igstAmount" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "totalGst" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "roundOff" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "discountAmount" FLOAT DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "poReference" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "dispatchReference" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "bankAccountNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "bankIfsc" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "termsConditions" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "financialYear" TEXT; -- 2026-27
ALTER TABLE "Invoice" ADD COLUMN "status" TEXT DEFAULT 'Draft'; -- Draft/Sent/Paid/Cancelled

-- Invoice Item: Itemized billing (NEW TABLE)
CREATE TABLE "InvoiceItem" (
  "id" TEXT PRIMARY KEY,
  "invoiceId" TEXT REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "styleNo" TEXT,
  "styleName" TEXT,
  "hsnCode" TEXT DEFAULT '6104', -- HSN for garments
  "quantity" INT NOT NULL,
  "unit" TEXT DEFAULT 'pcs',
  "ratePerUnit" FLOAT NOT NULL,
  "amount" FLOAT NOT NULL,       -- qty × rate
  "discountPercent" FLOAT DEFAULT 0,
  "taxableAmount" FLOAT NOT NULL, -- after discount
  "gstPercent" FLOAT DEFAULT 5,
  "gstAmount" FLOAT NOT NULL,
  "totalAmount" FLOAT NOT NULL,   -- taxable + gst
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Credit Note (for returns/adjustments)
CREATE TABLE "CreditNote" (
  "id" TEXT PRIMARY KEY,
  "creditNoteNo" TEXT UNIQUE,
  "invoiceId" TEXT REFERENCES "Invoice"("id"),
  "customerId" TEXT,
  "reason" TEXT, -- return, damage, rate adjustment, etc.
  "amount" FLOAT,
  "gstAmount" FLOAT DEFAULT 0,
  "totalAmount" FLOAT,
  "date" TIMESTAMPTZ DEFAULT NOW(),
  "status" TEXT DEFAULT 'Open', -- Open/Adjusted
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Debit Note (for purchase returns)
CREATE TABLE "DebitNote" (
  "id" TEXT PRIMARY KEY,
  "debitNoteNo" TEXT UNIQUE,
  "purchaseOrderId" TEXT,
  "supplierId" TEXT,
  "reason" TEXT,
  "amount" FLOAT,
  "gstAmount" FLOAT DEFAULT 0,
  "totalAmount" FLOAT,
  "date" TIMESTAMPTZ DEFAULT NOW(),
  "status" TEXT DEFAULT 'Open',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Gap 3: Accounts Receivable (AR) — Customer Outstanding

**Problem:** Ek page pe nahi dikhta kis customer ka kitna outstanding hai, kitna purana hai.

**What's Needed:**

```
AR Aging Report:
┌──────────────┬─────────┬─────────┬─────────┬─────────┬──────────┐
│ Customer     │ 0-30d   │ 31-60d  │ 61-90d  │ 90+d    │ Total    │
├──────────────┼─────────┼─────────┼─────────┼─────────┼──────────┤
│ Rajshree     │ ₹2,00K  │ ₹50K    │ ₹0      │ ₹0      │ ₹2,50K   │
│ Meera Fashion│ ₹0      │ ₹1,50K  │ ₹80K    │ ₹30K    │ ₹2,60K   │
│ Vastra Life  │ ₹1,20K  │ ₹0      │ ₹0      │ ₹0      │ ₹1,20K   │
├──────────────┼─────────┼─────────┼─────────┼─────────┼──────────┤
│ TOTAL        │ ₹3,20K  │ ₹2,00K  │ ₹80K    │ ₹30K    │ ₹6,30K   │
└──────────────┴─────────┴─────────┴─────────┴─────────┴──────────┘

Action Items:
  ⚠️ Meera Fashion: ₹30K overdue 90+ days → Send final notice
  ⚠️ Meera Fashion: ₹80K overdue 61-90 days → Send reminder
  ℹ️ Rajshree: ₹50K in 31-60 days → Monitor
```

**Additional AR Features:**

| Feature | Description |
|---------|-------------|
| **Credit Limit Alert** | Customer.creditLimit vs total outstanding — red flag if exceeded |
| **Advance Payment** | Customer ne advance diya → negative outstanding (credit balance) |
| **Payment Schedule** | Due dates calendar view — kis date ko kitna dena hai |
| **Collection Follow-up Log** | Follow-up call/visit records per customer |
| **Late Payment Interest** | @18% p.a. on overdue amount (auto-calculate) |
| **Bad Debt Write-off** | 180+ days → mark as bad debt |
| **Customer Statement** | Party-wise ledger: all invoices + payments + outstanding |

**Database Changes:**

```sql
-- Customer: Add credit-related fields (already has creditLimit)
ALTER TABLE "Customer" ADD COLUMN "openingBalance" FLOAT DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "creditDays" INT DEFAULT 30;

-- Payment: Link to customer (for advance payments not tied to invoice)
ALTER TABLE "Payment" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paymentType" TEXT DEFAULT 'Against Invoice'; -- Against Invoice/Advance/On Account

-- Collection Follow-up (NEW TABLE)
CREATE TABLE "CollectionFollowup" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT,
  "invoiceId" TEXT,
  "followupDate" TIMESTAMPTZ DEFAULT NOW(),
  "followupType" TEXT, -- Call/Visit/Email/WhatsApp/Notice
  "response" TEXT, -- Promised/Refused/Partial/No Response
  "promisedAmount" FLOAT DEFAULT 0,
  "promisedDate" DATE,
  "notes" TEXT,
  "nextFollowupDate" DATE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Gap 4: Accounts Payable (AP) — Supplier Outstanding

**Same as AR but for suppliers:**

| Feature | Description |
|---------|-------------|
| **Supplier Aging** | 0-30, 31-60, 61-90, 90+ days outstanding to suppliers |
| **Advance to Supplier** | Supplier ko advance diya — track karna hai |
| **Supplier Payment Schedule** | Kaunse supplier ko kab dena hai |
| **TDS Deduction** | Payment se TDS katna (194C — 1% for contractor, 2% for transport) |
| **Supplier Statement** | Party-wise ledger: all bills + payments + outstanding |
| **Purchase Bill Processing** | Bill received → verify → approve → schedule payment → pay |

**Database Changes:**

```sql
-- Supplier: Add credit fields
ALTER TABLE "Supplier" ADD COLUMN "openingBalance" FLOAT DEFAULT 0;
ALTER TABLE "Supplier" ADD COLUMN "creditDays" INT DEFAULT 15;
ALTER TABLE "Supplier" ADD COLUMN "tdsSection" TEXT DEFAULT '194C';
ALTER TABLE "Supplier" ADD COLUMN "tdsRate" FLOAT DEFAULT 1;

-- Vendor Payment: Add TDS fields
ALTER TABLE "VendorPayment" ADD COLUMN "tdsAmount" FLOAT DEFAULT 0;
ALTER TABLE "VendorPayment" ADD COLUMN "tdsSection" TEXT;
ALTER TABLE "VendorPayment" ADD COLUMN "netPayable" FLOAT DEFAULT 0;
ALTER TABLE "VendorPayment" ADD COLUMN "paymentType" TEXT DEFAULT 'Against Bill';
```

---

### Gap 5: Banking & Cash Management

**Problem:** No bank account tracking, no reconciliation, no separate cash/bank.

**What's Needed:**

```sql
-- Bank Account (NEW TABLE)
CREATE TABLE "BankAccount" (
  "id" TEXT PRIMARY KEY,
  "accountName" TEXT NOT NULL, -- 'HDFC Current', 'Cash Counter', 'SBI Savings'
  "accountNumber" TEXT,
  "bankName" TEXT,
  "branch" TEXT,
  "ifscCode" TEXT,
  "accountType" TEXT DEFAULT 'Current', -- Current/Savings/Cash/Petty Cash
  "openingBalance" FLOAT DEFAULT 0,
  "currentBalance" FLOAT DEFAULT 0,
  "status" TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Bank Transaction (NEW TABLE — all money in/out through accounts)
CREATE TABLE "BankTransaction" (
  "id" TEXT PRIMARY KEY,
  "bankAccountId" TEXT REFERENCES "BankAccount"("id"),
  "type" TEXT NOT NULL, -- Credit (in) / Debit (out)
  "amount" FLOAT NOT NULL,
  "date" TIMESTAMPTZ DEFAULT NOW(),
  "description" TEXT,
  "referenceType" TEXT, -- Invoice/Payment/PO/Expense/Salary/Rent/Transfer
  "referenceId" TEXT,   -- linked record ID
  "paymentMode" TEXT,   -- Cash/UPI/Cheque/RTGS/NEFT/Card
  "chequeNo" TEXT,
  "chequeDate" DATE,
  "reconciled" BOOLEAN DEFAULT false,
  "reconciliationDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Multiple bank accounts + cash counter + petty cash
- Every payment/receipt linked to a bank account
- Bank reconciliation: bank statement vs system records
- Cheque register: issued/received cheques with status (Pending/Cleared/Bounced)
- Transfer between accounts (bank to cash, cash to bank)
- Auto-update account balance on every transaction

---

### Gap 6: Tax & GST Compliance

**Problem:** No GST tracking on sales/purchases. No return preparation.

**What's Needed:**

| Feature | Description |
|---------|-------------|
| **GST on Sales** | Every invoice: CGST+SGST (intra-state) or IGST (inter-state) |
| **GST on Purchases** | Every PO/bill: input tax credit (ITC) |
| **GSTR-1** | Auto-generate outward supplies report (monthly) |
| **GSTR-3B** | Summary return: total output GST - total ITC = net payable |
| **ITC Register** | Track eligible input tax credit from all purchases |
| **HSN/SAC Master** | HSN codes for products (6104 for women's garments) |
| **Place of Supply** | Customer's state determines CGST+SGST vs IGST |
| **Tax Period** | Monthly/quarterly tax periods |
| **Tax Payment** | Challan tracking (GST paid to government) |
| **E-invoice** | JSON format for government portal (future) |
| **E-way Bill** | For transport (if consignment > ₹50,000) |

**Database Changes:**

```sql
-- GST Settings (part of CompanySettings)
ALTER TABLE "CompanySettings" ADD COLUMN "gstNumber" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "stateCode" TEXT; -- 24 for Gujarat
ALTER TABLE "CompanySettings" ADD COLUMN "defaultGstPercent" FLOAT DEFAULT 5; -- 5% for garments < ₹1000, 12% above

-- Tax Period (NEW TABLE)
CREATE TABLE "TaxPeriod" (
  "id" TEXT PRIMARY KEY,
  "period" TEXT NOT NULL, -- "2026-08" (Aug 2026)
  "type" TEXT DEFAULT 'Monthly',
  "status" TEXT DEFAULT 'Open', -- Open/Filed/Paid
  "outputGst" FLOAT DEFAULT 0,  -- total GST collected on sales
  "inputGst" FLOAT DEFAULT 0,   -- total ITC from purchases
  "netPayable" FLOAT DEFAULT 0, -- output - input
  "filedDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- HSN Master (NEW TABLE)
CREATE TABLE "HSNCode" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT UNIQUE, -- "6104" for women's garments
  "description" TEXT,
  "gstPercent" FLOAT DEFAULT 5,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Gap 7: Manufacturing-Specific Financial Reports

**These reports don't exist yet:**

#### 7a. Trading Account (Manufacturing P&L)
```
TRADING ACCOUNT — August 2026

Opening Stock (Fabric + WIP + FG):     ₹8,50,000
  Add: Purchases (Fabric + Trims):     ₹5,20,000
  Add: Direct Expenses (Labor + Power):₹3,80,000
                                       ──────────
  Total:                               ₹17,50,000

  Less: Closing Stock:                 ₹7,80,000
                                       ──────────
  Cost of Goods Sold (COGS):           ₹9,70,000

  Sales Revenue:                       ₹15,00,000
  Less: COGS:                          ₹9,70,000
                                       ──────────
  Gross Profit:                        ₹5,30,000  (35.3%)
```

#### 7b. WIP Valuation
```
WORK IN PROGRESS VALUATION — 07 Aug 2026

Job No   │ Style    │ Stage      │ Qty │ Cost/Pc │ WIP Value
JOB-001  │ EL-007   │ Stitching  │ 80  │ ₹400    │ ₹32,000
JOB-002  │ EL-009   │ Cutting    │ 50  │ ₹250    │ ₹12,500
JOB-003  │ EL-012   │ Embroidery │ 100 │ ₹300    │ ₹30,000
                                                    ─────────
                                         Total WIP: ₹74,500
```

#### 7c. Product-Wise Profitability
```
PRODUCT-WISE PROFITABILITY — August 2026

Style   │ Qty Sold │ Revenue  │ Est Cost │ Act Cost │ Est Profit │ Act Profit │ Variance
EL-007  │ 80       │ ₹64,000  │ ₹40,000  │ ₹42,000  │ ₹24,000    │ ₹22,000    │ -₹2,000
EL-009  │ 50       │ ₹60,000  │ ₹30,000  │ ₹28,500  │ ₹30,000    │ ₹31,500    │ +₹1,500
EL-012  │ 100      │ ₹80,000  │ ₹55,000  │ ₹58,000  │ ₹25,000    │ ₹22,000    │ -₹3,000
```

#### 7d. Cost Variance Analysis
```
COST VARIANCE — EL-007 Anarkali

Cost Element    │ Estimated │ Actual   │ Variance  │ Reason
Fabric          │ ₹250      │ ₹235     │ -₹15 ✅   │ Better rate from supplier
Trim            │ ₹50       │ ₹55      │ +₹5 ❌    │ Button price increased
Labor           │ ₹100      │ ₹120     │ +₹20 ❌   │ Overtime for rush delivery
Overhead        │ ₹50       │ ₹45      │ -₹5 ✅    │ Higher production volume
Embroidery      │ ₹0        │ ₹30      │ +₹30 ❌   │ Outsourced (not planned)
Wastage         │ ₹0        │ ₹15      │ +₹15 ❌   │ Fabric cutting waste
                ─────────── ─────────── ───────────
Total           │ ₹500      │ ₹550     │ +₹50 ❌   │ Actual margin: 31.25% vs Est 37.5%
```

---

### Gap 8: Financial Statements (Period-End)

#### 8a. Balance Sheet
```
BALANCE SHEET — 31 Aug 2026

ASSETS                              │  LIABILITIES & EQUITY
────────────────────────────────────┼────────────────────────────────
Current Assets:                     │  Current Liabilities:
  Cash & Bank:        ₹12,48,420    │    AP (Suppliers):   ₹5,95,227
  AR (Customers):     ₹16,31,653    │    GST Payable:      ₹2,45,000
  Inventory (Fabric): ₹6,53,510     │    TDS Payable:      ₹15,000
  WIP:                ₹74,500       │    Expenses Payable: ₹80,000
  Finished Goods:     ₹3,50,000     │  ───────────────────────────────
                                    │  Total CL:           ₹9,35,227
  Total CA:           ₹39,58,083    │
                                    │  Equity:
Fixed Assets:                       │    Capital:          ₹20,00,000
  Machinery:          ₹5,00,000     │    Retained Earning: ₹15,22,856
  Furniture:          ₹1,00,000     │  ───────────────────────────────
                                    │  Total Equity:       ₹35,22,856
  Total FA:           ₹6,00,000     │
                                    │
TOTAL ASSETS:        ₹45,58,083    │  TOTAL L&E:          ₹45,58,083
```

#### 8b. Trial Balance
```
TRIAL BALANCE — 31 Aug 2026

Account              │ Debit       │ Credit
─────────────────────┼─────────────┼──────────────
Cash & Bank          │ ₹12,48,420  │
Accounts Receivable  │ ₹16,31,653  │
Inventory            │ ₹6,53,510   │
WIP                  │ ₹74,500     │
Finished Goods       │ ₹3,50,000   │
Machinery            │ ₹5,00,000   │
Accounts Payable     │             │ ₹5,95,227
GST Payable          │             │ ₹2,45,000
Capital              │             │ ₹20,00,000
Sales Revenue        │             │ ₹1,25,42,175
Purchase (Material)  │ ₹85,50,000  │
Direct Expenses      │ ₹38,00,000  │
Indirect Expenses    │ ₹24,75,319  │
                     │             │
TOTAL                │ ₹1,92,83,402│ ₹1,53,82,402
```

---

### Gap 9: Budget vs Actual

```sql
-- Budget (NEW TABLE)
CREATE TABLE "Budget" (
  "id" TEXT PRIMARY KEY,
  "financialYear" TEXT, -- "2026-27"
  "month" TEXT, -- "Aug" or "Q1"
  "category" TEXT, -- Revenue, Fabric, Labor, Rent, Salary, etc.
  "budgetedAmount" FLOAT,
  "actualAmount" FLOAT DEFAULT 0,
  "variance" FLOAT DEFAULT 0,
  "variancePercent" FLOAT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📊 COMPLETE DATABASE CHANGES SUMMARY

### New Tables (12):
1. `InvoiceItem` — Itemized invoice line items with GST
2. `CreditNote` — Sales returns/adjustments
3. `DebitNote` — Purchase returns/adjustments
4. `CollectionFollowup` — Payment follow-up log
5. `BankAccount` — Multiple bank/cash accounts
6. `BankTransaction` — All money movements through accounts
7. `TaxPeriod` — Monthly/quarterly GST periods
8. `HSNCode` — HSN/SAC code master
9. `LaborTimesheet` — Worker hours per job
10. `Budget` — Budget vs Actual tracking
11. `ChequeRegister` — Cheque issued/received tracking
12. `ExpenseApproval` — Expense approval workflow

### Modified Tables (8):
1. `Invoice` — GST fields, customer details, bank details, status
2. `Payment` — customerId, paymentType (advance/on-account)
3. `Customer` — openingBalance, creditDays
4. `Supplier` — openingBalance, creditDays, TDS fields
5. `VendorPayment` — TDS fields, paymentType
6. `CompanySettings` — GST number, state code, default GST
7. `ProductionJob` — (already has cost tracking columns)
8. `OrderItem` — (already has sampleId, costSheetId, image)

---

## 🎯 IMPLEMENTATION PRIORITY — PRODUCT-WISE APPROACH

### Phase 1: GST-Compliant Invoicing (P0)
**Goal:** Legal invoice with GST, items, customer details, PDF

| Task | Details |
|------|---------|
| Invoice schema | Add GST, customer, bank fields |
| InvoiceItem table | Itemized billing with HSN, GST per item |
| Invoice API | Create with items, auto-calculate GST |
| Invoice PDF | Letterhead, GST breakup, terms, bank details |
| Company GST settings | GST number, state code, default GST% |

### Phase 2: AR Aging + Customer Outstanding (P0)
**Goal:** Know who owes what, aging-wise

| Task | Details |
|------|---------|
| AR Aging API | Customer-wise 0-30/31-60/61-90/90+ breakdown |
| AR Aging UI | Dashboard with aging buckets, alerts |
| Customer statement | Party ledger (all invoices + payments) |
| Credit limit alert | Customer outstanding vs credit limit |
| Collection follow-up | Log calls/visits, promised amounts |

### Phase 3: AP Aging + Supplier Outstanding (P1)
**Goal:** Know what we owe to whom, aging-wise

| Task | Details |
|------|---------|
| AP Aging API | Supplier-wise aging |
| AP Aging UI | Dashboard |
| Supplier statement | Party ledger |
| TDS calculation | Auto-deduct on payment |
| Advance to supplier | Track advances |

### Phase 4: Job Costing — Actual Cost (P1)
**Goal:** Real cost per product per piece

| Task | Details |
|------|---------|
| Labor timesheet | Worker hours per job → labor cost |
| Fabric cost from PO+GRN | Actual material cost per job |
| Overhead allocation | Monthly overhead ÷ total pieces × job pieces |
| Vendor bill to job | Outsourced cost per job |
| Wastage tracking | Issued vs consumed variance |
| Cost variance report | Estimated vs actual per product |

### Phase 5: Banking & Cash (P2)
**Goal:** Multiple accounts, reconciliation

| Task | Details |
|------|---------|
| Bank account management | CRUD for accounts |
| Bank transaction | All in/out through accounts |
| Cheque register | Issued/received/cleared/bounced |
| Bank reconciliation | Statement vs system |
| Transfer between accounts | Bank ↔ cash |

### Phase 6: GST Compliance (P2)
**Goal:** GST return preparation

| Task | Details |
|------|---------|
| GSTR-1 report | Outward supplies |
| GSTR-3B report | Summary return |
| ITC register | Input tax credit |
| Tax period management | Monthly periods |
| Tax payment challan | GST paid to government |

### Phase 7: Financial Statements (P3)
**Goal:** Period-end reporting

| Task | Details |
|------|---------|
| Trading account | Manufacturing P&L with COGS |
| P&L statement | Detailed expense breakdown |
| Balance sheet | Assets, liabilities, equity |
| Trial balance | Account verification |
| WIP valuation | Mid-production stock value |
| Product-wise profitability | Revenue vs cost per product |

### Phase 8: Budget & Analytics (P3)
**Goal:** Planning & decision-making

| Task | Details |
|------|---------|
| Budget vs actual | Monthly category-wise |
| Financial ratios | DSO, DPO, Current ratio, etc. |
| Break-even analysis | Per product |
| Working capital cycle | Cash conversion |
| Expense approval workflow | Manager approval → pay |

---

## ✅ DEFINITION OF DONE

Finance module is complete when:

1. ✅ Create GST-compliant invoice with items, GST breakup, customer GST
2. ✅ Generate professional PDF invoice with letterhead + bank details
3. ✅ View AR aging report (0-30/31-60/61-90/90+) with customer-wise outstanding
4. ✅ Customer credit limit alert when exceeded
5. ✅ Record payment with TDS deduction (for suppliers)
6. ✅ View AP aging report for suppliers
7. ✅ Track actual cost per production job (fabric + labor + overhead + outsourced)
8. ✅ Compare estimated vs actual cost per product (variance analysis)
9. ✅ View product-wise profitability (revenue, cost, profit per style)
10. ✅ Manage multiple bank accounts + cash counter
11. ✅ Bank reconciliation
12. ✅ Generate GSTR-1 and GSTR-3B reports
13. ✅ Generate Trading Account, P&L, Balance Sheet
14. ✅ WIP valuation per job
15. ✅ Budget vs actual per category
16. ✅ Collection follow-up log with promised amounts
17. ✅ Credit note / debit note for returns/adjustments
18. ✅ Cheque register (issued/received/cleared/bounced)
19. ✅ Late payment interest calculation
20. ✅ Product lifecycle shows ACTUAL profit (not estimated)

---

## 📝 NOTES

- All product-wise tracking uses `styleNo` as the universal key
- Cost tracking flows: PO → GRN → Fabric Stock → Production Job → Actual Cost
- Revenue tracking flows: Sales Order → Dispatch → Invoice → Payment
- GST determined by: Supplier state vs Customer state (intra/inter-state)
- Garment GST: 5% (≤₹1000/piece), 12% (>₹1000/piece)
- HSN for women's garments: 6104 (dresses), 6211 (track suits), 6302 (bed linen)
- TDS section 194C: 1% (individual/HUF), 2% (others) for manufacturing/works contract
- Financial year: April 1 to March 31 (Indian standard)
