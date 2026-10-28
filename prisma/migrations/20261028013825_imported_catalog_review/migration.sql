-- CreateTable
CREATE TABLE "ProductImport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportedProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "referencePrice" DECIMAL NOT NULL,
    "productId" INTEGER,
    "reviewedAt" DATETIME,
    CONSTRAINT "ImportedProduct_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProductImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductImport_sourceHash_key" ON "ProductImport"("sourceHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedProduct_normalizedKey_key" ON "ImportedProduct"("normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedProduct_productId_key" ON "ImportedProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedProduct_importId_sourceRow_key" ON "ImportedProduct"("importId", "sourceRow");
