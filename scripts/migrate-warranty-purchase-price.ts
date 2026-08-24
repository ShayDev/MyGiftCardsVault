// Follow-up ALTER for the Warranty table created by migrate-warranty.ts (that
// script's own CREATE TABLE is also updated to include these columns, for any
// future fresh install) — same "add a column after the table already exists"
// pattern as migrate-provider-balance-url.ts.
import prisma from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "Warranty" ADD COLUMN IF NOT EXISTS "purchasePrice" NUMERIC(65,30)`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Warranty" ADD COLUMN IF NOT EXISTS "currency" TEXT`)

  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) FROM "Warranty"`)
  console.log('done — Warranty.purchasePrice/currency ready, rows:', rows[0].count.toString())
}

main().catch(console.error)
