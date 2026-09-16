-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentShiftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftNumber" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "openingCash" TEXT NOT NULL DEFAULT '0.00',
    "totalCashIn" TEXT NOT NULL DEFAULT '0.00',
    "totalCashOut" TEXT NOT NULL DEFAULT '0.00',
    "totalSalesCash" TEXT NOT NULL DEFAULT '0.00',
    "expectedCash" TEXT NOT NULL DEFAULT '0.00',
    "actualCash" TEXT,
    "differenceAmount" TEXT NOT NULL DEFAULT '0.00',
    "discrepancyJournalId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftCashMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_name_key" ON "CashRegister"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_currentShiftId_key" ON "CashRegister"("currentShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "CashShift_shiftNumber_key" ON "CashShift"("shiftNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CashShift_discrepancyJournalId_key" ON "CashShift"("discrepancyJournalId");

-- CreateIndex
CREATE INDEX "CashShift_registerId_idx" ON "CashShift"("registerId");

-- CreateIndex
CREATE INDEX "CashShift_status_idx" ON "CashShift"("status");

-- CreateIndex
CREATE INDEX "ShiftCashMovement_shiftId_idx" ON "ShiftCashMovement"("shiftId");
