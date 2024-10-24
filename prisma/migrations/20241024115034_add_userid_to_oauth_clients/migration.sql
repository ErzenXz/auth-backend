/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `OAuthClient` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `OAuthClient` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_userId_key" ON "OAuthClient"("userId");

-- AddForeignKey
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
