import { mkdir, readdir, stat, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { ensure } from "./db.js";
import {
  postgresTool,
  postgresEnvironment,
  runFile,
} from "../scripts/postgres-tools.js";
export let backupState: { lastSuccess: string | null; error: string | null } = {
  lastSuccess: null,
  error: null,
};
let inProgress: Promise<string> | undefined;
export const backupDirectory = () =>
  path.resolve(process.env.BACKUP_DIR ?? "./backups");
export function createBackup() {
  if (inProgress) return inProgress;
  inProgress = (async () => {
    ensure(
      process.env.DATABASE_URL,
      "Falta DATABASE_URL para respaldar PostgreSQL",
    );
    const schema =
      new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public";
    ensure(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema),
      "Nombre de esquema inválido para el respaldo",
    );
    const directory = backupDirectory();
    await mkdir(directory, { recursive: true });
    const name = `universo-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
    const partial = path.join(directory, `${name}.partial`);
    try {
      await runFile(
        postgresTool("pg_dump"),
        [
          "--format=custom",
          "--no-owner",
          "--no-acl",
          "--no-password",
          `--schema=${schema}`,
          `--file=${partial}`,
        ],
        {
          env: postgresEnvironment(process.env.DATABASE_URL),
          windowsHide: true,
          timeout: 120_000,
        },
      );
      await rename(partial, path.join(directory, name));
    } catch {
      await unlink(partial).catch(() => {});
      throw new Error(
        "No se pudo respaldar PostgreSQL. Revisá PG_BIN, conexión, versión de pg_dump y permisos de BACKUP_DIR",
      );
    }
    for (const entry of await readdir(directory)) {
      if (!/^universo-\d{4}-\d\d-\d\dT[\dTZ-]+\.dump$/.test(entry)) continue;
      const file = path.join(directory, entry);
      if ((await stat(file)).mtimeMs < Date.now() - 15 * 86400_000)
        await unlink(file);
    }
    backupState = { lastSuccess: new Date().toISOString(), error: null };
    return name;
  })()
    .catch((error) => {
      backupState.error = (error as Error).message;
      throw error;
    })
    .finally(() => {
      inProgress = undefined;
    });
  return inProgress;
}
export async function automaticBackup() {
  try {
    await createBackup();
  } catch {
    console.error(
      "Fallo de respaldo PostgreSQL; consultá Configuración → Respaldos",
    );
  }
}
