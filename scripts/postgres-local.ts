import "dotenv/config";
import { parse } from "dotenv";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink, copyFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import {
  postgresTool,
  postgresEnvironment,
  runFile,
} from "./postgres-tools.js";

const root = path.resolve(".postgres"),
  data = path.join(root, "data"),
  configFile = path.join(root, "connection.json");
const action = process.argv[2];
try {
  if (!["init", "start", "stop"].includes(action))
    throw new Error(
      "Uso: npm run db:local:init | db:local:start | db:local:stop",
    );
  await mkdir(root, { recursive: true });
  let config: { port: number; adminPassword: string; password: string };
  if (existsSync(configFile))
    config = JSON.parse(await readFile(configFile, "utf8"));
  else {
    if (action !== "init")
      throw new Error("Primero ejecutá npm run db:local:init");
    config = {
      port: Number(process.env.PG_LOCAL_PORT ?? 55432),
      adminPassword: randomBytes(24).toString("hex"),
      password: randomBytes(24).toString("hex"),
    };
    if (
      !Number.isInteger(config.port) ||
      config.port < 1024 ||
      config.port > 65535
    )
      throw new Error("Puerto local inválido");
    const portAvailable = (port: number) =>
      new Promise<number>((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(port, "127.0.0.1", () => {
          const chosen = (probe.address() as net.AddressInfo).port;
          probe.close(() => resolve(chosen));
        });
      });
    try {
      await portAvailable(config.port);
    } catch {
      if (process.env.PG_LOCAL_PORT)
        throw new Error("PG_LOCAL_PORT está ocupado");
      config.port = await portAvailable(0);
    }
    await writeFile(configFile, JSON.stringify(config), {
      mode: 0o600,
      flag: "wx",
    });
  }
  if (action === "init" && existsSync(".env")) {
    const expected = `postgresql://universo:${config.password}@127.0.0.1:${config.port}/el_universo?schema=public`;
    const existing = parse(await readFile(".env", "utf8")).DATABASE_URL;
    if (
      existing?.startsWith("postgres") &&
      existing !== expected &&
      !existing.includes("CAMBIAR_PASSWORD")
    )
      throw new Error(
        "DATABASE_URL ya apunta a otro servidor PostgreSQL; se detuvo la inicialización local",
      );
  }
  if (!existsSync(path.join(data, "PG_VERSION"))) {
    if (action !== "init")
      throw new Error("El clúster local no está inicializado");
    const passwordFile = path.join(root, ".init-password");
    await writeFile(passwordFile, config.adminPassword, { mode: 0o600 });
    try {
      await runFile(
        postgresTool("initdb"),
        [
          "-D",
          data,
          "-U",
          "universo_admin",
          "--pwfile",
          passwordFile,
          "--auth=scram-sha-256",
          "--encoding=UTF8",
          "--locale=C",
        ],
        { windowsHide: true, timeout: 60_000 },
      );
    } finally {
      await unlink(passwordFile).catch(() => {});
    }
  }
  const running = await runFile(
    postgresTool("pg_ctl"),
    ["-D", data, "status"],
    { windowsHide: true },
  ).then(
    () => true,
    () => false,
  );
  if (action === "stop") {
    if (running)
      await runFile(
        postgresTool("pg_ctl"),
        ["-D", data, "stop", "-m", "fast", "-w"],
        { windowsHide: true, timeout: 60_000 },
      );
    console.log("PostgreSQL del proyecto detenido. Los datos se conservan.");
  } else {
    if (!running)
      await runFile(
        postgresTool("pg_ctl"),
        [
          "-D",
          data,
          "-l",
          path.join(root, "server.log"),
          "-o",
          `-p ${config.port} -h 127.0.0.1`,
          "-w",
          "start",
        ],
        { windowsHide: true, timeout: 60_000 },
      );
    if (action === "init") {
      const adminEnv = postgresEnvironment(
        `postgresql://universo_admin:${config.adminPassword}@127.0.0.1:${config.port}/postgres`,
      );
      const query = (sql: string) =>
        runFile(
          postgresTool("psql"),
          ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
          { env: adminEnv, windowsHide: true },
        );
      // La contraseña se transmite mediante stdin de archivo privado, nunca como argumento.
      if (
        !(
          await query("SELECT 1 FROM pg_roles WHERE rolname='universo'")
        ).stdout.trim()
      ) {
        const sqlFile = path.join(root, ".create-role.sql");
        await writeFile(
          sqlFile,
          `CREATE ROLE universo LOGIN PASSWORD '${config.password}';`,
          { mode: 0o600 },
        );
        try {
          await runFile(
            postgresTool("psql"),
            ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-f", sqlFile],
            { env: adminEnv, windowsHide: true },
          );
        } finally {
          await unlink(sqlFile).catch(() => {});
        }
      }
      if (
        !(
          await query("SELECT 1 FROM pg_database WHERE datname='el_universo'")
        ).stdout.trim()
      )
        await query("CREATE DATABASE el_universo OWNER universo");
      const connection = `postgresql://universo:${config.password}@127.0.0.1:${config.port}/el_universo?schema=public`;
      const previous = existsSync(".env")
        ? await readFile(".env", "utf8")
        : await readFile(".env.example", "utf8");
      const configured = parse(previous).DATABASE_URL;
      if (
        configured?.startsWith("postgres") &&
        configured !== connection &&
        !configured.includes("CAMBIAR_PASSWORD")
      )
        throw new Error(
          "Ya hay otra conexión PostgreSQL configurada. Se conservó .env; no se reemplaza por la instancia local",
        );
      if (existsSync(".env") && !existsSync(".env.sqlite.local"))
        await copyFile(".env", ".env.sqlite.local");
      const next = previous.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL="${connection}"`,
      );
      await writeFile(".env", next, { mode: 0o600 });
      console.log(
        "Instancia PostgreSQL preparada; conexión guardada en .env. Ejecutá npm run setup y luego la importación de SQLite.",
      );
    } else console.log("PostgreSQL del proyecto iniciado.");
  }
} catch (e) {
  // execFile incluye argumentos en sus errores; no imprimirlos porque initdb usa archivos privados.
  const error = e as Error & { code?: string | number };
  console.error(
    typeof error.code === "number"
      ? "No se pudo iniciar o configurar PostgreSQL. Consultá .postgres/server.log; verificá que PG_BIN sea correcto y que el puerto esté libre."
      : error.message,
  );
  process.exitCode = 1;
}
