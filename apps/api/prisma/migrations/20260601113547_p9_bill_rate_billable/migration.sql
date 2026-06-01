-- AlterTable
ALTER TABLE "TimeLog" ADD COLUMN     "billable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BillRate" (
    "id" UUID NOT NULL,
    "gradeId" UUID NOT NULL,
    "ratePerDay" DECIMAL(14,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,

    CONSTRAINT "BillRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillRate_gradeId_effectiveFrom_idx" ON "BillRate"("gradeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
