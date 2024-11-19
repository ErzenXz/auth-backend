/*
  Warnings:

  - A unique constraint covering the columns `[ip]` on the table `IpLocation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "IpLocation_ip_key" ON "IpLocation"("ip");
