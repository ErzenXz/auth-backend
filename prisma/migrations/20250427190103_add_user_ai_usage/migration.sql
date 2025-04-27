-- CreateTable
CREATE TABLE "UserSearchUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedRequests" INTEGER NOT NULL DEFAULT 0,
    "totalRequests" INTEGER NOT NULL DEFAULT 100,
    "resetDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSearchUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSearchUsage_userId_idx" ON "UserSearchUsage"("userId");

-- AddForeignKey
ALTER TABLE "UserSearchUsage" ADD CONSTRAINT "UserSearchUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
