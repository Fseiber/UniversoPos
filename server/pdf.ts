import PDFDocument from "pdfkit";
import type { report } from "./management.js";
type Report = Awaited<ReturnType<typeof report>>;
const money = (v: unknown) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })
    .format(Number(v))
    .replaceAll("\u00a0", " ");
export function buildReportPdf(data: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 47,
      bufferPages: true,
      info: {
        Title: "El Universo - Resumen del comercio",
        Author: "El Universo POS",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const width = doc.page.width - 94;
    function room(height: number) {
      if (doc.y + height > doc.page.height - 80) doc.addPage();
    }
    function section(title: string) {
      room(65);
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#2c624b").text(title);
      doc.moveDown(0.6);
    }
    function row(label: string, value: string, strong = false) {
      doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(10);
      const height =
        Math.max(
          doc.heightOfString(label, { width: width * 0.66 }),
          doc.heightOfString(value, { width: width * 0.3 }),
        ) + 14;
      room(height);
      const y = doc.y;
      doc.fillColor("#34463b").text(label, 47, y, { width: width * 0.66 });
      doc.text(value, 47 + width * 0.68, y, {
        width: width * 0.32,
        align: "right",
      });
      doc
        .moveTo(47, y + height - 5)
        .lineTo(47 + width, y + height - 5)
        .strokeColor("#e5e9e1")
        .lineWidth(0.5)
        .stroke();
      doc.x = 47;
      doc.y = y + height;
    }
    doc.rect(0, 0, doc.page.width, 17).fill("#18372a");
    doc
      .fillColor("#2c624b")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("EL UNIVERSO / GESTIÓN DEL COMERCIO");
    doc
      .moveDown(0.6)
      .fillColor("#20372a")
      .fontSize(25)
      .text("Resumen de actividad");
    doc
      .moveDown(0.4)
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#778374")
      .text(
        `Período: ${data.from} al ${data.to} | Zona horaria: Argentina (UTC-3)`,
      );
    section("Actividad del período");
    row("Ventas netas de devoluciones (sin anuladas)", money(data.total), true);
    row("Devoluciones del período", money(data.returnedAmount));
    row("Cantidad de ventas", String(data.salesCount));
    row("Pendientes de cobro del período", money(data.pending));
    row(
      data.hasUnknownCosts
        ? "Margen parcial (costos conocidos)"
        : "Margen estimado sobre costo histórico",
      money(data.margin),
    );
    row("Ventas sin costo de compra conocido", money(data.unknownCostRevenue));
    row("Ventas rápidas sin costo identificado", money(data.quick));
    row("Comisiones de retiros digitales", money(data.withdrawalCommission));
    section("Cobros registrados por medio de pago");
    const labels: Record<string, string> = {
      EFECTIVO: "Efectivo",
      TRANSFERENCIA: "Transferencia",
      MERCADO_PAGO: "Mercado Pago",
      DEBITO: "Débito / Posnet",
      CUENTA_CORRIENTE: "Fiado (no es efectivo)",
    };
    for (const [method, amount] of Object.entries(data.byMethod))
      row(labels[method] ?? method, money(amount));
    row("Cobros de deudas (todos los medios)", money(data.debtCollections));
    for (const c of data.debtCollectionsByMethod)
      row(`Fiados cobrados: ${labels[c.name] ?? c.name}`, money(c.amount));
    section("Inventario y gastos registrados");
    row("Inventario al costo conocido", money(data.inventoryValue));
    row(
      "Productos con costo / activos",
      `${data.inventoryCostCoverage.known} / ${data.inventoryCostCoverage.total}`,
    );
    row("Gastos de caja clasificados", money(data.expenses));
    row("Salidas sin clasificar", money(data.unclassifiedOutflows));
    row(
      "Margen conocido menos gastos registrados (parcial)",
      money(data.margin.minus(data.expenses)),
    );
    for (const [title, entries] of [
      ["Ventas netas por cajero", data.byEmployee],
      ["Ventas netas por hora - Argentina", data.byHour],
      ["Productos por categoría - sin recargos", data.byCategory],
      ["Deuda actual con proveedores", data.supplierDebt],
    ] as const) {
      section(title);
      for (const entry of entries) row(entry.name, money(entry.amount));
    }
    section("Antigüedad de fiados - saldos actuales");
    for (const c of data.debtAging)
      row(`${c.name} - ${c.days ?? "?"} días`, money(c.balance));
    section("Productos sin ventas en el período");
    for (const p of data.noSalesInPeriod)
      row(p.name, `Stock ${p.stock.toString()}`);
    section("Cuentas corrientes - saldos actuales");
    row("Total adeudado actual", money(data.totalDebt), true);
    for (const c of data.customers) row(c.name, money(c.balance));
    if (!data.customers.length) row("Clientes con deuda", "Ninguno");
    section("Productos con mayor venta por importe");
    for (const p of data.top)
      row(`${p.name} (${p.quantity.toString()})`, money(p.amount));
    if (!data.top.length) row("Productos vendidos", "Sin registros");
    section("Cierres de caja");
    for (const s of data.shifts)
      row(
        `Turno #${s.id} - ${s.employee.name}`,
        s.closedAt ? `Diferencia ${money(s.difference)}` : "Abierto",
      );
    if (!data.shifts.length) row("Turnos en el período", "Sin registros");
    section("Criterios de lectura");
    room(95);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#778374")
      .text(data.note, { width, lineGap: 3 });
    doc
      .moveDown()
      .text("Resumen interno de gestión. No válido como factura fiscal.");
    const pages = doc.bufferedPageRange();
    for (let n = pages.start; n < pages.start + pages.count; n++) {
      doc.switchToPage(n);
      doc
        .fontSize(8)
        .fillColor("#84917c")
        .text("EL UNIVERSO POS", 47, doc.page.height - 42, {
          lineBreak: false,
        });
      doc.text(
        `${n + 1} / ${pages.count}`,
        doc.page.width - 90,
        doc.page.height - 42,
        { lineBreak: false },
      );
    }
    doc.end();
  });
}
