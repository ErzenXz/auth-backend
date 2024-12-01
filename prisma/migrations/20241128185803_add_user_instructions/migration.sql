-- CreateTable
CREATE TABLE "UserInstruction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "job" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserInstruction_userId_idx" ON "UserInstruction"("userId");

-- AddForeignKey
ALTER TABLE "UserInstruction" ADD CONSTRAINT "UserInstruction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
