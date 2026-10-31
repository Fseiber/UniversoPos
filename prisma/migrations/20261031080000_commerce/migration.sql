ALTER TABLE "AccountMovement" ADD COLUMN "requestKey" TEXT, ADD COLUMN "requestHash" TEXT, ADD COLUMN "method" TEXT NOT NULL DEFAULT 'EFECTIVO', ADD COLUMN "reference" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "AccountMovement_requestKey_key" ON "AccountMovement"("requestKey");
ALTER TABLE "CashMovement" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'SIN_CLASIFICAR';
CREATE TABLE "Purchase" (
 "id" SERIAL PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "supplierId" INTEGER NOT NULL REFERENCES "Supplier"("id") ON UPDATE CASCADE,
 "document" TEXT NOT NULL, "total" DECIMAL(18,2) NOT NULL CHECK("total">0), "expenses" DECIMAL(18,2) NOT NULL CHECK("expenses">=0),
 "employeeId" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Purchase_supplierId_createdAt_idx" ON "Purchase"("supplierId","createdAt");
CREATE TABLE "PurchaseLine" (
 "id" SERIAL PRIMARY KEY, "purchaseId" INTEGER NOT NULL REFERENCES "Purchase"("id") ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON UPDATE CASCADE, "name" TEXT NOT NULL,
 "quantity" DECIMAL(18,3) NOT NULL CHECK("quantity">0), "unitCost" DECIMAL(18,2) NOT NULL CHECK("unitCost">=0),
 "previousCost" DECIMAL(18,2), "newCost" DECIMAL(18,2) NOT NULL CHECK("newCost">=0), "total" DECIMAL(18,2) NOT NULL CHECK("total">=0)
);
CREATE TABLE "ProductLot" (
 "id" SERIAL PRIMARY KEY, "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON UPDATE CASCADE,
 "purchaseLineId" INTEGER UNIQUE REFERENCES "PurchaseLine"("id") ON UPDATE CASCADE,
 "code" TEXT NOT NULL, "quantity" DECIMAL(18,3) NOT NULL CHECK("quantity">0),
 "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3)
);
CREATE INDEX "ProductLot_productId_expiresAt_idx" ON "ProductLot"("productId","expiresAt");
CREATE TABLE "SupplierPayment" (
 "id" SERIAL PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "purchaseId" INTEGER NOT NULL REFERENCES "Purchase"("id") ON UPDATE CASCADE,
 "amount" DECIMAL(18,2) NOT NULL CHECK("amount">0), "method" TEXT NOT NULL, "reference" TEXT NOT NULL,
 "employeeId" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
