import { existsSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
if (!existsSync(".env")) copyFileSync(".env.example", ".env");
await import("dotenv/config");
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  console.error(
    "DATABASE_URL todavía usa SQLite. Ejecutá npm run db:local:init para preparar PostgreSQL local, o configurá una conexión PostgreSQL compartida. La base anterior no se elimina.",
  );
  process.exit(1);
}
for (const args of [["migrate", "deploy"], ["generate"]]) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "PostgreSQL preparado. Para trasladar SQLite: npm run db:import-sqlite -- --source prisma/universo.db --apply. Luego npm run build y npm start.",
);
