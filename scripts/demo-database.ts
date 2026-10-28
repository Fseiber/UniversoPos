import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
export function demoConnection() {
  const configured = process.env.DEMO_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!configured?.startsWith("postgres"))
    throw new Error("La demostración requiere PostgreSQL configurado");
  const url = new URL(configured);
  url.searchParams.set("schema", "universo_demo");
  const production = new URL(process.env.DATABASE_URL!);
  if (url.toString() === production.toString())
    throw new Error(
      "La demostración debe usar un esquema distinto al del comercio",
    );
  return url.toString();
}
export async function prepareDemoDatabase() {
  const connection = demoConnection();
  const client = new PrismaClient({ datasources: { db: { url: connection } } });
  try {
    await client.$executeRawUnsafe(
      'CREATE SCHEMA IF NOT EXISTS "universo_demo"',
    );
  } finally {
    await client.$disconnect();
  }
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: connection },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw new Error("No se pudo preparar el esquema separado de demostración");
  return connection;
}
