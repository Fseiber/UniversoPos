-- Un solo turno abierto incluso ante dos solicitudes concurrentes.
CREATE UNIQUE INDEX "Shift_one_open" ON "Shift" ((1)) WHERE "closedAt" IS NULL;

CREATE TRIGGER "Product_nonnegative_insert" BEFORE INSERT ON "Product"
WHEN NEW."stock" < 0 OR NEW."cost" < 0 OR NEW."price" <= 0 OR NEW."minimum" < 0 OR NEW."unit" NOT IN ('UNIDAD', 'PESO')
BEGIN SELECT RAISE(ABORT, 'Valores de producto inválidos'); END;
CREATE TRIGGER "Product_nonnegative_update" BEFORE UPDATE ON "Product"
WHEN NEW."stock" < 0 OR NEW."cost" < 0 OR NEW."price" <= 0 OR NEW."minimum" < 0 OR NEW."unit" NOT IN ('UNIDAD', 'PESO')
BEGIN SELECT RAISE(ABORT, 'Valores de producto inválidos'); END;
CREATE TRIGGER "Customer_credit_insert" BEFORE INSERT ON "Customer"
WHEN NEW."balance" < 0 OR NEW."creditLimit" < NEW."balance"
BEGIN SELECT RAISE(ABORT, 'Cuenta corriente inválida'); END;
CREATE TRIGGER "Customer_credit_update" BEFORE UPDATE ON "Customer"
WHEN NEW."balance" < 0 OR NEW."creditLimit" < NEW."balance"
BEGIN SELECT RAISE(ABORT, 'Cuenta corriente inválida'); END;
CREATE TRIGGER "Employee_role_insert" BEFORE INSERT ON "Employee"
WHEN NEW."role" NOT IN ('ADMIN', 'EMPLEADO')
BEGIN SELECT RAISE(ABORT, 'Rol inválido'); END;
CREATE TRIGGER "Employee_role_update" BEFORE UPDATE ON "Employee"
WHEN NEW."role" NOT IN ('ADMIN', 'EMPLEADO')
BEGIN SELECT RAISE(ABORT, 'Rol inválido'); END;
CREATE TRIGGER "Payment_valid" BEFORE INSERT ON "Payment"
WHEN NEW."amount" <= 0 OR NEW."method" NOT IN ('EFECTIVO','TRANSFERENCIA','MERCADO_PAGO','DEBITO','CUENTA_CORRIENTE')
BEGIN SELECT RAISE(ABORT, 'Pago inválido'); END;
