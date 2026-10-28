import { z } from "zod";
import { db, D, audit, ensure, type Tx, transaction } from "./db.js";
import { money, moveStock, optionalMoney } from "./services.js";
import { ensureBarcodeAvailable } from "./barcodes.js";

export const productKey = (name: string, unit: string) =>
  JSON.stringify([
    name
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("es-AR"),
    unit,
  ]);
export const catalogImportInput = z.object({
  sourceName: z.string().trim().min(1).max(200),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sheetName: z.string().trim().min(1).max(80),
  records: z
    .array(
      z.object({
        sourceRow: z.number().int().min(2).max(1048576),
        name: z.string().trim().min(1).max(120),
        unit: z.enum(["UNIDAD", "PESO"]),
        referencePrice: money,
      }),
    )
    .min(1)
    .max(10000),
});

async function planImport(tx: Tx, data: z.infer<typeof catalogImportInput>) {
  const previous = await tx.productImport.findUnique({
    where: { sourceHash: data.sourceHash },
    include: { _count: { select: { items: true } } },
  });
  if (previous) return { previous, records: [], skipped: previous.skipped };
  const seenRows = new Set<number>(),
    seenKeys = new Set<string>();
  for (const item of data.records) {
    const key = productKey(item.name, item.unit);
    ensure(!seenRows.has(item.sourceRow), `Fila duplicada: ${item.sourceRow}`);
    ensure(
      !seenKeys.has(key),
      `Producto duplicado en el archivo: ${item.name}`,
    );
    seenRows.add(item.sourceRow);
    seenKeys.add(key);
  }
  const [products, imported] = await Promise.all([
    tx.product.findMany({ select: { name: true, unit: true } }),
    tx.importedProduct.findMany({ select: { normalizedKey: true } }),
  ]);
  const existing = new Set([
    ...products.map((p) => productKey(p.name, p.unit)),
    ...imported.map((p) => p.normalizedKey),
  ]);
  const records = data.records.filter(
    (item) => !existing.has(productKey(item.name, item.unit)),
  );
  return {
    previous: null,
    records,
    skipped: data.records.length - records.length,
  };
}

export async function importCatalog(source: unknown, apply = false) {
  const data = catalogImportInput.parse(source);
  return transaction(
    async (tx) => {
      const plan = await planImport(tx, data);
      if (plan.previous)
        return {
          alreadyImported: true,
          applied: false,
          importId: plan.previous.id,
          source: plan.previous.sourceName,
          total: plan.previous.recordCount,
          imported: plan.previous._count.items,
          skipped: plan.previous.skipped,
        };
      if (!apply)
        return {
          alreadyImported: false,
          applied: false,
          source: data.sourceName,
          total: data.records.length,
          imported: plan.records.length,
          skipped: plan.skipped,
        };
      const batch = await tx.productImport.create({
        data: {
          sourceName: data.sourceName,
          sourceHash: data.sourceHash,
          sheetName: data.sheetName,
          recordCount: data.records.length,
          skipped: plan.skipped,
          items: {
            create: plan.records.map((item) => ({
              ...item,
              normalizedKey: productKey(item.name, item.unit),
            })),
          },
        },
      });
      await audit(
        tx,
        null,
        "IMPORTAR_CATALOGO_PENDIENTE",
        `importacion:${batch.id}`,
        {
          sourceName: data.sourceName,
          sourceHash: data.sourceHash,
          total: data.records.length,
          staged: plan.records.length,
          skipped: plan.skipped,
          saleEnabled: false,
        },
      );
      return {
        alreadyImported: false,
        applied: true,
        importId: batch.id,
        source: data.sourceName,
        total: data.records.length,
        imported: plan.records.length,
        skipped: plan.skipped,
      };
    },
    { timeout: 20_000 },
  );
}

// El precio de venta y el stock requieren entrada explícita; el costo puede completarse luego.
// No se usan los valores de referencia para crear un producto vendible.
const explicitValue = (value: unknown) =>
  typeof value === "number" ||
  (typeof value === "string" && value.trim() !== "")
    ? value
    : NaN;
const explicitMoney = z.preprocess(explicitValue, money);
export const activateImportedInput = z.object({
  name: z.string().trim().min(1).max(120),
  barcode: z.string().trim().max(80).optional(),
  category: z.string().trim().min(1).max(60),
  price: explicitMoney.refine(
    (v) => v > 0,
    "Ingresá un precio actual mayor a cero",
  ),
  cost: optionalMoney,
  stock: z.preprocess(
    explicitValue,
    z.coerce
      .number()
      .finite()
      .min(0)
      .max(1_000_000)
      .refine((v) => new D(v).decimalPlaces() <= 3, "Usá hasta tres decimales"),
  ),
  minimum: z.coerce
    .number()
    .finite()
    .min(0)
    .max(1_000_000)
    .refine((v) => new D(v).decimalPlaces() <= 3)
    .default(0),
});

export async function activateImportedProduct(
  itemId: number,
  source: unknown,
  employeeId: number,
) {
  const data = activateImportedInput.parse(source);
  return transaction(async (tx) => {
    const item = await tx.importedProduct.findUniqueOrThrow({
      where: { id: itemId },
    });
    ensure(
      item.productId === null,
      "Este producto ya fue revisado y habilitado",
      409,
    );
    ensure(
      item.unit === "PESO" ||
        (Number.isInteger(data.stock) && Number.isInteger(data.minimum)),
      "El stock de productos por unidad debe ser entero",
    );
    const existing = await tx.product.findMany({
      where: { unit: item.unit },
      select: { name: true },
    });
    ensure(
      !existing.some(
        (p) =>
          productKey(p.name, item.unit) === productKey(data.name, item.unit),
      ),
      "Ya existe un producto con ese nombre y unidad. Editalo desde el catálogo activo para evitar duplicados",
      409,
    );
    const { stock, ...fields } = data;
    const barcode =
      data.barcode === undefined ? item.barcode : data.barcode || null;
    await ensureBarcodeAvailable(tx, barcode, { kind: "IMPORTED", id: itemId });
    // Transferir la reserva al producto dentro de la misma transacción.
    await tx.importedProduct.update({
      where: { id: itemId },
      data: { barcode: null },
    });
    const product = await tx.product.create({
      data: { ...fields, unit: item.unit, barcode },
    });
    if (stock > 0)
      await moveStock(
        tx,
        product.id,
        new D(stock),
        "INICIAL_IMPORTACION_REVISADA",
        employeeId,
      );
    await tx.importedProduct.update({
      where: { id: itemId },
      data: { productId: product.id, reviewedAt: new Date(), barcode },
    });
    await audit(
      tx,
      employeeId,
      "HABILITAR_PRODUCTO_IMPORTADO",
      `producto:${product.id}`,
      {
        importId: item.importId,
        sourceRow: item.sourceRow,
        previousReferencePrice: item.referencePrice,
        confirmedPrice: data.price,
        confirmedCost: data.cost,
        confirmedStock: stock,
      },
    );
    return tx.product.findUniqueOrThrow({ where: { id: product.id } });
  });
}
