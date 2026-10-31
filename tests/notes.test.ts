import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { postgresFixture } from "./postgres-fixture.js";
import { productCategory } from "../shared/product-category.js";
test("Clasificación · familias habituales y diferencias de presentación", () => {
  for (const [name, category] of [
    ["Galletitas Benjamin Coco", "Galletitas"],
    ["Fideo Galleti", "Almacén"],
    ["Cerveza Brahma Lata", "Bebidas alcohólicas"],
    ["Cremoso Tregar KG", "Fiambres y quesos"],
    ["Lavandina Ayudin", "Limpieza"],
    ["Jabon Rexona", "Higiene personal"],
    ["Jabon Liquido Ala", "Limpieza"],
    ["Leche Manfrey", "Lácteos"],
    ["Gato Vagoneta KG", "Mascotas"],
    ["Yerba Amanda", "Infusiones"],
    ["Agua Benedictino", "Bebidas"],
  ])
    assert.equal(productCategory(name), category);
});
test("Notas · acceso, fechas, edición compartida, resolución, conflictos y paginación", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  const { app } = await import("../server/app.js");
  const { db } = await import("../server/db.js");
  const admin = request.agent(app).set("X-POS-Request", "1"),
    worker = request.agent(app).set("X-POS-Request", "1");
  try {
    await request(app).get("/api/notes").expect(401);
    const owner = await admin
      .post("/api/setup")
      .send({ name: "Notas prueba", pin: "816235" })
      .expect(201);
    await admin
      .post("/api/login")
      .send({ employeeId: owner.body.id, pin: "816235" })
      .expect(200);
    const emp = await admin
      .post("/api/employees")
      .send({ name: "Empleado notas", role: "EMPLEADO", pin: "612583" })
      .expect(201);
    await worker
      .post("/api/login")
      .send({ employeeId: emp.body.id, pin: "612583" })
      .expect(200);
    await worker
      .post("/api/notes")
      .send({ title: " ", body: "Detalle" })
      .expect(400);
    const created = await worker
      .post("/api/notes")
      .send({
        title: "Envase pendiente",
        body: "Cliente de ejemplo debe un envase.\nRevisar en la próxima visita.",
      })
      .expect(201);
    assert.equal(created.body.author.name, "Empleado notas");
    assert.ok(Number.isFinite(Date.parse(created.body.createdAt)));
    const edited = await admin
      .patch(`/api/notes/${created.body.id}`)
      .send({
        body: "Se entregó el envase.",
        resolved: true,
        expectedVersion: 0,
      })
      .expect(200);
    assert.equal(edited.body.createdAt, created.body.createdAt);
    assert.equal(edited.body.version, 1);
    await worker
      .patch(`/api/notes/${created.body.id}`)
      .send({ body: "Sobrescribir", expectedVersion: 0 })
      .expect(409);
    assert.equal(
      (await worker.get("/api/notes?state=resolved&q=ENVASE").expect(200)).body
        .items.length,
      1,
    );
    assert.equal(
      (await worker.get("/api/notes?state=open").expect(200)).body.items.length,
      0,
    );
    await worker
      .patch(`/api/notes/${created.body.id}`)
      .send({ resolved: false, expectedVersion: 1 })
      .expect(200);
    await db.note.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        title: `Nota ${i}`,
        body: "Preventista pasó",
        authorId: owner.body.id,
      })),
    });
    const first = await worker.get("/api/notes").expect(200);
    assert.equal(first.body.items.length, 50);
    assert.ok(first.body.nextCursor);
    const second = await worker
      .get(`/api/notes?before=${first.body.nextCursor}`)
      .expect(200);
    assert.equal(second.body.items.length, 2);
    assert.equal(second.body.nextCursor, null);
    assert.equal(
      await db.audit.count({ where: { entity: `nota:${created.body.id}` } }),
      3,
    );
  } finally {
    await db.$disconnect();
    await fixture.dispose();
  }
});
