-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_familyId_fkey";

-- AlterTable
ALTER TABLE "FamilyGroup" ADD COLUMN "inviteCode" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GiftCard" ADD COLUMN "expiresAt" TEXT,
ADD COLUMN "fullNumber" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notes" TEXT,
ALTER COLUMN "last4" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "clerkId" TEXT NOT NULL,
ALTER COLUMN "familyId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FamilyGroup_inviteCode_key" ON "FamilyGroup"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
