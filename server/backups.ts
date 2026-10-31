import {
  mkdir,
  readdir,
  stat,
  unlink,
  rename,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { ensure } from "./db.js";
import {
  postgresTool,
  postgresEnvironment,
  runFile,
} from "../scripts/postgres-tools.js";
export let backupState: {
  lastSuccess: string | null;
  error: string | null;
  externalSuccess: string | null;
} = {
  lastSuccess: null,
  error: null,
  externalSuccess: null,
};
let inProgress: Promise<string> | undefined;
export const backupDirectory = () =>
  path.resolve(process.env.BACKUP_DIR ?? "./backups");
export const externalBackupDirectory = () =>
  process.env.BACKUP_SECONDARY_DIR?.trim()
    ? path.resolve(process.env.BACKUP_SECONDARY_DIR)
    : null;
export async function offsiteDirectory(): Promise<string | null> {
  if (process.env.BACKUP_OFFSITE_DIR)
    return path.resolve(process.env.BACKUP_OFFSITE_DIR);
  try {
    return (
      JSON.parse(
        await readFile(
          path.join(backupDirectory(), "backup-settings.json"),
          "utf8",
        ),
      ).offsite || null
    );
  } catch {
    return null;
  }
}
export async function configureOffsite(directory: string) {
  ensure(path.isAbsolute(directory), "Ingresá una ruta completa de carpeta");
  const target = path.resolve(directory);
  ensure(
    target !== backupDirectory() && target !== externalBackupDirectory(),
    "Elegí otra carpeta para la copia adicional",
  );
  await mkdir(target, { recursive: true });
  const probe = path.join(target, `.universo-write-check-${Date.now()}`);
  await writeFile(probe, "Comprobación de escritura");
  await unlink(probe);
  await mkdir(backupDirectory(), { recursive: true });
  const config = path.join(backupDirectory(), "backup-settings.json");
  await writeFile(config + ".partial", JSON.stringify({ offsite: target }));
  await rename(config + ".partial", config);
  return target;
}
async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
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
    backupState.lastSuccess = new Date().toISOString();
    for (const external of [
      ...new Set(
        [externalBackupDirectory(), await offsiteDirectory()].filter(
          Boolean,
        ) as string[],
      ),
    ]) {
      ensure(external !== directory, "La copia externa debe usar otra carpeta");
      await mkdir(external, { recursive: true });
      const target = path.join(external, name),
        partialExternal = target + ".partial";
      try {
        await copyFile(path.join(directory, name), partialExternal);
        ensure(
          (await digest(path.join(directory, name))) ===
            (await digest(partialExternal)),
          "La copia externa no coincide con el respaldo",
        );
        await rename(partialExternal, target);
        backupState.externalSuccess = new Date().toISOString();
      } catch {
        await unlink(partialExternal).catch(() => {});
        throw new Error(
          "El respaldo local se guardó, pero falló la copia externa. Revisá BACKUP_SECONDARY_DIR y el dispositivo",
        );
      }
    }
    backupState = {
      ...backupState,
      lastSuccess: new Date().toISOString(),
      error: null,
    };
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
