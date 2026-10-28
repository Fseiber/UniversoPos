CREATE TABLE "CatalogLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" INTEGER,
  "importedId" INTEGER,
  "baseline" TEXT NOT NULL
);
CREATE UNIQUE INDEX "CatalogLink_productId_key" ON "CatalogLink"("productId");
CREATE UNIQUE INDEX "CatalogLink_importedId_key" ON "CatalogLink"("importedId");
