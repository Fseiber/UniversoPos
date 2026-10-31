import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { postgresFixture } from "./postgres-fixture.js";
import { accountStatementText } from "../src/account-summary.js";
test("Mostrador · sin límite, notas auditadas, orden global y cobro de pendientes del día", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  const { app } = await import("../server/app.js"),
    { db } = await import("../server/db.js");
  const owner = request.agent(app).set("X-POS-Request", "1"),
    worker = request.agent(app).set("X-POS-Request", "1");
  try {
    const admin = (
      await owner
        .post("/api/setup")
        .send({ name: "Zulu dueño", pin: "491628" })
        .expect(201)
    ).body;
    await owner
      .post("/api/login")
      .send({ employeeId: admin.id, pin: "491628" })
      .expect(200);
    const e = (
      await owner
        .post("/api/employees")
        .send({ name: "Ana caja", role: "EMPLEADO", pin: "781264" })
        .expect(201)
    ).body;
    await worker
      .post("/api/login")
      .send({ employeeId: e.id, pin: "781264" })
      .expect(200);
    await worker
      .post("/api/customers")
      .send({ name: "No autorizado", creditLimit: 0, creditUnlimited: true })
      .expect(403);
    const c = (
      await owner
        .post("/api/customers")
        .send({ name: "Sanchez", creditLimit: 0, creditUnlimited: true })
        .expect(201)
    ).body;
    await owner.post("/api/shifts/open").send({ opening: 100 }).expect(201);
    await worker
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        customerId: c.id,
        quickAmount: 500000,
        payments: [{ method: "CUENTA_CORRIENTE", amount: 500000 }],
      })
      .expect(201);
    const statement = (await owner.get(`/api/customers/${c.id}/statement`))
      .body;
    assert.equal(statement.customer.creditUnlimited, true);
    assert.equal(statement.customer.available, null);
    assert.match(accountStatementText(statement), /Sin límite/);
    await owner.get(`/api/customers/${c.id}/statement.pdf`).expect(200);
    await owner
      .patch(`/api/customers/${c.id}`)
      .send({
        name: "Sanchez",
        phone: "",
        creditLimit: 100,
        creditUnlimited: false,
      })
      .expect(400);
    await assert.rejects(
      db.customer.update({
        where: { id: c.id },
        data: { creditUnlimited: false, creditLimit: 100 },
      }),
    );
    await owner
      .patch(`/api/customers/${c.id}`)
      .send({
        name: "Sanchez",
        phone: "",
        creditLimit: 600000,
        creditUnlimited: false,
      })
      .expect(200);
    await worker
      .post("/api/sales")
      .send({
        requestKey: randomUUID(),
        customerId: c.id,
        quickAmount: 200000,
        payments: [{ method: "CUENTA_CORRIENTE", amount: 200000 }],
      })
      .expect(400);
    await owner
      .patch(`/api/customers/${c.id}`)
      .send({
        name: "Sanchez",
        phone: "",
        creditLimit: 0,
        creditUnlimited: true,
      })
      .expect(200);
    await owner
      .post(`/api/customers/${c.id}/payments`)
      .send({ amount: 500001 })
      .expect(400);
    const note = (
      await worker
        .post("/api/notes")
        .send({
          title: "Envase devuelto",
          body: "Detalle completo para auditoría",
          customerId: c.id,
        })
        .expect(201)
    ).body;
    await owner
      .delete(`/api/notes/${note.id}`)
      .send({ expectedVersion: 0 })
      .expect(409);
    await worker
      .patch(`/api/notes/${note.id}`)
      .send({ resolved: true, expectedVersion: 0 })
      .expect(200);
    await owner
      .delete(`/api/notes/${note.id}`)
      .send({ expectedVersion: 0 })
      .expect(409);
    await worker
      .delete(`/api/notes/${note.id}`)
      .send({ expectedVersion: 1 })
      .expect(200);
    assert.equal(await db.note.count(), 0);
    const deleted = await db.audit.findFirstOrThrow({
      where: { action: "ELIMINAR_NOTA" },
    });
    assert.equal(deleted.employeeId, e.id);
    assert.equal(
      JSON.parse(deleted.detail).before.body,
      "Detalle completo para auditoría",
    );
    await db.audit.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        employeeId: i < 105 ? e.id : admin.id,
        action: i < 105 ? "B_TEST" : "A_TEST",
        entity: "ORDEN_DEMO",
        detail: "",
        createdAt: new Date(2001, 0, 1, i),
      })),
    });
    const first = (
      await owner
        .get("/api/audit?page=true&q=orden_demo&sort=employee&direction=asc")
        .expect(200)
    ).body;
    assert.equal(first.total, 205);
    assert.equal(first.items.length, 100);
    assert.ok(first.items.every((r: any) => r.employeeName === "Ana caja"));
    const second = (
      await owner.get(
        "/api/audit?page=true&q=orden_demo&sort=employee&direction=asc&offset=100",
      )
    ).body;
    assert.equal(
      second.items.filter((r: any) => r.employeeName === "Ana caja").length,
      5,
    );
    assert.equal(
      second.items.filter((r: any) => r.employeeName === "Zulu dueño").length,
      95,
    );
    const actions = (
      await owner.get(
        "/api/audit?page=true&q=ORDEN_DEMO&sort=action&direction=asc",
      )
    ).body;
    assert.ok(actions.items.every((r: any) => r.action === "A_TEST"));
    assert.equal(
      (await owner.get(`/api/audit?page=true&q=ORDEN_DEMO&employeeId=${e.id}`))
        .body.total,
      105,
    );
    assert.equal(
      (await owner.get("/api/audit?page=true&q=ORDEN_DEMO&action=A_TEST")).body
        .total,
      100,
    );
    await owner.get("/api/audit?sort=DROP").expect(400);
    await worker.get("/api/audit").expect(403);
    const day = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());
    const pending = () => ({
      requestKey: randomUUID(),
      customerId: c.id,
      quickAmount: 200,
      pendingName: "Sanchez",
      payments: [],
    });
    const old = (await owner.post("/api/sales").send(pending()).expect(201))
      .body;
    await db.sale.update({
      where: { id: old.id },
      data: {
        createdAt: new Date(new Date(`${day}T00:00:00-03:00`).getTime() - 1),
      },
    });
    const current = (await owner.post("/api/sales").send(pending()).expect(201))
      .body;
    assert.equal(
      (await worker.get("/api/sales/pending-summary")).body.today,
      1,
    );
    const list = (
      await worker.get(
        `/api/sales/history?status=PENDIENTE&from=${day}&to=${day}`,
      )
    ).body;
    assert.equal(list.total, 1);
    assert.equal(list.items[0].id, current.id);
    assert.equal(list.items[0].customer.name, "Sanchez");
    await worker
      .post(`/api/sales/${current.id}/settle`)
      .send({ payments: [{ method: "TRANSFERENCIA", amount: 200 }] })
      .expect(200);
    await worker
      .post(`/api/sales/${current.id}/settle`)
      .send({ payments: [{ method: "TRANSFERENCIA", amount: 200 }] })
      .expect(400);
    assert.equal(
      (await worker.get("/api/sales/pending-summary")).body.today,
      0,
    );
    assert.equal(
      (await worker.get("/api/sales/history?status=PENDIENTE")).body.total,
      1,
    );
    assert.equal(Number((await owner.get("/api/shift")).body.expected), 100);
    assert.equal(
      Number(
        (await db.customer.findUniqueOrThrow({ where: { id: c.id } })).balance,
      ),
      500000,
    );
    assert.equal(await db.payment.count({ where: { saleId: current.id } }), 1);
  } finally {
    await db.$disconnect();
    await fixture.dispose();
  }
});
