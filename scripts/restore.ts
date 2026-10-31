import "dotenv/config";
import { createInterface } from "node:readline/promises";
import {
  readdir,
  readFile,
  writeFile,
  copyFile,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  postgresEnvironment,
  postgresTool,
  runFile,
} from "./postgres-tools.js";
import {
  createBackup,
  backupDirectory,
  externalBackupDirectory,
  offsiteDirectory,
} from "../server/backups.js";

// Siempre crea una base nueva: nunca limpia ni sobrescribe la base en uso.
export async function restoreCopy(file: string) {
  const source = process.env.DATABASE_URL!;
  const target = new URL(source);
  const name = `universo_recuperado_${Date.now()}`;
  let creator = source;
  try {
    const local = JSON.parse(
      await readFile(".postgres/connection.json", "utf8"),
    );
    if (target.hostname === "127.0.0.1" && target.port === String(local.port)) {
      const admin = new URL(source);
      admin.username = "universo_admin";
      admin.password = local.adminPassword;
      admin.pathname = "/postgres";
      creator = admin.toString();
    }
  } catch {}
  const owner = decodeURIComponent(target.username);
  await runFile(
    postgresTool("createdb"),
    ["--no-password", `--owner=${owner}`, name],
    { env: postgresEnvironment(creator), windowsHide: true, timeout: 30000 },
  );
  target.pathname = `/${name}`;
  if (
    target.pathname === new URL(source).pathname ||
    !/^universo_recuperado_\d+$/.test(name)
  )
    throw new Error("La copia debe usar una base nueva y aislada");
  try {
    await runFile(
      postgresTool("pg_restore"),
      [
        "--no-password",
        "--no-owner",
        "--no-acl",
        // Solo en la base recién creada: reemplaza su esquema public vacío.
        "--clean",
        "--if-exists",
        "--exit-on-error",
        "--single-transaction",
        "--dbname=" + name,
        path.resolve(file),
      ],
      {
        env: postgresEnvironment(target.toString()),
        windowsHide: true,
        timeout: 120000,
      },
    );
    const schema = new URL(source).searchParams.get("schema") ?? "public";
    target.searchParams.set("schema", schema);
    const client = new PrismaClient({
      datasources: { db: { url: target.toString() } },
    });
    try {
      const tables = await client.$queryRaw<
        { relation: string | null }[]
      >`SELECT to_regclass(current_schema() || '._prisma_migrations')::text AS relation`;
      if (tables[0]?.relation)
        await runFile(
          process.execPath,
          ["node_modules/prisma/build/index.js", "migrate", "deploy"],
          {
            env: { ...process.env, DATABASE_URL: target.toString() },
            windowsHide: true,
            timeout: 120000,
          },
        );
      // Leer campos actuales comprueba además que la copia es compatible con esta versión.
      await client.product.findFirst();
      const stock = await client.$queryRaw<
        { ok: boolean }[]
      >`SELECT NOT EXISTS (SELECT 1 FROM "Product" p WHERE p.stock <> COALESCE((SELECT SUM(m.quantity) FROM "StockMovement" m WHERE m."productId" = p.id), 0)) AS ok`;
      const accounts = await client.$queryRaw<
        { ok: boolean }[]
      >`SELECT NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.balance <> COALESCE((SELECT SUM(m.amount) FROM "AccountMovement" m WHERE m."customerId" = c.id), 0)) AS ok`;
      if (!stock[0]?.ok || !accounts[0]?.ok)
        throw new Error("La copia tiene diferencias de conciliación");
      const products = await client.product.count();
      const sales = await client.sale.count();
      return { url: target.toString(), name, products, sales };
    } finally {
      await client.$disconnect();
    }
  } catch {
    throw new Error(
      `No se verificó la recuperación. La base original está intacta. Copia aislada para diagnóstico: ${name}`,
    );
  }
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const directories = [
      ...new Set(
        [
          backupDirectory(),
          externalBackupDirectory(),
          await offsiteDirectory(),
        ].filter(Boolean) as string[],
      ),
    ];
    const files: string[] = [];
    for (const dir of directories)
      for (const name of await readdir(dir).catch(() => []))
        if (/^universo-.*\.dump$/.test(name)) files.push(path.join(dir, name));
    files.sort().reverse();
    if (!files.length) throw new Error("No hay respaldos disponibles");
    console.log(
      "RECUPERACIÓN GUIADA: se crea una copia nueva y se conserva la base actual.",
    );
    files.forEach((f, i) => console.log(`${i + 1}. ${f}`));
    const index = Number(await rl.question("Número de respaldo: ")) - 1;
    if (!Number.isInteger(index) || !files[index])
      throw new Error("Selección inválida");
    if (
      (await rl.question(
        "Escribí RESTAURAR COPIA para verificar ese respaldo: ",
      )) !== "RESTAURAR COPIA"
    )
      return;
    const result = await restoreCopy(files[index]);
    console.log(
      `Copia verificada: ${result.name}. Productos: ${result.products}. Ventas: ${result.sales}.`,
    );
    console.log(
      "Para usarla, cerrá el POS en todos los equipos y detené el servidor. La base anterior se conserva.",
    );
    if (
      (await rl.question(
        "Escribí USAR COPIA para configurar el próximo inicio con esta copia: ",
      )) !== "USAR COPIA"
    )
      return;
    let running = false;
    try {
      await fetch(`http://127.0.0.1:${process.env.PORT ?? 3001}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      running = true;
    } catch {}
    if (running)
      throw new Error(
        "Detené el servidor del POS antes de cambiar a la copia recuperada",
      );
    let backup = "No disponible";
    try {
      backup = await createBackup();
    } catch {
      console.log(
        "No se pudo generar un respaldo nuevo de la base actual. La base anterior se conserva; la copia elegida ya fue restaurada y conciliada.",
      );
      if (
        (await rl.question(
          "Escribí CONTINUAR SIN RESPALDO NUEVO para activar la copia verificada: ",
        )) !== "CONTINUAR SIN RESPALDO NUEVO"
      )
        return;
    }
    const env = await readFile(".env", "utf8");
    await mkdir(".postgres", { recursive: true });
    await copyFile(".env", `.postgres/env-before-restore-${Date.now()}.txt`);
    await writeFile(
      ".env",
      env.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL=${JSON.stringify(result.url)}`,
      ),
    );
    console.log(
      `Configuración actualizada. Respaldo previo: ${backup}. Abrí Iniciar El Universo y revisá Configuración > Reconciliar.`,
    );
  } finally {
    rl.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/restore.ts")
)
  void main().catch((error) => {
    console.error(
      error instanceof Error && !error.message.includes("postgresql://")
        ? error.message
        : "Error al restaurar",
    );
    console.error(
      "No se completó la recuperación. Revisá respaldo, conexión y permisos para crear una base. La base original no se reemplazó.",
    );
    process.exitCode = 1;
  });
