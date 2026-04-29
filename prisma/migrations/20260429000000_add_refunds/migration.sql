CREATE TABLE IF NOT EXISTS "Refund" (
  "id"          TEXT NOT NULL,
  "seq"         SERIAL,
  "familyId"    TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "amount"      DECIMAL(65,30) NOT NULL,
  "currency"    TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "referenceId" TEXT,
  "notes"       TEXT,
  "expiresAt"   TEXT,
  "receivedAt"  TIMESTAMP(3),
  "code"        TEXT,
  "link"        TEXT,
  "imageUrl"    TEXT,
  "usedAmount"  DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isUsed"      BOOLEAN NOT NULL DEFAULT false,
  "usedAt"      TIMESTAMP(3),
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
