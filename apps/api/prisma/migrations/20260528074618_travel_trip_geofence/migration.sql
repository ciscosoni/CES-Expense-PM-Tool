-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('INTER_CITY', 'INTRA_CITY');

-- CreateEnum
CREATE TYPE "TravelStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED');

-- CreateTable
CREATE TABLE "Geofence" (
    "id" UUID NOT NULL,
    "projectSiteId" UUID NOT NULL,
    "centerLat" DECIMAL(9,6) NOT NULL,
    "centerLng" DECIMAL(9,6) NOT NULL,
    "radiusMeters" INTEGER NOT NULL,

    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "fromCityId" UUID NOT NULL,
    "toCityId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "travelClass" "TravelClass" NOT NULL,
    "tripType" "TripType" NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "TravelStatus" NOT NULL DEFAULT 'DRAFT',
    "approverId" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TravelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "travelRequestId" UUID NOT NULL,
    "actualStart" TIMESTAMP(3) NOT NULL,
    "actualEnd" TIMESTAMP(3),
    "gpsTrail" JSONB,
    "daEligibleDays" DECIMAL(6,2),
    "daAmount" DECIMAL(14,4),
    "daCurrency" CHAR(3),
    "daBreakdown" JSONB,
    "travelActualCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "lodgingActualCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "localConveyanceActualCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelRequest_userId_status_idx" ON "TravelRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "TravelRequest_projectId_status_idx" ON "TravelRequest"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_travelRequestId_key" ON "Trip"("travelRequestId");

-- AddForeignKey
ALTER TABLE "ProjectSite" ADD CONSTRAINT "ProjectSite_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_projectSiteId_fkey" FOREIGN KEY ("projectSiteId") REFERENCES "ProjectSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
