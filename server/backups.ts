import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { ensure } from "./db.js";

export let backupState: { lastSuccess: string | null; error: string | null } = {
  lastSuccess: null,
  error: null,
};
let inProgress: Promise<string> | undefined;
export function databaseFile() {
  const file = (process.env.DATABASE_URL ?? "file:./universo.db").replace(
    /^file:/,
    "",
  );
  return path.isAbsolute(file) ? file : path.resolve("prisma", file);
}
export const backupDirectory = () =>
  path.resolve(process.env.BACKUP_DIR ?? "./backups");
export function createBackup() {
  if (inProgress) return inProgress;
  inProgress = (async () => {
    const dir = backupDirectory();
    ensure(
      path.resolve(dir) !== path.dirname(databaseFile()),
      "Elegí una carpeta de respaldo diferente a la base activa",
    );
    await mkdir(dir, { recursive: true });
    const name = `universo-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
    const source = new DatabaseSync(databaseFile(), { readOnly: true });
    try {
      await backup(source, path.join(dir, name));
    } finally {
      source.close();
    }
    for (const entry of await readdir(dir)) {
      if (!/^universo-\d{4}-\d\d-\d\dT[\dTZ-]+\.db$/.test(entry)) continue;
      const file = path.join(dir, entry);
      if ((await stat(file)).mtimeMs < Date.now() - 15 * 86400_000)
        await unlink(file);
    }
    backupState = { lastSuccess: new Date().toISOString(), error: null };
    return name;
  })()
    .catch((error) => {
      backupState.error =
        "No se pudo guardar el respaldo. Revisá espacio y permisos de la carpeta configurada.";
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
    console.error("Fallo de respaldo automático; consultar /api/backups");
  }
}
