-- Sales Returns & RMA Management (TB-112 Pillar 3)
-- Enums: ReturnCondition, RefundMethod; extend CashMovementCategory with REFUND
-- Add Transaction.returnStatus
-- Create SalesReturn and SalesReturnItem
-- DISCLOSURE: SalesReturn.createdById is nullable String with no FK to User
-- DISCLOSURE: SalesReturn.shiftId is nullable String with no FK (PosShift does not exist)
-- DISCLOSURE: SalesReturnItem.inventoryItemId references Item (not InventoryItem)

ALTER TABLE "Transaction" ADD COLUMN "returnStatus" TEXT NOT NULL DEFAULT 'NONE';

-- CreateTable SalesReturn
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnNumber" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "customerId" TEXT,
    "refundAmount" TEXT NOT NULL,
    "refundMethod" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "shiftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesReturn_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesReturn_returnNumber_key" ON "SalesReturn"("returnNumber");
CREATE INDEX "SalesReturn_originalTransactionId_idx" ON "SalesReturn"("originalTransactionId");
CREATE INDEX "SalesReturn_customerId_idx" ON "SalesReturn"("customerId");
CREATE INDEX "SalesReturn_createdAt_idx" ON "SalesReturn"("createdAt");

-- CreateTable SalesReturnItem
CREATE TABLE "SalesReturnItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesReturnId" TEXT NOT NULL,
    "transactionItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "refundSubtotal" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "serialNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesReturnItem_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesReturnItem_transactionItemId_fkey" FOREIGN KEY ("transactionItemId") REFERENCES "TransactionItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesReturnItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SalesReturnItem_salesReturnId_idx" ON "SalesReturnItem"("salesReturnId");
CREATE INDEX "SalesReturnItem_transactionItemId_idx" ON "SalesReturnItem"("transactionItemId");
CREATE INDEX "SalesReturnItem_inventoryItemId_idx" ON "SalesReturnItem"("inventoryItemId");
