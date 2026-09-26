-- AlterTable
ALTER TABLE "User" ALTER COLUMN "steamId" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateTable
CREATE TABLE "SkinLoadout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "error" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkinLoadout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkinLoadout_userId_key" ON "SkinLoadout"("userId");
CREATE UNIQUE INDEX "SkinLoadout_steamId_key" ON "SkinLoadout"("steamId");

ALTER TABLE "SkinLoadout" ADD CONSTRAINT "SkinLoadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
