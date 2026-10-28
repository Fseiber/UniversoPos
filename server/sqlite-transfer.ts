import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ensure } from "./db.js";

export async function transferSqlite(
  client: PrismaClient,
  sourceFile: string,
  options: { apply?: boolean; backupDirectory: string },
) {
  const source = path.resolve(sourceFile);
  ensure((await stat(source)).isFile(), "La base SQLite de origen no existe");
  const sourceDb = new DatabaseSync(source, { readOnly: true });
  let snapshot: string | null = null;
  try {
    if (options.apply) {
      await mkdir(options.backupDirectory, { recursive: true });
      snapshot = path.resolve(
        options.backupDirectory,
        `legacy-sqlite-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
      );
      ensure(snapshot !== source, "El respaldo no puede reemplazar el origen");
      await backup(sourceDb, snapshot);
    }
  } finally {
    sourceDb.close();
  }
  const sqlite = new DatabaseSync(snapshot ?? source, { readOnly: true });
  const models = Prisma.dmmf.datamodel.models.filter(
    (m) => m.name !== "BarcodeReservation",
  );
  const records = new Map<string, Record<string, unknown>[]>();
  try {
    ensure(
      sqlite
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='Product'",
        )
        .get(),
      "El archivo no es una base de El Universo POS",
    );
    ensure(
      sqlite.prepare("PRAGMA integrity_check").get()?.integrity_check === "ok",
      "La base de origen no pasa la comprobación de integridad",
    );
    ensure(
      sqlite.prepare("PRAGMA foreign_key_check").all().length === 0,
      "El origen tiene referencias inválidas",
    );
    for (const model of models) {
      if (model.name === "Session") continue; // No trasladar sesiones abiertas entre servidores.
      const table = model.dbName ?? model.name;
      const present = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (!present) {
        records.set(model.name, []);
        continue;
      }
      const columns = new Set(
        sqlite
          .prepare(`PRAGMA table_info("${table}")`)
          .all()
          .map((c) => c.name),
      );
      const fields = model.fields.filter(
        (f) => f.kind === "scalar" && columns.has(f.dbName ?? f.name),
      );
      const selection = fields
        .map(
          (f) =>
            `${f.type === "Decimal" ? "CAST(" : ""}"${f.dbName ?? f.name}"${f.type === "Decimal" ? " AS TEXT)" : ""} AS "${f.name}"`,
        )
        .join(",");
      const rows = sqlite
        .prepare(`SELECT ${selection} FROM "${table}" ORDER BY "id"`)
        .all()
        .map((row) => {
          const result: Record<string, unknown> = {};
          for (const field of fields) {
            const value = row[field.name];
            if (value === null) {
              result[field.name] = null;
              continue;
            }
            if (field.type === "DateTime") {
              const text = String(value);
              const date = new Date(
                typeof value === "number" || /^\d{11,}$/.test(text)
                  ? Number(value)
                  : /(?:Z|[+-]\d\d:\d\d)$/.test(text)
                    ? text
                    : text.replace(" ", "T") + "Z",
              );
              ensure(
                !Number.isNaN(date.getTime()),
                `Fecha inválida en ${model.name}.${field.name}`,
              );
              result[field.name] = date;
            } else if (field.type === "Boolean") {
              ensure(
                value === 0 || value === 1,
                `Booleano inválido en ${model.name}.${field.name}`,
              );
              result[field.name] = value === 1;
            } else if (field.type === "Decimal") {
              const decimal = new Prisma.Decimal(String(value));
              const quantity =
                ["stock", "quantity"].includes(field.name) ||
                (field.name === "minimum" &&
                  ["Product", "PriceRule"].includes(model.name));
              ensure(
                decimal.isFinite() &&
                  decimal.decimalPlaces() <= (quantity ? 3 : 2),
                `Precisión inválida en ${model.name}.${field.name}, fila ${row.id}`,
              );
              result[field.name] = decimal;
            } else result[field.name] = value;
          }
          return result;
        });
      records.set(model.name, rows);
    }
  } finally {
    sqlite.close();
  }
  const counts = Object.fromEntries(
    [...records].map(([name, rows]) => [name, rows.length]),
  );
  // Una importación inicial nunca mezcla ni reemplaza registros preexistentes.
  for (const model of models) {
    const delegate = (client as any)[
      model.name[0].toLowerCase() + model.name.slice(1)
    ];
    ensure(
      (await delegate.count()) === 0,
      `PostgreSQL ya contiene datos en ${model.name}. No se importó nada; usá una base vacía`,
    );
  }
  if (!options.apply) return { applied: false, counts, snapshot: null };
  await client.$transaction(
    async (tx) => {
      // Serializar dos importaciones y volver a comprobar antes de escribir.
      await tx.$executeRawUnsafe(
        'LOCK TABLE "Employee", "Product", "Customer", "Sale", "ProductImport", "ImportedProduct" IN ACCESS EXCLUSIVE MODE',
      );
      for (const model of models) {
        const delegate = (tx as any)[
          model.name[0].toLowerCase() + model.name.slice(1)
        ];
        ensure(
          (await delegate.count()) === 0,
          `La base dejó de estar vacía: ${model.name}`,
        );
      }
      for (const model of models) {
        const rows = records.get(model.name) ?? [];
        const delegate = (tx as any)[
          model.name[0].toLowerCase() + model.name.slice(1)
        ];
        for (let offset = 0; offset < rows.length; offset += 250)
          await delegate.createMany({ data: rows.slice(offset, offset + 250) });
      }
      for (const model of models)
        if (model.fields.some((f) => f.name === "id" && f.type === "Int")) {
          // Nombres obtenidos únicamente del esquema interno de Prisma, nunca del usuario.
          await tx.$queryRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('"${model.name}"', 'id'), COALESCE(MAX("id"),1), COUNT(*)>0) FROM "${model.name}"`,
          );
        }
      for (const [name, rows] of records)
        ensure(
          (await (tx as any)[name[0].toLowerCase() + name.slice(1)].count()) ===
            rows.length,
          `No coincide el recuento de ${name}`,
        );
    },
    {
      timeout: 120_000,
      maxWait: 10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
  return { applied: true, counts, snapshot };
}
