-- CreateTable
CREATE TABLE "RepairPartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostPrice" TEXT NOT NULL DEFAULT '0.00',
    "unitPrice" TEXT NOT NULL DEFAULT '0.00',
    "totalCost" TEXT NOT NULL DEFAULT '0.00',
    "totalPrice" TEXT NOT NULL DEFAULT '0.00',
    "stockMovementId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairPartItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "RepairTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepairPartItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepairTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "deviceBrand" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "problemDescription" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "repairType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "technicianName" TEXT,
    "estimatedCost" TEXT NOT NULL DEFAULT '0.00',
    "actualCost" TEXT NOT NULL DEFAULT '0.00',
    "externalCost" TEXT NOT NULL DEFAULT '0.00',
    "depositAmount" TEXT NOT NULL DEFAULT '0.00',
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "laborCost" TEXT NOT NULL DEFAULT '0.00',
    "partsCost" TEXT NOT NULL DEFAULT '0.00',
    "partsTotal" TEXT NOT NULL DEFAULT '0.00',
    "discountAmount" TEXT NOT NULL DEFAULT '0.00',
    "paidAmount" TEXT NOT NULL DEFAULT '0.00',
    "completedAt" DATETIME,
    "invoiceNumber" TEXT,
    "relatedTransactionId" TEXT,
    "notes" TEXT,
    "physicalCondition" TEXT,
    "hasPasscode" BOOLEAN NOT NULL DEFAULT false,
    "accessories" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RepairTicket" ("accessories", "actualCost", "contactId", "createdAt", "deliveredAt", "depositAmount", "depositPaid", "deviceBrand", "deviceModel", "deviceType", "estimatedCost", "externalCost", "hasPasscode", "id", "invoiceNumber", "isActive", "notes", "physicalCondition", "problemDescription", "receivedAt", "relatedTransactionId", "repairType", "status", "technicianName", "ticketNumber", "updatedAt") SELECT "accessories", "actualCost", "contactId", "createdAt", "deliveredAt", "depositAmount", "depositPaid", "deviceBrand", "deviceModel", "deviceType", "estimatedCost", "externalCost", "hasPasscode", "id", "invoiceNumber", "isActive", "notes", "physicalCondition", "problemDescription", "receivedAt", "relatedTransactionId", "repairType", "status", "technicianName", "ticketNumber", "updatedAt" FROM "RepairTicket";
DROP TABLE "RepairTicket";
ALTER TABLE "new_RepairTicket" RENAME TO "RepairTicket";
CREATE UNIQUE INDEX "RepairTicket_ticketNumber_key" ON "RepairTicket"("ticketNumber");
CREATE UNIQUE INDEX "RepairTicket_invoiceNumber_key" ON "RepairTicket"("invoiceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RepairPartItem_ticketId_idx" ON "RepairPartItem"("ticketId");

-- CreateIndex
CREATE INDEX "RepairPartItem_inventoryItemId_idx" ON "RepairPartItem"("inventoryItemId");
