-- DropIndex
DROP INDEX "CustomerDebtLedgerEntry_customerId_idx";

-- DropIndex
DROP INDEX "SupplierDebtLedgerEntry_contactId_idx";

-- CreateIndex
CREATE INDEX "CashMovement_cashAccountId_createdAt_idx" ON "CashMovement"("cashAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_category_createdAt_idx" ON "CashMovement"("category", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDebtLedgerEntry_customerId_createdAt_idx" ON "CustomerDebtLedgerEntry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_categoryId_expenseDate_idx" ON "Expense"("categoryId", "expenseDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "RepairTicket_status_createdAt_idx" ON "RepairTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RepairTicket_contactId_createdAt_idx" ON "RepairTicket"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierDebtLedgerEntry_contactId_createdAt_idx" ON "SupplierDebtLedgerEntry"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_accountId_createdAt_idx" ON "Transaction"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_type_createdAt_idx" ON "Transaction"("type", "createdAt");
