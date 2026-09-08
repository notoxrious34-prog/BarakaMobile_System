-- Add creditLimit to Contact, extend CashMovementCategory, create CustomerDebtLedgerEntry
ALTER TABLE "Contact" ADD COLUMN "creditLimit" TEXT NOT NULL DEFAULT '0.00';

-- CreateTable CustomerDebtLedgerEntry
CREATE TABLE "CustomerDebtLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "balanceBefore" TEXT NOT NULL,
    "balanceAfter" TEXT NOT NULL,
    "relatedTransactionId" TEXT,
    "relatedRepairTicketId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerDebtLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerDebtLedgerEntry_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerDebtLedgerEntry_relatedRepairTicketId_fkey" FOREIGN KEY ("relatedRepairTicketId") REFERENCES "RepairTicket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CustomerDebtLedgerEntry_customerId_idx" ON "CustomerDebtLedgerEntry"("customerId");
CREATE INDEX "CustomerDebtLedgerEntry_relatedTransactionId_idx" ON "CustomerDebtLedgerEntry"("relatedTransactionId");
CREATE INDEX "CustomerDebtLedgerEntry_relatedRepairTicketId_idx" ON "CustomerDebtLedgerEntry"("relatedRepairTicketId");
