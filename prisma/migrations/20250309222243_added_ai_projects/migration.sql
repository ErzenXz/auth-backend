-- AlterTable
ALTER TABLE "AIThread" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "AIProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProjectCollaborator" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "AIProjectCollaborator_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "AIProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProjectFileVersion" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "commitMsg" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIProjectFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIProject_ownerId_idx" ON "AIProject"("ownerId");

-- CreateIndex
CREATE INDEX "AIProjectFile_projectId_idx" ON "AIProjectFile"("projectId");

-- CreateIndex
CREATE INDEX "AIProjectFile_path_idx" ON "AIProjectFile"("path");

-- CreateIndex
CREATE INDEX "AIProjectFileVersion_fileId_idx" ON "AIProjectFileVersion"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "AIProjectFileVersion_fileId_version_key" ON "AIProjectFileVersion"("fileId", "version");

-- AddForeignKey
ALTER TABLE "AIThread" ADD CONSTRAINT "AIThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AIProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProject" ADD CONSTRAINT "AIProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProjectCollaborator" ADD CONSTRAINT "AIProjectCollaborator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AIProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProjectCollaborator" ADD CONSTRAINT "AIProjectCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProjectFile" ADD CONSTRAINT "AIProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AIProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProjectFile" ADD CONSTRAINT "AIProjectFile_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "AIProjectFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProjectFileVersion" ADD CONSTRAINT "AIProjectFileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "AIProjectFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProjectFileVersion" ADD CONSTRAINT "AIProjectFileVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
