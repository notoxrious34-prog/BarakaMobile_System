-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN "operatorId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "operatorId" TEXT;

-- AlterTable
ALTER TABLE "RepairTicket" ADD COLUMN "operatorId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CASHIER',
    "permissions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarColor" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
