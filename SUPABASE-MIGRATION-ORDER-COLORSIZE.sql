-- ============================================================
-- Dhanya OS Migration: OrderItem Color×Size + Production Qty
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Add size column to OrderItemColor (color×size×qty matrix)
ALTER TABLE "OrderItemColor" 
ADD COLUMN IF NOT EXISTS "size" TEXT NOT NULL DEFAULT '-';

-- 2. Add production planning columns to OrderItem
-- productionQty = what will actually be manufactured (can be > client order qty)
ALTER TABLE "OrderItem" 
ADD COLUMN IF NOT EXISTS "productionQty" INTEGER NOT NULL DEFAULT 0;

-- surplusQty = productionQty - quantity (extra pieces that go to FG inventory)
ALTER TABLE "OrderItem" 
ADD COLUMN IF NOT EXISTS "surplusQty" INTEGER NOT NULL DEFAULT 0;

-- 3. Verify
SELECT 
  'OrderItemColor columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'OrderItemColor'
UNION ALL
SELECT 
  'OrderItem columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'OrderItem';

-- Expected: OrderItemColor should include "size", OrderItem should include "productionQty" and "surplusQty"
