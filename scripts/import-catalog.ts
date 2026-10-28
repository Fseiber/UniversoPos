import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db, ensure } from "../server/db.js";
import { createBackup } from "../server/backups.js";
import { importCatalog } from "../server/product-import.js";

try {
  const source = process.argv[2];
  ensure(source, "Uso: npm run import:catalog -- archivo.json [--apply]");
  const apply = process.argv.includes("--apply");
  const data: unknown = JSON.parse(await readFile(source, "utf8"));
  const plan = await importCatalog(data, false);
  if (apply && !plan.alreadyImported) {
    const backup = await createBackup();
    const result = await importCatalog(data, true);
    console.log(
      JSON.stringify({
        ...result,
        backup,
        location: "Productos → Importados por revisar",
        pricePolicy: "Solo referencia; no habilitados para vender",
      }),
    );
  } else console.log(JSON.stringify(plan));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
