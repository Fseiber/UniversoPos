import { demoConnection } from "./demo-database.js";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.DATABASE_URL = demoConnection();
const { db, ensure } = await import("../server/db.js");
const { createSale, saleInput } = await import("../server/services.js");
const { customerStatement } = await import("../server/customer-statement.js");
const { customerStatementPdf } = await import(
  "../server/customer-statement-pdf.js"
);
try {
  const admin = await db.employee.findFirstOrThrow({
    where: { role: "ADMIN", name: { startsWith: "Demo" } },
  });
  ensure(
    new URL(process.env.DATABASE_URL).searchParams.get("schema") ===
      "universo_demo",
    "Este script solo funciona sobre la base de demostración",
  );
  let customer = await db.customer.findFirst({
    where: { name: "Cliente de ejemplo · cuenta" },
  });
  if (!customer)
    customer = await db.customer.create({
      data: { name: "Cliente de ejemplo · cuenta", creditLimit: 500000 },
    });
  if (!(await db.shift.findFirst({ where: { closedAt: null } })))
    await db.shift.create({ data: { employeeId: admin.id, opening: 5000 } });
  const products = [
    "Aceite de girasol 900 ml",
    "Yerba mate 500 g",
    "Leche entera 1 L",
  ];
  for (const [index, name] of products.entries()) {
    const requestKey = `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`;
    if (await db.sale.findUnique({ where: { requestKey } })) continue;
    const product = await db.product.findFirstOrThrow({
      where: { name, active: true },
    });
    await createSale(
      saleInput.parse({
        requestKey,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [
          { method: "CUENTA_CORRIENTE", amount: Number(product.price) },
        ],
      }),
      admin.id,
    );
  }
  const statement = await customerStatement(customer.id, {});
  await mkdir("output/pdf", { recursive: true });
  await writeFile(
    "output/pdf/cuenta-cliente-ejemplo.pdf",
    await customerStatementPdf(statement),
  );
  console.log(
    JSON.stringify({
      demoOnly: true,
      customerId: customer.id,
      balance: statement.customer.balance,
      purchases: statement.purchases.length,
      pdf: "output/pdf/cuenta-cliente-ejemplo.pdf",
    }),
  );
} finally {
  await db.$disconnect();
}
