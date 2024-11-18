-- CreateTable
CREATE TABLE "IpLocation" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "isp" TEXT NOT NULL,
    "asn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpLocation_ip_idx" ON "IpLocation"("ip");

-- CreateIndex
CREATE INDEX "IpLocation_latitude_idx" ON "IpLocation"("latitude");

-- CreateIndex
CREATE INDEX "IpLocation_longitude_idx" ON "IpLocation"("longitude");
