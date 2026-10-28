import "dotenv/config";
import path from "node:path";
import { db } from "../server/db.js";
import { transferSqlite } from "../server/sqlite-transfer.js";
try {
  const args = process.argv.slice(2),
    index = args.indexOf("--source");
  if (index < 0 || !args[index + 1])
    throw new Error(
      "Uso: npm run db:import-sqlite -- --source prisma/universo.db [--apply]",
    );
  const result = await transferSqlite(db, args[index + 1], {
    apply: args.includes("--apply"),
    backupDirectory: path.resolve(process.env.BACKUP_DIR ?? "backups"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.applied)
    console.log(
      "Vista previa: no se modificó PostgreSQL. Agregá --apply para trasladar los datos con respaldo previo.",
    );
} catch (e) {
  console.error(
    (e as { code?: string }).code
      ? "Falló el traslado a PostgreSQL; la transacción se revirtió y SQLite se conservó. Verificá esquema y conexión."
      : (e as Error).message,
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
