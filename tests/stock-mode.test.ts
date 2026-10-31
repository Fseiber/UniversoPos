import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { postgresFixture } from "./postgres-fixture.js";
test("Modo sin stock · permisos, cantidades, cambio de modo, pendientes, reintentos y anulaciones", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  const { app } = await import("../server/app.js");
  const { db } = await import("../server/db.js");
  const { voidSale, reconcile } = await import("../server/services.js");
  const admin = request.agent(app).set("X-POS-Request", "1"),
    worker = request.agent(app).set("X-POS-Request", "1");
  try {
    const owner = await admin
      .post("/api/setup")
      .send({ name: "Modo de prueba", pin: "815263" })
      .expect(201);
    await admin
      .post("/api/login")
      .send({ employeeId: owner.body.id, pin: "815263" })
      .expect(200);
    const employee = await admin
      .post("/api/employees")
      .send({ name: "Caja", pin: "625184", role: "EMPLEADO" })
      .expect(201);
    await worker
      .post("/api/login")
      .send({ employeeId: employee.body.id, pin: "625184" })
      .expect(200);
    await admin.post("/api/shifts/open").send({ opening: 1000 }).expect(201);
    const p = await admin
      .post("/api/products")
      .send({ name: "Mercadería", price: 10, stock: 2 })
      .expect(201);
    const payload = (quantity: number, extra = {}) => ({
      requestKey: randomUUID(),
      items: [{ productId: p.body.id, quantity }],
      payments: [{ method: "EFECTIVO", amount: quantity * 10 }],
      ...extra,
    });
    await worker.post("/api/sales").send(payload(3)).expect(400);
    await worker
      .put("/api/settings/stock")
      .send({ stockEnabled: false, expectedVersion: 0 })
      .expect(403);
    await admin
      .put("/api/settings/stock")
      .send({ stockEnabled: false, expectedVersion: 0 })
      .expect(200);
    await admin
      .put("/api/settings/stock")
      .send({ stockEnabled: true, expectedVersion: 0 })
      .expect(409);
    const offPayload = payload(3, { expectedStockEnabled: false });
    const off = await worker.post("/api/sales").send(offPayload).expect(201);
    assert.equal(off.body.stockTracked, false);
    const empty = await admin
      .post("/api/products")
      .send({ name: "Sin existencias", price: 10, stock: 0 })
      .expect(201);
    await worker
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        items: [{ productId: empty.body.id, quantity: 2 }],
        payments: [{ method: "EFECTIVO", amount: 20 }],
      })
      .expect(201);
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: empty.body.id } })
      ).stock.toString(),
      "0",
    );
    assert.equal(
      await db.stockMovement.count({ where: { productId: empty.body.id } }),
      0,
    );
    const bulk = await admin
      .post("/api/products")
      .send({
        name: "Granel sin existencias",
        unit: "PESO",
        price: 100,
        stock: 0,
      })
      .expect(201);
    await worker
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        items: [{ productId: bulk.body.id, quantity: 0.125 }],
        payments: [{ method: "EFECTIVO", amount: 12.5 }],
      })
      .expect(201);
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: bulk.body.id } })
      ).stock.toString(),
      "0",
    );
    await worker.post("/api/sales").send(payload(0.5)).expect(400);
    const pending = await worker
      .post("/api/sales")
      .send(payload(5, { pendingName: "Entrega sin control", payments: [] }))
      .expect(201);
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: p.body.id } })
      ).stock.toString(),
      "2",
    );
    assert.equal(
      await db.stockMovement.count({ where: { productId: p.body.id } }),
      1,
    );
    await admin
      .put("/api/settings/stock")
      .send({ stockEnabled: true, expectedVersion: 1 })
      .expect(200);
    const retry = await worker.post("/api/sales").send(offPayload).expect(201);
    assert.equal(retry.body.id, off.body.id);
    await voidSale(
      off.body.id,
      "Anular sin movimiento",
      owner.body.id,
      owner.body.id,
    );
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: p.body.id } })
      ).stock.toString(),
      "2",
    );
    const { settleSale } = await import("../server/services.js");
    await settleSale(
      pending.body.id,
      [{ method: "EFECTIVO", amount: 50 }],
      undefined,
      owner.body.id,
    );
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: p.body.id } })
      ).stock.toString(),
      "2",
    );
    await voidSale(
      pending.body.id,
      "Anular pendiente saldada",
      owner.body.id,
      owner.body.id,
    );
    const tracked = await worker
      .post("/api/sales")
      .send(payload(1, { expectedStockEnabled: true }))
      .expect(201);
    assert.equal(tracked.body.stockTracked, true);
    await admin
      .put("/api/settings/stock")
      .send({ stockEnabled: false, expectedVersion: 2 })
      .expect(200);
    await worker
      .post("/api/sales")
      .send(payload(1, { expectedStockEnabled: true }))
      .expect(409);
    await voidSale(
      tracked.body.id,
      "Restituir según modo original",
      owner.body.id,
      owner.body.id,
    );
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: p.body.id } })
      ).stock.toString(),
      "2",
    );
    assert.equal(
      await db.stockMovement.count({ where: { productId: p.body.id } }),
      3,
    );
    assert.equal((await reconcile()).ok, true);
    assert.equal(
      (await worker.get("/api/settings/stock").expect(200)).body.stockEnabled,
      false,
    );
  } finally {
    await db.$disconnect();
    await fixture.dispose();
  }
});
