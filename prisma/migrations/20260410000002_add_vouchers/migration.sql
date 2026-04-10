CREATE TABLE IF NOT EXISTS "Voucher" (
  "id"         TEXT NOT NULL,
  "seq"        SERIAL,
  "familyId"   TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "provider"   TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "value"      DECIMAL(65,30),
  "expiresAt"  TEXT,
  "notes"      TEXT,
  "isUsed"     BOOLEAN NOT NULL DEFAULT false,
  "usedAt"     TIMESTAMP(3),
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
