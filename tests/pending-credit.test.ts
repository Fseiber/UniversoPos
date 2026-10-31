import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { postgresFixture } from "./postgres-fixture.js";

test("Pendientes a fiado · cuenta, límite, stock, caja y reintentos", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  const { app } = await import("../server/app.js");
  const { db } = await import("../server/db.js");
  const agent = request.agent(app).set("X-POS-Request", "1");
  try {
    const owner = (
      await agent
        .post("/api/setup")
        .send({ name: "Prueba", pin: "491628" })
        .expect(201)
    ).body;
    await agent
      .post("/api/login")
      .send({ employeeId: owner.id, pin: "491628" })
      .expect(200);
    await agent.post("/api/shifts/open").send({ opening: 100 }).expect(201);
    const product = (
      await agent
        .post("/api/products")
        .send({ name: "Producto", price: 200, stock: 10 })
        .expect(201)
    ).body;
    const customer = (
      await agent
        .post("/api/customers")
        .send({ name: "Sanchez", creditLimit: 300 })
        .expect(201)
    ).body;
    const pending = async (customerId?: number) =>
      (
        await agent
          .post("/api/sales")
          .send({
            requestKey: randomUUID(),
            customerId,
            pendingName: "Sanchez",
            items: [{ productId: product.id, quantity: 1 }],
            payments: [],
          })
          .expect(201)
      ).body;
    const sale = await pending(customer.id);
    const payment = { payments: [{ method: "CUENTA_CORRIENTE", amount: 200 }] };
    await agent.post(`/api/sales/${sale.id}/settle`).send(payment).expect(200);
    assert.equal(
      (await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status,
      "COMPLETADA",
    );
    assert.equal(
      Number(
        (await db.customer.findUniqueOrThrow({ where: { id: customer.id } }))
          .balance,
      ),
      200,
    );
    await agent.post(`/api/sales/${sale.id}/settle`).send(payment).expect(400);
    assert.equal(
      await db.accountMovement.count({
        where: { saleId: sale.id, kind: "CARGO_FIADO" },
      }),
      1,
    );
    assert.equal(await db.payment.count({ where: { saleId: sale.id } }), 1);
    assert.equal(
      Number(
        (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
          .stock,
      ),
      9,
    );
    const second = await pending();
    await agent
      .post(`/api/sales/${second.id}/settle`)
      .send(payment)
      .expect(400);
    await agent
      .post(`/api/sales/${second.id}/settle`)
      .send({ ...payment, customerId: customer.id })
      .expect(400);
    assert.equal(
      (await db.sale.findUniqueOrThrow({ where: { id: second.id } })).status,
      "PENDIENTE",
    );
    assert.equal(await db.payment.count({ where: { saleId: second.id } }), 0);
    const unlimited = (
      await agent
        .post("/api/customers")
        .send({ name: "Otra cuenta", creditLimit: 0, creditUnlimited: true })
        .expect(201)
    ).body;
    await agent
      .post(`/api/sales/${second.id}/settle`)
      .send({ ...payment, customerId: unlimited.id })
      .expect(200);
    assert.equal(
      (await db.sale.findUniqueOrThrow({ where: { id: second.id } }))
        .customerId,
      unlimited.id,
    );
    assert.equal(
      Number(
        (await db.customer.findUniqueOrThrow({ where: { id: unlimited.id } }))
          .balance,
      ),
      200,
    );
    assert.equal(
      Number(
        (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
          .stock,
      ),
      8,
    );
    assert.equal(
      Number((await agent.get("/api/shift").expect(200)).body.expected),
      100,
    );
    const statement = (
      await agent.get(`/api/customers/${unlimited.id}/statement`).expect(200)
    ).body;
    assert.equal(statement.purchases[0].id, second.id);
    assert.equal(statement.movements[0].purchase.id, second.id);
    assert.equal(Number(statement.closingBalance), 200);
    assert.equal(
      (await agent.get("/api/sales/history?status=PENDIENTE").expect(200)).body
        .total,
      0,
    );
  } finally {
    await db.$disconnect();
    await fixture.dispose();
  }
});
