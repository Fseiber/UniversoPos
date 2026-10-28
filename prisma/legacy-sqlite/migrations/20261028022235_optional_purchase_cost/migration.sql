-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "unit" TEXT NOT NULL DEFAULT 'UNIDAD',
    "cost" DECIMAL,
    "price" DECIMAL NOT NULL,
    "stock" DECIMAL NOT NULL DEFAULT 0,
    "minimum" DECIMAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Product" ("active", "barcode", "category", "cost", "createdAt", "id", "minimum", "name", "price", "stock", "unit") SELECT "active", "barcode", "category", "cost", "createdAt", "id", "minimum", "name", "price", "stock", "unit" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
CREATE TABLE "new_SaleLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "saleId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "unitCost" DECIMAL,
    "total" DECIMAL NOT NULL,
    CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleLine" ("id", "name", "productId", "quantity", "saleId", "total", "unitCost", "unitPrice") SELECT "id", "name", "productId", "quantity", "saleId", "total", "unitCost", "unitPrice" FROM "SaleLine";
DROP TABLE "SaleLine";
ALTER TABLE "new_SaleLine" RENAME TO "SaleLine";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- La reconstrucción de Product elimina sus triggers: conservar las restricciones.
CREATE TRIGGER "Product_nonnegative_insert" BEFORE INSERT ON "Product"
WHEN NEW."stock" < 0 OR NEW."cost" < 0 OR NEW."price" <= 0 OR NEW."minimum" < 0 OR NEW."unit" NOT IN ('UNIDAD', 'PESO')
BEGIN SELECT RAISE(ABORT, 'Valores de producto inválidos'); END;
CREATE TRIGGER "Product_nonnegative_update" BEFORE UPDATE ON "Product"
WHEN NEW."stock" < 0 OR NEW."cost" < 0 OR NEW."price" <= 0 OR NEW."minimum" < 0 OR NEW."unit" NOT IN ('UNIDAD', 'PESO')
BEGIN SELECT RAISE(ABORT, 'Valores de producto inválidos'); END;
