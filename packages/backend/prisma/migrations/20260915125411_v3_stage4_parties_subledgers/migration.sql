-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "type" TEXT NOT NULL,
    "creditLimit" TEXT NOT NULL DEFAULT '0.00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartySubledgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partyId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "balanceBefore" TEXT NOT NULL,
    "balanceAfter" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartySubledgerEntry_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartySubledgerEntry_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalEntryLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Party_type_isActive_idx" ON "Party"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PartySubledgerEntry_journalLineId_key" ON "PartySubledgerEntry"("journalLineId");

-- CreateIndex
CREATE INDEX "PartySubledgerEntry_partyId_createdAt_idx" ON "PartySubledgerEntry"("partyId", "createdAt");
