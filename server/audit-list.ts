import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, ensure, transaction } from "./db.js";
export const auditList = Router();
auditList.get("/options", async (_req, res) =>
  res.json({
    actions: (
      await db.audit.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      })
    ).map((r) => r.action),
  }),
);
auditList.get("/", async (req, res) => {
  const q = z
    .object({
      q: z.string().max(100).default(""),
      sort: z.enum(["date", "employee", "action"]).default("date"),
      direction: z.enum(["asc", "desc"]).default("desc"),
      employeeId: z.coerce.number().int().positive().optional(),
      action: z.string().max(100).optional(),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
      before: z.coerce.number().int().positive().optional(),
      page: z.enum(["true", "false"]).default("false"),
    })
    .parse(req.query);
  ensure(!q.from || !q.to || q.from <= q.to, "Revisá el período de fechas");
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q.q) {
    const pattern = `%${q.q}%`;
    conditions.push(
      Prisma.sql`(a.action ILIKE ${pattern} OR a.entity ILIKE ${pattern} OR a.detail ILIKE ${pattern} OR e.name ILIKE ${pattern})`,
    );
  }
  if (q.employeeId)
    conditions.push(Prisma.sql`a."employeeId" = ${q.employeeId}`);
  if (q.action) conditions.push(Prisma.sql`a.action = ${q.action}`);
  if (q.before) conditions.push(Prisma.sql`a.id < ${q.before}`);
  if (q.from)
    conditions.push(
      Prisma.sql`a."createdAt" >= ${new Date(`${q.from}T00:00:00-03:00`)}`,
    );
  if (q.to)
    conditions.push(
      Prisma.sql`a."createdAt" < ${new Date(new Date(`${q.to}T00:00:00-03:00`).getTime() + 86400000)}`,
    );
  const where = Prisma.join(conditions, " AND ");
  const column = Prisma.raw(
    {
      date: 'a."createdAt"',
      employee: "lower(COALESCE(e.name, 'Sistema'))",
      action: "lower(a.action)",
    }[q.sort],
  );
  const direction = Prisma.raw(q.direction.toUpperCase());
  res.json(
    await transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>(
        Prisma.sql`SELECT a.*, COALESCE(e.name, 'Sistema') AS "employeeName" FROM "Audit" a LEFT JOIN "Employee" e ON e.id = a."employeeId" WHERE ${where} ORDER BY ${column} ${direction}, a.id ${direction} LIMIT ${q.page === "true" ? 101 : 100} OFFSET ${q.offset}`,
      );
      if (q.page !== "true") return rows;
      const count = await tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total FROM "Audit" a LEFT JOIN "Employee" e ON e.id = a."employeeId" WHERE ${where}`,
      );
      return {
        items: rows.slice(0, 100),
        total: Number(count[0].total),
        hasMore: rows.length > 100,
      };
    }),
  );
});
