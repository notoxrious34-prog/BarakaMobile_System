-- CreateTable
CREATE TABLE "RepairTicket" (
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
    "invoiceNumber" TEXT,
    "relatedTransactionId" TEXT,
    "notes" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairTicket_ticketNumber_key" ON "RepairTicket"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RepairTicket_invoiceNumber_key" ON "RepairTicket"("invoiceNumber");
