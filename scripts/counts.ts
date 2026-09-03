// Count snapshot utility (Task 20) — prints exact table counts for E2E baseline/restore verification.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('/home/z/Dhanyaos2/.env', 'utf-8')
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const url = get('NEXT_PUBLIC_SUPABASE_URL')!
const key = get('SUPABASE_SERVICE_ROLE_KEY') || get('NEXT_PUBLIC_SUPABASE_ANON_KEY')!
const supabase = createClient(url, key, { auth: { persistSession: false } })

const tables = [
  'ProductionJob', 'StageTracking', 'QualityCheck', 'VendorBill',
  'FGStockMovement', 'FGStockBin', 'Vendor', 'Supplier', 'OrderItemColor', 'SalesOrder',
]

async function main() {
  const out: Record<string, number> = {}
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true })
    out[t] = count ?? -1
    if (error) console.error(`${t}: ${error.message}`)
  }
  console.log(JSON.stringify(out))
}

main()
