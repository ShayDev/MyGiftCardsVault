import prisma from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Provider" (
      "id"            TEXT        NOT NULL DEFAULT gen_random_uuid(),
      "type"          TEXT        NOT NULL,
      "name"          TEXT,
      "nameByCountry" TEXT,
      "country"       TEXT        NOT NULL DEFAULT 'IL',
      "familyId"      TEXT        NOT NULL DEFAULT '0',
      "createdBy"     TEXT,
      "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Provider_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Provider_name_check" CHECK ("name" IS NOT NULL OR "nameByCountry" IS NOT NULL)
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Provider_type_country_familyId_idx" ON "Provider" ("type", "country", "familyId")
  `)

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Provider_scope_name_unique"
      ON "Provider" ("type", "country", "familyId", lower(COALESCE("nameByCountry", "name")))
  `)

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Provider" ("type", "name", "nameByCountry") VALUES
      ('CARD', 'Amazon', 'אמזון'), ('CARD', 'Target', 'טארגט'), ('CARD', 'Starbucks', 'סטארבקס'),
      ('CARD', 'Apple', 'אפל'), ('CARD', 'Google Play', 'גוגל פליי'), ('CARD', 'Steam', 'סטים'),
      ('CARD', 'Netflix', 'נטפליקס'), ('CARD', 'IKEA', 'איקאה'), ('CARD', 'Zara', 'זארה'),
      ('CARD', 'Shufersal', 'שופרסל'), ('CARD', 'Rami Levy', 'רמי לוי'), ('CARD', 'Fox', 'פוקס'),
      ('CARD', 'Castro', 'קסטרו')
    ON CONFLICT DO NOTHING
  `)

  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) FROM "Provider"`)
  console.log('done — Provider table ready, rows:', rows[0].count.toString())
}

main().catch(console.error)
