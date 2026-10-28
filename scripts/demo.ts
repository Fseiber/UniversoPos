import "dotenv/config";
import path from "node:path";
import { prepareDemoDatabase } from "./demo-database.js";
process.env.DATABASE_URL = await prepareDemoDatabase();
process.env.BACKUP_DIR = path.resolve(".demo/backups");
process.env.PORT = "3002";
process.env.HOST = "127.0.0.1";
process.env.DEMO_MODE = "true";
const { db, D } = await import("../server/db.js");
if ((await db.employee.count()) === 0) {
  const { hashPin } = await import("../server/auth.js");
  const admin = await db.employee.create({
    data: {
      name: "Demo · Administración",
      role: "ADMIN",
      pinHash: await hashPin("246810"),
    },
  });
  const names = [
    ["Yerba mate 500 g", "Almacén", 2800, 1900, 24],
    ["Galletitas de vainilla", "Almacén", 1200, 720, 18],
    ["Gaseosa cola 1,5 L", "Bebidas", 2500, 1600, 15],
    ["Agua mineral 1,5 L", "Bebidas", 1500, 850, 32],
    ["Arroz largo fino 1 kg", "Almacén", 1800, 1100, 20],
    ["Aceite de girasol 900 ml", "Almacén", 3200, 2300, 12],
    ["Alfajor de chocolate", "Golosinas", 900, 500, 40],
    ["Chocolate con leche", "Golosinas", 1600, 1000, 22],
    ["Leche entera 1 L", "Lácteos", 1900, 1300, 16],
    ["Queso cremoso", "Lácteos", 8500, 5400, 4.75],
    ["Pan fresco", "Panadería", 2800, 1700, 8.5],
    ["Azúcar 1 kg", "Almacén", 1400, 900, 2],
  ] as const;
  for (let i = 0; i < names.length; i++) {
    const [name, category, price, cost, stock] = names[i];
    const product = await db.product.create({
      data: {
        name,
        category,
        price,
        cost,
        stock: new D(stock),
        minimum: 3,
        barcode: `7790000000${String(i + 1).padStart(3, "0")}`,
        unit: [9, 10].includes(i) ? "PESO" : "UNIDAD",
      },
    });
    await db.stockMovement.create({
      data: {
        productId: product.id,
        quantity: new D(stock),
        reason: "INICIAL_DEMO",
        employeeId: admin.id,
      },
    });
  }
  for (const name of ["Ana · ejemplo", "Carlos · ejemplo", "Marta · ejemplo"])
    await db.customer.create({ data: { name, creditLimit: 30000 } });
  await db.audit.create({
    data: {
      employeeId: admin.id,
      action: "ENTORNO_DEMO",
      entity: "sistema",
      detail:
        "Datos ficticios para verificar la aplicación. No usar para operar el comercio.",
    },
  });
}
await db.$disconnect();
console.log(
  "DEMO con datos ficticios · PIN 246810 · No es la base del comercio",
);
await import("../server/index.js");
