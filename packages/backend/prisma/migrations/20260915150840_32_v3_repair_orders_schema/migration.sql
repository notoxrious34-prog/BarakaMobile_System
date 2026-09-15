-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialOrImei" TEXT,
    "reportedIssue" TEXT NOT NULL,
    "diagnosisNotes" TEXT,
    "technicianNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "assignedTechnicianId" TEXT,
    "estimatedCost" TEXT NOT NULL DEFAULT '0.00',
    "laborPrice" TEXT NOT NULL DEFAULT '0.00',
    "partsPriceTotal" TEXT NOT NULL DEFAULT '0.00',
    "discountAmount" TEXT NOT NULL DEFAULT '0.00',
    "totalAmount" TEXT NOT NULL DEFAULT '0.00',
    "paidAmount" TEXT NOT NULL DEFAULT '0.00',
    "outstandingAmount" TEXT NOT NULL DEFAULT '0.00',
    "businessDocumentId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" DATETIME,
    "deliveredAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairOrder_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RepairOrder_businessDocumentId_fkey" FOREIGN KEY ("businessDocumentId") REFERENCES "BusinessDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairOrderPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repairOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" TEXT NOT NULL,
    "totalCost" TEXT NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "totalPrice" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONSUMED',
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" DATETIME,
    CONSTRAINT "RepairOrderPart_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepairOrderPart_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "repairOrderId" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "walletId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentAllocation" ("amount", "createdAt", "documentId", "id", "paymentMethod", "repairOrderId", "walletId") SELECT "amount", "createdAt", "documentId", "id", "paymentMethod", "repairOrderId", "walletId" FROM "PaymentAllocation";
DROP TABLE "PaymentAllocation";
ALTER TABLE "new_PaymentAllocation" RENAME TO "PaymentAllocation";
CREATE INDEX "PaymentAllocation_documentId_idx" ON "PaymentAllocation"("documentId");
CREATE INDEX "PaymentAllocation_repairOrderId_idx" ON "PaymentAllocation"("repairOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_orderNumber_key" ON "RepairOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_businessDocumentId_key" ON "RepairOrder"("businessDocumentId");

-- CreateIndex
CREATE INDEX "RepairOrder_status_createdAt_idx" ON "RepairOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RepairOrder_partyId_idx" ON "RepairOrder"("partyId");

-- CreateIndex
CREATE INDEX "RepairOrderPart_repairOrderId_idx" ON "RepairOrderPart"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderPart_itemId_idx" ON "RepairOrderPart"("itemId");
