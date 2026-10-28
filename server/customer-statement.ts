import { z } from "zod";
import { db, D, ensure, transaction } from "./db.js";
import type {
  AccountPurchase,
  CustomerStatement,
} from "../shared/customer-statement.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Fecha inválida",
  );
export const statementQuery = z
  .object({ from: date.optional(), to: date.optional() })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "La fecha desde debe ser anterior o igual a hasta",
  );

export async function customerStatement(
  customerId: number,
  query: z.infer<typeof statementQuery>,
): Promise<CustomerStatement> {
  const from = query.from
    ? new Date(`${query.from}T00:00:00-03:00`)
    : undefined;
  const to = query.to
    ? new Date(new Date(`${query.to}T00:00:00-03:00`).getTime() + 86400_000)
    : undefined;
  return transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
    });
    ensure(customer, "No se encontró el cliente", 404);
    const whereDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };
    const movements = await tx.accountMovement.findMany({
      where: { customerId, createdAt: whereDate },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const previous = from
      ? await tx.accountMovement.findMany({
          where: { customerId, createdAt: { lt: from } },
          select: { amount: true },
        })
      : [];
    const opening = previous.reduce((sum, m) => sum.plus(m.amount), new D(0));
    // Incluir el detalle de una entrega antigua que se fió dentro del período elegido.
    const relatedSaleIds = [
      ...new Set(
        movements.map((m) => m.saleId).filter((v): v is number => v !== null),
      ),
    ];
    const sales = await tx.sale.findMany({
      where: {
        customerId,
        OR: [{ createdAt: whereDate }, { id: { in: relatedSaleIds } }],
      },
      include: {
        lines: { include: { product: { select: { unit: true } } } },
        payments: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const mapped = new Map<number, AccountPurchase>(
      sales.map((s) => [
        s.id,
        {
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          status: s.status,
          total: s.total.toString(),
          creditAmount: s.payments
            .filter((p) => p.method === "CUENTA_CORRIENTE")
            .reduce((sum, p) => sum.plus(p.amount), new D(0))
            .toString(),
          quickAmount: s.quickAmount.toString(),
          surcharge: s.surcharge.toString(),
          pendingName: s.pendingName,
          voidReason: s.voidReason,
          lines: s.lines.map((l) => ({
            name: l.name,
            quantity: l.quantity.toString(),
            unit: l.product.unit,
            unitPrice: l.unitPrice.toString(),
            total: l.total.toString(),
          })),
          payments: s.payments.map((p) => ({
            method: p.method,
            amount: p.amount.toString(),
          })),
        },
      ]),
    );
    let balance = opening,
      creditAdded = new D(0),
      paymentsReceived = new D(0),
      reversals = new D(0);
    const entries = movements.map((m) => {
      balance = balance.plus(m.amount);
      if (m.kind === "CARGO_FIADO") creditAdded = creditAdded.plus(m.amount);
      else if (m.kind === "PAGO_EFECTIVO")
        paymentsReceived = paymentsReceived.minus(m.amount);
      else if (m.kind === "ANULACION") reversals = reversals.minus(m.amount);
      return {
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        kind: m.kind,
        amount: m.amount.toString(),
        balanceAfter: balance.toString(),
        purchase: m.saleId ? (mapped.get(m.saleId) ?? null) : null,
      };
    });
    return {
      customer: {
        id: customer.id,
        name: customer.name,
        creditLimit: customer.creditLimit.toString(),
        balance: customer.balance.toString(),
        available: new D(customer.creditLimit)
          .minus(customer.balance)
          .toString(),
      },
      from: query.from ?? null,
      to: query.to ?? null,
      generatedAt: new Date().toISOString(),
      openingBalance: opening.toString(),
      closingBalance: balance.toString(),
      creditAdded: creditAdded.toString(),
      paymentsReceived: paymentsReceived.toString(),
      reversals: reversals.toString(),
      purchases: sales
        .filter(
          (s) => (!from || s.createdAt >= from) && (!to || s.createdAt < to),
        )
        .map((s) => mapped.get(s.id)!),
      movements: entries,
    };
  });
}
