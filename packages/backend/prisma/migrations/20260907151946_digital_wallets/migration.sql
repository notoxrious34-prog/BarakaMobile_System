-- CreateTable
CREATE TABLE "DigitalWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FLEXY',
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "defaultSupplierId" TEXT,
    "lowBalanceThreshold" TEXT NOT NULL DEFAULT '2000.00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DigitalWallet_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "networkBrandColor" TEXT,
    "commissionRate" TEXT NOT NULL DEFAULT '0.0000',
    "pricingMode" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WalletService_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "DigitalWallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "relatedPurchaseId" TEXT,
    "relatedSaleId" TEXT,
    "balanceAfter" TEXT NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "DigitalWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_relatedPurchaseId_fkey" FOREIGN KEY ("relatedPurchaseId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_relatedSaleId_fkey" FOREIGN KEY ("relatedSaleId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransactionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "unitCost" TEXT NOT NULL DEFAULT '0.00',
    "totalPrice" TEXT NOT NULL,
    "walletServiceId" TEXT,
    "nominalAmount" TEXT,
    "walletDeductionAmount" TEXT,
    "commissionProfit" TEXT,
    "beneficiaryPhone" TEXT,
    CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransactionItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransactionItem_walletServiceId_fkey" FOREIGN KEY ("walletServiceId") REFERENCES "WalletService" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransactionItem" ("id", "itemId", "quantity", "totalPrice", "transactionId", "unitCost", "unitPrice") SELECT "id", "itemId", "quantity", "totalPrice", "transactionId", "unitCost", "unitPrice" FROM "TransactionItem";
DROP TABLE "TransactionItem";
ALTER TABLE "new_TransactionItem" RENAME TO "TransactionItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- SeedDefaultWallet: idempotent default Flexy wallet + operator services
INSERT OR IGNORE INTO "DigitalWallet" ("id", "name", "type", "currency", "lowBalanceThreshold", "isActive", "createdAt", "updatedAt")
VALUES ('wallet-main-flexy', 'المحفظة الرئيسية (فليكسي)', 'FLEXY', 'DZD', '2000.00', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "WalletService" ("id", "walletId", "name", "networkBrandColor", "commissionRate", "pricingMode", "isActive", "createdAt", "updatedAt")
VALUES
  ('ws-djezzy', 'wallet-main-flexy', 'Djezzy', '#E30613', '0.0050', 'PERCENTAGE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ws-mobilis', 'wallet-main-flexy', 'Mobilis', '#00A651', '0.0400', 'PERCENTAGE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ws-ooredoo', 'wallet-main-flexy', 'Ooredoo', '#ED1C24', '0.0075', 'PERCENTAGE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
