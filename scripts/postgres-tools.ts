import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
export const runFile = promisify(execFile);
export function postgresTool(name: string) {
  if (process.env.PG_BIN)
    return path.join(
      process.env.PG_BIN,
      name + (process.platform === "win32" ? ".exe" : ""),
    );
  if (process.platform === "win32")
    for (const version of ["18", "17", "16", "15"]) {
      const file = path.join(
        process.env.ProgramFiles ?? "C:/Program Files",
        "PostgreSQL",
        version,
        "bin",
        `${name}.exe`,
      );
      if (existsSync(file)) return file;
    }
  return name;
}
export function postgresEnvironment(connection: string) {
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Se requiere una conexión PostgreSQL");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "prefer",
    PGCONNECT_TIMEOUT: "10",
  };
}
