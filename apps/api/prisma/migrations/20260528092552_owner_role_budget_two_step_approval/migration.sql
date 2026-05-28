-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE 'OWNER_APPROVED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PROJECT_OWNER';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "ownerApprovedAt" TIMESTAMP(3),
ADD COLUMN     "ownerApproverId" UUID,
ADD COLUMN     "rejectedById" UUID;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budget" DECIMAL(18,4),
ADD COLUMN     "budgetCurrency" CHAR(3),
ADD COLUMN     "ownerId" UUID;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ownerApproverId_fkey" FOREIGN KEY ("ownerApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
