# Dhanya OS — Product Lifecycle Architecture Plan
## "One Product, One ID, Full Pipeline Tracking"

> **Goal:** When a product "X" is created in Sample Catalog, it should flow through EVERY stage of the system — Costing → PO → GRN → Sampling → Sales Order → Production → Dispatch → Delivery → Invoice → Payment → Profit Analysis — all linked by the same product ID, so at any point we can trace exact cost, revenue, and profit per product.

---

## 📐 CURRENT STATE ANALYSIS

### What Works ✅
1. **Sample Catalog** → Product created with photo, styleNo (e.g. EL-007)
2. **Costing** → Cost sheet linked to styleNo, auto-resolves image from Sample
3. **Sample Catalog PDF** → Photos + costing sent to client

### What's Broken ❌
| Stage | Issue | Impact |
|-------|-------|--------|
| **Purchase Order** | No product/style reference | Can't track which product's fabric was ordered |
| **GRN (Goods Receipt)** | No product link | Can't track which product's material arrived |
| **Sampling** | Empty, no product selection | Can't track PP samples per product |
| **Sales Order** | No sample catalog image link | Can't trace which sample became which order |
| **Production** | `salesOrderId = NULL` for all 12 jobs | Production jobs disconnected from orders |
| **Dispatch** | No product/item tracking | Can't track which products shipped |
| **Invoice/Payment** | No product-level cost tracking | Can't calculate actual profit per product |
| **Profit Analysis** | Missing actual cost data | Only estimated profit, not real |

### The Core Problem
```
Sample Catalog (EL-007) ──→ Costing (₹500 cost)
         │
         ╳ BREAK ╳  ← Product ID lost here
         │
Purchase Order (fabric only, no product ref)
         │
         ╳ BREAK ╳
         │
Production (no sales order link)
         │
         ╳ BREAK ╳
         │
Dispatch → Invoice → Payment (no product cost tracking)
```

---

## 🎯 TARGET STATE — Connected Product Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRODUCT LIFECYCLE PIPELINE                       │
│                                                                     │
│  ┌──────────────┐                                                   │
│  │ SAMPLE CATALOG│ ← Product born here with styleNo + photo         │
│  │   (EL-007)    │   styleNo = "EL-007", photo uploaded             │
│  └──────┬───────┘                                                   │
│         │ styleNo                                                   │
│  ┌──────▼───────┐                                                   │
│  │   COSTING     │ ← Cost calculated (₹500 cost, ₹800 sell)        │
│  │  (CS-001)     │   Linked by styleNo                              │
│  └──────┬───────┘                                                   │
│         │ styleNo + costSheetId                                     │
│  ┌──────▼───────┐                                                   │
│  │ PURCHASE ORDER│ ← Fabric ordered FOR this product                │
│  │  (PO-001)     │   styleNo linked, multi-color fabric items       │
│  └──────┬───────┘                                                   │
│         │ poId + styleNo                                            │
│  ┌──────▼───────┐                                                   │
│  │     GRN       │ ← Fabric received, qty verified                  │
│  │  (GRN-001)    │   Linked to PO, updates fabric stock             │
│  └──────┬───────┘                                                   │
│         │ styleNo + fabricStockId                                   │
│  ┌──────▼───────┐                                                   │
│  │   SAMPLING    │ ← PP Sample made, client copy + our copy         │
│  │  (SMP-007)    │   Linked to sample, photos uploaded              │
│  └──────┬───────┘                                                   │
│         │ sampleId + styleNo + costSheetId                          │
│  ┌──────▼───────┐                                                   │
│  │  SALES ORDER  │ ← Order placed with colors, sizes, qty           │
│  │  (SO-001)     │   Items linked to sampleId, image auto-loaded    │
│  └──────┬───────┘                                                   │
│         │ salesOrderId + styleNo + costSheetId                      │
│  ┌──────▼───────┐                                                   │
│  │  PRODUCTION   │ ← Job created FROM sales order                   │
│  │  (JOB-001)    │   salesOrderId linked, fabric issued from stock  │
│  └──────┬───────┘                                                   │
│         │ productionJobId + styleNo                                 │
│  ┌──────▼───────┐                                                   │
│  │   DISPATCH    │ ← Goods dispatched, delivery challan             │
│  │  (DC-001)     │   Linked to production job + sales order         │
│  └──────┬───────┘                                                   │
│         │ dispatchId + salesOrderId                                 │
│  ┌──────▼───────┐                                                   │
│  │   INVOICE     │ ← Bill generated from dispatch                   │
│  │  (INV-001)    │   Payment terms, credit days, due date           │
│  └──────┬───────┘                                                   │
│         │ invoiceId + salesOrderId                                  │
│  ┌──────▼───────┐                                                   │
│  │   PAYMENT     │ ← Payment collected, credit tracked              │
│  │  (PAY-001)    │   Partial/full, due date alerts                  │
│  └──────┬───────┘                                                   │
│         │                                                           │
│  ┌──────▼───────────────────────────────────────────────────────┐   │
│  │              PROFIT ANALYSIS (PER PRODUCT)                   │   │
│  │                                                              │   │
│  │  Product: EL-007 (Anarkali)                                 │   │
│  │  ├── Costing (estimated): ₹500/piece                        │   │
│  │  ├── Actual Fabric Cost: ₹480/piece (from PO + GRN)        │   │
│  │  ├── Actual Labor Cost: ₹120/piece (from production)       │   │
│  │  ├── Total Actual Cost: ₹600/piece                         │   │
│  │  ├── Selling Price: ₹800/piece                              │   │
│  │  ├── Actual Profit: ₹200/piece (25% margin)                │   │
│  │  ├── Qty Sold: 80 pieces                                    │   │
│  │  ├── Total Revenue: ₹64,000                                 │   │
│  │  ├── Total Cost: ₹48,000                                    │   │
│  │  └── Total Profit: ₹16,000 ✅                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 DATABASE CHANGES REQUIRED

### Phase 1: Product Linkage (Core Pipeline)

#### 1.1 Purchase Order Enhancement
```sql
-- Add product reference to PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "styleNo" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "styleName" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;

-- New table: PO Line Items (multi-fabric, multi-color per PO)
CREATE TABLE IF NOT EXISTS "POItem" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE,
  "styleNo" TEXT,
  "fabricName" TEXT NOT NULL,
  "color" TEXT,
  "quantity" FLOAT NOT NULL,
  "unit" TEXT DEFAULT 'meters',
  "ratePerUnit" FLOAT NOT NULL,
  "totalAmount" FLOAT NOT NULL,
  "receivedQty" FLOAT DEFAULT 0,
  "status" TEXT DEFAULT 'Pending',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.2 Sampling Enhancement
```sql
-- Add product/sample reference to Sampling
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "sampleId" TEXT;
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "styleNo" TEXT;
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "sampleType" TEXT DEFAULT 'PP Sample';
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "clientPhotoUrl" TEXT;
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "ourPhotoUrl" TEXT;
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "Sampling" ADD COLUMN IF NOT EXISTS "approvedDate" TIMESTAMPTZ;

-- New table: Sampling Photos (multiple photos per sampling)
CREATE TABLE IF NOT EXISTS "SamplingPhoto" (
  "id" TEXT PRIMARY KEY,
  "samplingId" TEXT NOT NULL REFERENCES "Sampling"("id") ON DELETE CASCADE,
  "imageUrl" TEXT NOT NULL,
  "photoType" TEXT DEFAULT 'progress',  -- 'client', 'our', 'progress'
  "sortOrder" INT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.3 Sales Order Item Enhancement
```sql
-- Add product/sample reference to SalesOrderItem
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "sampleId" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "image" TEXT;

-- New table: Order Item Colors (color-size-quantity matrix)
CREATE TABLE IF NOT EXISTS "OrderItemColor" (
  "id" TEXT PRIMARY KEY,
  "orderItemId" TEXT NOT NULL REFERENCES "SalesOrderItem"("id") ON DELETE CASCADE,
  "color" TEXT NOT NULL,
  "size" TEXT DEFAULT 'Free',
  "quantity" INT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.4 Production Job Fix
```sql
-- ProductionJob already has salesOrderId column — just need to populate it
-- Fix: eligibleOrders API should return Confirmed orders
-- Fix: Production creation should link salesOrderId
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "costSheetId" TEXT;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "actualFabricCost" FLOAT DEFAULT 0;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "actualLaborCost" FLOAT DEFAULT 0;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "actualOverheadCost" FLOAT DEFAULT 0;
ALTER TABLE "ProductionJob" ADD COLUMN IF NOT EXISTS "totalActualCost" FLOAT DEFAULT 0;
```

#### 1.5 Dispatch Enhancement
```sql
-- Add product/item tracking to Dispatch
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "salesOrderId" TEXT;
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "productionJobId" TEXT;

-- New table: Dispatch Items
CREATE TABLE IF NOT EXISTS "DispatchItem" (
  "id" TEXT PRIMARY KEY,
  "dispatchId" TEXT NOT NULL REFERENCES "Dispatch"("id") ON DELETE CASCADE,
  "styleNo" TEXT,
  "styleName" TEXT,
  "color" TEXT,
  "quantity" INT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.6 Invoice & Payment (New)
```sql
-- New table: Invoice
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT PRIMARY KEY,
  "invoiceNo" TEXT UNIQUE NOT NULL,
  "salesOrderId" TEXT,
  "dispatchId" TEXT,
  "customerId" TEXT,
  "totalAmount" FLOAT NOT NULL,
  "paidAmount" FLOAT DEFAULT 0,
  "paymentStatus" TEXT DEFAULT 'Unpaid',
  "paymentTerms" INT DEFAULT 0,  -- credit days
  "dueDate" TIMESTAMPTZ,
  "invoiceDate" TIMESTAMPTZ DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- New table: Payment
CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT PRIMARY KEY,
  "paymentNo" TEXT UNIQUE NOT NULL,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id"),
  "amount" FLOAT NOT NULL,
  "paymentDate" TIMESTAMPTZ DEFAULT NOW(),
  "paymentMode" TEXT DEFAULT 'Cash',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔌 API CHANGES REQUIRED

### Phase 1: Core Product Linkage

#### 1. Purchase Order API (`/api/purchase-orders`)
```
POST /api/purchase-orders
Body:
{
  "supplierId": "...",
  "styleNo": "EL-007",           ← NEW: which product
  "styleName": "Anarkali",       ← NEW
  "costSheetId": "...",          ← NEW: link to costing
  "items": [                     ← NEW: multi-fabric items
    { "fabricName": "Cotton", "color": "Red", "quantity": 100, "ratePerUnit": 50 },
    { "fabricName": "Cotton", "color": "Blue", "quantity": 80, "ratePerUnit": 50 }
  ],
  "expectedDelivery": "...",
  "notes": "..."
}

GET /api/purchase-orders?styleNo=EL-007  ← Filter by product
```

#### 2. Sampling API (`/api/sampling`)
```
POST /api/sampling
Body:
{
  "sampleId": "...",             ← NEW: link to Sample Catalog
  "styleNo": "EL-007",           ← NEW
  "costSheetId": "...",          ← NEW
  "sampleType": "PP Sample",     ← NEW
  "clientPhotoUrl": "...",       ← NEW
  "ourPhotoUrl": "...",          ← NEW
  "assignedTo": "...",           ← NEW
  "stage": "Design",
  "status": "In Progress"
}
```

#### 3. Sales Order API (`/api/orders`)
```
POST /api/orders
Body:
{
  "customerId": "...",
  "items": [
    {
      "styleId": "...",
      "styleNo": "EL-007",
      "sampleId": "...",          ← NEW: link to Sample Catalog
      "costSheetId": "...",       ← NEW: link to costing
      "quantity": 80,
      "unitPrice": 800,
      "colors": [                 ← NEW: color breakdown
        { "color": "Red", "size": "S", "quantity": 20 },
        { "color": "Red", "size": "M", "quantity": 20 },
        { "color": "Blue", "size": "S", "quantity": 20 },
        { "color": "Blue", "size": "M", "quantity": 20 }
      ]
    }
  ]
}
```

#### 4. Production API (`/api/production`)
```
Fix: GET /api/production/eligible-orders
- Should return orders with status 'Confirmed' or 'Acknowledged'
- Currently returns 0 — query is broken

Fix: POST /api/production
- When creating from sales order, MUST set salesOrderId
- Auto-populate styleNo, styleName, costSheetId from order items

NEW: GET /api/production/by-product/{styleNo}
- All production jobs for a specific product
```

#### 5. New: Product Tracking API
```
GET /api/products/{styleNo}/lifecycle
Returns:
{
  "styleNo": "EL-007",
  "styleName": "Anarkali",
  "image": "https://...",
  "sample": { "id": "...", "status": "Approved", "photoCount": 3 },
  "costing": { "id": "...", "totalCost": 500, "sellingPrice": 800, "margin": "37.5%" },
  "purchaseOrders": [
    { "poNo": "PO-001", "supplier": "...", "fabric": "Cotton", "color": "Red", "qty": 100, "received": 100, "status": "Received" }
  ],
  "sampling": { "id": "...", "type": "PP Sample", "status": "Approved", "clientPhoto": "...", "ourPhoto": "..." },
  "salesOrders": [
    { "orderNo": "SO-001", "customer": "...", "qty": 80, "amount": 64000, "status": "Confirmed" }
  ],
  "production": [
    { "jobNo": "JOB-001", "targetQty": 80, "completedQty": 80, "stage": "Dispatch", "status": "Completed" }
  ],
  "dispatch": [
    { "dcNo": "DC-001", "qty": 80, "date": "...", "status": "Delivered" }
  ],
  "invoice": { "invoiceNo": "INV-001", "amount": 64000, "paid": 64000, "status": "Paid" },
  "profitAnalysis": {
    "estimatedCost": 500,
    "actualCost": 520,
    "sellingPrice": 800,
    "actualProfit": 280,
    "actualMargin": "35%",
    "totalQty": 80,
    "totalRevenue": 64000,
    "totalCost": 41600,
    "totalProfit": 22400
  }
}
```

---

## 🎨 FRONTEND CHANGES REQUIRED

### 1. Purchase Order Form
- Add product selector (dropdown from Sample Catalog with image preview)
- Add multi-row fabric items (fabric name, color, qty, rate per row)
- Show product image in PO detail view

### 2. Sampling Form
- Add product selector (from Sample Catalog)
- Show product image, costing details
- Add PP Sample type selector
- Add dual photo upload (Client Copy / Our Copy)
- Show sampling history per product

### 3. Sales Order Form
- Add product selector (from Sample Catalog with images + costing)
- Show product image per line item
- Add color-size matrix per item
- Auto-fill price from costing

### 4. Production Form
- Fix eligible orders list (show Confirmed orders)
- When selecting order, auto-fill product details
- Show production jobs grouped by product
- Add actual cost tracking fields

### 5. New: Product Lifecycle View
- New page/module: "Product Tracker"
- Search by styleNo → shows entire lifecycle
- Visual timeline: Sample → Costing → PO → GRN → Sampling → Order → Production → Dispatch → Invoice → Payment
- Profit analysis card at bottom

---

## 📅 IMPLEMENTATION ROADMAP

### Sprint 1: Core Product Linkage (P0)
**Goal:** Product ID flows from Sample → PO → GRN → Production

| Task | Files | Effort |
|------|-------|--------|
| Add styleNo/styleName to PO API + form | `api/purchase-orders/route.ts`, `modules/purchase-orders.tsx` | 4h |
| Add POItem table (multi-fabric/color) | `prisma/schema.prisma`, `api/purchase-orders/route.ts` | 4h |
| Fix Production eligibleOrders API | `api/production/eligible-orders/route.ts` | 2h |
| Fix Production job creation (link salesOrderId) | `api/production/route.ts`, `modules/production.tsx` | 3h |
| Add costSheetId to ProductionJob | `prisma/schema.prisma`, `api/production/route.ts` | 2h |

### Sprint 2: Sampling & Sales Order Enhancement (P1)
**Goal:** Sampling linked to product, Sales Order shows images + colors

| Task | Files | Effort |
|------|-------|--------|
| Add sampleId/styleNo to Sampling | `api/sampling/route.ts`, `modules/sampling.tsx` | 4h |
| Add dual photo upload (client/our) | `modules/sampling.tsx` | 3h |
| Add sampleId/image to SalesOrderItem | `api/orders/route.ts`, `modules/sales-orders.tsx` | 4h |
| Add color-size matrix to order items | `modules/sales-orders.tsx`, new `OrderItemColor` table | 6h |

### Sprint 3: Dispatch & Invoice (P2)
**Goal:** Production → Dispatch → Invoice → Payment tracking

| Task | Files | Effort |
|------|-------|--------|
| Add salesOrderId/productionJobId to Dispatch | `api/dispatch/route.ts` | 3h |
| Add DispatchItem table | `prisma/schema.prisma`, `api/dispatch/route.ts` | 4h |
| Create Invoice table + API | `api/invoices/route.ts` (new) | 6h |
| Create Payment table + API | `api/payments/route.ts` (new) | 4h |
| Add credit tracking (paymentTerms, dueDate) | Invoice model | 2h |

### Sprint 4: Product Lifecycle Tracker (P2)
**Goal:** One-page view of entire product journey + profit analysis

| Task | Files | Effort |
|------|-------|--------|
| Create Product Lifecycle API | `api/products/[styleNo]/lifecycle/route.ts` (new) | 6h |
| Create Product Tracker UI page | `modules/product-tracker.tsx` (new) | 8h |
| Add to sidebar | `components/app-sidebar.tsx` | 1h |
| Profit analysis calculation | In lifecycle API | 4h |

### Sprint 5: Actual Cost Tracking (P3)
**Goal:** Replace estimated costs with actual costs from PO/GRN/Production

| Task | Files | Effort |
|------|-------|--------|
| Calculate actual fabric cost from PO+GRN | In lifecycle API | 4h |
| Calculate actual labor cost from production | In lifecycle API | 3h |
| Compare estimated vs actual | In lifecycle API + UI | 3h |
| Profit variance analysis | In lifecycle API + UI | 3h |

---

## 🔑 KEY PRINCIPLES

1. **styleNo is the universal key** — Every table that relates to a product has a `styleNo` column
2. **costSheetId follows the product** — When costing is done, that ID propagates through PO, Sampling, Order, Production
3. **sampleId links to the original** — Sample Catalog is the source of truth for product images
4. **salesOrderId links orders to production** — Every production job traces back to a sales order
5. **Actual costs tracked separately** — Estimated (from costing) vs Actual (from PO+GRN+Production)
6. **Profit = Revenue - Actual Cost** — Not estimated cost, but REAL cost

---

## ✅ DEFINITION OF DONE

The system is complete when:
1. ✅ Create product "X" in Sample Catalog with photo
2. ✅ Create costing for "X" — auto-linked
3. ✅ Create PO for "X" — select product, order fabric per color
4. ✅ Receive fabric via GRN — linked to PO and product
5. ✅ Create PP Sample for "X" — linked to sample, dual photos
6. ✅ Create Sales Order for "X" — select from catalog, colors, auto-image
7. ✅ Create Production Job from Sales Order — auto-linked
8. ✅ Dispatch goods — linked to production + order
9. ✅ Generate Invoice — from dispatch, credit terms
10. ✅ Collect Payment — tracked, due date alerts
11. ✅ View Product Lifecycle — one page shows entire journey
12. ✅ See Actual Profit — real cost vs revenue, per product

---

## 📝 NOTES

- This document should be updated after each sprint completion
- Each sprint should be tested end-to-end via agent-browser
- Database migrations should be run via `bun run db:push`
- All new APIs should use the auto-ID wrapper in `supabase-db.ts`
- Company Settings (white-label) should be respected in all new PDFs
