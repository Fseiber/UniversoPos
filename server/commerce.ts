import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { admin } from "./auth.js";
import { audit, db, D, ensure, transaction, type Tx } from "./db.js";
import {
  currentShift,
  expectedCash,
  id,
  money,
  moveStock,
  quantity,
} from "./services.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const paymentMethod = z.enum([
  "EFECTIVO",
  "TRANSFERENCIA",
  "MERCADO_PAGO",
  "DEBITO",
]);
const reference = z.string().trim().max(120).default("");
const paymentInput = z.object({
  requestKey: z.string().uuid(),
  amount: money.refine((v) => v > 0),
  method: paymentMethod.default("EFECTIVO"),
  reference,
  confirmed: z.boolean().default(false),
});
function digitalCheck(data: {
  method: string;
  confirmed: boolean;
  reference: string;
}) {
  ensure(
    data.method === "EFECTIVO" ||
      (data.confirmed && data.reference.length >= 3),
    "Verificá la acreditación e indicá la referencia del comprobante digital",
  );
}
export async function collectDebt(
  customerId: number,
  body: unknown,
  employeeId: number,
) {
  // Clientes anteriores conservan el contrato efectivo; la interfaz nueva siempre envía clave.
  const data = paymentInput
    .extend({ requestKey: z.string().uuid().optional() })
    .parse(body);
  digitalCheck(data);
  const requestHash = hash({ customerId, ...data });
  return transaction(async (tx) => {
    if (data.requestKey) {
      const previous = await tx.accountMovement.findUnique({
        where: { requestKey: data.requestKey },
      });
      if (previous) {
        ensure(
          previous.requestHash === requestHash,
          "La clave de pago corresponde a otros datos",
          409,
        );
        return previous;
      }
    }
    const shift = await currentShift(tx);
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    ensure(
      customer.active && new D(data.amount).lte(customer.balance),
      "El pago supera la deuda o el cliente está inactivo",
    );
    await tx.customer.update({
      where: { id: customerId },
      data: { balance: customer.balance.minus(data.amount) },
    });
    const movement = await tx.accountMovement.create({
      data: {
        customerId,
        amount: new D(data.amount).neg(),
        kind: `PAGO_${data.method}`,
        method: data.method,
        reference: data.reference,
        requestKey: data.requestKey,
        requestHash,
        shiftId: shift.id,
        employeeId,
      },
    });
    await audit(tx, employeeId, "COBRO_DEUDA", `cliente:${customerId}`, {
      ...data,
      movementId: movement.id,
    });
    return movement;
  });
}

export const commerce = Router();
commerce.use(admin);
commerce.get("/purchases", async (req, res) => {
  const before = z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .parse(req.query.before);
  const rows = await db.purchase.findMany({
    where: before ? { id: { lt: before } } : {},
    orderBy: { id: "desc" },
    take: 51,
    include: { supplier: true, lines: true, payments: true },
  });
  res.json({
    items: rows.slice(0, 50).map((p) => ({
      ...p,
      balance: p.total.minus(
        p.payments.reduce((s, v) => s.plus(v.amount), new D(0)),
      ),
    })),
    nextCursor: rows.length > 50 ? rows[49].id : null,
  });
});
const receiveInput = z.object({
  requestKey: z.string().uuid(),
  supplierId: id,
  document: z.string().trim().min(1).max(100),
  expenses: money.default(0),
  items: z
    .array(
      z.object({
        productId: id,
        version: z.number().int().nonnegative(),
        quantity,
        unitCost: money,
        lot: z.string().trim().max(80).default(""),
        expiresAt: z.string().date().optional(),
      }),
    )
    .min(1)
    .max(100),
});
commerce.post("/purchases", async (req, res) => {
  const input = receiveInput.parse(req.body);
  const requestHash = hash(input);
  const result = await transaction(async (tx) => {
    const previous = await tx.purchase.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (previous) {
      ensure(
        previous.requestHash === requestHash,
        "La recepción ya existe con otros datos",
        409,
      );
      return previous;
    }
    ensure(
      new Set(input.items.map((i) => i.productId)).size === input.items.length,
      "Usá una sola línea por producto en cada recepción",
    );
    await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
    const bases = input.items.map((i) =>
      new D(i.unitCost).mul(i.quantity).toDecimalPlaces(2),
    );
    const base = bases.reduce((s, b) => s.plus(b), new D(0));
    const total = base.plus(input.expenses);
    ensure(total.gt(0) && total.lte(100000000), "Total de compra inválido");
    ensure(
      base.gt(0) || input.expenses === 0,
      "No se pueden repartir gastos entre artículos sin costo base",
    );
    const purchase = await tx.purchase.create({
      data: {
        requestKey: input.requestKey,
        requestHash,
        supplierId: input.supplierId,
        document: input.document,
        total,
        expenses: input.expenses,
        employeeId: res.locals.employee.id,
      },
    });
    let allocated = new D(0);
    for (const [index, item] of input.items.entries()) {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
      });
      ensure(
        product.active && product.version === item.version,
        `La ficha de ${product.name} cambió. Actualizá y revisá la recepción`,
        409,
      );
      ensure(
        product.unit === "PESO" || Number.isInteger(item.quantity),
        "Las unidades recibidas deben ser enteras",
      );
      const extra =
        index === input.items.length - 1
          ? new D(input.expenses).minus(allocated)
          : base.gt(0)
            ? new D(input.expenses)
                .mul(bases[index])
                .div(base)
                .toDecimalPlaces(2)
            : new D(0);
      allocated = allocated.plus(extra);
      const lineTotal = bases[index].plus(extra),
        newCost = lineTotal.div(item.quantity).toDecimalPlaces(2);
      ensure(
        newCost.lte(100000000),
        "El costo con gastos supera el máximo por unidad o kilo",
      );
      const line = await tx.purchaseLine.create({
        data: {
          purchaseId: purchase.id,
          productId: product.id,
          name: product.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          previousCost: product.cost,
          newCost,
          total: lineTotal,
        },
      });
      // Las recepciones siempre suman mercadería física, aun si la venta sin stock está activa.
      await moveStock(
        tx,
        product.id,
        new D(item.quantity),
        `COMPRA #${purchase.id}`,
        res.locals.employee.id,
      );
      await tx.product.update({
        where: { id: product.id },
        data: { cost: newCost },
      });
      await tx.supplierOffer.upsert({
        where: {
          supplierId_productId: {
            supplierId: input.supplierId,
            productId: product.id,
          },
        },
        create: {
          supplierId: input.supplierId,
          productId: product.id,
          cost: newCost,
        },
        update: { cost: newCost },
      });
      if (item.expiresAt || item.lot)
        await tx.productLot.create({
          data: {
            productId: product.id,
            purchaseLineId: line.id,
            code: item.lot || input.document,
            quantity: item.quantity,
            expiresAt: item.expiresAt
              ? new Date(`${item.expiresAt}T00:00:00-03:00`)
              : null,
          },
        });
    }
    await audit(
      tx,
      res.locals.employee.id,
      "RECIBIR_COMPRA",
      `compra:${purchase.id}`,
      { ...input, total },
    );
    return purchase;
  });
  res.status(201).json(result);
});
commerce.post("/purchases/:id/payments", async (req, res) => {
  const purchaseId = id.parse(req.params.id),
    data = paymentInput.parse(req.body);
  digitalCheck(data);
  const requestHash = hash({ purchaseId, ...data });
  const result = await transaction(async (tx) => {
    const previous = await tx.supplierPayment.findUnique({
      where: { requestKey: data.requestKey },
    });
    if (previous) {
      ensure(
        previous.requestHash === requestHash,
        "Ese pago corresponde a otros datos",
        409,
      );
      return previous;
    }
    const shift = await currentShift(tx);
    const p = await tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { payments: true },
    });
    const balance = p.total.minus(
      p.payments.reduce((s, v) => s.plus(v.amount), new D(0)),
    );
    ensure(balance.gte(data.amount), "El pago supera lo adeudado al proveedor");
    if (data.method === "EFECTIVO") {
      ensure(
        (await expectedCash(tx, shift.id)).gte(data.amount),
        "Efectivo insuficiente",
      );
      await tx.cashMovement.create({
        data: {
          shiftId: shift.id,
          amount: new D(data.amount).neg(),
          category: "PROVEEDOR",
          reason: `Pago compra #${purchaseId} · ${data.reference}`,
          employeeId: res.locals.employee.id,
        },
      });
    }
    const payment = await tx.supplierPayment.create({
      data: {
        purchaseId,
        requestKey: data.requestKey,
        requestHash,
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        employeeId: res.locals.employee.id,
      },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "PAGAR_PROVEEDOR",
      `compra:${purchaseId}`,
      payment,
    );
    return payment;
  });
  res.status(201).json(result);
});
commerce.get("/lots", async (req, res) => {
  const before = z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .parse(req.query.before);
  const rows = await db.productLot.findMany({
    where: { resolvedAt: null, ...(before ? { id: { lt: before } } : {}) },
    include: { product: { select: { name: true, unit: true } } },
    orderBy: { id: "desc" },
    take: 101,
  });
  res.json({
    items: rows.slice(0, 100),
    nextCursor: rows.length > 100 ? rows[99].id : null,
  });
});
commerce.post("/lots", async (req, res) => {
  const data = z
    .object({
      productId: id,
      code: z.string().trim().min(1).max(80),
      quantity,
      expiresAt: z.string().date(),
    })
    .parse(req.body);
  const result = await transaction(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({
      where: { id: data.productId },
    });
    ensure(
      p.active && (p.unit === "PESO" || Number.isInteger(data.quantity)),
      "Producto o cantidad inválidos",
    );
    const lot = await tx.productLot.create({
      data: {
        ...data,
        expiresAt: new Date(`${data.expiresAt}T00:00:00-03:00`),
      },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "REGISTRAR_VENCIMIENTO",
      `lote:${lot.id}`,
      data,
    );
    return lot;
  });
  res.status(201).json(result);
});
commerce.post("/lots/:id/resolve", async (req, res) => {
  const reason = z.string().trim().min(5).max(160).parse(req.body.reason);
  await transaction(async (tx) => {
    const lot = await tx.productLot.findUniqueOrThrow({
      where: { id: id.parse(req.params.id) },
    });
    if (lot.resolvedAt) return;
    await tx.productLot.update({
      where: { id: lot.id },
      data: { resolvedAt: new Date() },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "REVISAR_VENCIMIENTO",
      `lote:${lot.id}`,
      { reason },
    );
  });
  res.json({ ok: true });
});
