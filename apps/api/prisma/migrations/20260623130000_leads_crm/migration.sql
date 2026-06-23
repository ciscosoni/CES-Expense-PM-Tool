-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('GENERATED', 'QUALIFIED', 'INITIAL_CONTACT', 'SCHEDULE_APPOINTMENT', 'PROPOSAL_SENT', 'WIN', 'LOST');

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'GENERATED',
    "value" DECIMAL(14,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "source" TEXT,
    "category" TEXT,
    "ownerId" UUID,
    "notes" TEXT,
    "convertedClientId" UUID,
    "convertedProjectId" UUID,
    "wonAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
