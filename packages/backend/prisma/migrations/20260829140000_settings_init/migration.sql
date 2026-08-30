-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- Seed initial settings
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('business_name', 'BarakaMobile', CURRENT_TIMESTAMP);
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('business_phone', '', CURRENT_TIMESTAMP);
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('business_address', '', CURRENT_TIMESTAMP);
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('currency_symbol', 'د.ج', CURRENT_TIMESTAMP);
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('low_stock_threshold', '5', CURRENT_TIMESTAMP);
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('invoice_footer_note', '', CURRENT_TIMESTAMP);
