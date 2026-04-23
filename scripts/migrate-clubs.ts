import prisma from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "ClubMember_seq_seq"`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ClubMember" (
      "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
      "seq"       INTEGER     NOT NULL DEFAULT nextval('"ClubMember_seq_seq"'),
      "familyId"  TEXT        NOT NULL,
      "name"      TEXT        NOT NULL,
      "provider"  TEXT        NOT NULL,
      "memberId"  TEXT,
      "ownerName" TEXT,
      "idType"    TEXT,
      "expiresAt" TEXT,
      "notes"     TEXT,
      "isActive"  BOOLEAN     NOT NULL DEFAULT true,
      "createdBy" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ClubMember_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ClubMember_familyId_fkey" FOREIGN KEY ("familyId")
        REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)

  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) FROM "ClubMember"`)
  console.log('done — ClubMember table ready, rows:', rows[0].count.toString())
}

main().catch(console.error)
