import { Router } from "express";
import { z } from "zod";
import { admin } from "./auth.js";
import { audit, db, D, ensure, transaction } from "./db.js";
import {
  currentShift,
  expectedCash,
  id,
  money,
  quantity,
  reconcile,
} from "./services.js";
import { backupDirectory, backupState, createBackup } from "./backups.js";
import { buildReportPdf } from "./pdf.js";

export const management = Router();
management.post("/withdrawals", async (req, res) => {
  const data = z
    .object({
      amount: money.refine((v) => v > 0),
      percent: z.coerce.number().min(0).max(50),
      method: z.enum(["DEBITO", "TRANSFERENCIA"]),
      mode: z.enum(["RECARGO", "DESCUENTO"]),
    })
    .parse(req.body);
  const result = await transaction(async (tx) => {
    const shift = await currentShift(tx);
    const cashAmount =
      data.mode === "RECARGO"
        ? new D(data.amount)
        : new D(data.amount)
            .mul(new D(1).minus(new D(data.percent).div(100)))
            .toDecimalPlaces(2);
    const digitalAmount =
      data.mode === "DESCUENTO"
        ? new D(data.amount)
        : new D(data.amount)
            .mul(new D(1).plus(new D(data.percent).div(100)))
            .toDecimalPlaces(2);
    ensure(
      (await expectedCash(tx, shift.id)).gte(cashAmount),
      "No hay efectivo suficiente para el retiro",
    );
    const withdrawal = await tx.cashWithdrawal.create({
      data: {
        shiftId: shift.id,
        employeeId: res.locals.employee.id,
        method: data.method,
        mode: data.mode,
        cashAmount,
        digitalAmount,
        commission: digitalAmount.minus(cashAmount),
      },
    });
    await tx.cashMovement.create({
      data: {
        shiftId: shift.id,
        amount: cashAmount.neg(),
        reason: `Retiro digital #${withdrawal.id} · ${data.method}`,
        employeeId: res.locals.employee.id,
      },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "RETIRO_DIGITAL",
      `retiro:${withdrawal.id}`,
      withdrawal,
    );
    return withdrawal;
  });
  res.status(201).json(result);
});
management.use(admin);
management.post("/products/:id/rules", async (req, res) => {
  const productId = id.parse(req.params.id);
  const data = z
    .object({ minimum: quantity, unitPrice: money.refine((v) => v > 0) })
    .parse(req.body);
  const rule = await transaction(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    ensure(
      p.unit === "PESO" || Number.isInteger(data.minimum),
      "El umbral de unidades debe ser entero",
    );
    ensure(
      !(await tx.priceRule.findFirst({
        where: { productId, minimum: data.minimum },
      })),
      "Ya existe una oferta para esa cantidad",
    );
    const r = await tx.priceRule.create({ data: { productId, ...data } });
    await audit(
      tx,
      res.locals.employee.id,
      "OFERTA_CANTIDAD",
      `producto:${productId}`,
      data,
    );
    return r;
  });
  res.status(201).json(rule);
});
management.delete("/rules/:id", async (req, res) => {
  await transaction(async (tx) => {
    const r = await tx.priceRule.delete({
      where: { id: id.parse(req.params.id) },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "ELIMINAR_OFERTA",
      `producto:${r.productId}`,
      r,
    );
  });
  res.json({ ok: true });
});
management.get("/suppliers", async (_req, res) =>
  res.json(
    await db.supplier.findMany({
      include: { offers: { include: { product: true } } },
      orderBy: { name: "asc" },
    }),
  ),
);
management.post("/suppliers", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      contact: z.string().max(120).default(""),
    })
    .parse(req.body);
  const supplier = await transaction(async (tx) => {
    const s = await tx.supplier.create({ data });
    await audit(
      tx,
      res.locals.employee.id,
      "CREAR_PROVEEDOR",
      `proveedor:${s.id}`,
      data,
    );
    return s;
  });
  res.status(201).json(supplier);
});
management.post("/supplier-offers", async (req, res) => {
  const data = z
    .object({ supplierId: id, productId: id, cost: money })
    .parse(req.body);
  const offer = await transaction(async (tx) => {
    const offer = await tx.supplierOffer.upsert({
      where: {
        supplierId_productId: {
          supplierId: data.supplierId,
          productId: data.productId,
        },
      },
      create: data,
      update: { cost: data.cost },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "COSTO_PROVEEDOR",
      `producto:${data.productId}`,
      data,
    );
    return offer;
  });
  res.json(offer);
});
management.get("/shortages", async (_req, res) => {
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  res.json({
    automatic: products.filter((p) => new D(p.stock).lte(p.minimum)),
    notes: await db.shortage.findMany({ orderBy: { id: "desc" } }),
  });
});
management.post("/shortages", async (req, res) => {
  const data = z
    .object({ note: z.string().trim().min(1).max(160) })
    .parse(req.body);
  res.status(201).json(await db.shortage.create({ data }));
});
management.patch("/shortages/:id", async (req, res) => {
  const data = z.object({ done: z.boolean() }).parse(req.body);
  res.json(
    await db.shortage.update({ where: { id: id.parse(req.params.id) }, data }),
  );
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Fecha inválida",
  );
export async function report(from: string, to: string) {
  const start = new Date(`${from}T00:00:00-03:00`);
  const end = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86400_000);
  ensure(start < end, "El período es inválido");
  ensure(
    end.getTime() - start.getTime() <= 367 * 86400_000,
    "Elegí un período de hasta un año",
  );
  return transaction(async (tx) => {
    const sales = await tx.sale.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: "ANULADA" } },
      include: { lines: true },
    });
    const payments = await tx.payment.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        sale: { status: { not: "ANULADA" } },
      },
    });
    const customers = await tx.customer.findMany({
      where: { balance: { gt: 0 } },
      orderBy: { name: "asc" },
    });
    const shifts = await tx.shift.findMany({
      where: { openedAt: { gte: start, lt: end } },
      include: { employee: { select: { name: true } } },
      orderBy: { id: "desc" },
    });
    const products = await tx.product.findMany({ where: { active: true } });
    const withdrawals = await tx.cashWithdrawal.findMany({
      where: { createdAt: { gte: start, lt: end } },
    });
    const top = new Map<
      number,
      {
        name: string;
        quantity: InstanceType<typeof D>;
        amount: InstanceType<typeof D>;
      }
    >();
    let margin = new D(0),
      total = new D(0),
      pending = new D(0),
      quick = new D(0),
      unknownProductCost = new D(0);
    const daily = new Map<string, InstanceType<typeof D>>();
    for (const s of sales) {
      total = total.plus(s.total);
      quick = quick.plus(s.quickAmount);
      if (s.status === "PENDIENTE") pending = pending.plus(s.total);
      margin = margin.plus(s.surcharge);
      const day = new Date(s.createdAt.getTime() - 3 * 3600_000)
        .toISOString()
        .slice(0, 10);
      daily.set(day, (daily.get(day) ?? new D(0)).plus(s.total));
      for (const l of s.lines) {
        if (l.unitCost === null)
          unknownProductCost = unknownProductCost.plus(l.total);
        else
          margin = margin.plus(
            new D(l.total).minus(new D(l.unitCost).mul(l.quantity)),
          );
        const p = top.get(l.productId) ?? {
          name: l.name,
          quantity: new D(0),
          amount: new D(0),
        };
        p.quantity = p.quantity.plus(l.quantity);
        p.amount = p.amount.plus(l.total);
        top.set(l.productId, p);
      }
    }
    const byMethod: Record<string, string> = {};
    for (const p of payments)
      byMethod[p.method] = new D(byMethod[p.method] ?? 0)
        .plus(p.amount)
        .toFixed(2);
    const debtCollections = await tx.accountMovement.findMany({
      where: { createdAt: { gte: start, lt: end }, kind: "PAGO_EFECTIVO" },
    });
    return {
      from,
      to,
      salesCount: sales.length,
      total,
      margin: margin.toDecimalPlaces(2),
      quick,
      unknownCostRevenue: unknownProductCost.plus(quick),
      pending,
      byMethod,
      debtCollections: debtCollections.reduce(
        (s, p) => s.minus(p.amount),
        new D(0),
      ),
      totalDebt: customers.reduce((s, c) => s.plus(c.balance), new D(0)),
      customers,
      lowStock: products.filter((p) => new D(p.stock).lte(p.minimum)),
      shifts,
      top: [...top.values()]
        .sort((a, b) => b.amount.comparedTo(a.amount))
        .slice(0, 10),
      daily: [...daily.entries()]
        .sort()
        .map(([day, amount]) => ({ day, amount })),
      withdrawalCommission: withdrawals.reduce(
        (s, w) => s.plus(w.commission),
        new D(0),
      ),
      note: "Ventas por fecha de creación; anulaciones excluidas. Cobros por fecha de pago. Fiados son deuda, no efectivo. El margen usa solo líneas con costo de compra conocido y recargos; excluye ventas rápidas, productos sin costo y gastos. Cargar un costo después no modifica el costo histórico de ventas anteriores. Saldos y stock son actuales.",
    };
  });
}
management.get("/reports", async (req, res) => {
  const data = z.object({ from: dateString, to: dateString }).parse(req.query);
  res.json(await report(data.from, data.to));
});
management.get("/reports.pdf", async (req, res) => {
  const data = z.object({ from: dateString, to: dateString }).parse(req.query);
  const pdf = await buildReportPdf(await report(data.from, data.to));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="universo-${data.from}-${data.to}.pdf"`,
  );
  res.send(pdf);
});
management.get("/audit", async (req, res) => {
  const data = z
    .object({ q: z.string().max(100).default(""), before: id.optional() })
    .parse(req.query);
  res.json(
    await db.audit.findMany({
      where: {
        ...(data.before ? { id: { lt: data.before } } : {}),
        OR: [
          { action: { contains: data.q } },
          { entity: { contains: data.q } },
          { detail: { contains: data.q } },
        ],
      },
      orderBy: { id: "desc" },
      take: 100,
    }),
  );
});
management.get("/reconcile", async (_req, res) => res.json(await reconcile()));
management.get("/backups", async (_req, res) =>
  res.json({ ...backupState, directory: backupDirectory(), retentionDays: 15 }),
);
management.post("/backups", async (_req, res) => {
  const file = await createBackup();
  await audit(db, res.locals.employee.id, "BACKUP_MANUAL", "respaldo", {
    file,
  });
  res.json({ file, ...backupState });
});

let mpCache: { updatedAt: string | null; payments: unknown[] } = {
  updatedAt: null,
  payments: [],
};
management.get("/mercadopago", async (_req, res) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token)
    return res.json({
      ...mpCache,
      connected: false,
      status:
        "Sin configurar. Agregá el Access Token en el servidor para consultar movimientos reales.",
    });
  try {
    const response = await fetch(
      "https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=20",
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      },
    );
    ensure(response.ok, "Mercado Pago no respondió");
    const data = (await response.json()) as {
      results: {
        id: number;
        status: string;
        transaction_amount: number;
        date_created: string;
        description: string;
      }[];
    };
    ensure(Array.isArray(data.results), "Respuesta inválida");
    mpCache = {
      updatedAt: new Date().toISOString(),
      payments: data.results.map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.transaction_amount,
        date: p.date_created,
        description: p.description,
      })),
    };
    res.json({
      ...mpCache,
      connected: true,
      status:
        "Actividad actualizada. Verificá el ingreso antes de registrar el pago.",
    });
  } catch {
    res.json({
      ...mpCache,
      connected: false,
      status: mpCache.updatedAt
        ? "Sin conexión — mostrando datos guardados en esta sesión del servidor"
        : "Sin conexión o credenciales inválidas. No hay datos guardados.",
    });
  }
});
