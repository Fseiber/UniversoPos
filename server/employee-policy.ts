import { z } from "zod";
import { audit, db, ensure } from "./db.js";
import { verifyPin, pinSchema } from "./auth.js";

export const authorization = z
  .object({
    adminId: z.coerce.number().int().positive(),
    pin: pinSchema,
    reason: z.string().trim().min(5).max(160),
  })
  .optional();

export async function authorizeException(
  employee: { id: number; role: string },
  kind: "surcharge" | "movement",
  amount: number,
  input: unknown,
) {
  if (employee.role === "ADMIN") return;
  const policy = await db.posSettings.findUnique({ where: { id: 1 } });
  const limit =
    kind === "surcharge"
      ? Number(policy?.employeeSurchargeLimit ?? 0)
      : Number(policy?.employeeMovementLimit ?? 0);
  if (amount <= limit) return;
  const approval = authorization.parse(input);
  ensure(
    approval,
    "Esta operación requiere autorización del dueño y un motivo",
    403,
  );
  const owner = await verifyPin(approval.adminId, approval.pin, true);
  await audit(db, employee.id, "AUTORIZAR_EXCEPCION", kind, {
    adminId: owner.id,
    amount,
    limit,
    reason: approval.reason,
  });
}

// Defensa central para todas las respuestas JSON autenticadas, incluso rutas nuevas.
export function employeeView(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (key, item) => {
    if (/^(cost|unitCost|offers|margin|oldCost|newCost)$/i.test(key))
      return undefined;
    if (key === "lineDetails" && typeof item === "string") {
      try {
        return JSON.stringify(employeeView(JSON.parse(item)));
      } catch {
        return undefined;
      }
    }
    return item;
  });
}
