import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { D, db, ensure, transaction, audit, type Tx } from "./db.js";
import { verifyPin, pinSchema } from "./auth.js";
import {
  quantity,
  methods,
  currentShift,
  expectedCash,
  moveStock,
} from "./services.js";
export const returns = Router();
const selection = z.object({
  items: z
    .array(z.object({ lineId: z.number().int().positive(), quantity }))
    .min(1)
    .max(300),
});
async function preview(
  tx: Tx,
  saleId: number,
  input: z.infer<typeof selection>,
) {
  const sale = await tx.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      lines: { include: { product: true }, orderBy: { id: "asc" } },
      returns: true,
    },
  });
  ensure(sale.status === "COMPLETADA", "Solo se devuelven ventas cobradas");
  const prior = sale.returns.flatMap((r) => JSON.parse(r.lineDetails));
  const grouped = new Map<number, InstanceType<typeof D>>();
  for (const i of input.items)
    grouped.set(i.lineId, (grouped.get(i.lineId) ?? new D(0)).plus(i.quantity));
  const allocations = new Map<number, InstanceType<typeof D>>();
  let allocated = new D(0);
  sale.lines.forEach((line, i) => {
    const amount =
      i === sale.lines.length - 1 && sale.quickAmount.eq(0)
        ? sale.total.minus(allocated)
        : line.total.div(sale.subtotal).mul(sale.total).toDecimalPlaces(2);
    allocated = allocated.plus(amount);
    allocations.set(line.id, amount);
  });
  const rows = [];
  for (const [lineId, q] of grouped) {
    const line = sale.lines.find((l) => l.id === lineId);
    ensure(line, "La línea no pertenece a la venta");
    ensure(
      line.product.unit === "PESO" || q.isInteger(),
      "La devolución por unidad debe ser entera",
    );
    const previous = prior.filter((p: any) => p.lineId === lineId);
    const already = previous.reduce(
      (s: InstanceType<typeof D>, p: any) => s.plus(p.quantity),
      new D(0),
    );
    const cumulative = already.plus(q);
    ensure(
      cumulative.lte(line.quantity),
      "La cantidad supera lo que falta devolver",
    );
    const amount = allocations
      .get(lineId)!
      .mul(cumulative)
      .div(line.quantity)
      .toDecimalPlaces(2)
      .minus(
        previous.reduce(
          (s: InstanceType<typeof D>, p: any) => s.plus(p.amount),
          new D(0),
        ),
      );
    const baseAmount = line.total
      .mul(cumulative)
      .div(line.quantity)
      .toDecimalPlaces(2)
      .minus(
        previous.reduce(
          (s: InstanceType<typeof D>, p: any) => s.plus(p.baseAmount),
          new D(0),
        ),
      );
    rows.push({
      lineId,
      productId: line.productId,
      name: line.name,
      quantity: q.toString(),
      amount: amount.toString(),
      baseAmount: baseAmount.toString(),
      unitCost: line.unitCost?.toString() ?? null,
    });
  }
  const amount = rows.reduce((s, r) => s.plus(r.amount), new D(0));
  ensure(amount.gt(0), "La devolución debe ser mayor a cero");
  ensure(
    sale.returns.reduce((s, r) => s.plus(r.amount), amount).lte(sale.total),
    "La devolución supera el total original",
  );
  return { sale, rows, amount };
}
returns.post("/:id/return-preview", async (req, res) => {
  const result = await transaction((tx) =>
    preview(
      tx,
      z.coerce.number().int().positive().parse(req.params.id),
      selection.parse(req.body),
    ),
  );
  res.json({
    amount: result.amount,
    rows: result.rows,
    stockTracked: result.sale.stockTracked,
  });
});
returns.post("/:id/returns", async (req, res) => {
  const saleId = z.coerce.number().int().positive().parse(req.params.id);
  const input = selection
    .extend({
      requestKey: z.string().uuid(),
      expectedAmount: z.string(),
      method: methods,
      reason: z.string().trim().min(5).max(160),
      restock: z.boolean(),
      adminId: z.number().int().positive(),
      pin: pinSchema,
      externalConfirmed: z.boolean().default(false),
    })
    .parse(req.body);
  const approver = await verifyPin(input.adminId, input.pin, true);
  const { pin: _pin, ...fingerprint } = input;
  const hash = createHash("sha256")
    .update(JSON.stringify(fingerprint))
    .digest("hex");
  const result = await transaction(async (tx) => {
    const previous = await tx.saleReturn.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (previous) {
      ensure(
        previous.saleId === saleId && previous.requestHash === hash,
        "La solicitud ya corresponde a otra devolución",
        409,
      );
      return previous;
    }
    const plan = await preview(tx, saleId, input);
    ensure(
      plan.amount.eq(input.expectedAmount),
      "Cambió la devolución: revisá la vista previa",
      409,
    );
    const shift = await currentShift(tx);
    if (input.method === "EFECTIVO")
      ensure(
        (await expectedCash(tx, shift.id)).gte(plan.amount),
        "No hay efectivo suficiente",
      );
    else if (input.method === "CUENTA_CORRIENTE") {
      ensure(plan.sale.customerId, "La venta no tiene cliente");
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: plan.sale.customerId },
      });
      ensure(
        customer.balance.gte(plan.amount),
        "El saldo es menor al reintegro. Revisá el medio de devolución",
      );
      await tx.customer.update({
        where: { id: customer.id },
        data: { balance: customer.balance.minus(plan.amount) },
      });
      await tx.accountMovement.create({
        data: {
          customerId: customer.id,
          amount: plan.amount.neg(),
          kind: "DEVOLUCION",
          saleId,
          shiftId: shift.id,
          employeeId: res.locals.employee.id,
        },
      });
    } else
      ensure(
        input.externalConfirmed,
        "Confirmá que realizaste el reintegro en el medio digital original",
      );
    const returned = await tx.saleReturn.create({
      data: {
        requestKey: input.requestKey,
        requestHash: hash,
        saleId,
        amount: plan.amount,
        method: input.method,
        reason: input.reason,
        restock: input.restock,
        employeeId: res.locals.employee.id,
        adminId: approver.id,
        lineDetails: JSON.stringify(plan.rows),
      },
    });
    if (returned.restock && plan.sale.stockTracked)
      for (const row of plan.rows)
        await moveStock(
          tx,
          row.productId,
          new D(row.quantity),
          "DEVOLUCION",
          res.locals.employee.id,
          saleId,
        );
    if (input.method === "EFECTIVO")
      await tx.cashMovement.create({
        data: {
          shiftId: shift.id,
          amount: plan.amount.neg(),
          reason: `Devolución #${returned.id}: ${input.reason}`,
          employeeId: res.locals.employee.id,
          saleId,
        },
      });
    await audit(
      tx,
      res.locals.employee.id,
      "DEVOLUCION_PARCIAL",
      `venta:${saleId}`,
      {
        returnId: returned.id,
        adminId: approver.id,
        amount: plan.amount,
        method: input.method,
        restock: returned.restock,
        reason: input.reason,
      },
    );
    return returned;
  });
  res.json(result);
});
