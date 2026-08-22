-- ============================================================
-- Dhanya OS Migration: Vendor GST + comprehensive fields
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Add gstNumber column to Vendor
ALTER TABLE "Vendor" 
ADD COLUMN IF NOT EXISTS "gstNumber" TEXT;

-- 2. Add address components (optional, for shipping/billing)
ALTER TABLE "Vendor" 
ADD COLUMN IF NOT EXISTS "state" TEXT;

-- 3. Verify
SELECT 
  'Vendor columns:' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns WHERE table_name = 'Vendor';

-- Expected: Vendor should now include "gstNumber" and "state"
