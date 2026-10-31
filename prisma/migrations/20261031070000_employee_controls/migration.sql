ALTER TABLE "PosSettings" ADD COLUMN "employeeSurchargeLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN "employeeMovementLimit" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION bump_product_version() RETURNS trigger AS $$
BEGIN NEW."version" := OLD."version" + 1; RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER product_version BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION bump_product_version();
