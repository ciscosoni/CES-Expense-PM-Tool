-- CreateEnum
CREATE TYPE "ReceiptFlagKind" AS ENUM ('DUPLICATE_HASH', 'AMOUNT_OCR_MISMATCH', 'DATE_OUT_OF_TRIP', 'GPS_FAR_FROM_TRIP', 'SUSPICIOUS_VENDOR', 'NO_EXIF');

-- CreateEnum
CREATE TYPE "ReceiptFlagSeverity" AS ENUM ('INFO', 'WARN', 'BLOCK');

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "perceptualHash" CHAR(16),
    "exifTimestamp" TIMESTAMP(3),
    "exifLat" DECIMAL(9,6),
    "exifLng" DECIMAL(9,6),
    "ocrJson" JSONB,
    "ocrAmount" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptFlag" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "kind" "ReceiptFlagKind" NOT NULL,
    "severity" "ReceiptFlagSeverity" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_expenseId_idx" ON "Receipt"("expenseId");

-- CreateIndex
CREATE INDEX "Receipt_contentHash_idx" ON "Receipt"("contentHash");

-- CreateIndex
CREATE INDEX "Receipt_perceptualHash_idx" ON "Receipt"("perceptualHash");

-- CreateIndex
CREATE INDEX "ReceiptFlag_receiptId_idx" ON "ReceiptFlag"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptFlag_kind_idx" ON "ReceiptFlag"("kind");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptFlag" ADD CONSTRAINT "ReceiptFlag_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
