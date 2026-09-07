-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WalletLedgerEntry" (
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
    "walletServiceId" TEXT,
    "nominalAmount" TEXT,
    "commissionProfit" TEXT,
    "beneficiaryPhone" TEXT,
    CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "DigitalWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_relatedPurchaseId_fkey" FOREIGN KEY ("relatedPurchaseId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_relatedSaleId_fkey" FOREIGN KEY ("relatedSaleId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_walletServiceId_fkey" FOREIGN KEY ("walletServiceId") REFERENCES "WalletService" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WalletLedgerEntry" ("amount", "balanceAfter", "createdAt", "createdBy", "entryType", "id", "notes", "relatedPurchaseId", "relatedSaleId", "walletId") SELECT "amount", "balanceAfter", "createdAt", "createdBy", "entryType", "id", "notes", "relatedPurchaseId", "relatedSaleId", "walletId" FROM "WalletLedgerEntry";
DROP TABLE "WalletLedgerEntry";
ALTER TABLE "new_WalletLedgerEntry" RENAME TO "WalletLedgerEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
