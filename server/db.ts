import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
export const db = new PrismaClient();
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
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await db.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
}
