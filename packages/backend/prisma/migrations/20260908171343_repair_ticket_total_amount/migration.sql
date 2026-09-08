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
    "totalAmount" TEXT NOT NULL DEFAULT '0.00',
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
INSERT INTO "new_RepairTicket" ("accessories", "actualCost", "completedAt", "contactId", "createdAt", "deliveredAt", "depositAmount", "depositPaid", "deviceBrand", "deviceModel", "deviceType", "discountAmount", "estimatedCost", "externalCost", "hasPasscode", "id", "invoiceNumber", "isActive", "laborCost", "notes", "paidAmount", "partsCost", "partsTotal", "physicalCondition", "problemDescription", "receivedAt", "relatedTransactionId", "repairType", "status", "technicianName", "ticketNumber", "updatedAt") SELECT "accessories", "actualCost", "completedAt", "contactId", "createdAt", "deliveredAt", "depositAmount", "depositPaid", "deviceBrand", "deviceModel", "deviceType", "discountAmount", "estimatedCost", "externalCost", "hasPasscode", "id", "invoiceNumber", "isActive", "laborCost", "notes", "paidAmount", "partsCost", "partsTotal", "physicalCondition", "problemDescription", "receivedAt", "relatedTransactionId", "repairType", "status", "technicianName", "ticketNumber", "updatedAt" FROM "RepairTicket";
DROP TABLE "RepairTicket";
ALTER TABLE "new_RepairTicket" RENAME TO "RepairTicket";
CREATE UNIQUE INDEX "RepairTicket_ticketNumber_key" ON "RepairTicket"("ticketNumber");
CREATE UNIQUE INDEX "RepairTicket_invoiceNumber_key" ON "RepairTicket"("invoiceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
