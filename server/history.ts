import { Router } from "express";
import { z } from "zod";
import { transaction, ensure } from "./db.js";
import type { Prisma } from "@prisma/client";
export const history = Router();
history.get("/", async (req, res) => {
  const date = z.string().date().optional();
  const q = z
    .object({
      q: z.string().trim().max(100).default(""),
      from: date,
      to: date,
      status: z.enum(["COMPLETADA", "PENDIENTE", "ANULADA"]).optional(),
      method: z
        .enum([
          "EFECTIVO",
          "TRANSFERENCIA",
          "MERCADO_PAGO",
          "DEBITO",
          "CUENTA_CORRIENTE",
        ])
        .optional(),
      before: z.coerce.number().int().positive().optional(),
    })
    .parse(req.query);
  ensure(
    !q.from || !q.to || q.from <= q.to,
    "La fecha inicial no puede ser posterior a la final",
  );
  const createdAt = {
    ...(q.from ? { gte: new Date(`${q.from}T00:00:00-03:00`) } : {}),
    ...(q.to
      ? {
          lt: new Date(new Date(`${q.to}T00:00:00-03:00`).getTime() + 86400000),
        }
      : {}),
  };
  const where: Prisma.SaleWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.method ? { payments: { some: { method: q.method } } } : {}),
    ...(q.from || q.to ? { createdAt } : {}),
    ...(q.q
      ? {
          OR: [
            ...(/^\d+$/.test(q.q) && Number(q.q) <= 2147483647
              ? [{ id: Number(q.q) }]
              : []),
            { pendingName: { contains: q.q, mode: "insensitive" } },
            {
              customer: {
                is: { name: { contains: q.q, mode: "insensitive" } },
              },
            },
            {
              employee: {
                is: { name: { contains: q.q, mode: "insensitive" } },
              },
            },
            {
              lines: { some: { name: { contains: q.q, mode: "insensitive" } } },
            },
          ],
        }
      : {}),
  };
  res.setHeader("Cache-Control", "no-store");
  res.json(
    await transaction(async (tx) => {
      const total = await tx.sale.count({ where });
      const rows = await tx.sale.findMany({
        where: { ...where, ...(q.before ? { id: { lt: q.before } } : {}) },
        orderBy: { id: "desc" },
        take: 51,
        include: {
          lines: true,
          returns: true,
          payments: true,
          customer: { select: { name: true, phone: true } },
          employee: { select: { name: true } },
        },
      });
      return {
        items: rows.slice(0, 50),
        total,
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    }),
  );
});
