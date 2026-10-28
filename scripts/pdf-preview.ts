import { demoConnection } from "./demo-database.js";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.DATABASE_URL = demoConnection();
const { report } = await import("../server/management.js");
const { buildReportPdf } = await import("../server/pdf.js");
const { db } = await import("../server/db.js");
const day = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Argentina/Buenos_Aires",
}).format(new Date());
await mkdir("output/pdf", { recursive: true });
await writeFile(
  "output/pdf/resumen-demo.pdf",
  await buildReportPdf(await report(day, day)),
);
await db.$disconnect();
