import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import type { RequestHandler } from "express";
import { z } from "zod";
import { audit, db, ensure, transaction } from "./db.js";

export const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/, "El PIN debe tener entre 4 y 8 dígitos");
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function verifyPin(
  employeeId: number,
  pin: string,
  adminOnly = false,
) {
  const result = await transaction(async (tx) => {
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee?.active || (adminOnly && employee.role !== "ADMIN")) {
      await audit(tx, employeeId, "PIN_RECHAZADO", "seguridad", {
        reason: "Usuario o rol inválido",
      });
      return { error: "Credenciales inválidas" };
    }
    if (employee.lockedUntil && employee.lockedUntil > new Date())
      return { error: "Acceso bloqueado temporalmente. Esperá 5 minutos" };
    if (!(await compare(pin, employee.pinHash))) {
      const failures = employee.failures + 1;
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          failures,
          lockedUntil: failures >= 5 ? new Date(Date.now() + 300_000) : null,
        },
      });
      await audit(tx, employeeId, "PIN_RECHAZADO", "seguridad", { failures });
      return {
        error:
          failures >= 5
            ? "Acceso bloqueado por 5 minutos"
            : "Credenciales inválidas",
      };
    }
    await tx.employee.update({
      where: { id: employeeId },
      data: { failures: 0, lockedUntil: null },
    });
    return { employee };
  });
  ensure(result.employee, result.error ?? "Credenciales inválidas", 401);
  return result.employee;
}
export const hashPin = (pin: string) => hash(pin, 12);

export const authenticate: RequestHandler = async (req, res, next) => {
  const raw = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("universo_session="))
    ?.slice("universo_session=".length);
  if (!raw)
    return res
      .status(401)
      .json({ error: "Iniciá sesión", code: "SESSION_EXPIRED" });
  const session = await db.session.findUnique({
    where: { id: digest(raw) },
    include: { employee: true },
  });
  if (!session || session.expiresAt < new Date() || !session.employee.active)
    return res
      .status(401)
      .json({
        error: "La sesión venció. Ingresá nuevamente",
        code: "SESSION_EXPIRED",
      });
  res.locals.employee = session.employee;
  res.locals.sessionId = session.id;
  next();
};
export const admin: RequestHandler = (_req, res, next) => {
  ensure(
    res.locals.employee.role === "ADMIN",
    "Necesitás permisos de administrador",
    403,
  );
  next();
};
export async function newSession(employeeId: number) {
  const token = randomBytes(32).toString("hex");
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: {
      id: digest(token),
      employeeId,
      expiresAt: new Date(Date.now() + 8 * 3600_000),
    },
  });
  return token;
}
