-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "invoiceNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_invoiceNumber_key" ON "Transaction"("invoiceNumber");
