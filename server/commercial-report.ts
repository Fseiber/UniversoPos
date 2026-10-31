import { D, type Tx } from "./db.js";
export async function commercialReport(
  tx: Tx,
  start: Date,
  end: Date,
  sales: any[],
  returns: any[],
  products: any[],
) {
  const employees = await tx.employee.findMany({
    select: { id: true, name: true },
  });
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const catalog = new Map(products.map((p) => [p.id, p]));
  const employee = new Map<string, InstanceType<typeof D>>(),
    hours = new Map<string, InstanceType<typeof D>>(),
    families = new Map<string, InstanceType<typeof D>>();
  const add = (map: typeof employee, key: string, amount: any) =>
    map.set(key, (map.get(key) ?? new D(0)).plus(amount));
  const hour = (date: Date) =>
    `${new Date(date.getTime() - 3 * 3600000).getUTCHours().toString().padStart(2, "0")}:00`;
  const sold = new Set<number>();
  for (const s of sales) {
    add(
      employee,
      names.get(s.employeeId) ?? `Empleado #${s.employeeId}`,
      s.total,
    );
    add(hours, hour(s.createdAt), s.total);
    for (const l of s.lines) {
      sold.add(l.productId);
      add(
        families,
        catalog.get(l.productId)?.category ?? "Producto inactivo",
        l.total,
      );
    }
  }
  const returnSales = await tx.sale.findMany({
    where: { id: { in: [...new Set(returns.map((r) => r.saleId))] } },
    select: { id: true, employeeId: true },
  });
  const returnEmployees = new Map(returnSales.map((s) => [s.id, s.employeeId]));
  for (const r of returns) {
    add(
      employee,
      names.get(returnEmployees.get(r.saleId)!) ?? "Empleado anterior",
      new D(r.amount).neg(),
    );
    add(hours, hour(r.createdAt), new D(r.amount).neg());
    for (const l of JSON.parse(r.lineDetails))
      add(
        families,
        catalog.get(l.productId)?.category ?? "Producto inactivo",
        new D(l.baseAmount).neg(),
      );
  }
  const cash = await tx.cashMovement.findMany({
    where: { createdAt: { gte: start, lt: end }, amount: { lt: 0 } },
  });
  const expenses = cash
    .filter((m) => m.category === "GASTO")
    .reduce((s, m) => s.minus(m.amount), new D(0));
  const unclassified = cash
    .filter((m) => m.category === "SIN_CLASIFICAR" && !m.saleId)
    .reduce((s, m) => s.minus(m.amount), new D(0));
  const customers = await tx.customer.findMany({
    where: { balance: { gt: 0 } },
    include: { movements: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  const aging = customers.map((c) => {
    let paid = c.movements
      .filter((m) => m.amount.lt(0))
      .reduce((s, m) => s.minus(m.amount), new D(0));
    let oldest: Date | null = null;
    for (const m of c.movements.filter((m) => m.amount.gt(0))) {
      if (paid.gte(m.amount)) paid = paid.minus(m.amount);
      else {
        oldest = m.createdAt;
        break;
      }
    }
    const lastPayment =
      [...c.movements].reverse().find((m) => m.kind.startsWith("PAGO_"))
        ?.createdAt ?? null;
    return {
      id: c.id,
      name: c.name,
      balance: c.balance,
      oldestOutstandingAt: oldest,
      days: oldest
        ? Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 86400000))
        : null,
      lastPayment,
    };
  });
  const outstanding = await tx.purchase.findMany({
    include: { payments: true, supplier: { select: { name: true } } },
  });
  const supplierDebt = new Map<string, InstanceType<typeof D>>();
  for (const p of outstanding)
    add(
      supplierDebt,
      p.supplier.name,
      p.total.minus(p.payments.reduce((s, v) => s.plus(v.amount), new D(0))),
    );
  const debtPayments = await tx.accountMovement.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      kind: { startsWith: "PAGO_" },
    },
  });
  const collections = new Map<string, InstanceType<typeof D>>();
  for (const p of debtPayments) add(collections, p.method, p.amount.neg());
  const known = products.filter((p) => p.cost !== null);
  const list = (map: typeof employee) =>
    [...map].map(([name, amount]) => ({ name, amount }));
  return {
    byEmployee: list(employee),
    byHour: list(hours).sort((a, b) => a.name.localeCompare(b.name)),
    byCategory: list(families),
    expenses,
    unclassifiedOutflows: unclassified,
    inventoryValue: known.reduce(
      (s, p) => s.plus(new D(p.cost).mul(p.stock)),
      new D(0),
    ),
    inventoryCostCoverage: { known: known.length, total: products.length },
    noSalesInPeriod: products
      .filter((p) => !sold.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
    debtAging: aging,
    supplierDebt: list(supplierDebt).filter((v) => v.amount.gt(0)),
    debtCollectionsByMethod: list(collections),
  };
}
