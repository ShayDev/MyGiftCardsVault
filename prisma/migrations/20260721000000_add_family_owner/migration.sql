-- AlterTable FamilyGroup: add ownerId, backfill from current owner rows, then enforce NOT NULL + UNIQUE
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

UPDATE "FamilyGroup" fg
SET "ownerId" = u.id
FROM "User" u
WHERE u."familyId" = fg.id AND u.role = 'owner' AND fg."ownerId" IS NULL;

ALTER TABLE "FamilyGroup" ALTER COLUMN "ownerId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "FamilyGroup_ownerId_key" ON "FamilyGroup"("ownerId");

-- AddForeignKey (only if it doesn't exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FamilyGroup_ownerId_fkey' AND table_name = 'FamilyGroup') THEN
    ALTER TABLE "FamilyGroup" ADD CONSTRAINT "FamilyGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
