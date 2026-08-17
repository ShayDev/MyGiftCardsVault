-- Backfills a CREATE TABLE step that was never captured in migration history —
-- ClubMember exists in real databases already (created out-of-band at some point),
-- but no prior migration ever created it, which breaks `prisma migrate dev`'s shadow
-- database replay (20260725000000_expires_at_to_datetime ALTERs this table). IF NOT
-- EXISTS makes this a no-op against any database where the table already exists.
-- expiresAt is TEXT here (not TIMESTAMP) to match the schema's shape at this point in
-- history — 20260725000000 converts it, same as it does for GiftCard/Refund/Voucher.
CREATE TABLE IF NOT EXISTS "ClubMember" (
  "id"        TEXT NOT NULL,
  "seq"       SERIAL,
  "familyId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "provider"  TEXT NOT NULL,
  "memberId"  TEXT,
  "ownerName" TEXT,
  "idType"    TEXT,
  "expiresAt" TEXT,
  "notes"     TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubMember_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ClubMember_familyId_fkey' AND table_name = 'ClubMember') THEN
    ALTER TABLE "ClubMember" ADD CONSTRAINT "ClubMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
