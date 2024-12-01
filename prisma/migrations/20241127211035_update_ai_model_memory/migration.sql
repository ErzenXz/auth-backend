/*
  Warnings:

  - A unique constraint covering the columns `[userId,key,value]` on the table `UserMemory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_key_value_key" ON "UserMemory"("userId", "key", "value");
