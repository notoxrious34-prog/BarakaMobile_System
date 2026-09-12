-- TASK-BRIEF-002 Stream 4 (DEF-BE-003): prevent duplicate OPENING_BALANCE
-- entries per counterparty at the database constraint level. SQLite
-- supports partial indexes natively; Prisma's declarative schema has no
-- syntax for a filtered @@unique, so this constraint is expressed here as
-- a hand-written migration and documented via a schema.prisma comment
-- (no drift risk: `type` is a plain TEXT enum column in SQLite).
CREATE UNIQUE INDEX "CustomerDebtLedgerEntry_customerId_opening_balance_unique"
  ON "CustomerDebtLedgerEntry"("customerId")
  WHERE "type" = 'OPENING_BALANCE';

CREATE UNIQUE INDEX "SupplierDebtLedgerEntry_contactId_opening_balance_unique"
  ON "SupplierDebtLedgerEntry"("contactId")
  WHERE "type" = 'OPENING_BALANCE';
