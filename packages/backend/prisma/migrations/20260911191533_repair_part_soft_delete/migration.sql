-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepairPartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostPrice" TEXT NOT NULL DEFAULT '0.00',
    "unitPrice" TEXT NOT NULL DEFAULT '0.00',
    "totalCost" TEXT NOT NULL DEFAULT '0.00',
    "totalPrice" TEXT NOT NULL DEFAULT '0.00',
    "stockMovementId" TEXT,
    "reversalMovementId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairPartItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "RepairTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepairPartItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RepairPartItem" ("createdAt", "id", "inventoryItemId", "quantity", "stockMovementId", "ticketId", "totalCost", "totalPrice", "unitCostPrice", "unitPrice") SELECT "createdAt", "id", "inventoryItemId", "quantity", "stockMovementId", "ticketId", "totalCost", "totalPrice", "unitCostPrice", "unitPrice" FROM "RepairPartItem";
DROP TABLE "RepairPartItem";
ALTER TABLE "new_RepairPartItem" RENAME TO "RepairPartItem";
CREATE INDEX "RepairPartItem_ticketId_idx" ON "RepairPartItem"("ticketId");
CREATE INDEX "RepairPartItem_inventoryItemId_idx" ON "RepairPartItem"("inventoryItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
