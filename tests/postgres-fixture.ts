import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  postgresEnvironment,
  postgresTool,
  runFile,
} from "../scripts/postgres-tools.js";
export async function postgresFixture() {
  const connection = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connection?.startsWith("postgres"))
    throw new Error(
      "Las pruebas requieren PostgreSQL: npm run db:local:start y npm run setup, o TEST_DATABASE_URL",
    );
  const schema = `test_${randomBytes(10).toString("hex")}`;
  const admin = new PrismaClient({ datasources: { db: { url: connection } } });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(connection);
  url.searchParams.set("schema", schema);
  try {
    for (const name of (await readdir("prisma/migrations"))
      .filter((n) => !n.endsWith(".toml"))
      .sort())
      await runFile(
        postgresTool("psql"),
        [
          "-X",
          "--no-password",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          path.resolve("prisma/migrations", name, "migration.sql"),
        ],
        {
          env: {
            ...postgresEnvironment(connection),
            PGOPTIONS: `-c search_path=${schema}`,
          },
          windowsHide: true,
        },
      );
  } catch (e) {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    throw e;
  }
  return {
    url: url.toString(),
    schema,
    async dispose() {
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    },
  };
}
