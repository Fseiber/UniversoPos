import { Router } from "express";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { admin } from "./auth.js";
import { db, D, ensure, transaction, audit } from "./db.js";
import { createBackup } from "./backups.js";
export const priceChanges = Router();
priceChanges.use(admin);
const secret = randomBytes(32);
const signature = (s: string) =>
  createHmac("sha256", secret).update(s).digest("hex");
priceChanges.post("/preview", async (req, res) => {
  const data = z
    .object({
      category: z.string().max(60).optional(),
      percent: z
        .number()
        .finite()
        .min(-99)
        .max(1000)
        .refine((n) => n !== 0),
      roundTo: z
        .union([z.literal(0), z.literal(1), z.literal(10), z.literal(100)])
        .default(0),
    })
    .parse(req.body);
  const products = await db.product.findMany({
    where: {
      active: true,
      ...(data.category ? { category: data.category } : {}),
    },
    orderBy: { id: "asc" },
    take: 1001,
  });
  ensure(products.length > 0, "No hay productos en esa selección");
  ensure(
    products.length <= 1000,
    "Seleccioná una categoría: el máximo es 1000 productos por lote",
  );
  const rows = products.map((p) => {
    let next = p.price.mul(new D(1).plus(new D(data.percent).div(100)));
    if (data.roundTo)
      next = next.div(data.roundTo).toDecimalPlaces(0).mul(data.roundTo);
    next = next.toDecimalPlaces(2);
    ensure(
      next.gt(0) && next.lte(100000000),
      "El aumento produce un precio fuera del rango permitido",
    );
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      cost: p.cost?.toString() ?? null,
      oldPrice: p.price.toString(),
      newPrice: next.toString(),
      oldMargin:
        p.cost === null
          ? null
          : p.price.minus(p.cost).div(p.price).mul(100).toFixed(1),
      newMargin:
        p.cost === null
          ? null
          : next.minus(p.cost).div(next).mul(100).toFixed(1),
    };
  });
  const body = Buffer.from(
    JSON.stringify({ expires: Date.now() + 900000, rows }),
  ).toString("base64url");
  res.json({ rows, token: `${body}.${signature(body)}` });
});
priceChanges.post("/apply", async (req, res) => {
  const data = z
    .object({ token: z.string().max(245000), requestKey: z.string().uuid() })
    .parse(req.body);
  const [body, sig] = data.token.split(".");
  ensure(
    body &&
      sig &&
      sig.length === 64 &&
      /^[a-f0-9]+$/.test(sig) &&
      timingSafeEqual(
        Buffer.from(sig, "hex"),
        Buffer.from(signature(body), "hex"),
      ),
    "La vista previa venció o no es válida. Generala nuevamente",
    409,
  );
  const plan = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  const hash = createHash("sha256").update(data.token).digest("hex");
  const backup = await createBackup();
  res.json(
    await transaction(
      async (tx) => {
        const previous = await tx.audit.findFirst({
          where: { action: "CAMBIO_MASIVO_PRECIOS", entity: data.requestKey },
        });
        if (previous) {
          const detail = JSON.parse(previous.detail);
          ensure(
            detail.hash === hash,
            "Este lote ya se usó con otros datos",
            409,
          );
          return { updated: detail.rows.length, repeated: true };
        }
        ensure(
          Date.now() < plan.expires,
          "La vista previa venció. Generala nuevamente",
          409,
        );
        for (const row of plan.rows) {
          const p = await tx.product.findUniqueOrThrow({
            where: { id: row.id },
          });
          ensure(
            p.active &&
              p.price.eq(row.oldPrice) &&
              (p.cost?.toString() ?? null) === row.cost &&
              p.category === row.category &&
              p.name === row.name,
            `Cambió «${row.name}». No se aplicó el lote; generá otra vista previa`,
            409,
          );
        }
        for (const row of plan.rows)
          await tx.product.update({
            where: { id: row.id },
            data: { price: row.newPrice },
          });
        await audit(
          tx,
          res.locals.employee.id,
          "CAMBIO_MASIVO_PRECIOS",
          data.requestKey,
          { hash, backup, rows: plan.rows },
        );
        return { updated: plan.rows.length, repeated: false };
      },
      { timeout: 60000 },
    ),
  );
});
