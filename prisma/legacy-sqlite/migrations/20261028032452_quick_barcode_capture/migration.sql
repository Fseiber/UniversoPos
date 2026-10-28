-- AlterTable
ALTER TABLE "ImportedProduct" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE INDEX "ImportedProduct_barcode_idx" ON "ImportedProduct"("barcode");

CREATE UNIQUE INDEX "ImportedProduct_pending_barcode_key" ON "ImportedProduct"("barcode") WHERE "productId" IS NULL AND "barcode" IS NOT NULL;
CREATE TRIGGER product_barcode_pending_insert BEFORE INSERT ON Product
WHEN NEW.barcode IS NOT NULL AND EXISTS(SELECT 1 FROM ImportedProduct WHERE productId IS NULL AND barcode=NEW.barcode)
BEGIN SELECT RAISE(ABORT, 'Código reservado por producto importado'); END;
CREATE TRIGGER product_barcode_pending_update BEFORE UPDATE OF barcode ON Product
WHEN NEW.barcode IS NOT NULL AND EXISTS(SELECT 1 FROM ImportedProduct WHERE productId IS NULL AND barcode=NEW.barcode)
BEGIN SELECT RAISE(ABORT, 'Código reservado por producto importado'); END;
CREATE TRIGGER imported_barcode_product_insert BEFORE INSERT ON ImportedProduct
WHEN NEW.productId IS NULL AND NEW.barcode IS NOT NULL AND EXISTS(SELECT 1 FROM Product WHERE barcode=NEW.barcode)
BEGIN SELECT RAISE(ABORT, 'Código existente en catálogo'); END;
CREATE TRIGGER imported_barcode_product_update BEFORE UPDATE OF barcode,productId ON ImportedProduct
WHEN NEW.productId IS NULL AND NEW.barcode IS NOT NULL AND EXISTS(SELECT 1 FROM Product WHERE barcode=NEW.barcode)
BEGIN SELECT RAISE(ABORT, 'Código existente en catálogo'); END;
