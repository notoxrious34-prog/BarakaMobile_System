-- CreateTable
CREATE TABLE "SupplierDebtLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "balanceBefore" TEXT NOT NULL,
    "balanceAfter" TEXT NOT NULL,
    "relatedTransactionId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierDebtLedgerEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierDebtLedgerEntry_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SupplierDebtLedgerEntry_contactId_idx" ON "SupplierDebtLedgerEntry"("contactId");

-- CreateIndex
CREATE INDEX "SupplierDebtLedgerEntry_relatedTransactionId_idx" ON "SupplierDebtLedgerEntry"("relatedTransactionId");
