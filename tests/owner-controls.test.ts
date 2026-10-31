import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { postgresFixture } from "./postgres-fixture.js";
test("Dueños y empleados · privacidad, arqueo ciego, autorizaciones, conflictos y recuperación", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  const { app } = await import("../server/app.js");
  const { db } = await import("../server/db.js");
  const owner = request.agent(app).set("X-POS-Request", "1"),
    worker = request.agent(app).set("X-POS-Request", "1");
  try {
    const admin = (
      await owner
        .post("/api/setup")
        .send({ name: "Dueño", pin: "716283" })
        .expect(201)
    ).body;
    await owner
      .post("/api/login")
      .send({ employeeId: admin.id, pin: "716283" })
      .expect(200);
    const employee = (
      await owner
        .post("/api/employees")
        .send({ name: "Empleado", pin: "891234", role: "EMPLEADO" })
        .expect(201)
    ).body;
    await worker
      .post("/api/login")
      .send({ employeeId: employee.id, pin: "891234" })
      .expect(200);
    await owner.post("/api/shifts/open").send({ opening: 1000 }).expect(201);
    assert.equal((await worker.get("/api/shift")).body.expected, null);
    const p = (
      await owner
        .post("/api/products")
        .send({ name: "Prueba permisos", cost: 50, price: 100, stock: 10 })
        .expect(201)
    ).body;
    assert.equal((await owner.get("/api/products")).body[0].cost, "50");
    assert.ok(!("cost" in (await worker.get("/api/products")).body[0]));
    const order = {
      requestKey: randomUUID(),
      items: [{ productId: p.id, quantity: 1 }],
      surchargePercent: 10,
      payments: [{ method: "EFECTIVO", amount: 110 }],
    };
    await worker.post("/api/sales").send(order).expect(403);
    assert.equal(await db.sale.count(), 0);
    await worker
      .post("/api/sales")
      .send({
        ...order,
        approval: {
          adminId: admin.id,
          pin: "716283",
          reason: "Recargo autorizado",
        },
      })
      .expect(201);
    const recovered = (
      await worker.get(`/api/sales/by-request/${order.requestKey}`).expect(200)
    ).body;
    assert.ok(!("unitCost" in recovered.lines[0]));
    await worker.post("/api/sales").send(order).expect(201);
    assert.equal(await db.sale.count(), 1);
    assert.ok(
      !(
        "unitCost" in
        (await worker.get("/api/sales/history")).body.items[0].lines[0]
      ),
    );
    await worker
      .post("/api/cash-movements")
      .send({ amount: 1, direction: "RETIRO", reason: "Retiro prueba" })
      .expect(403);
    await owner
      .put("/api/settings/employees")
      .send({ employeeSurchargeLimit: 5, employeeMovementLimit: 10 })
      .expect(200);
    await worker
      .post("/api/cash-movements")
      .send({ amount: 5, direction: "RETIRO", reason: "Retiro menor" })
      .expect(200);
    const fresh = (await owner.get("/api/products")).body[0];
    await owner
      .put(`/api/products/${p.id}`)
      .send({ ...fresh, barcode: fresh.barcode ?? "", price: 120 })
      .expect(200);
    await owner
      .put(`/api/products/${p.id}`)
      .send({ ...fresh, barcode: fresh.barcode ?? "", price: 90 })
      .expect(409);
    await worker
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        items: [{ productId: p.id, quantity: 1, expectedUnitPrice: 100 }],
        payments: [{ method: "EFECTIVO", amount: 120 }],
      })
      .expect(409);
    assert.equal(await db.sale.count(), 1);
    await worker.get("/api/commerce/purchases").expect(403);
    await worker
      .put("/api/settings/employees")
      .send({ employeeSurchargeLimit: 100, employeeMovementLimit: 1000 })
      .expect(403);
    await worker
      .put("/api/recovery/offsite")
      .send({ directory: "E:/No autorizado" })
      .expect(403);
    const closed = (
      await worker
        .post("/api/shifts/close")
        .send({ declared: 1105 })
        .expect(200)
    ).body;
    assert.equal(Number(closed.difference), 0);
    await owner.get("/api/health").expect(200);
  } finally {
    await db.$disconnect();
    await fixture.dispose();
  }
});
