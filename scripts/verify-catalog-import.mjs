import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";

const input = process.argv[2];
const original = process.argv[3];
assert.ok(
  input && original,
  "Uso: node scripts/verify-catalog-import.mjs preparado.json original.xlsx",
);
const payload = JSON.parse(readFileSync(input, "utf8"));
assert.equal(
  createHash("sha256").update(readFileSync(original)).digest("hex"),
  payload.sourceHash,
  "La fuente fue modificada después de la extracción",
);
const db = new DatabaseSync("prisma/universo.db", { readOnly: true });
try {
  const rows = db
    .prepare(
      "SELECT i.* FROM ImportedProduct i JOIN ProductImport b ON b.id=i.importId WHERE b.sourceHash=? ORDER BY i.sourceRow",
    )
    .all(payload.sourceHash);
  assert.equal(rows.length, payload.records.length);
  for (const [index, row] of rows.entries()) {
    const source = payload.records[index];
    assert.equal(row.sourceRow, source.sourceRow);
    assert.equal(row.name, source.name);
    assert.equal(row.unit, source.unit);
    assert.equal(Number(row.referencePrice), Number(source.referencePrice));
    assert.equal(
      row.productId,
      null,
      "Un producto fue habilitado sin revisión",
    );
  }
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  console.log(
    JSON.stringify({
      verified: rows.length,
      pending: rows.filter((r) => r.productId === null).length,
      units: rows.filter((r) => r.unit === "UNIDAD").length,
      byWeight: rows.filter((r) => r.unit === "PESO").length,
      integrity: "ok",
      sourceUnchanged: true,
    }),
  );
} finally {
  db.close();
}
