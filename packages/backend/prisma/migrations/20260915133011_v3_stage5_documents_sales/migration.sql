-- CreateTable
CREATE TABLE "BusinessDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "subtotalAmount" TEXT NOT NULL DEFAULT '0.00',
    "discountAmount" TEXT NOT NULL DEFAULT '0.00',
    "totalAmount" TEXT NOT NULL DEFAULT '0.00',
    "paidAmount" TEXT NOT NULL DEFAULT '0.00',
    "outstandingAmount" TEXT NOT NULL DEFAULT '0.00',
    "reversalDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessDocument_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocument_reversalDocumentId_fkey" FOREIGN KEY ("reversalDocumentId") REFERENCES "BusinessDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "serialId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCost" TEXT NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "lineTotal" TEXT NOT NULL,
    CONSTRAINT "DocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocumentLine_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerializedItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "repairOrderId" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "walletId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_documentNumber_key" ON "BusinessDocument"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_reversalDocumentId_key" ON "BusinessDocument"("reversalDocumentId");

-- CreateIndex
CREATE INDEX "BusinessDocument_type_createdAt_idx" ON "BusinessDocument"("type", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessDocument_partyId_idx" ON "BusinessDocument"("partyId");

-- CreateIndex
CREATE INDEX "DocumentLine_documentId_idx" ON "DocumentLine"("documentId");

-- CreateIndex
CREATE INDEX "DocumentLine_itemId_idx" ON "DocumentLine"("itemId");

-- CreateIndex
CREATE INDEX "DocumentLine_serialId_idx" ON "DocumentLine"("serialId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_documentId_idx" ON "PaymentAllocation"("documentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_repairOrderId_idx" ON "PaymentAllocation"("repairOrderId");
