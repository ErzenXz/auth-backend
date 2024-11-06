-- CreateTable
CREATE TABLE "AllowedOrigins" (
    "id" SERIAL NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AllowedOrigins_pkey" PRIMARY KEY ("id")
);
