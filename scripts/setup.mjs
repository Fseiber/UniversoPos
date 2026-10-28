import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
if (!existsSync(".env")) copyFileSync(".env.example", ".env");
await import("dotenv/config");
const raw = (process.env.DATABASE_URL ?? "file:./universo.db").replace(
  /^file:/,
  "",
);
const file = path.isAbsolute(raw) ? raw : path.resolve("prisma", raw);
mkdirSync(path.dirname(file), { recursive: true });
// En este entorno Windows el motor necesita que el archivo SQLite exista antes de migrate deploy.
const sqlite = new DatabaseSync(file);
sqlite.close();
for (const args of [["migrate", "deploy"], ["generate"]]) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Base preparada. Ejecutá npm run build y npm start.");
