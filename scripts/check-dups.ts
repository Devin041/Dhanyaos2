import { readFileSync, writeFileSync } from 'fs'

const envFile = readFileSync('/home/z/Dhanyaos2/.env', 'utf8')
const env: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('MISSING ENV'); process.exit(1) }

const H = { apikey: key, Authorization: `Bearer ${key}` }

// 1) Fetch ALL OrderItemColor rows (backup + analysis)
const oic: any[] = await fetch(`${url}/rest/v1/OrderItemColor?select=id,orderItemId,color,size,quantity,createdAt&order=id.asc&limit=1000`, { headers: H }).then(r => r.json())
writeFileSync('/home/z/Dhanyaos2/logs/orderitemcolor-backup.json', JSON.stringify(oic, null, 2))
console.log('OrderItemColor total rows:', oic.length)

// 2) Group by (orderItemId, color, size) — treat null/''/undefined size as ''
const groups = new Map<string, any[]>()
for (const r of oic) {
  const k = `${r.orderItemId}|${String(r.color ?? '')}|${String(r.size ?? '')}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k)!.push(r)
}
const dupGroups = [...groups.values()].filter(g => g.length > 1)
console.log('Unique (item,color,size) combos:', groups.size)
console.log('Dup groups:', dupGroups.length)

// 3) Which rows to delete: keep referenced-or-lowest, delete the rest
const jobs: any[] = await fetch(`${url}/rest/v1/ProductionJob?select=id,jobNo,orderItemColorId&orderItemColorId=not.is.null`, { headers: H }).then(r => r.json())
console.log('ProductionJobs referencing OrderItemColor:', jobs.length)
const referenced = new Set(jobs.map(j => j.orderItemColorId))

const toDelete: string[] = []
let extras = 0
for (const g of dupGroups) {
  const sorted = [...g].sort((a, b) => (a.id < b.id ? -1 : 1))
  // keep the referenced row if any, else lowest id
  const refRow = sorted.find(r => referenced.has(r.id))
  const keep = refRow ?? sorted[0]
  for (const r of sorted) {
    if (r.id !== keep.id) { toDelete.push(r.id); extras++ }
  }
  console.log(`  DUP: item=${g[0].orderItemId.slice(0, 8)} color="${g[0].color}" size="${g[0].size}" x${g.length} qty=[${g.map(x => x.quantity).join(',')}] -> keep ${refRow ? 'REFERENCED' : 'lowest'} ${keep.id.slice(0, 8)}, delete ${sorted.length - 1}`)
}
console.log('EXTRA rows to remove:', extras)

// 4) FK conflict check — would we delete any referenced row? (should be impossible given logic above)
const conflicts = toDelete.filter(id => referenced.has(id))
console.log('FK conflicts:', conflicts.length)

writeFileSync('/home/z/Dhanyaos2/logs/oic-to-delete.json', JSON.stringify(toDelete))
console.log('DRAFT delete list saved — NOT deleting in this script')
