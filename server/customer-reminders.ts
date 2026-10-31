import { Router } from "express";
import { z } from "zod";
import { db, ensure, transaction, audit } from "./db.js";
export const customerReminders = Router();
customerReminders.get("/:id/reminders", async (req, res) => {
  const customerId = z.coerce.number().int().positive().parse(req.params.id);
  res.setHeader("Cache-Control", "no-store");
  const notes = await db.note.findMany({
    where: { customerId, resolved: false },
    orderBy: [{ dueAt: "asc" }, { id: "desc" }],
    take: 100,
    select: { id: true, title: true, body: true, dueAt: true },
  });
  const balances = await db.containerMovement.groupBy({
    by: ["kind"],
    where: { customerId },
    _sum: { quantity: true },
  });
  const movements = await db.containerMovement.findMany({
    where: { customerId },
    orderBy: { id: "desc" },
    take: 100,
  });
  res.json({
    notes,
    balances: balances.map((b) => ({
      kind: b.kind,
      quantity: b._sum.quantity ?? 0,
    })),
    movements,
  });
});
customerReminders.post("/:id/containers", async (req, res) => {
  const customerId = z.coerce.number().int().positive().parse(req.params.id);
  const data = z
    .object({
      requestKey: z.string().uuid(),
      kind: z
        .string()
        .trim()
        .min(2)
        .max(60)
        .transform((s) => s.toLocaleLowerCase("es")),
      quantity: z
        .number()
        .int()
        .min(-10000)
        .max(10000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(3).max(160),
    })
    .parse(req.body);
  res.json(
    await transaction(async (tx) => {
      const old = await tx.containerMovement.findUnique({
        where: { requestKey: data.requestKey },
      });
      if (old) {
        ensure(
          old.customerId === customerId &&
            old.kind === data.kind &&
            old.quantity === data.quantity &&
            old.reason === data.reason,
          "La solicitud ya se registró con otros datos",
          409,
        );
        return old;
      }
      await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
      const balance = await tx.containerMovement.aggregate({
        where: { customerId, kind: data.kind },
        _sum: { quantity: true },
      });
      ensure(
        (balance._sum.quantity ?? 0) + data.quantity >= 0,
        "La entrega supera los envases que debe el cliente",
      );
      const movement = await tx.containerMovement.create({
        data: { ...data, customerId, employeeId: res.locals.employee.id },
      });
      await audit(
        tx,
        res.locals.employee.id,
        "MOVIMIENTO_ENVASE",
        `cliente:${customerId}`,
        {
          id: movement.id,
          kind: data.kind,
          quantity: data.quantity,
          reason: data.reason,
        },
      );
      return movement;
    }),
  );
});
