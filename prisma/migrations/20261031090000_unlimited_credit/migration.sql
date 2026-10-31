ALTER TABLE "Customer" ADD COLUMN "creditUnlimited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_credit";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_credit" CHECK ("balance" >= 0 AND "creditLimit" >= 0 AND ("creditUnlimited" OR "creditLimit" >= "balance"));
