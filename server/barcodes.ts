import { z } from "zod";
import { db, audit, ensure, type Tx, transaction } from "./db.js";

export const barcodeValue = z
  .string()
  .trim()
  .min(1, "Escaneá o ingresá un código")
  .max(80)
  .regex(
    /^[^\s\x00-\x1f\x7f]+$/,
    "El código no debe tener espacios ni caracteres de control",
  );
export type BarcodeTarget = { kind: "PRODUCT" | "IMPORTED"; id: number };
export async function ensureBarcodeAvailable(
  tx: Tx,
  code: string | null | undefined,
  own?: BarcodeTarget,
) {
  if (!code) return;
  const product = await tx.product.findFirst({
    where: {
      barcode: code,
      ...(own?.kind === "PRODUCT" ? { id: { not: own.id } } : {}),
    },
    select: { name: true },
  });
  ensure(
    !product,
    `Ese código ya pertenece a «${product?.name}» en el catálogo`,
    409,
  );
  const imported = await tx.importedProduct.findFirst({
    where: {
      barcode: code,
      productId: null,
      ...(own?.kind === "IMPORTED" ? { id: { not: own.id } } : {}),
    },
    select: { name: true },
  });
  ensure(
    !imported,
    `Ese código ya está reservado para «${imported?.name}» entre los importados`,
    409,
  );
}

export const saveBarcodeInput = z.object({
  kind: z.enum(["PRODUCT", "IMPORTED"]),
  id: z.number().int().positive(),
  barcode: barcodeValue,
  expectedBarcode: z.string().nullable(),
  replaceExisting: z.boolean().default(false),
});
export async function saveBarcode(source: unknown, employeeId: number) {
  const input = saveBarcodeInput.parse(source);
  return transaction(async (tx) => {
    const target =
      input.kind === "PRODUCT"
        ? await tx.product.findUniqueOrThrow({ where: { id: input.id } })
        : await tx.importedProduct.findUniqueOrThrow({
            where: { id: input.id },
          });
    if (input.kind === "PRODUCT")
      ensure(
        (target as { active: boolean }).active,
        "El producto está dado de baja",
        409,
      );
    else
      ensure(
        (target as { productId: number | null }).productId === null,
        "Este importado ya se habilitó. Buscalo en el catálogo activo",
        409,
      );
    if (target.barcode === input.barcode)
      return {
        key: `${input.kind}:${input.id}`,
        name: target.name,
        barcode: input.barcode,
        unchanged: true,
      };
    ensure(
      target.barcode === input.expectedBarcode,
      "El código cambió desde que abriste la ficha. Actualizá la lista antes de guardar",
      409,
    );
    ensure(
      !target.barcode || input.replaceExisting,
      "Este producto ya tiene un código. Confirmá el reemplazo para cambiarlo",
      409,
    );
    await ensureBarcodeAvailable(tx, input.barcode, input);
    if (input.kind === "PRODUCT")
      await tx.product.update({
        where: { id: input.id },
        data: { barcode: input.barcode },
      });
    else
      await tx.importedProduct.update({
        where: { id: input.id },
        data: { barcode: input.barcode },
      });
    await audit(
      tx,
      employeeId,
      "ASIGNAR_CODIGO_BARRAS",
      `${input.kind === "PRODUCT" ? "producto" : "importado"}:${input.id}`,
      {
        name: target.name,
        previousBarcode: target.barcode,
        barcode: input.barcode,
        source: "carga_rapida",
      },
    );
    return {
      key: `${input.kind}:${input.id}`,
      name: target.name,
      barcode: input.barcode,
      unchanged: false,
    };
  });
}
