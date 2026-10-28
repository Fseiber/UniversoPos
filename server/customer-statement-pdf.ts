import PDFDocument from "pdfkit";
import type { CustomerStatement } from "../shared/customer-statement.js";

const cash = (value: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })
    .format(Number(value))
    .replaceAll("\u00a0", " ");
const time = (value: string) =>
  new Date(value).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
  });
const labels: Record<string, string> = {
  CARGO_FIADO: "Compra fiada",
  PAGO_EFECTIVO: "Pago recibido",
  ANULACION: "Anulación de fiado",
  EFECTIVO: "Efectivo",
  CUENTA_CORRIENTE: "Fiado",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  DEBITO: "Débito",
};

export function customerStatementPdf(data: CustomerStatement): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 44,
      bufferPages: true,
      info: {
        Title: `Cuenta de ${data.customer.name} - El Universo`,
        Author: "El Universo POS",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 88;
    function room(h: number) {
      if (doc.y + h > doc.page.height - 68) doc.addPage();
    }
    function line(text: string, bold = false, size = 10) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      const height = doc.heightOfString(text, { width, lineGap: 3 });
      room(height + 9);
      doc.fillColor("#263b2f").text(text, 44, doc.y, { width, lineGap: 3 });
      doc.moveDown(0.3);
    }
    function section(text: string) {
      room(62);
      doc.moveDown(0.6);
      line(text, true, 13);
    }
    line("EL UNIVERSO", true, 12);
    line(`Cuenta de ${data.customer.name}`, true, 23);
    line(
      `Período: ${data.from ?? "desde el inicio"} a ${data.to ?? "hoy"}`,
      false,
      9,
    );
    line(`Emitido: ${time(data.generatedAt)} (Argentina)`, false, 9);
    section("Estado actual de la cuenta");
    line(`Límite de fiado: ${cash(data.customer.creditLimit)}`);
    line(`Disponible para comprar fiado: ${cash(data.customer.available)}`);
    line(`SALDO ACTUAL A PAGAR: ${cash(data.customer.balance)}`, true, 13);
    section("Compras y productos");
    if (!data.purchases.length) line("Sin compras en el período.");
    for (const s of data.purchases) {
      room(95);
      line(`Compra #${s.id} - ${time(s.createdAt)} - ${s.status}`, true, 11);
      for (const l of s.lines)
        line(
          `${l.quantity.replace(".", ",")} ${l.unit === "PESO" ? "kg" : "u."} x ${l.name} | Precio: ${cash(l.unitPrice)} | Importe: ${cash(l.total)}`,
          false,
          9,
        );
      if (Number(s.quickAmount))
        line(
          `Venta rápida sin detalle de productos: ${cash(s.quickAmount)}`,
          false,
          9,
        );
      if (Number(s.surcharge)) line(`Recargo: ${cash(s.surcharge)}`, false, 9);
      line(
        `Total de la compra: ${cash(s.total)} - Parte fiada: ${cash(s.creditAmount)}`,
        true,
      );
      for (const p of s.payments)
        line(`${labels[p.method] ?? p.method}: ${cash(p.amount)}`, false, 9);
      if (s.voidReason) line(`Anulada: ${s.voidReason}`, false, 9);
      doc.moveDown(0.4);
    }
    section("Movimientos del fiado");
    line(`Saldo al inicio del período: ${cash(data.openingBalance)}`, true);
    for (const m of data.movements) {
      line(
        `${time(m.createdAt)} - ${labels[m.kind] ?? m.kind}${m.purchase ? ` - Compra #${m.purchase.id}` : ""}: ${cash(m.amount)} | Saldo: ${cash(m.balanceAfter)}`,
        false,
        9,
      );
      if (m.purchase && !data.purchases.some((s) => s.id === m.purchase!.id))
        for (const l of m.purchase.lines)
          line(
            `  ${l.quantity.replace(".", ",")} x ${l.name}: ${cash(l.total)}`,
            false,
            9,
          );
    }
    line(`Saldo al cierre del período: ${cash(data.closingBalance)}`, true, 12);
    section("Cómo leer la cuenta");
    line(
      "El saldo a pagar es lo comprado fiado menos pagos y anulaciones. El límite indica hasta cuánto puede deber el cliente. Los pagos se aplican al saldo total, sin asignarlos a una compra individual. Las ventas rápidas conservan solo su importe.",
      false,
      8,
    );
    line("Resumen interno. No válido como factura fiscal.", false, 8);
    const pages = doc.bufferedPageRange();
    for (let n = 0; n < pages.count; n++) {
      doc.switchToPage(n);
      doc.font("Helvetica").fontSize(8).fillColor("#73836e");
      doc.text("EL UNIVERSO POS", 44, doc.page.height - 36, {
        lineBreak: false,
      });
      doc.text(
        `${n + 1} / ${pages.count}`,
        doc.page.width - 86,
        doc.page.height - 36,
        { lineBreak: false },
      );
    }
    doc.end();
  });
}
