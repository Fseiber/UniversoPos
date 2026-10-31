import { Router } from "express";
import { z } from "zod";
import { db, transaction, audit, ensure } from "./db.js";
export const notes = Router();
notes.delete("/:id", async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { expectedVersion } = z
    .object({ expectedVersion: z.number().int().nonnegative() })
    .parse(req.body);
  await transaction(async (tx) => {
    const old = await tx.note.findUnique({ where: { id } });
    ensure(old, "La nota ya no existe. Actualizá la lista", 404);
    ensure(old.resolved, "Primero marcá la nota como resuelta", 409);
    ensure(
      old.version === expectedVersion,
      "La nota cambió en otro equipo. Actualizá antes de eliminar",
      409,
    );
    await audit(tx, res.locals.employee.id, "ELIMINAR_NOTA", `nota:${id}`, {
      before: old,
    });
    await tx.note.delete({ where: { id } });
  });
  res.json({ ok: true });
});
notes.get("/summary", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    open: await db.note.count({ where: { resolved: false } }),
    overdue: await db.note.count({
      where: { resolved: false, dueAt: { lt: new Date() } },
    }),
  });
});
const text = z.object({
  productId: z.number().int().positive().nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(6000),
});
const include = {
  author: { select: { name: true } },
  customer: { select: { name: true } },
  product: { select: { name: true } },
  supplier: { select: { name: true } },
};
notes.get("/lookups", async (_req, res) =>
  res.json({
    suppliers: await db.supplier.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  }),
);
notes.get("/relevant", async (req, res) => {
  const input = z.object({ products: z.string().max(4000) }).parse(req.query);
  const ids = z
    .array(z.coerce.number().int().positive())
    .max(300)
    .parse(input.products.split(",").filter(Boolean));
  res.setHeader("Cache-Control", "no-store");
  res.json(
    await db.note.findMany({
      where: { resolved: false, productId: { in: ids } },
      orderBy: { id: "desc" },
      take: 100,
      include,
    }),
  );
});
notes.get("/", async (req, res) => {
  const q = z
    .object({
      q: z.string().max(100).default(""),
      state: z.enum(["all", "open", "resolved"]).default("all"),
      before: z.coerce.number().int().positive().optional(),
    })
    .parse(req.query);
  const rows = await db.note.findMany({
    where: {
      ...(q.before ? { id: { lt: q.before } } : {}),
      ...(q.state === "all" ? {} : { resolved: q.state === "resolved" }),
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { body: { contains: q.q, mode: "insensitive" } },
      ],
    },
    include,
    orderBy: { id: "desc" },
    take: 51,
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({
    items: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? rows[49].id : null,
  });
});
notes.post("/", async (req, res) => {
  const data = text.parse(req.body);
  const result = await transaction(async (tx) => {
    const note = await tx.note.create({
      data: { ...data, authorId: res.locals.employee.id },
      include,
    });
    await audit(tx, res.locals.employee.id, "CREAR_NOTA", `nota:${note.id}`, {
      title: note.title,
    });
    return note;
  });
  res.status(201).json(result);
});
notes.patch("/:id", async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const input = text
    .partial()
    .extend({
      resolved: z.boolean().optional(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .parse(req.body);
  const { expectedVersion, ...changes } = input;
  ensure(Object.keys(changes).length > 0, "No hay cambios");
  res.json(
    await transaction(async (tx) => {
      const old = await tx.note.findUniqueOrThrow({ where: { id } });
      ensure(
        old.version === expectedVersion,
        "La nota cambió en otro equipo. Actualizá la lista antes de editar",
        409,
      );
      const note = await tx.note.update({
        where: { id },
        data: { ...changes, version: { increment: 1 } },
        include,
      });
      await audit(tx, res.locals.employee.id, "EDITAR_NOTA", `nota:${id}`, {
        before: {
          title: old.title,
          body: old.body,
          resolved: old.resolved,
          customerId: old.customerId,
          productId: old.productId,
          supplierId: old.supplierId,
          dueAt: old.dueAt,
        },
        after: changes,
      });
      return note;
    }),
  );
});
