-- AD-76 (TB-141): extend CustomerDebtEntryType and SupplierDebtEntryType with
-- OPENING_BALANCE. SQLite persists enums as TEXT, so no DDL is required;
-- this is a marker migration so deploy/repair pipelines record schema v23.
SELECT 1;
