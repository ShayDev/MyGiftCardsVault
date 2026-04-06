-- DropForeignKey (only if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'User_familyId_fkey' AND table_name = 'User') THEN
    ALTER TABLE "User" DROP CONSTRAINT "User_familyId_fkey";
  END IF;
END $$;

-- AlterTable FamilyGroup: add inviteCode if not exists, backfill, then set NOT NULL
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
UPDATE "FamilyGroup" SET "inviteCode" = gen_random_uuid()::text WHERE "inviteCode" IS NULL;
ALTER TABLE "FamilyGroup" ALTER COLUMN "inviteCode" SET NOT NULL;

-- AlterTable GiftCard: add columns if not exists
ALTER TABLE "GiftCard" ADD COLUMN IF NOT EXISTS "expiresAt" TEXT;
ALTER TABLE "GiftCard" ADD COLUMN IF NOT EXISTS "fullNumber" TEXT;
ALTER TABLE "GiftCard" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GiftCard" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "GiftCard" ALTER COLUMN "last4" SET NOT NULL;

-- AlterTable User: add clerkId if not exists, backfill, then set NOT NULL
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerkId" TEXT;
UPDATE "User" SET "clerkId" = gen_random_uuid()::text WHERE "clerkId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "clerkId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "familyId" DROP NOT NULL;

-- CreateIndex (only if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "FamilyGroup_inviteCode_key" ON "FamilyGroup"("inviteCode");
CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkId_key" ON "User"("clerkId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
