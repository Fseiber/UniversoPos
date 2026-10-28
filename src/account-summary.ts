import type { CustomerStatement } from "../shared/customer-statement";
import { currency, methodLabels, qty, when } from "./api";

export const accountKind: Record<string, string> = {
  CARGO_FIADO: "Compra fiada",
  PAGO_EFECTIVO: "Pago recibido",
  ANULACION: "Anulación de fiado",
};
export function accountStatementText(data: CustomerStatement) {
  const { customer: c } = data;
  const out = [
    "EL UNIVERSO · RESUMEN DE CUENTA",
    `Cliente: ${c.name}`,
    `Período: ${data.from ?? "desde el inicio"} a ${data.to ?? "hoy"}`,
    `Emitido: ${when(data.generatedAt)}`,
    "",
    `Límite de fiado actual: ${currency(c.creditLimit)}`,
    `Disponible para comprar fiado: ${currency(c.available)}`,
    `SALDO ACTUAL A PAGAR: ${currency(c.balance)}`,
    "",
    "COMPRAS Y PRODUCTOS",
  ];
  for (const s of data.purchases) {
    out.push(`Compra #${s.id} · ${when(s.createdAt)} · ${s.status}`);
    for (const l of s.lines)
      out.push(
        `  ${qty(l.quantity)} ${l.unit === "PESO" ? "kg" : "u."} × ${l.name} · ${currency(l.unitPrice)} c/u · ${currency(l.total)}`,
      );
    if (Number(s.quickAmount))
      out.push(
        `  Venta rápida sin detalle de productos: ${currency(s.quickAmount)}`,
      );
    if (Number(s.surcharge)) out.push(`  Recargo: ${currency(s.surcharge)}`);
    out.push(
      `  Total compra: ${currency(s.total)} · Parte fiada: ${currency(s.creditAmount)}`,
    );
    for (const p of s.payments)
      out.push(
        `  ${methodLabels[p.method] ?? p.method}: ${currency(p.amount)}`,
      );
    if (s.voidReason) out.push(`  Motivo de anulación: ${s.voidReason}`);
    out.push("");
  }
  if (!data.purchases.length) out.push("Sin compras en el período.");
  out.push(
    "",
    "MOVIMIENTOS DEL FIADO",
    `Saldo al inicio del período: ${currency(data.openingBalance)}`,
  );
  for (const m of data.movements)
    out.push(
      `${when(m.createdAt)} · ${accountKind[m.kind] ?? m.kind}${m.purchase ? ` · compra #${m.purchase.id}` : ""}: ${currency(m.amount)} · Saldo: ${currency(m.balanceAfter)}`,
    );
  out.push(
    `Saldo al cierre del período: ${currency(data.closingBalance)}`,
    "",
    "El saldo a pagar es lo comprado fiado menos pagos y anulaciones. El límite indica hasta cuánto puede deber el cliente.",
    "Resumen interno. No válido como factura fiscal.",
  );
  return out.join("\n");
}
