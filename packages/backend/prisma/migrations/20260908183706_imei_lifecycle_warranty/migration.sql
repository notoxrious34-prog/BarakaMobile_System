-- CreateTable
CREATE TABLE "DeviceSerial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imei1" TEXT NOT NULL,
    "imei2" TEXT,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "supplierContactId" TEXT,
    "purchaseInvoiceRef" TEXT,
    "purchaseCost" TEXT,
    "saleInvoiceId" TEXT,
    "saleDate" DATETIME,
    "customerContactId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 12,
    "warrantyExpiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceSerial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceLifecycleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceSerialId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "operatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceLifecycleEvent_deviceSerialId_fkey" FOREIGN KEY ("deviceSerialId") REFERENCES "DeviceSerial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimNumber" TEXT NOT NULL,
    "deviceSerialId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "reportedIssue" TEXT NOT NULL,
    "technicianVerdict" TEXT,
    "actionTaken" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "operatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WarrantyClaim_deviceSerialId_fkey" FOREIGN KEY ("deviceSerialId") REFERENCES "DeviceSerial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSerial_imei1_key" ON "DeviceSerial"("imei1");

-- CreateIndex
CREATE INDEX "DeviceSerial_status_idx" ON "DeviceSerial"("status");

-- CreateIndex
CREATE INDEX "DeviceSerial_itemId_idx" ON "DeviceSerial"("itemId");

-- CreateIndex
CREATE INDEX "DeviceLifecycleEvent_deviceSerialId_createdAt_idx" ON "DeviceLifecycleEvent"("deviceSerialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_claimNumber_key" ON "WarrantyClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "WarrantyClaim_deviceSerialId_idx" ON "WarrantyClaim"("deviceSerialId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_isResolved_idx" ON "WarrantyClaim"("isResolved");
