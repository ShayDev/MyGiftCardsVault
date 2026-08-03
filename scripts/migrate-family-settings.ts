import prisma from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "settings" TEXT
  `)

  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) FROM "FamilyGroup"`)
  console.log('done — FamilyGroup.settings ready, rows:', rows[0].count.toString())
}

main().catch(console.error)
