/*
  Warnings:

  - Added the required column `stripePriceId` to the `Plan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeProductId` to the `Plan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalPriceId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeProductId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalSubscriptionId` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Plan_applicationId_idx";

-- DropIndex
DROP INDEX "Product_applicationId_idx";

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "stripePriceId" TEXT NOT NULL,
ADD COLUMN     "stripeProductId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "externalPriceId" TEXT NOT NULL,
ADD COLUMN     "stripeProductId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "externalSubscriptionId" TEXT NOT NULL,
ALTER COLUMN "endDate" DROP NOT NULL;
