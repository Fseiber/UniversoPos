ALTER TABLE "Note" ADD COLUMN "productId" INTEGER REFERENCES "Product"("id") ON DELETE RESTRICT;
ALTER TABLE "Note" ADD COLUMN "supplierId" INTEGER REFERENCES "Supplier"("id") ON DELETE RESTRICT;
CREATE INDEX "Note_productId_resolved_idx" ON "Note"("productId","resolved");
