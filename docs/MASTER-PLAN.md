# 🏭 DHANYA OS — MASTER PLAN (Single Source of Truth)

> **Document**: Master plan — vision, current state, bug register, phase roadmap, scenarios, test scripts
> **Date**: 2026-09-03 (updated after E2E test + user's PDF error report)
> **Reference Test Case**: EL-025 Anarkali · Client: Patels · Supplier: Chirag Textile · Broker: PK Agency (2%) · 4 colors × 120 = 480 pcs
> **Status**: Planning document — development **NOT started yet** (awaiting founder go-ahead + decision confirmations)

---

## 1. VISION & PRODUCT GOAL

**Ek hi line me:** Garment manufacturing industry me kaam karne wale **owner ka END-TO-END FULL AUTOMATION** — sample se dispatch, dispatch se payment, payment se GST, GST se annual accounts — sab kuch itna automated ki owner sirf **decisions** le, **data entry ya yaad rakhna** nahi.

**Owner ki aaj ki zindagi (problem):**
- WhatsApp pe order, diary me payment, Excel me hisaab, dimaag me dates
- "Is order pe kitna kamaya?" — ka bina calculator nahi hota
- Cheque bounce ka pata tab tak nahi chalta jab bank phone na kare
- CA ko har mahine Excel bhejna, GST ka darr
- Vendor ko kab kitna dena hai — yaad rakhna padta hai

**Dhanya OS ki promise:**
- Har business event (payment, GRN, dispatch, invoice) **khud accounting me post** hoga
- System khud **alert** karega (payment due, ITC 180-din, cheque bounce, reorder)
- AI **advise** karegi (kisko pehle pay karna, kis customer ko credit dena)
- Har number **drill-down** ho sakta hai (P&L → voucher → invoice)
- EL-025 jaisa poora order-chain **ek hi product tracker** me dikhega

---

## 2. AUTOMATION LADDER (har module isi pe measure hota hai)

| Level | Naam | Matlab | Owner ko kya milta hai |
|---|---|---|---|
| **L0** | Record | Data entry hoti hai | Kaam ho gaya, par mehnat se |
| **L1** | Connect | Modules linked hain | Ek jagah entry, sab jagah dikhe |
| **L2** | Compute | Auto-calculation | Galat hisaab impossible |
| **L3** | Post | Event → khud journal likhe | Khaata khud-ba-khud bane |
| **L4** | Alert | System khud bataye | Owner ko yaad rakhna nahi padta |
| **L5** | Advise | AI bole kya karna hai | Decisions me partner |
| **L6** | Act | System khud kar de (WhatsApp/PDF) | Owner sirf approve kare |

**Aaj hum kahan hain:**
- Manufacturing chain (sample → dispatch): **L2 complete** ✅ (EL-025 me proven)
- Finance chain (payment → accounts → GST): **L0-L1 pe atke** ⚠️ (payment record hota hai, ledger me post NAHI hota)
- AI/Alert framework: **ready** (Founder/CFO/COO agents + notifications engine live hai), par real finance data ka intezaar

---

## 3. AAJ KA EXACT STATE (live audit 2026-09-03)

### 3.1 🟢 E2E-PROVEN MANUFACTURING MODULES (EL-025 flow me verified)

| Chain Step | Module | Automation | E2E Evidence |
|---|---|---|---|
| Sample → Style | Sample Catalog | L1 | EL-025 Approved, photo attached |
| Costing | Cost Sheet | L2 | ₹10,12,800 cost → ₹13,16,640 sell → 23.1% margin + PK Agency 2% = ₹26,332.80 |
| Quotation → Order | Sales Orders | L1 | SO-20260903-001, 480 pcs, 4-color matrix |
| Order → Jobs | Production | L2 | 4 color-wise jobs khud bane (RED/NAV/MAR/PIN × 120) |
| BOM | BOM | L2 | Georgette 6m+5%, lining 2m+5%, lace, accessories |
| PO | Purchase Orders | L2 | PO-20260903-001: 4×780m @ ₹150 = ₹4,68,000 + 5% GST = ₹4,91,400 |
| Receiving | GRN | L2 | GRN-20260903-001: 3,120m received, 7m reject (Red 2, Maroon 5) |
| Fabric Stock | Fabric Stock | L2 | Auto 4 color rows, lot numbers, avg cost ₹150, reject deducted |
| Fabric → Production | Fabric Issue | L2 | 756m/color, stock exact deduct, stage auto-advance |
| Job-work | Stage Tracking | L2 | Multi-vendor split (RED Embroidery 2-split proven) |
| Vendor bills | Vendor Bills | L2 | 9 bills auto ₹99,400 |
| QC | Quality Control | L2 | 4 Final Inspections, Maroon 118/2 |
| FG Stock | FG Bins | L2 | 120/120/118/120 @ cost ₹2,110, sell ₹2,743 |
| Dispatch | Dispatch | L2 | DSP-20260903-001: 478 pcs, FG deduct to 0 |
| Invoice | Invoices | L2 | INV-20260903-001: ₹14,68,492, IGST 12% per-item rounding |
| Payments (in) | Payments | L1 | ₹7,00,000 → Partial (par ledger me post nahi hota — Bug F1) |
| Tracking | Product Tracker | L2 | Full chain + target profit ₹3,03,840 |
| Costing (actual) | Job Costing | L2 | RED job est ₹2,53,200 vs actual ₹1,88,200 |

### 3.2 🟡 FINANCE MODULES — BUILT PAR BUGS KE SAATH (audit me pakde gaye — F-series)

| Module | Dikhta hai | Asli Problem (root cause verified) |
|---|---|---|
| Payments → Ledger | Payment entry + invoice status | **F1**: payments POST **AccountTransaction me post hi nahi karta** — ₹7L aya, Sep-2026 me cashIn=0. Accounts/cashflow/P&L sab andhe. L3 ki missing seed |
| GST Returns | GSTR-3B live | **F2**: cross-utilization missing — `netIGST = outputIGST − inputIGST` only. ₹1,57,338 dikhata hai; sahi = ₹1,57,338.48 − ₹23,400 = ₹1,33,938.48 (Sec 49(5)/Rule 88A: CGST+SGST credit IGST me use hota hai) |
| P&L Dashboard | Live P&L | **F3**: TARGET-based hai — revenue = SalesOrder.totalAmount (booking ₹14,74,637, invoice ₹14,68,492 nahi), COGS = cost-sheet target (₹10,12,800), indirectExpenses hamesha 0 |
| Vendor Bills | 9 bills, GST fields | **F4**: taxableAmount/GST amounts = 0 — bills excl-GST record hote hain, tax compute nahi hota |

### 3.3 🔴 MISSING MODULES (banana hai — Phase A-D)

- Supplier/PO/vendor-bill/broker **payments OUT** (paise dena) — /api/vendor-payments empty hai (feature ready, data 0)
- Payment **allocation engine** (kis invoice/bill ke against, FIFO + override)
- **Auto-ledger** (L3) — har event se double-entry journal
- Expense vouchers (direct/indirect) + recurring + petty cash
- GST register (invoice-wise), credit/debit notes, filing tracker, rate master
- Bank/cash books, cheque register (bounce lifecycle), TDS register
- Aging reports, reminders, statement PDFs, WhatsApp
- NET product P&L (overhead ke baad) + CASH view

---

## 4. 🐛 BUG REGISTER — USER's PDF REPORT (U-series, 2026-09-03) — ✅ ALL FIXED (commit f405cfc)

> Ye 5 bugs user ne UI me dekhe (PDF report). Root causes live-verified + **Phase 0 sprint me sab FIX ho chuke** (browser-verified on EL-025 data). Fix details neeche reference ke liye.

### U1 — PO me product photo/identity nahi dikh raha
**User ka shikaya (original):** "PO me nai dikh rha hai ki jo product ke against me hmne PO release kiya hai vo konsi product hai, yha pe photo fetch nai ho rha hai product ki id ke sath"

**Verification:**
- PO data me `styleNo: "EL-025"`, `styleName: "Anarkali"` **present hai** (live verified) — data problem nahi hai
- `/api/style-image?styleNo=EL-025` **perfect chalta hai** → Cloudinary URL + source: sample
- **Root cause (VIEW)**: PO list table me Product column hai hi nahi (columns: PO No | Supplier | Fabric | Qty | Unit | Rate | Total | Delivery | Status | Payment | Actions). PO detail sheet header me sirf PO number — koi Product card nahi

**Fix design:**
1. PO detail sheet ke top me **Product card** add karo: styleNo + styleName + photo (`/api/style-image?styleNo=...` se, 40px thumb) — PO.delivery-linked order ka product
2. PO list me **Product column**: 28px thumb + styleNo badge (fabric name ke sath)
3. Line Items me per-item style line already hai (`Style: EL-025`) — items me styleNo ensure karo creation pe
4. Fallback: styleNo null ho to salesOrderId → OrderItem.styleNo resolve karo (recent fix `1a2568f` isi chain ka hai)

**Files**: `src/components/modules/purchase-orders.tsx` (list columns + detail sheet) | Severity: HIGH (user-facing identity) | Effort: ~1-2 hrs

### U2 — PO details me 399% received (galat calculation)
**User ka shikaya (original):** "PO ki details me calculation thodi galt ho rhi hai... 780 mtr sirf aek product ka dikhta hai, total receive 3113 → 399% received — ye aek hi product ka calculation ho rha hai"

**Verification (live numbers):**
- PO-20260903-001: `quantity: 780` (**legacy header field = first item's qty**), `receivedQty: 3,113` (SAHI total)
- Items: 4 × 780 = 3,120 ordered (778/780/775/780 received — per-line sahi)
- View code (purchase-orders.tsx ~line 1846-1857): `selectedPO.receivedQty / selectedPO.quantity` = 3,113/780 = **399%** ← bug
- Backend GRN approve logic SAHI hai (header receivedQty=3,113, status=Partial — totalOrdered 3,120 se compare karta hai)

**Root cause**: PO POST creation pe multi-item PO me legacy `quantity` field = **first item qty** likhta hai (780), aur detail view **wahi legacy field** use karta hai progress ke liye.

**Fix design:**
1. **View fix (primary)**: detail sheet me `totalOrdered = items.length ? sum(items.quantity) : selectedPO.quantity` — "3,113 of 3,120 m (99.8%)" dikhana hai; Progress bar cap at 100%
2. **API fix (secondary)**: PO POST pe multi-item ho to `quantity` = sum(items) likhna chahiye (780 nahi, 3,120) — new POs ke liye seedhi seedhi
3. Per-line progress already sahi render hota hai (Received 778/780 ✓) — usko rakhna

**Files**: `src/components/modules/purchase-orders.tsx` (~L1846) + `src/app/api/purchase-orders/route.ts` (POST) | Severity: HIGH (galat number owner ko darata hai) | Effort: ~1 hr

### U3 — Fabric Stock me images nahi aa rahi
**User ka shikaya (original):** "Fabric stock me images correctly fetch nai ho rai hai ki konse product ke against konsa fabric receive hua hai"

**Verification (BADA WALA pakda):**
- Backend `_image` **OBJECT hai**: `{"url": "https://res.cloudinary.com/...", "source": "sample"}` (live JSON verified)
- Frontend type: `_image?: string | null` aur render: `<img src={item._image}>` → React object ko `[object Object]` bana deta hai → **broken image**
- Backend resolution khud SAHI kaam karta hai (EL-025 ke 4 rows me Cloudinary URL present)

**Root cause**: `batchResolveStyleImages()` `StyleImageResult {url, source}` object return karta hai; fabric-stock/grn routes usko direct `_image` me daal dete hain; view string expect karta hai. **Type mismatch.**

**Fix design (backend flatten — sabse saaf):**
1. `src/app/api/fabric-stock/route.ts` L73: `_image: s.styleNo ? imageMap[s.styleNo]?.url || null : null` (+ chaho to `_imageSource: imageMap[s.styleNo]?.source`)
2. Ye pattern **har route me** jahan `imageMap[...]` object directly `_image` me jaata hai — ek grep se sab pakdo: `grep -rn "imageMap\[" src/app/api/`
3. Ya frontend me `item._image?.url` — par backend flatten better (ek jagah fix, saare views theek)
4. **Style-image lib me hi helper add** kar sakte hain: `flattenImageMap()` — standardize

**Files**: `src/app/api/fabric-stock/route.ts`, `src/app/api/grn/route.ts` + `[id]/route.ts`, + grep sweep | Severity: HIGH (product identity har jagah) | Effort: ~1-2 hrs (sweep ke sath)

### U4 — GRN me product image nahi aa rahi
**User ka shikaya (original):** "GRN me bhi product image sahi se fetch nai ho rha hai jiske against goods receive hua hai"

**Verification:** Bilkul U3 jaisa — GRN route L116: `_image: poMap[g.poId]?.styleNo ? imageMap[poMap[g.poId].styleNo] || null : null` → object → `<img src={grn._image}>` broken. GRN-20260903-001 ka `_image` live check kiya: `{"url": "https://...cloudinary..."}` — URL milta hai, render nahi.

**Fix design**: U3 ke sweep me hi fix (same root cause). GRN list thumb (L940), GRN detail (L1335), PO-image section (L1088 — `poImage` yahan string hi hai, wo alag `/api/style-image` se aata hai, wo theek chalta hai).

**Files**: `src/app/api/grn/route.ts` + `[id]/route.ts` | Severity: HIGH | Effort: U3 ke sath included

### U5 — Inventory me EL-025 "Dispatch Ready" dikh raha hai jabki dispatch ho chuka + photo nahi hai
**User ka shikaya (original):** "Inventory me apna ye EL-025 vo dispatch ready dikha rha hai jabki vo to dispatch ho chuka hai, and product ki photo attached nai hai jo product ke against me hai"

**Verification (2 alag problems mile):**
- **(a) Stale status**: `/api/inventory` WIP rows: EL-025 ke 5 jobs (parent + 4 color) `stage: "Dispatch Ready"`, `status: "In Progress"`, `completedQty: 0` — **jabki DSP-20260903-001 Delivered hai aur FG bins 0 ho chuki hain**
- **Root cause**: `src/app/api/dispatch/route.ts` me **ProductionJob update ka koi code hi nahi hai** (grep me zero `update`/`ProductionJob` reference) — dispatch deliver hone par jobs ko Completed mark karne wala link missing hai
- **(b) No photo**: inventory route `FinishedGood.select('*')` — FG table me image field nahi, style-image resolve **call hi nahi hota**

**Fix design:**
1. **Dispatch [status→Delivered] handler me**: linked jobs (`dispatch.items → jobNo/productionJobId`) ko update karo → `status: "Completed"`, `stage: "Dispatched/Delivered"`, `completedQty += dispatchedQty`
2. **Inventory wipJobs query**: `Dispatch Ready` stage wale jobs WIP me isliye aate hain kyunki status In Progress hai — upar wale fix ke baad automatically WIP se nikal jayenge
3. **Inventory route**: FG rows + WIP rows ke liye `batchResolveStyleImages(styleNos)` → `_image` (string! — U3 wala flatten use karke) → view me thumb
4. **Edge case**: partial dispatch (job 120 me se 100 dispatch) → completedQty=100, status In Progress hi rahe; full → Completed
5. **Backfill migration**: E2E wale 5 jobs manually fix (SQL ya one-time script) — data already Delivered hai

**Files**: `src/app/api/dispatch/route.ts` (+ status route), `src/app/api/inventory/route.ts`, backfill SQL | Severity: **CRITICAL** (ye owner ko galat operational picture deta hai — "dispatch pending" jabki ho gaya) | Effort: ~3-4 hrs

### Observation (monitor, bug nahi)
- `/api/fabric-stock` ek baar 120s tak hang hua (doosri call pe turant 200). Likely dev-server cold compile ya Supabase latency. **Phase 0 me note: API timeouts pe p3-radar, agar dobara ho to Supabase connection pool/timeout config check**

---

## 5. 🐛 BUG REGISTER — FINANCE (F-series, audit se)

| # | Bug | Root Cause (verified) | Fix Design | Phase |
|---|---|---|---|---|
| **F1** | Payment → ledger post nahi hota | payments POST me AccountTransaction insert **hai hi nahi** | Har business event pe auto-journal: payment in (Dr Bank / Cr Receivable), payment out (Dr Payable / Cr Bank), invoice (Dr Receivable / Cr Sales + Cr GST-out), PO-bill (Dr Stock+ITC / Cr Payable), expense (Dr a/c / Cr Cash). **Double-entry Day-1** | **A** |
| **F2** | GST net payable galat | cross-utilization missing, sirf same-head minus | ✅ FIXED in Phase 0 (f405cfc) — Rule 88A sequential allocation live: 1,33,938 | IGST liability pehle CGST+SGST credit se kaato, phir IGST credit; formula: `netIGST = max(0, outIGST − inCGST − inSGST − inIGST)` → ₹1,33,938.48 | **B** |
| **F3** | P&L target-based hai | revenue=SalesOrder.totalAmount, COGS=target, indirect=0 | 3 views clearly label: TARGET (abhi wala) / ACTUAL (invoice-revenue − actual direct costs) / NET (− indirect). Bina label ke target ko actual mat dikhao | **C** |
| **F4** | Vendor bill GST 0 | compute nahi hota, excl-GST record | taxable = qty×rate; CGST/SGST ya IGST gstType ke hisab se; registered-vendor flag (unregistered = ITC nahi) | **B** |

---

## 6. PHASE ROADMAP (execution order — Phase 0 pehle, EL-025 har phase ka test-bed)

### ⚡ PHASE 0 — BUG-FIX SPRINT (U1-U5 + F2 quick-fix) — "~1 din"
> User-facing 5 bugs pehle saaf — kyunki ye **trust** ke bugs hain. Owner galat number (399%) ya broken photo dekhe to software pe bharosa karega kaise?
1. U3+U4: `_image` object→string flatten (all routes sweep) — sabse pehle, sabse easy
2. U2: PO progress items-total se (view + POST legacy field)
3. U1: PO product card + list column (photo + styleNo)
4. U5: dispatch→job Completed link + inventory images + E2E jobs backfill
5. F2 quick-fix: GST cross-utilization formula (1 line, B me full module bachega)
6. Monitor: fabric-stock timeout
**Definition of Done**: Browser me PO/GRN/Fabric-Stock/Inventory sab EL-025 real data pe sahi render — har number photo sahi, 99.8% progress, EL-025 WIP se gayab, FG me photo.

### 💰 PHASE A — "PAISA IN/OUT + AUTO-LEDGER" (L3 ki neev)
1. **F1 fix**: auto-journal engine (double-entry, har event) — chart of accounts Day-1
2. Supplier payments (PO pe Pay — full/part, advance) — /api/vendor-payments already scaffolded
3. Vendor-bill payments (per-bill allocation) + broker payout + TDS 194H (2% × ₹26,332.80 − 5% TDS = pay ₹25,016.16)
4. Cheque register: Issued → Deposited → Cleared/**BOUNCED** lifecycle + reversal entry
5. Bank/cash accounts + transfer entry (bank-accounts API ready hai, data 0)
6. Expense vouchers: **Direct (order-linked: freight, packing)** vs **Indirect (rent, salary)** + recurring
7. Allocation engine: payment → invoice/bill FIFO suggest + manual override
8. Cash-flow ko real events se feed (abhi 0 dikha raha hai)
**Test script (EL-025, isi order me):**
```
1. Patels +₹3,00,000 NEFT          → invoice Partial (₹4,68,492 baki)
2. Patels ₹2,00,000 cheque → BOUNCE → reversal + alert + follow-up
3. Patels ₹4,68,492 − ₹3,000 freight short-payment adjust → invoice PAID
4. Chirag ₹2,00,000 advance + ₹2,91,400 balance → PO Paid (₹4,91,400)
5. 7m reject debit note −₹1,050 negotiate → Chirag ledger adjust
6. 9 vendor bills pay (Zari ₹35,992 pehle — delivery rating) → per-bill alloc
7. PK Agency ₹25,016.16 pay + TDS ₹1,316.64 entry (realization-complete trigger)
8. Kharche: rent 25k, salary 40k, VRL freight 8.5k (DIRECT→order), packing 3k cash, chai 500 petty
9. Har step ke baad: ledger balanced? cash/bank book sahi? aging update?
```
**Definition of Done**: Patels ledger 0, Chirag ledger 0 (post debit-note), PK settled, trial balance me har journal double-entry, **CASH view: ₹7,00,000 in vs ₹7,51,071.28 out = −₹51,071 hole DIKHEGA** (red flag feature).

### 🧾 PHASE B — GST AUTOMATION (L2→L4)
1. GST register invoice-wise (B2B/B2C, HSN 6204, place of supply)
2. Credit/debit notes (returns, rate-diff) → output adjust
3. Vendor-bill GST compute (F4) + registered/unregistered flag
4. GSTR-1 + GSTR-3B export (CSV/PDF — filing-ready), filing calendar (11/20 tareekh) + status tracker
5. **Rule 37 ITC tracker**: Chirag ko 180 din me pay nahi → ₹23,400 credit reversal warning (auto-alert)
6. Rate master HSN-wise (georgette synthetic technically 12% vs 5% — configurable)
7. RCM (freight GTA), TDS register view
**Test script**: EL-025 Sep-2026 return — output ₹1,57,338.48, ITC ₹23,400, **net ₹1,33,938.48** (F2 fixed), payment voucher, 2 defective Maroon credit note (₹5,486+GST reverse).

### 📊 PHASE C — EXACT PRODUCT P&L + ACCOUNTING REPORTS (owner ka "kitna kamaya")
1. **Product P&L 4 views** (Product Tracker me):
   - TARGET: ₹3,03,840 / 23.1% (cost-sheet basis) — already hai
   - **ACTUAL-DIRECT**: revenue 478×2,743 = ₹13,11,154 − (fabric 3,024m×150 actual consumed + vendor bills 99,400 + in-house labor + broker 26,332.80 + freight 8,500) = ?
   - **NET**: actual − allocated indirect (rent/salary proportion ya flat)
   - **CASH**: in 7,00,000 − out 7,51,071 = −₹51,071 (collection gap highlight)
2. Variance per color (RED est 2,53,200 vs actual 1,88,200 — kyo sasta? Neha ₹175 vs Zari ₹180)
3. Party ledgers (Patels/Chirag/PK running statement) + **Statement of Account PDF**
4. Trial Balance → P&L → Balance Sheet, **drill-down** (number → voucher → INV-001)
5. Aging color-coded (0-30/30-60/60+), month-close wizard, closing stock valuation (89m fabric + 0 FG)
**Test**: teen P&L views live + Patels ledger 0 + TB balanced + drill-down INV-20260903-001 tak.

### 🤖 PHASE D — "OWNER HANDS-FREE" (L4-L6)
- Reminders + WhatsApp: payment receipt PDF, statement, GST due kal hai
- Credit scoring (Patels: 60d me kitna % time pe), vendor rating (Chirag: 7m reject = rating down, delivery on-time)
- Reorder points (89m left, next EL-025 order FIFO consume), capacity planning (workers/timesheets data hai)
- Repeat-Order Wizard (EL-025 poora chain 1-click), e-invoice/e-way (>₹5Cr/>₹50k), payment approval flow, multi-user roles, export orders (LUT)

---

## 7. SCENARIO CATALOGS (future-proofing — ye sab design me already covered hona chahiye)

### 7.1 Receivables — 13 scenarios
Advance | part-payment series | multi-mode (NEFT/UPI/cash/cheque/PDC) | **cheque bounce + reversal** | short-payment + reason | TDS 194C/194Q by customer | late-payment interest | over-payment→next advance | **sales return + credit note** | rate-diff claim | on-account (unknown allocation) | multi-invoice FIFO + override | PDC register

### 7.2 Payables — 12 scenarios
Supplier advance (Surat booking) | part-payment ledger | settlement rate-diff → **debit note** | vendor-bill per-bill allocation | job-work advance | **broker commission timing (policy: realization pe)** | broker TDS 194H 5% | freight hamara/unka + RCM | cash purchases (no-GST expense) | recurring (rent/salary) | petty imprest | payment approval flow

### 7.3 GST — 12 scenarios
Invoice-basis liability (regular scheme) vs cash-basis dashboard (dono views) | ITC 180-din Rule 37 | advance receipt tax | rate master synthetic 12% vs cotton 5% | credit note adjust | return reversal | intra vs interstate split | RCM freight | e-invoice/e-way scale | nil return + late fee | unregistered vendor = no ITC | export LUT

### 7.4 Accounting — 12 scenarios
Double-entry Day-1 | chart of accounts | party ledgers + statement PDF | cash + bank book + transfers | bank reconciliation | direct vs indirect expense classification | recurring auto-suggest | TB→P&L→BS | closing stock valuation | rounding/suspense | drill-down audit trail | founder dashboard (cash + bank + receivable + payable + GST due + top kharche + product profit + **cash-gap red flag**)

### 7.5 Product P&L edge cases
Commission basis lock (cost-sheet 480 = ₹26,332.80 vs delivered 478 = ₹26,223.08 — **recommendation: delivered pe**) | 2 defective Maroon (rework / scrap ₹4,220 loss / discount) | 89m leftover = next-order asset (FIFO carry) | wastage report (7m reject + 5% planned vs actual) | 2nd order same style weighted-avg cost | 4-color variance analysis

---

## 8. AUTOMATION MATRIX (owner manual → system auto) — PRODUCT KA CORE VALUE

| # | Owner aaj MANUALLY | Dhanya OS AUTOMATIC | Level | Phase |
|---|---|---|---|---|
| 1 | Payment mila → khaata + invoice tick | Entry → **ledger post + invoice + party ledger + cash view** | L3 | A |
| 2 | Vendor payment diary me | PO pe Pay → ledger + payable ghata + **180-din ITC warning** | L3 | A |
| 3 | Broker kab dena — dimaag me | Realization pe **payout + TDS auto-suggest** | L4 | A |
| 4 | CA ko GST Excel | **GSTR-3B khud** (cross-util fix) — download & file | L2 | B |
| 5 | Mahine ke kharche yaad rakhna | Recurring auto-suggest, 1-click month close | L4 | A |
| 6 | "Kitna kamaya?" calculator | **4 views P&L** (target/actual/net/cash) | L2 | C |
| 7 | Cheque deposit bhoolna | Register: deposit→clear/**bounce** auto-track + alert | L4 | A |
| 8 | Statement WhatsApp typing | **Statement PDF auto** → share | L6 | D |
| 9 | "Agla order dena chahiye?" intuition | **Credit score auto** | L5 | D |
| 10 | "Chirag ki quality?" yaad se | **Vendor rating** (reject% + on-time + rate) | L5 | D |
| 11 | Fabric khatam ka pata delivery pe | **Reorder alert + FIFO carry** | L4 | D |
| 12 | Repeat order — sab dobara | **1-click chain copy** | L6 | D |
| 13 | Late delivery customer call pe | **Overdue + delivery-risk auto-alert** | L4 | D |
| 14 | CA/bank ke liye reports | **TB/P&L/BS auto, drill-down** | L2 | C |

**Manufacturing side pe ye already automated hai** (competitors yahi nahi kar paate): GRN→stock→issue→consumption→costing→FG→invoice — **EL-025 me ek bhi number owner ne calculate nahi kiya tha.**

---

## 9. EL-025 MASTER TEST LEDGER (har phase isi se validate — Single Source of Truth)

```
COLLECTION SIDE:
  INV-20260903-001: ₹14,68,492 (taxable 13,11,154 + IGST 12% 1,57,338.48)
  Received: ₹7,00,000 (Partial) | Balance: ₹7,68,492
  → Phase A end pe: FULLY SETTLED (short-payment ke sath) = 0

PAYMENT SIDE (dues ₹7,51,071.28):
  Chirag Textile:  ₹4,91,400 (PO + 5% GST) [− debit note 1,050 = 4,90,350]
  9 vendor bills:  ₹99,400 (Sharma 14,400 / Zari 35,992 / Neha 49,008)
  PK Agency:       ₹26,332.80 (2% broker, −TDS 1,316.64 = pay 25,016.16)
  GST govt.:       ₹1,33,938.48 (output 1,57,338.48 − ITC 23,400)

PROFIT SIDE (4 views):
  TARGET:    ₹3,03,840 / 23.1% (cost-sheet) — already live
  ACTUAL:    revenue 13,11,154 − actual-direct (fabric consumed + vendors + labor + broker + freight) = Phase C me exact
  NET:       ACTUAL − indirect allocation (rent+salary+...) = Phase C
  CASH:      7,00,000 − 7,51,071.28 = −₹51,071.28 (THE red flag)

ASSETS LEFT:
  Fabric 89m (22+24+19+24) @ ₹150 ≈ ₹13,350 — next order asset
  2 defective Maroon (cost ₹4,220) — decision: rework/scrap/discount
```

---

## 10. FOUNDER DECISIONS (Phase A start se pehle — recommendation ke sath)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Purani 307 seed transactions | Fresh ledger start, purana archive |
| 2 | P&L presentation | TARGET vs ACTUAL alag-alag + variance view (merge nahi) |
| 3 | GST basis | Invoice-basis (legal) + cash-basis dashboard dono |
| 4 | Accounting depth | **Full double-entry Day-1** (retrofit 10x mehnga) |
| 5 | Payment allocation | FIFO suggest + manual override |
| 6 | Broker commission trigger | **Payment-realization pe**, configurable |
| 7 | Overhead product me | Direct→product; overheads separate monthly view (+optional % alloc) |
| 8 | TDS scope | Pehle broker 194H + customer-deducted; full module baad me |
| 9 | Cheque | Full register + bounce lifecycle |
| 10 | Cash vs Bank | Dono alag + transfer entry |
| 11 | Commission basis | Delivered qty (478) pe, cost-sheet (480) nahi |
| 12 | Financial year | Apr–Mar + opening-balance schema Day-1 |

---

## 11. DATA MODEL ADDITIONS (planned — Supabase, tabhi jab phase aaye)

```
Phase A: SupplierPayment (poId, amount, mode, allocation[]) · PaymentAllocation
         (paymentId → invoiceId/billId, amount) · ExpenseVoucher (direct/indirect,
         orderId?, recurring flag) · ChequeRegister (status lifecycle) ·
         JournalEntry + JournalLine (double-entry) · BankAccount (exists, fill data)
Phase B: GSTR filing status · CreditNote/DebitNote · GstRateMaster (HSN) ·
         Vendor.gstRegistered flag
Phase C: OverheadAllocationRule · Ledger view (derived) · ClosingStock snapshot
Phase D: ReminderLog · CreditScore (derived) · ApprovalFlow · UserRole
```
*(Exact columns phase-start pe design honge — ye outline hai.)*

---

## 12. VERIFICATION PROTOCOL (har phase ka "DONE" matlab)

1. **Unit numbers**: har calculation EL-025 ke hand-verified numbers se match (upar wale ledger se)
2. **Browser E2E** (agent-browser): golden path click-through + screenshots + console 0 errors
3. **VLM visual review**: overlap/broken/[object Object] check
4. **Lint**: `bun run lint` 0 errors
5. **Worklog**: har phase ka section + numbers ka evidence
6. **Git**: commit + push (repo clean)

---

*Ye document living hai — har phase ke baad update hota rahega. Development abhi start NAHI hua hai; founder ke "GO" + Section-10 decisions ke confirmation ka intezaar hai. Phase 0 (bug sprint) ko pehle green-light milna chahiye kyunki wahi user-facing trust hai.*
