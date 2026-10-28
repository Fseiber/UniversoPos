import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { audit, db, D, ensure, Problem } from "./db.js";
import {
  admin,
  authenticate,
  hashPin,
  newSession,
  pinSchema,
  verifyPin,
} from "./auth.js";
import {
  createSale,
  currentShift,
  expectedCash,
  id,
  methods,
  money,
  optionalMoney,
  moveStock,
  saleInput,
  settleSale,
  voidSale,
} from "./services.js";
import { automaticBackup } from "./backups.js";
import { management } from "./management.js";
import { activateImportedProduct } from "./product-import.js";
import { customerStatement, statementQuery } from "./customer-statement.js";
import { customerStatementPdf } from "./customer-statement-pdf.js";

export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "upgrade-insecure-requests": null,
      },
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use("/api", (req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    ensure(req.get("X-POS-Request") === "1", "Solicitud inválida", 403);
  next();
});
const publicEmployee = (e: { id: number; name: string; role: string }) => ({
  id: e.id,
  name: e.name,
  role: e.role,
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/bootstrap", async (_req, res) => {
  const employees = await db.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
  });
  res.json({
    needsSetup: employees.length === 0,
    employees,
    demo: process.env.DEMO_MODE === "true",
  });
});
const loginLimit = rateLimit({
  windowMs: 300_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Esperá unos minutos" },
});
app.post("/api/setup", loginLimit, async (req, res) => {
  const data = z
    .object({ name: z.string().trim().min(2).max(80), pin: pinSchema })
    .parse(req.body);
  const pinHash = await hashPin(data.pin);
  const employee = await db.$transaction(async (tx) => {
    ensure(
      (await tx.employee.count()) === 0,
      "El sistema ya está configurado",
      409,
    );
    const employee = await tx.employee.create({
      data: { name: data.name, pinHash, role: "ADMIN" },
    });
    await audit(tx, employee.id, "CONFIGURACION_INICIAL", "empleados", {
      name: employee.name,
    });
    return employee;
  });
  res.status(201).json(publicEmployee(employee));
});
app.post("/api/login", loginLimit, async (req, res) => {
  const input = z.object({ employeeId: id, pin: pinSchema }).parse(req.body);
  const employee = await verifyPin(input.employeeId, input.pin);
  const token = await newSession(employee.id);
  await audit(db, employee.id, "LOGIN", "seguridad", {});
  res.cookie("universo_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 8 * 3600_000,
    path: "/",
  });
  res.json(publicEmployee(employee));
});
app.use("/api", authenticate);
app.get("/api/me", (_req, res) =>
  res.json(publicEmployee(res.locals.employee)),
);
app.post("/api/logout", async (_req, res) => {
  await db.session.delete({ where: { id: res.locals.sessionId } });
  res.clearCookie("universo_session", { path: "/" }).json({ ok: true });
});
app.get("/api/employees", admin, async (_req, res) =>
  res.json(
    await db.employee.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        active: true,
        lockedUntil: true,
      },
    }),
  ),
);
app.post("/api/employees", admin, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      pin: pinSchema,
      role: z.enum(["ADMIN", "EMPLEADO"]),
    })
    .parse(req.body);
  const pinHash = await hashPin(data.pin);
  const employee = await db.$transaction(async (tx) => {
    const e = await tx.employee.create({
      data: { name: data.name, role: data.role, pinHash },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "CREAR_EMPLEADO",
      `empleado:${e.id}`,
      { name: e.name, role: e.role },
    );
    return e;
  });
  res.status(201).json(publicEmployee(employee));
});
app.patch("/api/employees/:id", admin, async (req, res) => {
  const employeeId = id.parse(req.params.id);
  const data = z
    .object({ active: z.boolean().optional(), pin: pinSchema.optional() })
    .parse(req.body);
  ensure(
    employeeId !== res.locals.employee.id || data.active !== false,
    "No podés desactivar tu propio acceso",
  );
  await db.$transaction(async (tx) => {
    const old = await tx.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    if (old.role === "ADMIN" && data.active === false)
      ensure(
        (await tx.employee.count({ where: { active: true, role: "ADMIN" } })) >
          1,
        "Debe quedar un administrador activo",
      );
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        active: data.active,
        ...(data.pin
          ? { pinHash: await hashPin(data.pin), failures: 0, lockedUntil: null }
          : {}),
      },
    });
    await tx.session.deleteMany({ where: { employeeId } });
    await audit(
      tx,
      res.locals.employee.id,
      "EDITAR_EMPLEADO",
      `empleado:${employeeId}`,
      { active: data.active, pinChanged: Boolean(data.pin) },
    );
  });
  res.json({ ok: true });
});

const productInput = z.object({
  name: z.string().trim().min(1).max(120),
  barcode: z.string().trim().max(80).optional(),
  category: z.string().trim().max(60).default("General"),
  unit: z.enum(["UNIDAD", "PESO"]).default("UNIDAD"),
  cost: optionalMoney,
  price: money.refine((v) => v > 0),
  minimum: z.coerce
    .number()
    .finite()
    .min(0)
    .max(1_000_000)
    .refine((v) => new D(v).decimalPlaces() <= 3)
    .default(0),
});
app.get("/api/products", async (_req, res) =>
  res.json(
    await db.product.findMany({
      where: { active: true },
      include: { rules: true, offers: { include: { supplier: true } } },
      orderBy: { name: "asc" },
    }),
  ),
);
app.post("/api/products", admin, async (req, res) => {
  const data = productInput
    .extend({
      stock: z.coerce
        .number()
        .min(0)
        .max(1_000_000)
        .refine((v) => new D(v).decimalPlaces() <= 3)
        .default(0),
    })
    .parse(req.body);
  ensure(
    data.unit === "PESO" ||
      (Number.isInteger(data.stock) && Number.isInteger(data.minimum)),
    "El stock de unidades debe ser entero",
  );
  const { stock, ...fields } = data;
  const product = await db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: { ...fields, barcode: data.barcode || null },
    });
    if (stock)
      await moveStock(
        tx,
        p.id,
        new D(stock),
        "INICIAL",
        res.locals.employee.id,
      );
    await audit(
      tx,
      res.locals.employee.id,
      "CREAR_PRODUCTO",
      `producto:${p.id}`,
      { name: p.name, stock },
    );
    return tx.product.findUniqueOrThrow({ where: { id: p.id } });
  });
  res.status(201).json(product);
});
app.get("/api/imported-products", admin, async (_req, res) => {
  const [items, total, reviewed] = await Promise.all([
    db.importedProduct.findMany({
      where: { productId: null },
      include: { batch: { select: { sourceName: true, sheetName: true } } },
      orderBy: { name: "asc" },
    }),
    db.importedProduct.count(),
    db.importedProduct.count({ where: { productId: { not: null } } }),
  ]);
  res.json({ items, total, reviewed });
});
app.post("/api/imported-products/:id/activate", admin, async (req, res) => {
  res
    .status(201)
    .json(
      await activateImportedProduct(
        id.parse(req.params.id),
        req.body,
        res.locals.employee.id,
      ),
    );
});
app.put("/api/products/:id", admin, async (req, res) => {
  const productId = id.parse(req.params.id);
  const data = productInput.parse(req.body);
  await db.$transaction(async (tx) => {
    const old = await tx.product.findUniqueOrThrow({
      where: { id: productId },
    });
    ensure(
      old.unit === data.unit,
      "La unidad de medida no se cambia después del alta",
    );
    ensure(
      data.unit === "PESO" || Number.isInteger(data.minimum),
      "El mínimo debe ser entero",
    );
    await tx.product.update({
      where: { id: productId },
      data: { ...data, barcode: data.barcode || null },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "EDITAR_PRODUCTO",
      `producto:${productId}`,
      data,
    );
  });
  res.json({ ok: true });
});
app.delete("/api/products/:id", admin, async (req, res) => {
  const productId = id.parse(req.params.id);
  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { active: false },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "BAJA_PRODUCTO",
      `producto:${productId}`,
      {},
    );
  });
  res.json({ ok: true });
});
app.post("/api/products/:id/stock", admin, async (req, res) => {
  const productId = id.parse(req.params.id);
  const data = z
    .object({
      mode: z.enum(["DELTA", "SET"]).default("DELTA"),
      quantity: z
        .union([z.number(), z.string().trim().min(1)])
        .transform(Number)
        .pipe(
          z
            .number()
            .finite()
            .min(-1_000_000)
            .max(1_000_000)
            .refine((v) => new D(v).decimalPlaces() <= 3),
        ),
      reason: z.string().trim().min(3).max(160),
    })
    .parse(req.body);
  await db.$transaction(async (tx) => {
    ensure(
      data.mode !== "SET" || data.quantity >= 0,
      "El stock contado no puede ser negativo",
    );
    ensure(
      data.mode !== "DELTA" || data.quantity !== 0,
      "Ingresá una cantidad distinta de cero",
    );
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const delta =
      data.mode === "SET"
        ? new D(data.quantity).minus(product.stock)
        : new D(data.quantity);
    await moveStock(tx, productId, delta, data.reason, res.locals.employee.id);
    await audit(
      tx,
      res.locals.employee.id,
      "AJUSTE_STOCK",
      `producto:${productId}`,
      data,
    );
  });
  res.json({ ok: true });
});
app.get("/api/products/:id/movements", admin, async (req, res) =>
  res.json(
    await db.stockMovement.findMany({
      where: { productId: id.parse(req.params.id) },
      orderBy: { id: "desc" },
      take: 500,
    }),
  ),
);

app.get("/api/customers", async (_req, res) =>
  res.json(
    await db.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ),
);
app.post("/api/customers", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().max(40).default(""),
      creditLimit: money,
    })
    .parse(req.body);
  ensure(
    res.locals.employee.role === "ADMIN" || data.creditLimit === 0,
    "El administrador debe asignar el límite de crédito",
    403,
  );
  const customer = await db.$transaction(async (tx) => {
    const c = await tx.customer.create({ data });
    await audit(
      tx,
      res.locals.employee.id,
      "CREAR_CLIENTE",
      `cliente:${c.id}`,
      data,
    );
    return c;
  });
  res.status(201).json(customer);
});
app.patch("/api/customers/:id", admin, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().max(40),
      creditLimit: money,
    })
    .parse(req.body);
  const customerId = id.parse(req.params.id);
  await db.$transaction(async (tx) => {
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    ensure(
      new D(data.creditLimit).gte(c.balance),
      "El límite no puede quedar por debajo de la deuda actual",
    );
    await tx.customer.update({ where: { id: customerId }, data });
    await audit(
      tx,
      res.locals.employee.id,
      "EDITAR_CLIENTE",
      `cliente:${customerId}`,
      data,
    );
  });
  res.json({ ok: true });
});
app.get("/api/customers/:id/movements", async (req, res) =>
  res.json(
    await db.accountMovement.findMany({
      where: { customerId: id.parse(req.params.id) },
      orderBy: { id: "desc" },
      take: 500,
    }),
  ),
);
app.get("/api/customers/:id/statement", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(
    await customerStatement(
      id.parse(req.params.id),
      statementQuery.parse(req.query),
    ),
  );
});
app.get("/api/customers/:id/statement.pdf", async (req, res) => {
  const customerId = id.parse(req.params.id);
  const data = await customerStatement(
    customerId,
    statementQuery.parse(req.query),
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="cuenta-cliente-${customerId}.pdf"`,
  );
  res.send(await customerStatementPdf(data));
});
app.post("/api/customers/:id/payments", async (req, res) => {
  const customerId = id.parse(req.params.id);
  const data = z.object({ amount: money.refine((v) => v > 0) }).parse(req.body);
  await db.$transaction(async (tx) => {
    const shift = await currentShift(tx);
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    ensure(new D(data.amount).lte(customer.balance), "El pago supera la deuda");
    await tx.customer.update({
      where: { id: customerId },
      data: { balance: new D(customer.balance).minus(data.amount) },
    });
    await tx.accountMovement.create({
      data: {
        customerId,
        amount: new D(data.amount).neg(),
        kind: "PAGO_EFECTIVO",
        shiftId: shift.id,
        employeeId: res.locals.employee.id,
      },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "COBRO_DEUDA",
      `cliente:${customerId}`,
      data,
    );
  });
  res.json({ ok: true });
});
app.get("/api/shift", async (_req, res) => {
  const shift = await db.shift.findFirst({
    where: { closedAt: null },
    include: { employee: { select: { name: true } }, movements: true },
  });
  res.json(
    shift
      ? {
          ...shift,
          expected: await db.$transaction((tx) => expectedCash(tx, shift.id)),
        }
      : null,
  );
});
app.post("/api/shifts/open", async (req, res) => {
  const data = z.object({ opening: money }).parse(req.body);
  const shift = await db.$transaction(async (tx) => {
    ensure(
      (await tx.shift.count({ where: { closedAt: null } })) === 0,
      "Ya hay una caja abierta",
      409,
    );
    const shift = await tx.shift.create({
      data: { opening: data.opening, employeeId: res.locals.employee.id },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "ABRIR_CAJA",
      `caja:${shift.id}`,
      data,
    );
    return shift;
  });
  await automaticBackup();
  res.status(201).json(shift);
});
app.post("/api/shifts/close", async (req, res) => {
  const data = z.object({ declared: money }).parse(req.body);
  const shift = await db.$transaction(async (tx) => {
    const current = await currentShift(tx);
    const expected = await expectedCash(tx, current.id);
    const difference = new D(data.declared).minus(expected);
    const result = await tx.shift.update({
      where: { id: current.id },
      data: {
        declared: data.declared,
        expected,
        difference,
        closedAt: new Date(),
      },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "CERRAR_CAJA",
      `caja:${current.id}`,
      { declared: data.declared, expected, difference },
    );
    return result;
  });
  await automaticBackup();
  res.json(shift);
});
app.post("/api/cash-movements", async (req, res) => {
  const data = z
    .object({
      amount: money.refine((v) => v > 0),
      direction: z.enum(["INGRESO", "RETIRO"]),
      reason: z.string().trim().min(3).max(160),
    })
    .parse(req.body);
  await db.$transaction(async (tx) => {
    const shift = await currentShift(tx);
    const amount = new D(data.amount).mul(
      data.direction === "INGRESO" ? 1 : -1,
    );
    ensure(
      (await expectedCash(tx, shift.id)).plus(amount).gte(0),
      "El retiro supera el efectivo disponible",
    );
    await tx.cashMovement.create({
      data: {
        shiftId: shift.id,
        amount,
        reason: data.reason,
        employeeId: res.locals.employee.id,
      },
    });
    await audit(
      tx,
      res.locals.employee.id,
      "MOVIMIENTO_CAJA",
      `caja:${shift.id}`,
      data,
    );
  });
  res.json({ ok: true });
});
app.get("/api/sales", async (req, res) => {
  const pending = req.query.pending === "true";
  res.json(
    await db.sale.findMany({
      where: pending ? { status: "PENDIENTE" } : {},
      include: {
        lines: true,
        payments: true,
        customer: { select: { name: true } },
        employee: { select: { name: true } },
      },
      orderBy: { id: "desc" },
      take: 200,
    }),
  );
});
app.post("/api/sales", async (req, res) =>
  res
    .status(201)
    .json(await createSale(saleInput.parse(req.body), res.locals.employee.id)),
);
app.post("/api/sales/:id/settle", async (req, res) => {
  const data = z
    .object({
      payments: z
        .array(
          z.object({ method: methods, amount: money.refine((v) => v > 0) }),
        )
        .min(1)
        .max(10),
      customerId: id.optional(),
    })
    .parse(req.body);
  await settleSale(
    id.parse(req.params.id),
    data.payments,
    data.customerId,
    res.locals.employee.id,
  );
  res.json({ ok: true });
});
app.post("/api/sales/:id/void", loginLimit, async (req, res) => {
  const data = z
    .object({
      adminId: id,
      pin: pinSchema,
      reason: z.string().trim().min(5).max(160),
    })
    .parse(req.body);
  const approver = await verifyPin(data.adminId, data.pin, true);
  res.json(
    await voidSale(
      id.parse(req.params.id),
      data.reason,
      res.locals.employee.id,
      approver.id,
    ),
  );
});

app.use("/api", management);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Ruta no encontrada" }),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof Problem)
      return res.status(error.status).json({ error: error.message });
    if (error instanceof ZodError)
      return res.status(400).json({
        error: error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      });
    const code = (error as { code?: string })?.code;
    if (code === "P2002")
      return res
        .status(409)
        .json({ error: "Ya existe un registro con ese código" });
    if (code === "P2025")
      return res.status(404).json({ error: "No se encontró el registro" });
    if (code === "P2003")
      return res.status(400).json({
        error: "La operación hace referencia a un registro inexistente",
      });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Datos inválidos" });
    console.error(error);
    res.status(500).json({
      error:
        "No se pudo completar la operación. Los cambios de la operación no fueron guardados",
    });
  },
);
