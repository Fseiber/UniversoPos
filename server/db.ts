import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
export const db = new PrismaClient({
  transactionOptions: {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 20_000,
  },
});
export const D = Prisma.Decimal;
export type Tx = Prisma.TransactionClient;
export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new Problem(status, message);
}
export const audit = (
  tx: Tx | PrismaClient,
  employeeId: number | null,
  action: string,
  entity: string,
  detail: unknown,
) =>
  tx.audit.create({
    data: { employeeId, action, entity, detail: JSON.stringify(detail) },
  });
export async function initializeDatabase() {
  ensure(
    /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? ""),
    "Configurá DATABASE_URL con PostgreSQL. Para trasladar la base anterior usá npm run db:import-sqlite",
  );
  await db.$queryRaw`SELECT 1`;
}

// Repetir la transacción completa evita perder stock/saldo al operar desde dos equipos.
export async function transaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        ...options,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (!["P2034", "P2002"].includes(code ?? "") || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
