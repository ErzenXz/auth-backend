/*
  Warnings:

  - You are about to drop the column `stripePriceId` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `stripeProductId` on the `Plan` table. All the data in the column will be lost.
  - Added the required column `externalPriceId` to the `Plan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalProductId` to the `Plan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "stripePriceId",
DROP COLUMN "stripeProductId",
ADD COLUMN     "externalPriceId" TEXT NOT NULL,
ADD COLUMN     "externalProductId" TEXT NOT NULL;
