import "dotenv/config";
import { db, initializeDatabase } from "../server/db.js";
import { reconcile } from "../server/services.js";
try {
  await initializeDatabase();
  const result = await reconcile();
  console.log({
    database: "PostgreSQL",
    products: await db.product.count(),
    importedRecords: await db.importedProduct.count(),
    sales: await db.sale.count(),
    reconciliation: result,
  });
  if (!result.ok) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
