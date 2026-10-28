import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { postgresFixture } from "./postgres-fixture.js";
import { transferSqlite } from "../server/sqlite-transfer.js";

test("PostgreSQL · traslado completo conserva identidades, saldos, nulos, códigos y secuencias", async () => {
  const fixture = await postgresFixture();
  const pg = new PrismaClient({ datasources: { db: { url: fixture.url } } });
  await mkdir(".test-data", { recursive: true });
  const dir = await mkdtemp(path.resolve(".test-data/transfer-"));
  const file = path.join(dir, "source.db");
  const sqlite = new DatabaseSync(file);
  try {
    for (const migration of (await readdir("prisma/legacy-sqlite/migrations"))
      .filter((n) => !n.endsWith(".toml"))
      .sort())
      sqlite.exec(
        await readFile(
          path.join(
            "prisma/legacy-sqlite/migrations",
            migration,
            "migration.sql",
          ),
          "utf8",
        ),
      );
    sqlite.exec(`
      INSERT INTO Employee (id,name,pinHash,role) VALUES (4,'Empleado de prueba','hash-original','ADMIN');
      INSERT INTO Session (id,employeeId,expiresAt) VALUES ('no-trasladar',4,1999999999999);
      INSERT INTO Product (id,name,barcode,unit,price,cost,stock) VALUES (20,'Por kilo','00001234','PESO',1234.56,NULL,3.125);
      INSERT INTO Customer (id,name,creditLimit,balance) VALUES (9,'Cliente de prueba',500000,7890);
      INSERT INTO Shift (id,employeeId,opening) VALUES (8,4,100);
      INSERT INTO Sale (id,requestKey,employeeId,shiftId,customerId,subtotal,total) VALUES (11,'f86e1d0b-3a52-44cc-8e07-398221629aa0',4,8,9,7890,7890);
      INSERT INTO SaleLine (saleId,productId,name,quantity,unitPrice,unitCost,total) VALUES (11,20,'Nombre histórico',1,7890,NULL,7890);
      INSERT INTO Payment (saleId,method,amount,shiftId) VALUES (11,'CUENTA_CORRIENTE',7890,8);
      INSERT INTO AccountMovement (customerId,amount,kind,saleId,shiftId,employeeId) VALUES (9,7890,'CARGO_FIADO',11,8,4);
      INSERT INTO StockMovement (productId,quantity,reason,employeeId) VALUES (20,3.125,'INICIAL',4);
      INSERT INTO ProductImport (id,sourceName,sourceHash,sheetName,recordCount) VALUES (3,'productos.xlsx','hash-transferencia','Catálogo',1);
      INSERT INTO ImportedProduct (importId,sourceRow,name,normalizedKey,unit,referencePrice,barcode) VALUES (3,2,'Pendiente','clave-pendiente','UNIDAD',40,'00005555');
    `);
    const options = { backupDirectory: path.join(dir, "backups") };
    sqlite.exec("UPDATE Payment SET amount=-1");
    await assert.rejects(transferSqlite(pg, file, { ...options, apply: true }));
    assert.equal(await pg.employee.count(), 0);
    assert.equal(await pg.product.count(), 0);
    sqlite.exec("UPDATE Payment SET amount=7890");
    assert.equal((await transferSqlite(pg, file, options)).applied, false);
    assert.equal(await pg.product.count(), 0);
    const result = await transferSqlite(pg, file, { ...options, apply: true });
    assert.ok(result.snapshot);
    const product = await pg.product.findUniqueOrThrow({ where: { id: 20 } });
    assert.equal(product.barcode, "00001234");
    assert.equal(product.cost, null);
    assert.equal(product.price.toString(), "1234.56");
    assert.equal(product.stock.toString(), "3.125");
    assert.equal((await pg.saleLine.findFirstOrThrow()).unitCost, null);
    assert.equal(
      (
        await pg.customer.findUniqueOrThrow({ where: { id: 9 } })
      ).balance.toString(),
      "7890",
    );
    assert.equal(
      (await pg.employee.findUniqueOrThrow({ where: { id: 4 } })).pinHash,
      "hash-original",
    );
    assert.equal(await pg.session.count(), 0);
    assert.equal(await pg.barcodeReservation.count(), 2);
    const next = await pg.product.create({
      data: { name: "Siguiente", price: 10 },
    });
    assert.equal(next.id, 21);
    await assert.rejects(
      transferSqlite(pg, file, { ...options, apply: true }),
      /ya contiene datos/,
    );
    assert.equal(await pg.product.count(), 2);
    assert.equal(
      Number(
        sqlite.prepare("SELECT stock FROM Product WHERE id=20").get()!.stock,
      ),
      3.125,
    );
  } finally {
    sqlite.close();
    await pg.$disconnect();
    await fixture.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
