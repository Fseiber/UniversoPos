import "dotenv/config";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import request from "supertest";
import { postgresFixture } from "../tests/postgres-fixture.js";
const fixture = await postgresFixture();
process.env.DATABASE_URL = fixture.url;
const { app } = await import("../server/app.js");
const { db } = await import("../server/db.js");
const agent = request.agent(app).set("X-POS-Request", "1");
try {
  const owner = await agent
    .post("/api/setup")
    .send({ name: "Rendimiento aislado", pin: "823615" })
    .expect(201);
  await agent
    .post("/api/login")
    .send({ employeeId: owner.body.id, pin: "823615" })
    .expect(200);
  const shift = await db.shift.create({
    data: { employeeId: owner.body.id, opening: 0 },
  });
  for (let offset = 0; offset < 5000; offset += 500)
    await db.product.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        name: `Producto de carga ${offset + i}`,
        category: `Familia ${(offset + i) % 10}`,
        price: 100,
        stock: 0,
      })),
    });
  for (let offset = 0; offset < 50000; offset += 1000) {
    await db.sale.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: offset + i + 1,
        requestKey: randomUUID(),
        employeeId: owner.body.id,
        shiftId: shift.id,
        subtotal: 100,
        total: 100,
        quickAmount: 100,
      })),
    });
    await db.payment.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        saleId: offset + i + 1,
        shiftId: shift.id,
        method: "EFECTIVO",
        amount: 100,
      })),
    });
  }
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const cases = [
    ["Historial inicial", "/sales/history"],
    ["Historial anterior", "/sales/history?before=25000"],
    ["Búsqueda por número", "/sales/history?q=123"],
    ["Catálogo 5000 productos", "/products"],
    ["Arqueo con 50000 pagos", "/shift"],
    ["Resumen diario 50000 ventas", `/reports?from=${day}&to=${day}`],
  ];
  const results = [];
  for (const [name, url] of cases) {
    const times: number[] = [];
    let bytes = 0;
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      const response = await agent.get("/api" + url).expect(200);
      times.push(performance.now() - start);
      bytes = Buffer.byteLength(response.text);
    }
    times.sort((a, b) => a - b);
    results.push({
      name,
      medianMs: Math.round(times[3]),
      p95Ms: Math.round(times[6]),
      responseBytes: bytes,
    });
  }
  const output = {
    timestamp: new Date().toISOString(),
    products: 5000,
    sales: 50000,
    repeats: 7,
    scope: "API local con supertest; no mide renderizado ni una PC antigua",
    results,
  };
  await mkdir("output/qa", { recursive: true });
  await writeFile(
    "output/qa/rendimiento-5000-50000.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  await db.$disconnect();
  await fixture.dispose();
}
