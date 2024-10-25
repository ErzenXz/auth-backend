/*
  Warnings:

  - Changed the type of `settings` on the `UserPrivaySettings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "UserPrivaySettings" DROP COLUMN "settings",
ADD COLUMN     "settings" JSONB NOT NULL;
