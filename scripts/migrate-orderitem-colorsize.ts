import { Client } from 'pg'

async function main() {
  // Use hostname — Node will resolve to IPv6 and connect over IPv6
  const client = new Client({
    host: 'db.uvlamiwykxekblposogn.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
    connectionTimeoutMillis: 20000,
  })
  try {
    await client.connect()
    console.log('Connected to Supabase Postgres')
    await client.query(`ALTER TABLE "OrderItemColor" ADD COLUMN IF NOT EXISTS "size" TEXT NOT NULL DEFAULT '-'`)
    console.log('Added size column to OrderItemColor')
    await client.query(`ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "productionQty" INTEGER NOT NULL DEFAULT 0`)
    console.log('Added productionQty column to OrderItem')
    await client.query(`ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "surplusQty" INTEGER NOT NULL DEFAULT 0`)
    console.log('Added surplusQty column to OrderItem')
    await client.end()
    console.log('Migration complete')
  } catch (e) {
    console.error('Migration failed:', e.message)
    process.exit(1)
  }
}
main()
