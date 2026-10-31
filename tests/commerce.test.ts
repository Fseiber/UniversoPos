import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { postgresFixture } from "./postgres-fixture.js";
import {
  postgresEnvironment,
  postgresTool,
  runFile,
} from "../scripts/postgres-tools.js";
test("Gestión comercial · recepción atómica, costos históricos, pagos digitales, lotes, gastos y recuperación", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  const { app } = await import("../server/app.js"),
    { db } = await import("../server/db.js");
  const owner = request.agent(app).set("X-POS-Request", "1");
  let restored: { name: string; url: string } | undefined;
  try {
    const admin = (
      await owner
        .post("/api/setup")
        .send({ name: "Compras", pin: "721683" })
        .expect(201)
    ).body;
    await owner
      .post("/api/login")
      .send({ employeeId: admin.id, pin: "721683" })
      .expect(200);
    await owner.post("/api/shifts/open").send({ opening: 1000 }).expect(201);
    const product = (
      await owner
        .post("/api/products")
        .send({
          name: "Compra leche",
          category: "Lácteos",
          cost: 20,
          price: 100,
          stock: 4,
        })
        .expect(201)
    ).body;
    const customer = (
      await owner
        .post("/api/customers")
        .send({ name: "Cuenta digital", creditLimit: 1000 })
        .expect(201)
    ).body;
    const sale = (
      await owner
        .post("/api/sales")
        .send({
          requestKey: randomUUID(),
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: "CUENTA_CORRIENTE", amount: 100 }],
        })
        .expect(201)
    ).body;
    const supplier = (
      await owner
        .post("/api/suppliers")
        .send({ name: "Proveedor prueba" })
        .expect(201)
    ).body;
    const fresh = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    const receipt = {
      requestKey: randomUUID(),
      supplierId: supplier.id,
      document: "Remito 123",
      expenses: 15,
      items: [
        {
          productId: product.id,
          version: fresh.version,
          quantity: 3,
          unitCost: 30,
          lot: "L-01",
          expiresAt: "2026-11-05",
        },
      ],
    };
    const purchase = (
      await owner.post("/api/commerce/purchases").send(receipt).expect(201)
    ).body;
    await owner.post("/api/commerce/purchases").send(receipt).expect(201);
    assert.equal(await db.purchase.count(), 1);
    assert.equal(Number(purchase.total), 105);
    const received = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    assert.equal(Number(received.stock), 6);
    assert.equal(Number(received.cost), 35);
    assert.equal(
      Number(
        (await db.saleLine.findFirstOrThrow({ where: { saleId: sale.id } }))
          .unitCost,
      ),
      20,
    );
    assert.equal(
      Number((await db.purchaseLine.findFirstOrThrow()).previousCost),
      20,
    );
    await owner
      .post("/api/commerce/purchases")
      .send({ ...receipt, requestKey: randomUUID() })
      .expect(409);
    assert.equal(await db.purchase.count(), 1);
    const digitalPayment = {
      requestKey: randomUUID(),
      method: "TRANSFERENCIA",
      amount: 50,
      reference: "OP-501",
      confirmed: false,
    };
    await owner
      .post(`/api/commerce/purchases/${purchase.id}/payments`)
      .send(digitalPayment)
      .expect(400);
    digitalPayment.confirmed = true;
    await Promise.all([
      owner
        .post(`/api/commerce/purchases/${purchase.id}/payments`)
        .send(digitalPayment)
        .expect(201),
      owner
        .post(`/api/commerce/purchases/${purchase.id}/payments`)
        .send(digitalPayment)
        .expect(201),
    ]);
    assert.equal(Number((await owner.get("/api/shift")).body.expected), 1000);
    await owner
      .post(`/api/commerce/purchases/${purchase.id}/payments`)
      .send({ requestKey: randomUUID(), amount: 56, method: "EFECTIVO" })
      .expect(400);
    await owner
      .post(`/api/commerce/purchases/${purchase.id}/payments`)
      .send({ requestKey: randomUUID(), amount: 55, method: "EFECTIVO" })
      .expect(201);
    const debtPayment = {
      requestKey: randomUUID(),
      amount: 60,
      method: "TRANSFERENCIA",
      reference: "OP-602",
      confirmed: true,
    };
    await Promise.all([
      owner
        .post(`/api/customers/${customer.id}/payments`)
        .send(debtPayment)
        .expect(200),
      owner
        .post(`/api/customers/${customer.id}/payments`)
        .send(debtPayment)
        .expect(200),
    ]);
    assert.equal(
      Number(
        (await db.customer.findUniqueOrThrow({ where: { id: customer.id } }))
          .balance,
      ),
      40,
    );
    assert.equal(Number((await owner.get("/api/shift")).body.expected), 945);
    await owner
      .post(`/api/customers/${customer.id}/payments`)
      .send({ ...debtPayment, amount: 20 })
      .expect(409);
    await owner
      .post(`/api/customers/${customer.id}/payments`)
      .send({ requestKey: randomUUID(), amount: 40 })
      .expect(200);
    const statement = (
      await owner.get(`/api/customers/${customer.id}/statement`)
    ).body;
    assert.equal(Number(statement.paymentsReceived), 100);
    assert.ok(
      statement.movements.some((m: any) => m.kind === "PAGO_TRANSFERENCIA"),
    );
    await owner
      .post("/api/cash-movements")
      .send({
        amount: 10,
        direction: "RETIRO",
        category: "GASTO",
        reason: "Librería del local",
      })
      .expect(200);
    await owner
      .post("/api/cash-movements")
      .send({
        amount: 20,
        direction: "RETIRO",
        category: "RETIRO_DUENO",
        reason: "Retiro personal",
      })
      .expect(200);
    const report = (
      await owner.get("/api/reports?from=2026-01-01&to=2026-12-31").expect(200)
    ).body;
    assert.equal(Number(report.expenses), 10);
    assert.equal(Number(report.inventoryValue), 210);
    assert.equal(Number(report.margin), 80);
    assert.equal(Number(report.byEmployee[0].amount), 100);
    assert.equal(
      Number(
        report.debtCollectionsByMethod.find(
          (p: any) => p.name === "TRANSFERENCIA",
        ).amount,
      ),
      60,
    );
    const lot = (await owner.get("/api/commerce/lots").expect(200)).body
      .items[0];
    assert.equal(lot.code, "L-01");
    await owner
      .post(`/api/commerce/lots/${lot.id}/resolve`)
      .send({ reason: "Lote agotado verificado" })
      .expect(200);
    assert.equal((await owner.get("/api/commerce/lots")).body.items.length, 0);
    assert.equal(
      Number(
        (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
          .stock,
      ),
      6,
    );
    const { createBackup, backupDirectory } = await import(
      "../server/backups.js"
    );
    const offsite = path.join(backupDirectory(), "offsite-test");
    await owner
      .put("/api/recovery/offsite")
      .send({ directory: offsite })
      .expect(200);
    const name = await createBackup();
    const file = path.join(backupDirectory(), name);
    assert.deepEqual(
      await readFile(file),
      await readFile(path.join(offsite, name)),
    );
    const { restoreCopy } = await import("../scripts/restore.js");
    const restoredCopy = await restoreCopy(file);
    restored = restoredCopy;
    const client = new PrismaClient({
      datasources: { db: { url: restoredCopy.url } },
    });
    try {
      assert.equal(await client.purchase.count(), 1);
      assert.equal(await client.supplierPayment.count(), 2);
      assert.equal(
        Number(
          (
            await client.customer.findUniqueOrThrow({
              where: { id: customer.id },
            })
          ).balance,
        ),
        0,
      );
    } finally {
      await client.$disconnect();
    }
    assert.equal(await db.sale.count(), 1);
  } finally {
    if (restored) {
      await runFile(postgresTool("dropdb"), ["--no-password", restored.name], {
        env: postgresEnvironment(fixture.url),
        windowsHide: true,
      });
    }
    await db.$disconnect();
    await fixture.dispose();
  }
});
