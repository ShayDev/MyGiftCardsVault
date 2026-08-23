import prisma from "../lib/prisma";

async function main() {
  // Same name/nameByCountry/country shape as Provider (migrate-provider.ts) —
  // at least one of name/nameByCountry must be set, enforced via CHECK.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarrantyProvider" (
      "id"            TEXT        NOT NULL DEFAULT gen_random_uuid(),
      "familyId"      TEXT        NOT NULL DEFAULT '0',
      "name"          TEXT,
      "nameByCountry" TEXT,
      "country"       TEXT        NOT NULL DEFAULT 'IL',
      "phone"         TEXT,
      "url"           TEXT,
      "createdBy"     TEXT,
      "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "WarrantyProvider_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WarrantyProvider_name_check" CHECK ("name" IS NOT NULL OR "nameByCountry" IS NOT NULL)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WarrantyProvider_familyId_idx" ON "WarrantyProvider" ("familyId")
  `);

  // Backstop against races in ensureWarrantyProviderExists (app/warranties/actions.ts),
  // which already does its own case-insensitive existing-row check first — same
  // belt-and-suspenders pattern as Provider_scope_name_unique in migrate-provider.ts.
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyProvider_scope_name_unique"
      ON "WarrantyProvider" ("country", "familyId", lower(COALESCE("nameByCountry", "name")))
  `);

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS "Warranty_seq_seq"`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Warranty" (
      "id"                TEXT        NOT NULL DEFAULT gen_random_uuid(),
      "seq"               INTEGER     NOT NULL DEFAULT nextval('"Warranty_seq_seq"'),
      "familyId"          TEXT        NOT NULL,
      "productName"       TEXT        NOT NULL,
      "purchasedFromId"   TEXT        NOT NULL,
      "branch"            TEXT,
      "warrantyCompanyId" TEXT,
      "purchaseDate"      TIMESTAMPTZ,
      "durationMonths"    INTEGER,
      "expiresAt"         TIMESTAMPTZ,
      "referenceId"       TEXT,
      "notes"             TEXT,
      "link"              TEXT,
      "imageUrl"          TEXT,
      "isActive"          BOOLEAN     NOT NULL DEFAULT true,
      "createdBy"         TEXT,
      "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Warranty_familyId_fkey" FOREIGN KEY ("familyId")
        REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Warranty_purchasedFromId_fkey" FOREIGN KEY ("purchasedFromId")
        REFERENCES "WarrantyProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Warranty_warrantyCompanyId_fkey" FOREIGN KEY ("warrantyCompanyId")
        REFERENCES "WarrantyProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  const providerRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) FROM "WarrantyProvider"`,
  );
  const warrantyRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) FROM "Warranty"`,
  );
  console.log(
    "done — WarrantyProvider rows:",
    providerRows[0].count.toString(),
    "| Warranty rows:",
    warrantyRows[0].count.toString(),
  );
}

main().catch(console.error);
