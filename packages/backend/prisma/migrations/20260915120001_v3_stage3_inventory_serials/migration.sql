-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "costPrice" TEXT NOT NULL DEFAULT '0.00',
    "sellingPrice" TEXT NOT NULL DEFAULT '0.00',
    "minStockLevel" INTEGER NOT NULL DEFAULT 0,
    "isSerialized" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" TEXT NOT NULL,
    "totalCost" TEXT NOT NULL,
    "balanceAfterQty" INTEGER NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerializedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imei1" TEXT NOT NULL,
    "imei2" TEXT,
    "itemId" TEXT NOT NULL,
    "acquisitionCost" TEXT NOT NULL,
    "currentStatus" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "warrantyMonths" INTEGER NOT NULL DEFAULT 12,
    "warrantyEndsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SerializedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SerializedLifecycleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serialId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SerializedLifecycleEvent_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerializedItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_sku_key" ON "CatalogItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedItem_imei1_key" ON "SerializedItem"("imei1");

-- CreateIndex
CREATE INDEX "SerializedItem_currentStatus_idx" ON "SerializedItem"("currentStatus");

-- CreateIndex
CREATE INDEX "SerializedItem_itemId_idx" ON "SerializedItem"("itemId");

-- CreateIndex
CREATE INDEX "SerializedLifecycleEvent_serialId_createdAt_idx" ON "SerializedLifecycleEvent"("serialId", "createdAt");
