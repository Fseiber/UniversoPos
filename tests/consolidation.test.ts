import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { postgresFixture } from "./postgres-fixture.js";
test("Consolidación · historial completo y precios masivos con autorización, vista previa y conflictos", async () => {
  const fixture = await postgresFixture();
  process.env.DATABASE_URL = fixture.url;
  await mkdir(".test-data", { recursive: true });
  const dir = await mkdtemp(path.resolve(".test-data/consolidation-"));
  process.env.BACKUP_DIR = dir;
  const { app } = await import("../server/app.js");
  const { db } = await import("../server/db.js");
  const admin = request.agent(app).set("X-POS-Request", "1"),
    worker = request.agent(app).set("X-POS-Request", "1");
  try {
    const owner = await admin
      .post("/api/setup")
      .send({ name: "Etapas", pin: "826315" })
      .expect(201);
    await admin
      .post("/api/login")
      .send({ employeeId: owner.body.id, pin: "826315" })
      .expect(200);
    const e = await admin
      .post("/api/employees")
      .send({ name: "Caja etapa", pin: "621835", role: "EMPLEADO" })
      .expect(201);
    await worker
      .post("/api/login")
      .send({ employeeId: e.body.id, pin: "621835" })
      .expect(200);
    const shift = await db.shift.create({
      data: { employeeId: owner.body.id, opening: 0 },
    });
    await db.sale.createMany({
      data: Array.from({ length: 205 }, () => ({
        employeeId: owner.body.id,
        shiftId: shift.id,
        requestKey: randomUUID(),
        subtotal: 1,
        total: 1,
        quickAmount: 1,
      })),
    });
    const ids = new Set<number>();
    let before: number | null = null;
    do {
      const r: {
        body: {
          total: number;
          items: { id: number }[];
          nextCursor: number | null;
        };
      } = await worker
        .get("/api/sales/history" + (before ? `?before=${before}` : ""))
        .expect(200);
      assert.equal(r.body.total, 205);
      for (const s of r.body.items) {
        assert.ok(!ids.has(s.id));
        ids.add(s.id);
      }
      before = r.body.nextCursor;
    } while (before);
    assert.equal(ids.size, 205);
    const found = await worker
      .get(`/api/sales/history?q=${Math.min(...ids)}`)
      .expect(200);
    assert.equal(found.body.items.length, 1);
    await worker.get("/api/sales/history?from=invalid").expect(400);
    const product = await admin
      .post("/api/products")
      .send({
        name: "Precio A",
        category: "Etapa",
        price: 100,
        cost: 60,
        stock: 4,
      })
      .expect(201);
    await worker
      .post("/api/price-changes/preview")
      .send({ percent: 10 })
      .expect(403);
    const preview = await admin
      .post("/api/price-changes/preview")
      .send({ percent: 10, category: "Etapa" })
      .expect(200);
    assert.equal(preview.body.rows[0].newPrice, "110");
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: product.body.id } })
      ).price.toString(),
      "100",
    );
    const requestKey = randomUUID();
    await admin
      .post("/api/price-changes/apply")
      .send({ token: preview.body.token, requestKey })
      .expect(200);
    await admin
      .post("/api/price-changes/apply")
      .send({ token: preview.body.token, requestKey })
      .expect(200);
    const p = await db.product.findUniqueOrThrow({
      where: { id: product.body.id },
    });
    assert.equal(p.price.toString(), "110");
    assert.equal(p.stock.toString(), "4");
    assert.equal(p.cost!.toString(), "60");
    assert.equal(
      await db.audit.count({
        where: { action: "CAMBIO_MASIVO_PRECIOS", entity: requestKey },
      }),
      1,
    );
    const stale = await admin
      .post("/api/price-changes/preview")
      .send({ percent: 20, category: "Etapa" })
      .expect(200);
    await db.product.update({ where: { id: p.id }, data: { price: 115 } });
    await admin
      .post("/api/price-changes/apply")
      .send({ token: stale.body.token, requestKey: randomUUID() })
      .expect(409);
    assert.equal(
      (
        await db.product.findUniqueOrThrow({ where: { id: p.id } })
      ).price.toString(),
      "115",
    );
    await admin
      .post("/api/price-changes/apply")
      .send({ token: preview.body.token + "x", requestKey: randomUUID() })
      .expect(409);
  } finally {
    await db.$disconnect();
    await fixture.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
