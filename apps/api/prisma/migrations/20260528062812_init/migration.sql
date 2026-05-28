-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'APPROVER', 'ENGINEER');

-- CreateEnum
CREATE TYPE "CityTier" AS ENUM ('METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "TravelClass" AS ENUM ('FLIGHT_ECONOMY', 'FLIGHT_BUSINESS', 'TRAIN_3AC', 'TRAIN_2AC', 'TRAIN_1AC', 'BUS_AC', 'TAXI');

-- CreateEnum
CREATE TYPE "ClientKind" AS ENUM ('SI', 'OEM');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('ACI', 'NON_ACI', 'SD_WAN', 'SECURITY', 'AUDIT', 'MANAGED_SERVICES');

-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('FIXED_PRICE', 'T_AND_M', 'MILESTONE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "azureOid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "managerId" UUID,
    "gradeId" UUID,
    "roles" "UserRole"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seniorityOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRate" (
    "id" UUID NOT NULL,
    "gradeId" UUID NOT NULL,
    "ratePerDay" DECIMAL(14,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,

    CONSTRAINT "CostRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "tier" "CityTier" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementMatrixRow" (
    "id" UUID NOT NULL,
    "gradeId" UUID NOT NULL,
    "cityTier" "CityTier" NOT NULL,
    "perDiemAmount" DECIMAL(14,4) NOT NULL,
    "perDiemCurrency" CHAR(3) NOT NULL,
    "lodgingCapPerNight" DECIMAL(14,4) NOT NULL,
    "lodgingCurrency" CHAR(3) NOT NULL,
    "travelClass" "TravelClass" NOT NULL,
    "localConveyanceCapPerDay" DECIMAL(14,4) NOT NULL,
    "localConveyanceCurrency" CHAR(3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,

    CONSTRAINT "EntitlementMatrixRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaPolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "partialDayPercent" DECIMAL(5,4) NOT NULL,
    "intraCitySameDayPaysDa" BOOLEAN NOT NULL,
    "effectiveFrom" DATE NOT NULL,

    CONSTRAINT "DaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ClientKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndCustomer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EndCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "endCustomerId" UUID,
    "whiteLabel" BOOLEAN NOT NULL DEFAULT false,
    "category" "ProjectCategory" NOT NULL,
    "billingModel" "BillingModel" NOT NULL,
    "contractValue" DECIMAL(18,4) NOT NULL,
    "contractCurrency" CHAR(3) NOT NULL,
    "includesPassthrough" BOOLEAN NOT NULL DEFAULT false,
    "pmId" UUID NOT NULL,
    "plannedStart" DATE NOT NULL,
    "plannedEnd" DATE NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSite" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteName" TEXT NOT NULL,
    "cityId" UUID NOT NULL,
    "address" TEXT,

    CONSTRAINT "ProjectSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "plannedDate" DATE NOT NULL,
    "signedOffDate" DATE,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_azureOid_key" ON "User"("azureOid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_code_key" ON "Grade"("code");

-- CreateIndex
CREATE INDEX "CostRate_gradeId_effectiveFrom_idx" ON "CostRate"("gradeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_country_key" ON "City"("name", "country");

-- CreateIndex
CREATE INDEX "EntitlementMatrixRow_gradeId_cityTier_effectiveFrom_idx" ON "EntitlementMatrixRow"("gradeId", "cityTier", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EndCustomer_name_key" ON "EndCustomer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRate" ADD CONSTRAINT "CostRate_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementMatrixRow" ADD CONSTRAINT "EntitlementMatrixRow_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_endCustomerId_fkey" FOREIGN KEY ("endCustomerId") REFERENCES "EndCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSite" ADD CONSTRAINT "ProjectSite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
