import { z } from "zod";
import { createHash } from "node:crypto";
import { audit, db, D, ensure, type Tx } from "./db.js";

export const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(100_000_000)
  .refine((v) => new D(v).decimalPlaces() <= 2, "Usá hasta dos decimales");
export const optionalMoney = z.preprocess(
  (value) =>
    value == null || (typeof value === "string" && value.trim() === "")
      ? null
      : value,
  money.nullable(),
);
export const quantity = z.coerce
  .number()
  .finite()
  .positive()
  .max(1_000_000)
  .refine((v) => new D(v).decimalPlaces() <= 3, "Usá hasta tres decimales");
export const id = z.coerce.number().int().positive();
export const methods = z.enum([
  "EFECTIVO",
  "TRANSFERENCIA",
  "MERCADO_PAGO",
  "DEBITO",
  "CUENTA_CORRIENTE",
]);
export const saleInput = z.object({
  requestKey: z.string().uuid(),
  customerId: id.optional(),
  pendingName: z.string().trim().min(1).max(80).optional(),
  items: z
    .array(z.object({ productId: id, quantity }))
    .max(300)
    .default([]),
  quickAmount: money.default(0),
  surchargePercent: z.coerce.number().min(0).max(100).default(0),
  payments: z
    .array(z.object({ method: methods, amount: money.refine((v) => v > 0) }))
    .max(10)
    .default([]),
});

export async function currentShift(tx: Tx = db) {
  const shift = await tx.shift.findFirst({
    where: { closedAt: null },
    orderBy: { id: "desc" },
  });
  ensure(shift, "Primero abrí la caja");
  return shift;
}

export async function expectedCash(tx: Tx, shiftId: number) {
  const shift = await tx.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const payments = await tx.payment.findMany({
    where: { shiftId, method: "EFECTIVO" },
  });
  const accounts = await tx.accountMovement.findMany({
    where: { shiftId, kind: "PAGO_EFECTIVO" },
  });
  const movements = await tx.cashMovement.findMany({ where: { shiftId } });
  return payments
    .reduce((s, p) => s.plus(p.amount), new D(shift.opening))
    .plus(accounts.reduce((s, p) => s.minus(p.amount), new D(0)))
    .plus(movements.reduce((s, p) => s.plus(p.amount), new D(0)))
    .toDecimalPlaces(2);
}

export async function moveStock(
  tx: Tx,
  productId: number,
  delta: InstanceType<typeof D>,
  reason: string,
  employeeId: number,
  saleId?: number,
) {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
  });
  const stock = new D(product.stock).plus(delta);
  ensure(stock.gte(0), `Stock insuficiente: ${product.name}`);
  ensure(
    product.unit === "PESO" || delta.isInteger(),
    `${product.name} se vende por unidades enteras`,
  );
  await tx.product.update({ where: { id: productId }, data: { stock } });
  await tx.stockMovement.create({
    data: { productId, quantity: delta, reason, employeeId, saleId },
  });
}

async function chargeAccount(
  tx: Tx,
  customerId: number | undefined,
  amount: InstanceType<typeof D>,
  employeeId: number,
  saleId: number,
) {
  if (amount.isZero()) return;
  ensure(customerId, "Seleccioná un cliente para fiar");
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  ensure(customer?.active, "Cliente no disponible");
  const balance = new D(customer.balance).plus(amount);
  ensure(
    balance.lte(customer.creditLimit),
    `El fiado supera el límite de ${customer.name}. Disponible: $${new D(customer.creditLimit).minus(customer.balance).toFixed(2)}`,
  );
  await tx.customer.update({ where: { id: customerId }, data: { balance } });
  await tx.accountMovement.create({
    data: { customerId, amount, kind: "CARGO_FIADO", employeeId, saleId },
  });
}

export async function createSale(
  input: z.infer<typeof saleInput>,
  employeeId: number,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return db.$transaction(async (tx) => {
    const previous = await tx.sale.findUnique({
      where: { requestKey: input.requestKey },
      include: { lines: true, payments: true },
    });
    if (previous) {
      ensure(
        previous.requestHash === requestHash,
        "Este carrito ya fue registrado con otros datos. Revisá el historial antes de iniciar otra venta",
        409,
      );
      return previous;
    }
    const shift = await currentShift(tx);
    ensure(
      input.items.length || input.quickAmount > 0,
      "Agregá productos o un monto de venta rápida",
    );
    const grouped = new Map<number, InstanceType<typeof D>>();
    for (const item of input.items)
      grouped.set(
        item.productId,
        (grouped.get(item.productId) ?? new D(0)).plus(item.quantity),
      );
    const lines = [];
    for (const [productId, qty] of grouped) {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { rules: true },
      });
      ensure(product?.active, "Producto no disponible");
      ensure(
        product.unit === "PESO" || qty.isInteger(),
        `${product.name}: ingresá unidades enteras`,
      );
      ensure(qty.lte(product.stock), `Stock insuficiente: ${product.name}`);
      const rule = product.rules
        .filter((r) => qty.gte(r.minimum))
        .sort((a, b) => new D(b.minimum).comparedTo(a.minimum))[0];
      const price = new D(rule?.unitPrice ?? product.price);
      lines.push({
        productId,
        name: product.name,
        quantity: qty,
        unitPrice: price,
        unitCost: product.cost,
        total: price.mul(qty).toDecimalPlaces(2),
      });
    }
    const subtotal = lines.reduce(
      (s, l) => s.plus(l.total),
      new D(input.quickAmount),
    );
    const surcharge = subtotal
      .mul(input.surchargePercent)
      .div(100)
      .toDecimalPlaces(2);
    const total = subtotal.plus(surcharge);
    ensure(total.gt(0), "El total debe ser mayor a cero");
    ensure(
      total.lte(100_000_000),
      "El total supera el máximo permitido por operación",
    );
    const pending = Boolean(input.pendingName);
    ensure(
      !pending || input.payments.length === 0,
      "Una venta pendiente se cobra al saldar",
    );
    if (!pending)
      ensure(
        input.payments.reduce((s, p) => s.plus(p.amount), new D(0)).eq(total),
        "Los pagos deben sumar exactamente el total",
      );
    const sale = await tx.sale.create({
      data: {
        requestKey: input.requestKey,
        requestHash,
        employeeId,
        shiftId: shift.id,
        customerId: input.customerId,
        pendingName: input.pendingName,
        status: pending ? "PENDIENTE" : "COMPLETADA",
        subtotal,
        surcharge,
        total,
        quickAmount: input.quickAmount,
        lines: { create: lines },
        payments: {
          create: input.payments.map((p) => ({ ...p, shiftId: shift.id })),
        },
      },
    });
    for (const line of lines)
      await moveStock(
        tx,
        line.productId,
        line.quantity.neg(),
        "VENTA",
        employeeId,
        sale.id,
      );
    const credit = input.payments
      .filter((p) => p.method === "CUENTA_CORRIENTE")
      .reduce((s, p) => s.plus(p.amount), new D(0));
    await chargeAccount(tx, input.customerId, credit, employeeId, sale.id);
    await audit(
      tx,
      employeeId,
      pending ? "VENTA_PENDIENTE" : "VENTA",
      `venta:${sale.id}`,
      { total: total.toFixed(2) },
    );
    return tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { lines: true, payments: true },
    });
  });
}

export async function settleSale(
  saleId: number,
  payments: { method: z.infer<typeof methods>; amount: number }[],
  customerId: number | undefined,
  employeeId: number,
) {
  return db.$transaction(async (tx) => {
    const shift = await currentShift(tx);
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    ensure(sale.status === "PENDIENTE", "Esta venta ya no está pendiente");
    ensure(
      payments.reduce((s, p) => s.plus(p.amount), new D(0)).eq(sale.total),
      "Los pagos deben sumar el total",
    );
    const credit = payments
      .filter((p) => p.method === "CUENTA_CORRIENTE")
      .reduce((s, p) => s.plus(p.amount), new D(0));
    await chargeAccount(
      tx,
      customerId ?? sale.customerId ?? undefined,
      credit,
      employeeId,
      sale.id,
    );
    await tx.payment.createMany({
      data: payments.map((p) => ({ ...p, saleId, shiftId: shift.id })),
    });
    await tx.sale.update({
      where: { id: saleId },
      data: { status: "COMPLETADA", customerId: customerId ?? sale.customerId },
    });
    await audit(tx, employeeId, "SALDAR_PENDIENTE", `venta:${saleId}`, {
      payments,
    });
  });
}

export async function voidSale(
  saleId: number,
  reason: string,
  employeeId: number,
  adminId: number,
) {
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { lines: true, payments: true },
    });
    ensure(sale.status !== "ANULADA", "La venta ya está anulada");
    const cash = sale.payments
      .filter((p) => p.method === "EFECTIVO")
      .reduce((s, p) => s.plus(p.amount), new D(0));
    const shift = cash.gt(0) ? await currentShift(tx) : null;
    if (shift)
      ensure(
        (await expectedCash(tx, shift.id)).gte(cash),
        "No hay suficiente efectivo en caja para el reembolso",
      );
    for (const line of sale.lines)
      await moveStock(
        tx,
        line.productId,
        new D(line.quantity),
        "ANULACION",
        employeeId,
        saleId,
      );
    const credit = sale.payments
      .filter((p) => p.method === "CUENTA_CORRIENTE")
      .reduce((s, p) => s.plus(p.amount), new D(0));
    if (credit.gt(0) && sale.customerId) {
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: sale.customerId },
      });
      ensure(
        new D(customer.balance).gte(credit),
        "La deuda ya fue cobrada total o parcialmente. Requiere conciliación antes de anular",
      );
      await tx.customer.update({
        where: { id: customer.id },
        data: { balance: new D(customer.balance).minus(credit) },
      });
      await tx.accountMovement.create({
        data: {
          customerId: customer.id,
          amount: credit.neg(),
          kind: "ANULACION",
          employeeId,
          saleId,
        },
      });
    }
    if (cash.gt(0) && shift)
      await tx.cashMovement.create({
        data: {
          shiftId: shift.id,
          amount: cash.neg(),
          reason: `Anulación #${saleId}: ${reason}`,
          employeeId,
          saleId,
        },
      });
    await tx.sale.update({
      where: { id: saleId },
      data: { status: "ANULADA", voidReason: reason, voidedAt: new Date() },
    });
    await audit(tx, employeeId, "ANULAR_VENTA", `venta:${saleId}`, {
      adminId,
      reason,
      digitalRefundRequired: sale.payments.some(
        (p) => !["EFECTIVO", "CUENTA_CORRIENTE"].includes(p.method),
      ),
    });
    return {
      digitalRefundRequired: sale.payments.some(
        (p) => !["EFECTIVO", "CUENTA_CORRIENTE"].includes(p.method),
      ),
    };
  });
}

export async function reconcile() {
  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      include: { movements: true },
    });
    const customers = await tx.customer.findMany({
      include: { movements: true },
    });
    const issues: string[] = [];
    for (const p of products)
      if (
        !p.movements.reduce((s, m) => s.plus(m.quantity), new D(0)).eq(p.stock)
      )
        issues.push(`Stock: ${p.name}`);
    for (const c of customers)
      if (
        !c.movements.reduce((s, m) => s.plus(m.amount), new D(0)).eq(c.balance)
      )
        issues.push(`Cuenta: ${c.name}`);
    return {
      ok: issues.length === 0,
      issues,
      products: products.length,
      customers: customers.length,
      checkedAt: new Date(),
    };
  });
}
