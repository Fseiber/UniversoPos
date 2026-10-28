-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL DEFAULT '',
    "employeeId" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "pendingName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETADA',
    "subtotal" DECIMAL NOT NULL,
    "surcharge" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    "quickAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" DATETIME,
    "voidReason" TEXT,
    CONSTRAINT "Sale_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "customerId", "employeeId", "id", "pendingName", "quickAmount", "requestKey", "shiftId", "status", "subtotal", "surcharge", "total", "voidReason", "voidedAt") SELECT "createdAt", "customerId", "employeeId", "id", "pendingName", "quickAmount", "requestKey", "shiftId", "status", "subtotal", "surcharge", "total", "voidReason", "voidedAt" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_requestKey_key" ON "Sale"("requestKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
