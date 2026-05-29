-- CreateTable
CREATE TABLE "UserLoginStat" (
    "clerkId"     TEXT NOT NULL,
    "loginCount"  INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLoginStat_pkey" PRIMARY KEY ("clerkId")
);
