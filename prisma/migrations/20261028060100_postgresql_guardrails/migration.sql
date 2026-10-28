ALTER TABLE "Product" ADD CONSTRAINT "Product_valid" CHECK
  ("stock" >= 0 AND ("cost" IS NULL OR "cost" >= 0) AND "price" > 0 AND "minimum" >= 0 AND "unit" IN ('UNIDAD','PESO'));
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_credit" CHECK ("balance" >= 0 AND "creditLimit" >= "balance");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_role" CHECK ("role" IN ('ADMIN','EMPLEADO'));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_valid" CHECK ("amount" > 0 AND "method" IN ('EFECTIVO','TRANSFERENCIA','MERCADO_PAGO','DEBITO','CUENTA_CORRIENTE'));
ALTER TABLE "ImportedProduct" ADD CONSTRAINT "ImportedProduct_unit" CHECK ("unit" IN ('UNIDAD','PESO'));
CREATE UNIQUE INDEX "Shift_one_open" ON "Shift" ((1)) WHERE "closedAt" IS NULL;
CREATE UNIQUE INDEX "ImportedProduct_pending_barcode_key" ON "ImportedProduct"("barcode") WHERE "productId" IS NULL AND "barcode" IS NOT NULL;

-- Un único registro de reserva hace atómica la exclusividad entre las dos tablas,
-- incluso con dos servidores o escrituras SQL simultáneas.
CREATE TABLE "BarcodeReservation" ("barcode" TEXT PRIMARY KEY, "owner" TEXT NOT NULL UNIQUE);
CREATE FUNCTION "reserve_barcode"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_key TEXT;
BEGIN
  owner_key := TG_TABLE_NAME || ':' || COALESCE(NEW."id", OLD."id")::TEXT;
  DELETE FROM "BarcodeReservation" WHERE "owner" = owner_key;
  IF TG_OP <> 'DELETE' AND NEW."barcode" IS NOT NULL THEN
    IF TG_TABLE_NAME = 'Product' THEN
      INSERT INTO "BarcodeReservation" VALUES (NEW."barcode", owner_key);
    ELSIF NEW."productId" IS NULL THEN
      INSERT INTO "BarcodeReservation" VALUES (NEW."barcode", owner_key);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "Product_reserve_barcode" AFTER INSERT OR UPDATE OF "barcode" OR DELETE ON "Product" FOR EACH ROW EXECUTE FUNCTION "reserve_barcode"();
CREATE TRIGGER "ImportedProduct_reserve_barcode" AFTER INSERT OR UPDATE OF "barcode", "productId" OR DELETE ON "ImportedProduct" FOR EACH ROW EXECUTE FUNCTION "reserve_barcode"();
