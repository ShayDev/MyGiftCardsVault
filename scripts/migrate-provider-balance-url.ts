import prisma from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "balanceCheckUrl" TEXT
  `)

  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) FROM "Provider"`)
  console.log('done — Provider.balanceCheckUrl ready, rows:', rows[0].count.toString())
}

main().catch(console.error)
