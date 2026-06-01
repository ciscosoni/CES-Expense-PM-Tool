-- CreateTable
CREATE TABLE "AutoApprovalPolicy" (
    "id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxAmount" DECIMAL(14,4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "requireReceipt" BOOLEAN NOT NULL DEFAULT true,
    "requireNoFlags" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoApprovalPolicy_pkey" PRIMARY KEY ("id")
);
