/*
  Warnings:

  - A unique constraint covering the columns `[userId,key]` on the table `UserMemory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserMemory_userId_key_value_key";

-- CreateIndex
CREATE INDEX "UserMemory_userId_key_idx" ON "UserMemory"("userId", "key");

-- CreateIndex
CREATE INDEX "UserMemory_userId_idx" ON "UserMemory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_key_key" ON "UserMemory"("userId", "key");
