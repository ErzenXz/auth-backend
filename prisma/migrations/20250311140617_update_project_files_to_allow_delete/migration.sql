-- AlterTable
ALTER TABLE "AIProjectFile" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AIProjectFileVersion" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
