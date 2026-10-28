import test from "node:test";
import assert from "node:assert/strict";
import { accountStatementText } from "../src/account-summary.js";
import type { CustomerStatement } from "../shared/customer-statement.js";

test("Resumen de cliente · texto completo con productos, fiado parcial y pagos", () => {
  const statement: CustomerStatement = {
    customer: {
      id: 1,
      name: "Cliente ejemplo",
      creditLimit: "500000",
      balance: "600",
      available: "499400",
    },
    from: null,
    to: null,
    generatedAt: "2026-10-27T12:00:00Z",
    openingBalance: "0",
    closingBalance: "600",
    creditAdded: "800",
    paymentsReceived: "200",
    reversals: "0",
    purchases: [
      {
        id: 12,
        createdAt: "2026-10-27T12:00:00Z",
        status: "COMPLETADA",
        total: "1000",
        creditAmount: "800",
        quickAmount: "200",
        surcharge: "0",
        pendingName: null,
        voidReason: null,
        lines: [
          {
            name: "Pan",
            quantity: "0.5",
            unit: "PESO",
            unitPrice: "1600",
            total: "800",
          },
        ],
        payments: [
          { method: "EFECTIVO", amount: "200" },
          { method: "CUENTA_CORRIENTE", amount: "800" },
        ],
      },
    ],
    movements: [
      {
        id: 1,
        createdAt: "2026-10-27T12:00:00Z",
        kind: "CARGO_FIADO",
        amount: "800",
        balanceAfter: "800",
        purchase: null,
      },
      {
        id: 2,
        createdAt: "2026-10-27T13:00:00Z",
        kind: "PAGO_EFECTIVO",
        amount: "-200",
        balanceAfter: "600",
        purchase: null,
      },
    ],
  };
  const text = accountStatementText(statement);
  assert.match(text, /Cliente ejemplo/);
  assert.match(text, /0,5 kg × Pan/);
  assert.match(text, /Total compra:/);
  assert.match(text, /Parte fiada:/);
  assert.match(text, /Pago recibido/);
  assert.match(text, /Venta rápida sin detalle de productos/);
  assert.match(text, /SALDO ACTUAL A PAGAR:/);
  assert.match(text, /Saldo al cierre del período:/);
});
