/*
  Warnings:

  - Added the required column `userId` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "AIModelPricing" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AIModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationUsage" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "aiModelPricingId" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIModelPricing_name_idx" ON "AIModelPricing"("name");

-- CreateIndex
CREATE INDEX "AIModelPricing_pricePerUnit_idx" ON "AIModelPricing"("pricePerUnit");

-- CreateIndex
CREATE INDEX "Application_apiKey_userId_idx" ON "Application"("apiKey", "userId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUsage" ADD CONSTRAINT "ApplicationUsage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUsage" ADD CONSTRAINT "ApplicationUsage_aiModelPricingId_fkey" FOREIGN KEY ("aiModelPricingId") REFERENCES "AIModelPricing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
