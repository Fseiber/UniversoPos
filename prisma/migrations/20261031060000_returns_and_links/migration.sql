CREATE TABLE "SaleReturn" (
 "id" SERIAL PRIMARY KEY,"requestKey" TEXT NOT NULL UNIQUE,"requestHash" TEXT NOT NULL,
 "saleId" INTEGER NOT NULL REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "amount" DECIMAL(18,2) NOT NULL CHECK("amount">0),"method" TEXT NOT NULL,
 "restock" BOOLEAN NOT NULL,"reason" TEXT NOT NULL,"employeeId" INTEGER NOT NULL,"adminId" INTEGER NOT NULL,
 "lineDetails" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SaleReturn_createdAt_idx" ON "SaleReturn"("createdAt");
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX "Sale_employeeId_idx" ON "Sale"("employeeId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "Sale_status_id_idx" ON "Sale"("status","id");
ALTER TABLE "Note" ADD COLUMN "customerId" INTEGER REFERENCES "Customer"("id") ON DELETE RESTRICT;
ALTER TABLE "Note" ADD COLUMN "dueAt" TIMESTAMP(3);
CREATE INDEX "Note_customerId_resolved_idx" ON "Note"("customerId","resolved");
CREATE TABLE "ContainerMovement" (
 "id" SERIAL PRIMARY KEY,"requestKey" TEXT NOT NULL UNIQUE,
 "customerId" INTEGER NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL,"quantity" INTEGER NOT NULL CHECK("quantity"<>0),"reason" TEXT NOT NULL,
 "employeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ContainerMovement_customerId_id_idx" ON "ContainerMovement"("customerId","id");
