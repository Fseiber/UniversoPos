import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { postgresFixture } from "./postgres-fixture.js";
test("Devoluciones, envases y recordatorios · importes, permisos, stock, saldos y copia externa", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  await mkdir(".test-data", { recursive: true });
  const dir = await mkdtemp(path.resolve(".test-data/returns-"));
  process.env.BACKUP_DIR = path.join(dir, "backup");
  process.env.BACKUP_SECONDARY_DIR = path.join(dir, "external");
  const { app } = await import("../server/app.js");
  const { db } = await import("../server/db.js");
  const { report } = await import("../server/management.js");
  const { reconcile } = await import("../server/services.js");
  const { createBackup } = await import("../server/backups.js");
  const admin = request.agent(app).set("X-POS-Request", "1");
  try {
    const owner = await admin
      .post("/api/setup")
      .send({ name: "Devoluciones", pin: "862315" })
      .expect(201);
    await admin
      .post("/api/login")
      .send({ employeeId: owner.body.id, pin: "862315" })
      .expect(200);
    await admin.post("/api/shifts/open").send({ opening: 1000 }).expect(201);
    const product = await admin
      .post("/api/products")
      .send({ name: "Producto retorno", price: 100, cost: 60, stock: 10 })
      .expect(201);
    const sale = await admin
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        items: [{ productId: product.body.id, quantity: 2 }],
        surchargePercent: 10,
        payments: [{ method: "EFECTIVO", amount: 220 }],
      })
      .expect(201);
    const items = [{ lineId: sale.body.lines[0].id, quantity: 1 }];
    const preview = await admin
      .post(`/api/sales/${sale.body.id}/return-preview`)
      .send({ items })
      .expect(200);
    assert.equal(preview.body.amount, "110");
    const payload = {
      items,
      requestKey: randomUUID(),
      expectedAmount: "110",
      method: "EFECTIVO",
      reason: "Devolución de prueba",
      restock: true,
      adminId: owner.body.id,
      pin: "862315",
    };
    await admin
      .post(`/api/sales/${sale.body.id}/returns`)
      .send({ ...payload, pin: "0000" })
      .expect(401);
    const returned = await admin
      .post(`/api/sales/${sale.body.id}/returns`)
      .send(payload)
      .expect(200);
    const repeated = await admin
      .post(`/api/sales/${sale.body.id}/returns`)
      .send(payload)
      .expect(200);
    assert.equal(returned.body.id, repeated.body.id);
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: product.body.id } })
      ).stock.toString(),
      "9",
    );
    await admin
      .post(`/api/sales/${sale.body.id}/returns`)
      .send({
        ...payload,
        requestKey: randomUUID(),
        items: [{ lineId: items[0].lineId, quantity: 2 }],
      })
      .expect(400);
    await admin
      .post(`/api/sales/${sale.body.id}/void`)
      .send({
        adminId: owner.body.id,
        pin: "862315",
        reason: "Intento de anulación",
      })
      .expect(400);
    await admin
      .post(`/api/sales/${sale.body.id}/returns`)
      .send({ ...payload, requestKey: randomUUID(), restock: false })
      .expect(200);
    const day = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());
    const summary = await report(day, day);
    assert.equal(summary.total.toString(), "0");
    assert.equal(summary.margin.toString(), "-60");
    assert.equal((await reconcile()).ok, true);
    const c = await admin
      .post("/api/customers")
      .send({ name: "Cliente envases", creditLimit: 1000 })
      .expect(201);
    const credit = await admin
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        customerId: c.body.id,
        items: [{ productId: product.body.id, quantity: 2 }],
        payments: [{ method: "CUENTA_CORRIENTE", amount: 200 }],
      })
      .expect(201);
    await admin
      .post(`/api/sales/${credit.body.id}/returns`)
      .send({
        ...payload,
        requestKey: randomUUID(),
        items: [{ lineId: credit.body.lines[0].id, quantity: 1 }],
        expectedAmount: "100",
        method: "CUENTA_CORRIENTE",
      })
      .expect(200);
    assert.equal(
      (
        await db.customer.findUniqueOrThrow({ where: { id: c.body.id } })
      ).balance.toString(),
      "100",
    );
    const currentStock = (
      await db.product.findUniqueOrThrow({ where: { id: product.body.id } })
    ).stock.toString();
    await admin
      .put("/api/settings/stock")
      .send({ stockEnabled: false, expectedVersion: 0 })
      .expect(200);
    const untracked = await admin
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        items: [{ productId: product.body.id, quantity: 50 }],
        payments: [{ method: "EFECTIVO", amount: 5000 }],
      })
      .expect(201);
    await admin
      .post(`/api/sales/${untracked.body.id}/returns`)
      .send({
        ...payload,
        requestKey: randomUUID(),
        items: [{ lineId: untracked.body.lines[0].id, quantity: 1 }],
        expectedAmount: "100",
        restock: true,
      })
      .expect(200);
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: product.body.id } })
      ).stock.toString(),
      currentStock,
    );
    assert.equal((await reconcile()).ok, true);
    await admin
      .post("/api/notes")
      .send({
        title: "Envase pendiente",
        body: "Revisar envase al atender",
        customerId: c.body.id,
        dueAt: new Date().toISOString(),
      })
      .expect(201);
    const supplier = await db.supplier.create({
      data: { name: "Proveedor vinculado" },
    });
    await admin
      .post("/api/notes")
      .send({
        title: "Producto a revisar",
        body: "Revisar presentación",
        productId: product.body.id,
        supplierId: supplier.id,
      })
      .expect(201);
    const relevant = await admin
      .get(`/api/notes/relevant?products=${product.body.id}`)
      .expect(200);
    assert.equal(relevant.body.length, 1);
    assert.equal(relevant.body[0].supplier.name, supplier.name);
    const movement = {
      requestKey: randomUUID(),
      kind: "Botella 1 L",
      quantity: 3,
      reason: "Préstamo inicial",
    };
    const first = await admin
      .post(`/api/customers/${c.body.id}/containers`)
      .send(movement)
      .expect(200);
    const again = await admin
      .post(`/api/customers/${c.body.id}/containers`)
      .send(movement)
      .expect(200);
    assert.equal(first.body.id, again.body.id);
    await admin
      .post(`/api/customers/${c.body.id}/containers`)
      .send({
        ...movement,
        requestKey: randomUUID(),
        quantity: -1,
        reason: "Entrega un envase",
      })
      .expect(200);
    await admin
      .post(`/api/customers/${c.body.id}/containers`)
      .send({
        ...movement,
        requestKey: randomUUID(),
        quantity: -3,
        reason: "Entrega excesiva",
      })
      .expect(400);
    const reminders = await admin
      .get(`/api/customers/${c.body.id}/reminders`)
      .expect(200);
    assert.equal(reminders.body.notes.length, 1);
    assert.equal(reminders.body.balances[0].quantity, 2);
    const file = await createBackup();
    assert.deepEqual(
      await readFile(path.join(process.env.BACKUP_DIR!, file)),
      await readFile(path.join(process.env.BACKUP_SECONDARY_DIR!, file)),
    );
  } finally {
    await db.$disconnect();
    await fixture.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
