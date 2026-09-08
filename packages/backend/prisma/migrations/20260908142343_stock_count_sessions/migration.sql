-- CreateTable
CREATE TABLE "StockCountSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "scope" TEXT NOT NULL DEFAULT 'FULL_STORE',
    "categoryId" TEXT,
    "notes" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "totalItemsExpected" INTEGER NOT NULL DEFAULT 0,
    "totalItemsCounted" INTEGER NOT NULL DEFAULT 0,
    "totalDiscrepancyQty" INTEGER NOT NULL DEFAULT 0,
    "totalFinancialVariance" TEXT NOT NULL DEFAULT '0.00',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER NOT NULL DEFAULT 0,
    "differenceQuantity" INTEGER NOT NULL,
    "unitCost" TEXT NOT NULL DEFAULT '0.00',
    "varianceValue" TEXT NOT NULL DEFAULT '0.00',
    "notes" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockCountItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StockCountSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCountItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StockCountSession_sessionNumber_key" ON "StockCountSession"("sessionNumber");

-- CreateIndex
CREATE INDEX "StockCountSession_status_createdAt_idx" ON "StockCountSession"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StockCountItem_sessionId_idx" ON "StockCountItem"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountItem_sessionId_inventoryItemId_key" ON "StockCountItem"("sessionId", "inventoryItemId");
