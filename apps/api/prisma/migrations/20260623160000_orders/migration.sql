-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('SALE', 'PURCHASE');
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "partyId" UUID,
    "projectId" UUID,
    "orderDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "items" JSONB NOT NULL DEFAULT '[]',
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_kind_status_idx" ON "Order"("kind", "status");
