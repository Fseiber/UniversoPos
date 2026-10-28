import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

test("Migración · costo opcional conserva ventas, importaciones vinculadas y restricciones", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const names = readdirSync("prisma/legacy-sqlite/migrations")
      .filter((n) => !n.endsWith(".toml"))
      .sort();
    for (const name of names.filter(
      (n) => n < names.find((v) => v.endsWith("optional_purchase_cost"))!,
    ))
      sqlite.exec(
        readFileSync(
          path.join("prisma/legacy-sqlite/migrations", name, "migration.sql"),
          "utf8",
        ),
      );
    sqlite.exec(`
      INSERT INTO Employee (id,name,pinHash,role) VALUES (1,'Prueba','hash-ficticio','ADMIN');
      INSERT INTO Shift (id,employeeId,opening) VALUES (1,1,100);
      INSERT INTO Product (id,name,price,cost,stock) VALUES (1,'Producto histórico',20,10,2);
      INSERT INTO Sale (id,requestKey,employeeId,shiftId,subtotal,total) VALUES (1,'prueba-migracion',1,1,20,20);
      INSERT INTO SaleLine (id,saleId,productId,name,quantity,unitPrice,unitCost,total) VALUES (1,1,1,'Producto histórico',1,20,10,20);
      INSERT INTO ProductImport (id,sourceName,sourceHash,sheetName,recordCount) VALUES (1,'prueba.xlsx','hash-prueba','Catálogo',1);
      INSERT INTO ImportedProduct (importId,sourceRow,name,normalizedKey,unit,referencePrice,productId) VALUES (1,2,'Producto histórico','clave','UNIDAD',5,1);
    `);
    const migration = names.find((n) => n.endsWith("optional_purchase_cost"))!;
    sqlite.exec(
      readFileSync(
        path.join("prisma/legacy-sqlite/migrations", migration, "migration.sql"),
        "utf8",
      ),
    );
    assert.equal(
      sqlite.prepare("SELECT cost FROM Product WHERE id=1").get()!.cost,
      10,
    );
    assert.equal(
      sqlite.prepare("SELECT unitCost FROM SaleLine WHERE id=1").get()!
        .unitCost,
      10,
    );
    assert.equal(
      sqlite.prepare("SELECT productId FROM ImportedProduct").get()!.productId,
      1,
    );
    sqlite.exec("UPDATE Product SET cost=NULL WHERE id=1");
    assert.equal(
      sqlite.prepare("SELECT cost FROM Product WHERE id=1").get()!.cost,
      null,
    );
    assert.throws(() => sqlite.exec("UPDATE Product SET stock=-1 WHERE id=1"));
    assert.throws(() => sqlite.exec("UPDATE Product SET cost=-1 WHERE id=1"));
    assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(
      sqlite.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
  } finally {
    sqlite.close();
  }
});
