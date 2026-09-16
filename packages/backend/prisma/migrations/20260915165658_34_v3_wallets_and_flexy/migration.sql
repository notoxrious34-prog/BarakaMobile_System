-- CreateTable
CREATE TABLE "TopUpWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "balance" TEXT NOT NULL DEFAULT '0.00',
    "minBalanceAlert" TEXT NOT NULL DEFAULT '0.00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DigitalServiceTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionNumber" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'FLEXY',
    "targetPhoneNumber" TEXT NOT NULL,
    "faceAmount" TEXT NOT NULL,
    "costAmount" TEXT NOT NULL,
    "feeAmount" TEXT NOT NULL DEFAULT '0.00',
    "collectedAmount" TEXT NOT NULL,
    "marginAmount" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "partyId" TEXT,
    "journalEntryId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalServiceTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "TopUpWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FloatTransferRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transferNumber" TEXT NOT NULL,
    "sourceAccountType" TEXT NOT NULL,
    "sourceWalletId" TEXT,
    "targetAccountType" TEXT NOT NULL,
    "targetWalletId" TEXT,
    "amount" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FloatTransferRecord_sourceWalletId_fkey" FOREIGN KEY ("sourceWalletId") REFERENCES "TopUpWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FloatTransferRecord_targetWalletId_fkey" FOREIGN KEY ("targetWalletId") REFERENCES "TopUpWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TopUpWallet_operator_isActive_idx" ON "TopUpWallet"("operator", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalServiceTransaction_transactionNumber_key" ON "DigitalServiceTransaction"("transactionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalServiceTransaction_journalEntryId_key" ON "DigitalServiceTransaction"("journalEntryId");

-- CreateIndex
CREATE INDEX "DigitalServiceTransaction_walletId_idx" ON "DigitalServiceTransaction"("walletId");

-- CreateIndex
CREATE INDEX "DigitalServiceTransaction_partyId_idx" ON "DigitalServiceTransaction"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FloatTransferRecord_transferNumber_key" ON "FloatTransferRecord"("transferNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FloatTransferRecord_journalEntryId_key" ON "FloatTransferRecord"("journalEntryId");

-- CreateIndex
CREATE INDEX "FloatTransferRecord_sourceWalletId_idx" ON "FloatTransferRecord"("sourceWalletId");

-- CreateIndex
CREATE INDEX "FloatTransferRecord_targetWalletId_idx" ON "FloatTransferRecord"("targetWalletId");
