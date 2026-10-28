import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  mkdir,
  rm,
  writeFile,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { randomUUID } from "node:crypto";

await mkdir(".test-data", { recursive: true });
const dir = await mkdtemp(path.resolve(".test-data/run-"));
const dbPath = path.join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.BACKUP_DIR = path.join(dir, "backups");
const sqlite = new DatabaseSync(dbPath);
for (const name of (await readdir("prisma/migrations")).sort()) {
  if (name.endsWith(".toml")) continue;
  sqlite.exec(
    await readFile(
      path.join("prisma/migrations", name, "migration.sql"),
      "utf8",
    ),
  );
}
sqlite.close();
const { app } = await import("../server/app.js");
const { db, initializeDatabase } = await import("../server/db.js");
const { report } = await import("../server/management.js");
const { importCatalog } = await import("../server/product-import.js");
await initializeDatabase();
const admin = request.agent(app).set("X-POS-Request", "1");
const worker = request.agent(app).set("X-POS-Request", "1");
const testYear = new Date(Date.now() - 3 * 3600_000).getUTCFullYear();
const reportFrom = `${testYear}-01-01`;
const reportTo = `${testYear}-12-31`;
let adminId = 0,
  employeeId = 0,
  productId = 0,
  customerId = 0,
  saleId = 0,
  weightId = 0,
  pendingId = 0;
const order = (items: unknown[], payments: unknown[], extra = {}) => ({
  requestKey: randomUUID(),
  items,
  payments,
  ...extra,
});

await test("F0 · configuración, sesión, roles y PIN hasheado", async () => {
  await request(app).get("/api/products").expect(401);
  await request(app)
    .post("/api/setup")
    .send({ name: "Intruso", pin: "1234" })
    .expect(403);
  const setup = await admin
    .post("/api/setup")
    .send({ name: "Administración", pin: "825194" })
    .expect(201);
  adminId = setup.body.id;
  await admin
    .post("/api/setup")
    .send({ name: "Otro", pin: "1234" })
    .expect(409);
  await admin
    .post("/api/login")
    .send({ employeeId: adminId, pin: "825194" })
    .expect(200);
  const employee = await admin
    .post("/api/employees")
    .send({ name: "Mostrador", pin: "667788", role: "EMPLEADO" })
    .expect(201);
  employeeId = employee.body.id;
  const record = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
  });
  assert.notEqual(record.pinHash, "667788");
  assert.ok(record.pinHash.startsWith("$2"));
  await worker
    .post("/api/login")
    .send({ employeeId, pin: "667788" })
    .expect(200);
  await worker.get("/api/employees").expect(403);
  await worker.get("/api/reports?from=2026-10-01&to=2026-10-31").expect(403);
  await worker.post("/api/products").send({}).expect(403);
});
await test("F0 · PIN incorrecto, bloqueo persistente y auditoría", async () => {
  const e = await admin
    .post("/api/employees")
    .send({ name: "Bloqueo", pin: "554433", role: "EMPLEADO" })
    .expect(201);
  for (let n = 0; n < 5; n++)
    await admin
      .post("/api/login")
      .send({ employeeId: e.body.id, pin: "000000" })
      .expect(401);
  await admin
    .post("/api/login")
    .send({ employeeId: e.body.id, pin: "554433" })
    .expect(401);
  const stored = await db.employee.findUniqueOrThrow({
    where: { id: e.body.id },
  });
  assert.equal(stored.failures, 5);
  assert.ok(stored.lockedUntil! > new Date());
  assert.equal(
    await db.audit.count({
      where: { employeeId: e.body.id, action: "PIN_RECHAZADO" },
    }),
    5,
  );
});
await test("F0 · catálogo inicial y rechazo de operaciones sin caja", async () => {
  const p = await admin
    .post("/api/products")
    .send({
      name: "Yerba 500g",
      barcode: "7790001",
      category: "Almacén",
      price: 100,
      cost: 65,
      stock: 20,
      minimum: 2,
    })
    .expect(201);
  productId = p.body.id;
  assert.equal(Number(p.body.stock), 20);
  const c = await admin
    .post("/api/customers")
    .send({ name: "Cliente de prueba", creditLimit: 300 })
    .expect(201);
  customerId = c.body.id;
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId, quantity: 1 }],
        [{ method: "EFECTIVO", amount: 100 }],
      ),
    )
    .expect(400);
  await worker.post("/api/shifts/open").send({ opening: 500 }).expect(201);
  await worker.post("/api/shifts/open").send({ opening: 0 }).expect(409);
});
await test("F0 · venta de contado atómica e idempotencia", async () => {
  const payload = order(
    [{ productId, quantity: 2 }],
    [{ method: "EFECTIVO", amount: 200 }],
  );
  const sale = await worker.post("/api/sales").send(payload).expect(201);
  saleId = sale.body.id;
  const again = await worker.post("/api/sales").send(payload).expect(201);
  assert.equal(again.body.id, saleId);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ),
    18,
  );
  assert.equal(await db.stockMovement.count({ where: { saleId } }), 1);
  assert.equal(Number((await worker.get("/api/shift")).body.expected), 700);
  await worker
    .post("/api/sales")
    .send({
      ...payload,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "EFECTIVO", amount: 100 }],
    })
    .expect(409);
});
await test("F0 · rechazo de fiado y stock sin efectos parciales", async () => {
  const before = await db.sale.count();
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId, quantity: 4 }],
        [{ method: "CUENTA_CORRIENTE", amount: 400 }],
        { customerId },
      ),
    )
    .expect(400);
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId, quantity: 99 }],
        [{ method: "EFECTIVO", amount: 9900 }],
      ),
    )
    .expect(400);
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId, quantity: 0.5 }],
        [{ method: "EFECTIVO", amount: 50 }],
      ),
    )
    .expect(400);
  assert.equal(await db.sale.count(), before);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ),
    18,
  );
  assert.equal(
    Number(
      (await db.customer.findUniqueOrThrow({ where: { id: customerId } }))
        .balance,
    ),
    0,
  );
});
await test("F0 · fiar, cobrar deuda y arqueo correcto", async () => {
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId, quantity: 2 }],
        [{ method: "CUENTA_CORRIENTE", amount: 200 }],
        { customerId },
      ),
    )
    .expect(201);
  assert.equal(Number((await worker.get("/api/shift")).body.expected), 700);
  await worker
    .post(`/api/customers/${customerId}/payments`)
    .send({ amount: 50 })
    .expect(200);
  await worker
    .post(`/api/customers/${customerId}/payments`)
    .send({ amount: 151 })
    .expect(400);
  assert.equal(
    Number(
      (await db.customer.findUniqueOrThrow({ where: { id: customerId } }))
        .balance,
    ),
    150,
  );
  assert.equal(Number((await worker.get("/api/shift")).body.expected), 750);
});
await test("F0 · validaciones de crédito, referencias y montos", async () => {
  await worker
    .post("/api/customers")
    .send({ name: "Sin permiso", creditLimit: 99999 })
    .expect(403);
  await admin
    .patch(`/api/customers/${customerId}`)
    .send({ name: "Cliente de prueba", phone: "", creditLimit: 100 })
    .expect(400);
  await worker
    .post("/api/sales")
    .send(
      order([{ productId, quantity: 1 }], [{ method: "EFECTIVO", amount: 99 }]),
    )
    .expect(400);
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId, quantity: 1 }],
        [{ method: "CUENTA_CORRIENTE", amount: 100 }],
      ),
    )
    .expect(400);
  await worker
    .post("/api/sales")
    .send(order([], [{ method: "EFECTIVO", amount: -10 }], { quickAmount: 10 }))
    .expect(400);
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId: 999999, quantity: 1 }],
        [{ method: "EFECTIVO", amount: 100 }],
      ),
    )
    .expect(400);
});
await test("Clientes · historial con productos, pagos y saldo acumulado del fiado", async () => {
  const result = await worker
    .get(`/api/customers/${customerId}/statement`)
    .expect(200)
    .expect("Cache-Control", "no-store");
  assert.equal(result.body.customer.balance, "150");
  assert.equal(result.body.customer.available, "150");
  assert.equal(result.body.customer.creditLimit, "300");
  assert.equal(result.body.openingBalance, "0");
  assert.equal(result.body.closingBalance, "150");
  assert.equal(result.body.creditAdded, "200");
  assert.equal(result.body.paymentsReceived, "50");
  assert.equal(result.body.purchases.length, 1);
  assert.equal(result.body.purchases[0].lines[0].name, "Yerba 500g");
  assert.equal(result.body.purchases[0].lines[0].quantity, "2");
  assert.equal(result.body.purchases[0].lines[0].unitPrice, "100");
  assert.equal(result.body.movements[0].balanceAfter, "200");
  assert.equal(result.body.movements[1].balanceAfter, "150");
  assert.ok(!("unitCost" in result.body.purchases[0].lines[0]));
  await request(app).get(`/api/customers/${customerId}/statement`).expect(401);
  await worker.get("/api/customers/999999/statement").expect(404);
});
await test("Clientes · filtro de fechas conserva saldo inicial y exportación privada", async () => {
  const tomorrow = new Date(Date.now() + 86400_000 - 3 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const result = await worker
    .get(`/api/customers/${customerId}/statement?from=${tomorrow}`)
    .expect(200);
  assert.equal(result.body.purchases.length, 0);
  assert.equal(result.body.movements.length, 0);
  assert.equal(result.body.openingBalance, "150");
  assert.equal(result.body.closingBalance, "150");
  await worker
    .get(`/api/customers/${customerId}/statement?from=2026-02-31`)
    .expect(400);
  await worker
    .get(`/api/customers/${customerId}/statement?from=2026-10-31&to=2026-10-01`)
    .expect(400);
  const pdf = await worker
    .get(`/api/customers/${customerId}/statement.pdf`)
    .expect(200)
    .expect("Content-Type", /application\/pdf/)
    .expect("Cache-Control", "no-store");
  assert.ok(Buffer.isBuffer(pdf.body));
  assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
  await request(app)
    .get(`/api/customers/${customerId}/statement.pdf`)
    .expect(401);
});

await test("F1 · pagos mixtos, venta rápida y recargos", async () => {
  const p = await worker
    .post("/api/sales")
    .send(
      order(
        [],
        [
          { method: "EFECTIVO", amount: 50 },
          { method: "TRANSFERENCIA", amount: 62 },
        ],
        { quickAmount: 100, surchargePercent: 12 },
      ),
    )
    .expect(201);
  assert.equal(Number(p.body.total), 112);
  assert.equal(Number((await worker.get("/api/shift")).body.expected), 800);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ),
    16,
  );
  await worker
    .post("/api/cash-movements")
    .send({ amount: 20, direction: "RETIRO", reason: "Gasto de prueba" })
    .expect(200);
  await worker
    .post("/api/cash-movements")
    .send({ amount: 1000, direction: "RETIRO", reason: "Exceso" })
    .expect(400);
  const w = await worker
    .post("/api/withdrawals")
    .send({ amount: 100, percent: 5, mode: "RECARGO", method: "TRANSFERENCIA" })
    .expect(201);
  assert.equal(Number(w.body.digitalAmount), 105);
  const w2 = await worker
    .post("/api/withdrawals")
    .send({ amount: 100, percent: 17, mode: "DESCUENTO", method: "DEBITO" })
    .expect(201);
  assert.equal(Number(w2.body.cashAmount), 83);
  assert.equal(Number((await worker.get("/api/shift")).body.expected), 597);
});
await test("F2 · granel, redondeo y precedencia de precios escalonados", async () => {
  const p = await admin
    .post("/api/products")
    .send({
      name: "Queso por kilo",
      unit: "PESO",
      price: 1000,
      cost: 500,
      stock: 4.75,
      minimum: 1,
    })
    .expect(201);
  weightId = p.body.id;
  await admin
    .post(`/api/products/${weightId}/rules`)
    .send({ minimum: 0.5, unitPrice: 900 })
    .expect(201);
  await admin
    .post(`/api/products/${weightId}/rules`)
    .send({ minimum: 1, unitPrice: 800 })
    .expect(201);
  const sale = await worker
    .post("/api/sales")
    .send(
      order(
        [
          { productId: weightId, quantity: 0.5 },
          { productId: weightId, quantity: 0.75 },
        ],
        [{ method: "EFECTIVO", amount: 1000 }],
      ),
    )
    .expect(201);
  assert.equal(Number(sale.body.lines[0].unitPrice), 800);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: weightId } })).stock,
    ),
    3.5,
  );
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId: weightId, quantity: 0.1234 }],
        [{ method: "EFECTIVO", amount: 123.4 }],
      ),
    )
    .expect(400);
});
await test("F2 · proveedores, ofertas y faltantes", async () => {
  const a = await admin
    .post("/api/suppliers")
    .send({ name: "Proveedor A" })
    .expect(201);
  const b = await admin
    .post("/api/suppliers")
    .send({ name: "Proveedor B" })
    .expect(201);
  await admin
    .post("/api/supplier-offers")
    .send({ supplierId: a.body.id, productId, cost: 65 })
    .expect(200);
  await admin
    .post("/api/supplier-offers")
    .send({ supplierId: b.body.id, productId, cost: 60 })
    .expect(200);
  const p = (await admin.get("/api/products")).body.find(
    (p: any) => p.id === productId,
  );
  assert.equal(p.offers.length, 2);
  const note = await admin
    .post("/api/shortages")
    .send({ note: "Pedir bolsas" })
    .expect(201);
  await admin
    .patch(`/api/shortages/${note.body.id}`)
    .send({ done: true })
    .expect(200);
  assert.equal((await admin.get("/api/shortages")).body.notes[0].done, true);
});
await test("F3 · pendiente entrega stock sin cobrar y salda una sola vez", async () => {
  const beforeCash = Number((await worker.get("/api/shift")).body.expected);
  const sale = await worker
    .post("/api/sales")
    .send(order([{ productId, quantity: 1 }], [], { pendingName: "Valentina" }))
    .expect(201);
  pendingId = sale.body.id;
  assert.equal(
    Number((await worker.get("/api/shift")).body.expected),
    beforeCash,
  );
  const stockBefore = Number(
    (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
  );
  await worker
    .post(`/api/sales/${pendingId}/settle`)
    .send({ payments: [{ method: "EFECTIVO", amount: 100 }] })
    .expect(200);
  await worker
    .post(`/api/sales/${pendingId}/settle`)
    .send({ payments: [{ method: "EFECTIVO", amount: 100 }] })
    .expect(400);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ),
    stockBefore,
  );
  assert.equal(
    Number((await worker.get("/api/shift")).body.expected),
    beforeCash + 100,
  );
});
await test("F3 · anulación requiere PIN ADMIN y revierte caja/stock sin duplicar", async () => {
  const beforeCash = Number((await worker.get("/api/shift")).body.expected);
  const beforeStock = Number(
    (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
  );
  await worker
    .post(`/api/sales/${saleId}/void`)
    .send({ adminId: employeeId, pin: "667788", reason: "Prueba de anulación" })
    .expect(401);
  await worker
    .post(`/api/sales/${saleId}/void`)
    .send({ adminId, pin: "825194", reason: "Prueba de anulación" })
    .expect(200);
  await worker
    .post(`/api/sales/${saleId}/void`)
    .send({ adminId, pin: "825194", reason: "Prueba de anulación" })
    .expect(400);
  assert.equal(
    Number((await worker.get("/api/shift")).body.expected),
    beforeCash - 200,
  );
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ),
    beforeStock + 2,
  );
});
await test("F4 · reportes de operaciones, auditoría y MP sin credenciales", async () => {
  const r = await report(reportFrom, reportTo);
  assert.equal(Number(r.totalDebt), 150);
  assert.equal(Number(r.margin), 492);
  assert.equal(Number(r.total), 1412);
  assert.equal(Number(r.withdrawalCommission), 22);
  const mp = await admin.get("/api/mercadopago").expect(200);
  assert.equal(mp.body.connected, false);
  assert.match(mp.body.status, /Sin configurar/);
  const logs = await admin.get("/api/audit?q=VENTA").expect(200);
  assert.ok(logs.body.length >= 5);
  await admin.get("/api/reports?from=2026-02-31&to=2026-03-01").expect(400);
});
await test("F4 · descarga PDF real y permisos de exportación", async () => {
  const pdf = await admin
    .get(`/api/reports.pdf?from=${reportFrom}&to=${reportTo}`)
    .expect(200)
    .expect("Content-Type", /application\/pdf/);
  assert.ok(Buffer.isBuffer(pdf.body));
  assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.body.length > 2000);
  await worker
    .get(`/api/reports.pdf?from=${reportFrom}&to=${reportTo}`)
    .expect(403);
});
await test("F4 · MP guarda última respuesta y tolera caída sin revelar credenciales", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  try {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST_TOKEN_NO_REAL";
    globalThis.fetch = async (_input, init) => {
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer TEST_TOKEN_NO_REAL",
      );
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 123,
              status: "approved",
              transaction_amount: 120,
              date_created: "2026-10-27T12:00:00Z",
              description: "Prueba",
            },
          ],
        }),
        { status: 200 },
      );
    };
    const online = await admin.get("/api/mercadopago").expect(200);
    assert.equal(online.body.connected, true);
    assert.equal(online.body.payments[0].amount, 120);
    globalThis.fetch = async () => {
      throw new Error("Sin conexión");
    };
    const offline = await admin.get("/api/mercadopago").expect(200);
    assert.equal(offline.body.connected, false);
    assert.equal(offline.body.payments[0].id, 123);
    assert.ok(!JSON.stringify(offline.body).includes("TEST_TOKEN"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined)
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken;
  }
});
const catalogSample = {
  sourceName: "catalogo-prueba.xlsx",
  sourceHash: "a".repeat(64),
  sheetName: "Catálogo",
  records: [
    {
      sourceRow: 2,
      name: "Producto importado unidad",
      unit: "UNIDAD",
      referencePrice: 5,
    },
    {
      sourceRow: 3,
      name: "Producto importado granel",
      unit: "PESO",
      referencePrice: 800,
    },
    { sourceRow: 4, name: "  YERBA 500g  ", unit: "UNIDAD", referencePrice: 1 },
  ],
};
let importedUnit = 0,
  importedWeight = 0;
await test("Importación · previsualiza, omite existentes y no habilita precios anteriores", async () => {
  const before = await db.product.count();
  const preview = await importCatalog(catalogSample);
  assert.equal(preview.imported, 2);
  assert.equal(preview.skipped, 1);
  assert.equal(await db.importedProduct.count(), 0);
  const applied = await importCatalog(catalogSample, true);
  assert.equal(applied.imported, 2);
  assert.equal(await db.product.count(), before);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).price,
    ),
    100,
  );
  const list = await admin.get("/api/imported-products").expect(200);
  importedUnit = list.body.items.find((p: any) => p.unit === "UNIDAD").id;
  importedWeight = list.body.items.find((p: any) => p.unit === "PESO").id;
  assert.equal(list.body.reviewed, 0);
  assert.ok(
    !(await worker.get("/api/products")).body.some((p: any) =>
      p.name.startsWith("Producto importado"),
    ),
  );
  await worker.get("/api/imported-products").expect(403);
  await worker
    .post(`/api/imported-products/${importedUnit}/activate`)
    .send({})
    .expect(403);
});
await test("Importación · reintento idempotente y duplicados rechazados sin carga parcial", async () => {
  assert.equal(
    (await importCatalog(catalogSample, true)).alreadyImported,
    true,
  );
  assert.equal(await db.productImport.count(), 1);
  assert.equal(await db.importedProduct.count(), 2);
  const repeat = await importCatalog(
    { ...catalogSample, sourceHash: "b".repeat(64) },
    true,
  );
  assert.equal(repeat.imported, 0);
  assert.equal(repeat.skipped, 3);
  const count = await db.productImport.count();
  await assert.rejects(
    importCatalog(
      {
        ...catalogSample,
        sourceHash: "c".repeat(64),
        records: [
          catalogSample.records[0],
          { ...catalogSample.records[0], sourceRow: 8 },
        ],
      },
      true,
    ),
  );
  assert.equal(await db.productImport.count(), count);
});
await test("Importación · exige datos actuales explícitos y habilita una sola vez con Kardex", async () => {
  const valid = {
    name: "Producto importado unidad",
    category: "Almacén",
    barcode: "000123456789",
    price: "120",
    cost: "40",
    stock: "2",
    minimum: 0,
  };
  const route = `/api/imported-products/${importedUnit}/activate`;
  await admin
    .post(route)
    .send({ ...valid, price: "" })
    .expect(400);
  await admin
    .post(route)
    .send({ ...valid, cost: -1 })
    .expect(400);
  await admin
    .post(route)
    .send({ ...valid, stock: "" })
    .expect(400);
  await admin
    .post(route)
    .send({ ...valid, stock: "0.5" })
    .expect(400);
  await admin
    .post(route)
    .send({ ...valid, name: "Yerba 500g" })
    .expect(409);
  assert.equal(
    (
      await db.importedProduct.findUniqueOrThrow({
        where: { id: importedUnit },
      })
    ).productId,
    null,
  );
  const active = await admin.post(route).send(valid).expect(201);
  assert.equal(active.body.barcode, "000123456789");
  assert.equal(Number(active.body.price), 120);
  assert.equal(Number(active.body.stock), 2);
  assert.equal(
    await db.stockMovement.count({ where: { productId: active.body.id } }),
    1,
  );
  await admin.post(route).send(valid).expect(409);
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId: active.body.id, quantity: 1 }],
        [{ method: "EFECTIVO", amount: 5 }],
      ),
    )
    .expect(400);
  await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId: active.body.id, quantity: 1 }],
        [{ method: "EFECTIVO", amount: 120 }],
      ),
    )
    .expect(201);
});
await test("Importación · granel, conflicto de código y conservación del precio de referencia", async () => {
  const route = `/api/imported-products/${importedWeight}/activate`;
  const valid = {
    name: "Producto importado granel",
    category: "Almacén",
    price: 1250.5,
    cost: 900,
    stock: 4.75,
    minimum: 0.5,
  };
  await admin
    .post(route)
    .send({ ...valid, barcode: "000123456789" })
    .expect(409);
  assert.equal(
    (
      await db.importedProduct.findUniqueOrThrow({
        where: { id: importedWeight },
      })
    ).productId,
    null,
  );
  const active = await admin.post(route).send(valid).expect(201);
  assert.equal(active.body.unit, "PESO");
  assert.equal(Number(active.body.stock), 4.75);
  assert.equal(
    Number(
      (
        await db.importedProduct.findUniqueOrThrow({
          where: { id: importedWeight },
        })
      ).referencePrice,
    ),
    800,
  );
  const list = await admin.get("/api/imported-products").expect(200);
  assert.equal(list.body.items.length, 0);
  assert.equal(list.body.reviewed, 2);
});

await test("Productos · precio de venta sin costo de compra y margen sin ganancia inventada", async () => {
  const p = await admin
    .post("/api/products")
    .send({
      name: "Costo pendiente",
      category: "Almacén",
      price: 25,
      cost: "",
      stock: 10,
    })
    .expect(201);
  assert.equal(p.body.cost, null);
  const before = await report(reportFrom, reportTo);
  const sale = await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId: p.body.id, quantity: 2 }],
        [{ method: "EFECTIVO", amount: 50 }],
      ),
    )
    .expect(201);
  assert.equal(sale.body.lines[0].unitCost, null);
  const after = await report(reportFrom, reportTo);
  assert.equal(after.margin.toString(), before.margin.toString());
  assert.equal(
    Number(after.unknownCostRevenue),
    Number(before.unknownCostRevenue) + 50,
  );
  const input = {
    name: p.body.name,
    category: "Almacén",
    unit: "UNIDAD",
    price: 25,
    cost: 10,
  };
  await admin.put(`/api/products/${p.body.id}`).send(input).expect(200);
  assert.equal(
    (await report(reportFrom, reportTo)).margin.toString(),
    before.margin.toString(),
  );
  const later = await worker
    .post("/api/sales")
    .send(
      order(
        [{ productId: p.body.id, quantity: 1 }],
        [{ method: "EFECTIVO", amount: 25 }],
      ),
    )
    .expect(201);
  assert.equal(Number(later.body.lines[0].unitCost), 10);
  assert.equal(
    Number((await report(reportFrom, reportTo)).margin),
    Number(before.margin) + 15,
  );
  const zero = await admin
    .post("/api/products")
    .send({ name: "Costo cero confirmado", price: 10, cost: 0, stock: 0 })
    .expect(201);
  assert.notEqual(zero.body.cost, null);
  assert.equal(Number(zero.body.cost), 0);
  const noCost = await admin
    .post("/api/products")
    .send({ name: "Costo omitido", price: 10, stock: 0 })
    .expect(201);
  assert.equal(noCost.body.cost, null);
  const source = await importCatalog(
    {
      sourceName: "sin-costo.xlsx",
      sourceHash: "d".repeat(64),
      sheetName: "Catálogo",
      records: [
        {
          sourceRow: 2,
          name: "Importado sin costo",
          unit: "UNIDAD",
          referencePrice: 1,
        },
      ],
    },
    true,
  );
  const pending = await db.importedProduct.findFirstOrThrow({
    where: { importId: source.importId },
  });
  const active = await admin
    .post(`/api/imported-products/${pending.id}/activate`)
    .send({ name: pending.name, category: "Bebidas", price: 100, stock: 4 })
    .expect(201);
  assert.equal(active.body.cost, null);
});
await test("Stock · reemplaza cantidades temporales sin sumar dos veces y conserva Kardex", async () => {
  const p = await admin
    .post("/api/products")
    .send({ name: "Stock para corregir", price: 10, stock: 100 })
    .expect(201);
  const route = `/api/products/${p.body.id}/stock`;
  await worker
    .post(route)
    .send({ mode: "SET", quantity: 8, reason: "Conteo real" })
    .expect(403);
  await admin
    .post(route)
    .send({ mode: "SET", quantity: 8, reason: "Conteo real" })
    .expect(200);
  await admin
    .post(route)
    .send({ mode: "SET", quantity: 8, reason: "Segundo conteo" })
    .expect(200);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: p.body.id } })).stock,
    ),
    8,
  );
  await admin
    .post(route)
    .send({ mode: "SET", quantity: 0, reason: "Sin existencias" })
    .expect(200);
  await admin
    .post(route)
    .send({ mode: "SET", quantity: -1, reason: "Conteo inválido" })
    .expect(400);
  await admin
    .post(route)
    .send({ mode: "SET", quantity: "", reason: "Dato faltante" })
    .expect(400);
  await admin
    .post(route)
    .send({ mode: "SET", quantity: null, reason: "Dato faltante" })
    .expect(400);
  await admin
    .post(route)
    .send({ mode: "SET", quantity: 0.5, reason: "Fracción inválida" })
    .expect(400);
  await admin
    .post(route)
    .send({ mode: "DELTA", quantity: 0, reason: "Sin cambio" })
    .expect(400);
  await admin
    .post(route)
    .send({ mode: "DELTA", quantity: 3, reason: "Compra" })
    .expect(200);
  assert.equal(
    Number(
      (await db.product.findUniqueOrThrow({ where: { id: p.body.id } })).stock,
    ),
    3,
  );
  assert.equal((await admin.get("/api/reconcile")).body.ok, true);
});

await test("F5 · restricciones de integridad también en SQLite", async () => {
  await assert.rejects(
    db.product.update({ where: { id: productId }, data: { stock: -1 } }),
  );
  await assert.rejects(
    db.customer.update({ where: { id: customerId }, data: { balance: 301 } }),
  );
  await assert.rejects(
    db.employee.update({
      where: { id: employeeId },
      data: { role: "SUPERUSUARIO" },
    }),
  );
  await assert.rejects(db.shift.create({ data: { employeeId, opening: 0 } }));
});
await test("F5 · rotación de backups elimina solo copias propias vencidas", async () => {
  const old = path.join(
    process.env.BACKUP_DIR!,
    "universo-2020-01-01T00-00-00-000Z.db",
  );
  const unrelated = path.join(
    process.env.BACKUP_DIR!,
    "archivo-del-usuario.txt",
  );
  await writeFile(old, "copia vencida de prueba");
  await writeFile(unrelated, "preservar");
  const past = new Date(Date.now() - 16 * 86400_000);
  await utimes(old, past, past);
  await utimes(unrelated, past, past);
  await admin.post("/api/backups").expect(200);
  const files = await readdir(process.env.BACKUP_DIR!);
  assert.ok(!files.includes(path.basename(old)));
  assert.ok(files.includes(path.basename(unrelated)));
});
await test("F5 · cambio de PIN revoca sesiones anteriores", async () => {
  const testEmployee = await admin
    .post("/api/employees")
    .send({ name: "Sesión revocable", pin: "112233", role: "EMPLEADO" })
    .expect(201);
  const agent = request.agent(app).set("X-POS-Request", "1");
  await agent
    .post("/api/login")
    .send({ employeeId: testEmployee.body.id, pin: "112233" })
    .expect(200);
  await admin
    .patch(`/api/employees/${testEmployee.body.id}`)
    .send({ pin: "223344" })
    .expect(200);
  await agent.get("/api/me").expect(401);
});
await test("F5 · reconciliación, respaldo consistente, cierre y persistencia", async () => {
  const reconciled = await admin.get("/api/reconcile").expect(200);
  assert.equal(reconciled.body.ok, true);
  const cash = (await worker.get("/api/shift")).body.expected;
  const closed = await worker
    .post("/api/shifts/close")
    .send({ declared: cash })
    .expect(200);
  assert.equal(Number(closed.body.difference), 0);
  const backup = await admin.post("/api/backups").expect(200);
  const restored = new DatabaseSync(
    path.join(process.env.BACKUP_DIR!, backup.body.file),
    { readOnly: true },
  );
  assert.equal(
    (restored.prepare("PRAGMA integrity_check").get() as any).integrity_check,
    "ok",
  );
  assert.equal(
    (restored.prepare("SELECT COUNT(*) AS n FROM Sale").get() as any).n,
    await db.sale.count(),
  );
  restored.close();
  await db.$disconnect();
  assert.ok((await db.sale.count()) > 0);
  await worker.post("/api/logout").expect(200);
  await worker.get("/api/products").expect(401);
});
after(async () => {
  await db.$disconnect();
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
});
