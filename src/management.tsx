import { Purchases } from "./purchases";
import { PendingCredit } from "./pending-credit";
import { creditLimitText } from "./customer-credit";
import { CommercialReport } from "./commercial-report";
import { RecoverySettings } from "./recovery-settings";
import { EmployeeSettings } from "./employee-settings";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  Check,
  Download,
  Printer,
  RefreshCw,
  ShieldCheck,
  Database,
  ExternalLink,
  Copy,
} from "lucide-react";
import Decimal from "decimal.js";
import { api, currency, methodLabels, qty, today, when } from "./api";
import { usePos } from "./context";
import { Empty, Field, Modal, NumberInput, Stat } from "./components";
import { Receipt } from "./sell";
import { SaleReturn, ReturnReceipt } from "./sale-return";

function useResource(url: string | null) {
  const previousUrl = useRef<string | null>(null);
  const { version } = usePos();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!url) return;
    let active = true;
    setError("");
    if (previousUrl.current !== url) setData(null);
    previousUrl.current = url;
    void api(url)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url, version, revision]);
  return { data, error, reload: () => setRevision((v) => v + 1) };
}
function LoadState({ error }: { error: string }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : (
    <p className="muted">Cargando información…</p>
  );
}

export function Sales({
  initialPendingToday = false,
}: {
  initialPendingToday?: boolean;
}) {
  const [returnReceipt, setReturnReceipt] = useState<any>(null);
  const [creditSale, setCreditSale] = useState<any>(null);
  const [returning, setReturning] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>(
    (): Record<string, string> =>
      initialPendingToday ? { from: today(), to: today() } : {},
  );
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const { task, refresh, notify, customers, busy } = usePos();
  const [onlyPending, setOnlyPending] = useState(initialPendingToday),
    [receipt, setReceipt] = useState<any>(null),
    [settle, setSettle] = useState<any>(null),
    [voiding, setVoiding] = useState<any>(null),
    [admins, setAdmins] = useState<any[]>([]);
  const { data: pageData, error } = useResource(
    `/sales/history?${new URLSearchParams({ ...filters, ...(onlyPending ? { status: "PENDIENTE" } : {}), ...(cursors[cursors.length - 1] ? { before: String(cursors[cursors.length - 1]) } : {}) })}`,
  );
  const data = pageData?.items;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERACIONES</span>
          <h1>
            La historia de tu mostrador<span className="heading-dot">.</span>
          </h1>
          <p>Todas las ventas, comprobantes y entregas pendientes.</p>
        </div>
        <div className="button-row">
          <button
            className={onlyPending && filters.from === today() ? "primary" : ""}
            onClick={() => {
              setOnlyPending(true);
              setFilters({ from: today(), to: today() });
              setCursors([null]);
            }}
          >
            Pendientes de hoy
          </button>
          <button
            className={onlyPending && !filters.from ? "primary" : ""}
            onClick={() => {
              setOnlyPending(true);
              setFilters({});
              setCursors([null]);
            }}
          >
            Todas las pendientes
          </button>
          <button
            onClick={() => {
              setOnlyPending(false);
              setFilters({});
              setCursors([null]);
            }}
          >
            Todas las ventas
          </button>
        </div>
      </div>
      <form
        className="panel-toolbar history-search"
        key={JSON.stringify(filters)}
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(
            Object.fromEntries(
              [...new FormData(e.currentTarget)]
                .map(([k, v]) => [k, String(v)])
                .filter(([, v]) => v),
            ),
          );
          setCursors([null]);
        }}
      >
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          aria-label="Buscar venta"
          placeholder="Número, producto, cliente o empleado"
          maxLength={100}
        />
        <Field label="Desde">
          <input name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field label="Hasta">
          <input name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
        <button>Buscar</button>
      </form>
      <section className="panel">
        {!data || error ? (
          <LoadState error={error} />
        ) : data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Pagos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <strong>#{s.id}</strong>
                      <small>
                        {when(s.createdAt)} · {s.employee.name}
                      </small>
                    </td>
                    <td>
                      {s.customer?.name ?? s.pendingName ?? "Consumidor final"}
                    </td>
                    <td>
                      <span
                        className={`badge ${s.status === "COMPLETADA" ? "green" : s.status === "ANULADA" ? "red" : "amber"}`}
                      >
                        {s.status}
                      </span>
                      {s.voidReason && <small>{s.voidReason}</small>}
                      {s.stockTracked === false && (
                        <small>Sin control de stock</small>
                      )}
                    </td>
                    <td>
                      <b>{currency(s.total)}</b>
                    </td>
                    <td>
                      {s.payments.map((p: any) => (
                        <small key={p.id}>
                          {methodLabels[p.method]} · {currency(p.amount)}
                        </small>
                      ))}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => setReceipt(s)}>Ticket</button>
                        {s.status === "COMPLETADA" && s.lines.length > 0 && (
                          <button
                            disabled={busy}
                            onClick={() => setReturning(s)}
                          >
                            Devolver
                          </button>
                        )}
                        {s.returns?.length > 0 && (
                          <div>
                            <small>
                              Devoluciones:{" "}
                              {currency(
                                s.returns.reduce(
                                  (sum: number, r: any) =>
                                    sum + Number(r.amount),
                                  0,
                                ),
                              )}
                            </small>
                            {s.returns.map((r: any) => (
                              <button
                                key={r.id}
                                onClick={() => setReturnReceipt(r)}
                              >
                                Comprobante devolución #{r.id}
                              </button>
                            ))}
                          </div>
                        )}
                        {s.status === "PENDIENTE" && (
                          <button
                            disabled={busy}
                            onClick={() => setCreditSale(s)}
                          >
                            Pasar a fiado
                          </button>
                        )}
                        {s.status === "PENDIENTE" && (
                          <button onClick={() => setSettle(s)}>
                            Registrar cobro
                          </button>
                        )}
                        {s.status !== "ANULADA" && (
                          <button
                            className="danger subtle"
                            disabled={busy}
                            onClick={() =>
                              void task(async () => {
                                const bootstrap = await api("/bootstrap");
                                setAdmins(
                                  bootstrap.employees.filter(
                                    (e: any) => e.role === "ADMIN",
                                  ),
                                );
                                setVoiding(s);
                              })
                            }
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              onlyPending ? "No hay ventas pendientes" : "Todavía no hay ventas"
            }
            text="Las operaciones confirmadas van a aparecer en este historial."
          />
        )}
      </section>
      {pageData && !error && (
        <div className="panel-toolbar">
          <span>
            {pageData.total} ventas · página {cursors.length}
          </span>
          <button
            disabled={cursors.length === 1 || busy}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            Anterior
          </button>
          <button
            disabled={!pageData.nextCursor || busy}
            onClick={() => setCursors((c) => [...c, pageData.nextCursor])}
          >
            Siguiente
          </button>
        </div>
      )}
      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
      {creditSale && (
        <PendingCredit sale={creditSale} onClose={() => setCreditSale(null)} />
      )}
      {returnReceipt && (
        <ReturnReceipt
          returned={returnReceipt}
          onClose={() => setReturnReceipt(null)}
        />
      )}
      {returning && (
        <SaleReturn sale={returning} onClose={() => setReturning(null)} />
      )}
      {settle && (
        <Modal
          title={`Registrar cobro de venta #${settle.id}`}
          onClose={() => setSettle(null)}
        >
          <div className="payment-total">
            <small>{settle.pendingName}</small>
            <strong>{currency(settle.total)}</strong>
          </div>
          <p>
            {settle.stockTracked === false
              ? "Esta venta no modifica stock."
              : "El stock ya fue descontado al entregar."}{" "}
            El pago se registra en la caja actual. Si ya te transfirió, elegí
            Transferencia y confirmá el cobro después de verificar la
            acreditación.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void task(async () => {
                await api(`/sales/${settle.id}/settle`, "POST", {
                  payments: [
                    { method: f.get("method"), amount: Number(settle.total) },
                  ],
                  customerId: f.get("customerId")
                    ? Number(f.get("customerId"))
                    : undefined,
                });
                setSettle(null);
                await refresh();
                notify("Cobro registrado. La venta quedó completada");
              });
            }}
          >
            <Field label="Medio de pago">
              <select name="method">
                {Object.entries(methodLabels).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cliente (obligatorio para fiado)">
              <select name="customerId" defaultValue={settle.customerId ?? ""}>
                <option value="">Sin cuenta corriente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <button className="primary full" disabled={busy}>
              Confirmar pago
            </button>
          </form>
        </Modal>
      )}
      {voiding && (
        <Modal
          title={`Anular venta #${voiding.id}`}
          onClose={() => setVoiding(null)}
        >
          <p>
            Revierte efectivo o deuda. Repone stock solo si la venta original lo
            descontó. Requiere autorización de un administrador.
          </p>
          {voiding.payments.some(
            (p: any) => !["EFECTIVO", "CUENTA_CORRIENTE"].includes(p.method),
          ) && (
            <div className="notice amber">
              Esta venta tiene pagos digitales. El reintegro debe realizarse
              también en el medio de pago original; esta aplicación registra la
              anulación interna.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                const result = await api(
                  `/sales/${voiding.id}/void`,
                  "POST",
                  f,
                );
                setVoiding(null);
                await refresh();
                notify(
                  result.digitalRefundRequired
                    ? "Venta anulada. Falta gestionar el reintegro digital en el medio original"
                    : "Venta anulada y movimientos revertidos",
                );
              });
            }}
          >
            <Field label="Administrador que autoriza">
              <select name="adminId" required>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PIN de autorización">
              <input
                type="password"
                inputMode="numeric"
                name="pin"
                pattern="[0-9]{4,8}"
                maxLength={8}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Motivo de anulación">
              <input name="reason" minLength={5} maxLength={160} required />
            </Field>
            <button className="danger full" disabled={busy}>
              Autorizar anulación
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Catalog() {
  const { products, task, refresh, notify, busy } = usePos();
  const suppliers = useResource("/suppliers"),
    shortages = useResource("/shortages");
  const [modal, setModal] = useState<"supplier" | "offer" | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMPRAS Y REPOSICIÓN</span>
          <h1>
            Comprá mejor, reponé a tiempo<span className="heading-dot">.</span>
          </h1>
          <p>Compará costos de proveedores y llevá tu lista de faltantes.</p>
        </div>
        <div className="button-row">
          <button onClick={() => setModal("supplier")}>
            <Plus size={16} /> Proveedor
          </button>
          <button
            className="primary"
            disabled={!suppliers.data?.length || !products.length}
            onClick={() => setModal("offer")}
          >
            Registrar costo
          </button>
        </div>
      </div>
      <Purchases />
      <div className="two-columns">
        <section className="panel">
          <div className="panel-toolbar">
            <h2>Comparador de costos</h2>
          </div>
          {products.some((p) => p.offers.length) ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proveedor y costo</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter((p) => p.offers.length)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>
                          {[...p.offers]
                            .sort((a, b) => Number(a.cost) - Number(b.cost))
                            .map((o, i) => (
                              <div className="offer-cost" key={o.supplier.name}>
                                <span>{o.supplier.name}</span>
                                <b className={i === 0 ? "positive" : ""}>
                                  {currency(o.cost)}{" "}
                                  {i === 0 && <Check size={14} />}
                                </b>
                              </div>
                            ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Encontrá el mejor costo"
              text="Registrá proveedores y sus costos para comparar el mismo producto."
            />
          )}
          <div className="supplier-list">
            {suppliers.data?.map((s: any) => (
              <div className="list-row" key={s.id}>
                <strong>{s.name}</strong>
                <small>{s.contact || "Sin contacto"}</small>
              </div>
            ))}
          </div>
          {suppliers.error && <LoadState error={suppliers.error} />}
        </section>
        <section className="panel">
          <div className="panel-toolbar">
            <h2>Lista de reposición</h2>
            <span className="badge amber">
              {shortages.data?.automatic.length ?? 0} alertas
            </span>
          </div>
          {shortages.data?.automatic.map((p: any) => (
            <div className="list-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>
                  Mínimo: {qty(p.minimum)} · stock: {qty(p.stock)}
                </small>
              </div>
              <span className="badge amber">Reponer</span>
            </div>
          ))}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const note = new FormData(form).get("note");
              void task(async () => {
                await api("/shortages", "POST", { note });
                form.reset();
                shortages.reload();
              });
            }}
          >
            <input
              name="note"
              maxLength={160}
              placeholder="Anotar otro faltante…"
              aria-label="Nuevo faltante"
              required
            />
            <button className="primary" disabled={busy}>
              <Plus size={17} />
            </button>
          </form>
          {shortages.data?.notes.map((n: any) => (
            <label className={`check-row ${n.done ? "done" : ""}`} key={n.id}>
              <input
                type="checkbox"
                checked={n.done}
                onChange={(e) =>
                  void task(async () => {
                    await api(`/shortages/${n.id}`, "PATCH", {
                      done: e.target.checked,
                    });
                    shortages.reload();
                  })
                }
              />
              {n.note}
            </label>
          ))}
          {shortages.error && <LoadState error={shortages.error} />}
        </section>
      </div>
      {modal === "supplier" && (
        <Modal
          title="Nuevo proveedor / preventista"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api("/suppliers", "POST", data);
                setModal(null);
                await refresh();
                notify("Proveedor guardado");
              });
            }}
          >
            <Field label="Nombre">
              <input
                name="name"
                minLength={2}
                maxLength={100}
                required
                autoFocus
              />
            </Field>
            <Field label="Contacto / teléfono">
              <input name="contact" maxLength={120} />
            </Field>
            <button className="primary full" disabled={busy}>
              Guardar proveedor
            </button>
          </form>
        </Modal>
      )}
      {modal === "offer" && (
        <Modal
          title="Registrar costo de proveedor"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api("/supplier-offers", "POST", data);
                setModal(null);
                await refresh();
                notify("Costo actualizado en el comparador");
              });
            }}
          >
            <Field label="Proveedor">
              <select name="supplierId" required>
                {suppliers.data?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Producto">
              <select name="productId" required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Costo por unidad / kilo">
              <NumberInput name="cost" />
            </Field>
            <button className="primary full" disabled={busy}>
              Guardar costo
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function downloadCsv(data: any) {
  const safe = (v: unknown) => {
    const s = String(v ?? "");
    return `"${(/^[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`;
  };
  const rows = [
    ["EL UNIVERSO - RESUMEN", `${data.from} a ${data.to}`],
    ["Ventas", data.total],
    ["Cantidad de ventas", data.salesCount],
    [data.hasUnknownCosts ? "Margen parcial" : "Margen estimado", data.margin],
    ["Devoluciones del período", data.returnedAmount],
    ["Inventario al costo conocido", data.inventoryValue],
    [
      "Productos con costo / activos",
      `${data.inventoryCostCoverage.known}/${data.inventoryCostCoverage.total}`,
    ],
    ["Gastos de caja clasificados", data.expenses],
    ["Salidas sin clasificar", data.unclassifiedOutflows],
    [
      "Margen conocido menos gastos (parcial)",
      new Decimal(data.margin).minus(data.expenses).toFixed(2),
    ],
    ["Ventas rápidas sin costo conocido", data.quick],
    ["Ventas sin costo de compra conocido", data.unknownCostRevenue],
    ["Saldo actual fiados", data.totalDebt],
    ["Cobros de deuda del período", data.debtCollections],
    ["Comisión retiros digitales", data.withdrawalCommission],
    [""],
    ["Medio de pago", "Importe"],
    ...Object.entries(data.byMethod).map(([key, value]) => [
      methodLabels[key],
      value,
    ]),
    [""],
    ["Cliente", "Deuda actual"],
    ...data.customers.map((c: any) => [c.name, c.balance]),
    [""],
    ["Producto", "Cantidad", "Venta"],
    ...data.top.map((p: any) => [p.name, p.quantity, p.amount]),
    ...[
      ["Ventas netas por cajero", data.byEmployee],
      ["Ventas netas por hora", data.byHour],
      ["Productos por categoría (sin recargos)", data.byCategory],
      ["Cobros de fiado por medio", data.debtCollectionsByMethod],
      ["Deuda con proveedores", data.supplierDebt],
    ].flatMap(([title, entries]: any) => [
      [""],
      [title, "Importe"],
      ...entries.map((r: any) => [r.name, r.amount]),
    ]),
    [""],
    ["Cliente", "Deuda", "Días de deuda más antigua", "Último pago"],
    ...data.debtAging.map((c: any) => [
      c.name,
      c.balance,
      c.days,
      c.lastPayment ?? "Sin pagos",
    ]),
    [""],
    ["Producto sin ventas en el período", "Stock actual"],
    ...data.noSalesInPeriod.map((p: any) => [p.name, p.stock]),
    [""],
    [data.note],
  ];
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(safe).join(";")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `universo-${data.from}-${data.to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Reports() {
  const [range, setRange] = useState({ from: today(), to: today() }),
    [applied, setApplied] = useState(range),
    [showMp, setShowMp] = useState(false);
  const { data, error } = useResource(
    `/reports?from=${applied.from}&to=${applied.to}`,
  );
  const mp = useResource(showMp ? "/mercadopago" : null);
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">GESTIÓN DEL COMERCIO</span>
          <h1>
            Una mirada a tu universo<span className="heading-dot">.</span>
          </h1>
          <p>
            Las operaciones reales, convertidas en información para decidir.
          </p>
        </div>
        <button onClick={() => setShowMp(true)}>
          Actividad Mercado Pago <ExternalLink size={15} />
        </button>
      </div>
      <form
        className="report-filters no-print"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...range });
        }}
      >
        <Field label="Desde">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            required
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            required
          />
        </Field>
        <button className="primary">Consultar</button>
        <button
          type="button"
          onClick={() => {
            const d = today();
            const r = { from: `${d.slice(0, 7)}-01`, to: d };
            setRange(r);
            setApplied(r);
          }}
        >
          Este mes
        </button>
        {data && (
          <>
            <button type="button" onClick={() => downloadCsv(data)}>
              <Download size={16} /> CSV
            </button>
            <a
              className="button"
              href={`/api/reports.pdf?from=${applied.from}&to=${applied.to}`}
            >
              <Download size={16} /> PDF
            </a>
          </>
        )}
      </form>
      {!data || error ? (
        <LoadState error={error} />
      ) : (
        <div className="print-scope report">
          <div className="print-only">
            <h1>EL UNIVERSO · Resumen del comercio</h1>
            <p>
              {data.from} a {data.to}
            </p>
          </div>
          <div className="stats four">
            <Stat
              label="Ventas netas de devoluciones"
              value={currency(data.total)}
              detail={`${data.salesCount} operaciones · devoluciones ${currency(data.returnedAmount ?? 0)} · pendientes ${currency(data.pending)}`}
            />
            <Stat
              label={
                data.hasUnknownCosts || Number(data.unknownCostRevenue) !== 0
                  ? "Margen parcial"
                  : "Margen estimado"
              }
              value={currency(data.margin)}
              detail={
                data.hasUnknownCosts || Number(data.unknownCostRevenue) !== 0
                  ? `${currency(data.unknownCostRevenue)} vendidos sin costo conocido`
                  : "Costos históricos y recargos"
              }
            />
            <Stat
              label="Total fiado actual"
              value={currency(data.totalDebt)}
              detail={`${data.customers.length} clientes con deuda`}
            />
            <Stat
              label="Productos a reponer"
              value={String(data.lowStock.length)}
              detail="Stock actual en el mínimo o por debajo"
            />
          </div>
          <div className="two-columns">
            <section className="panel">
              <div className="panel-toolbar">
                <h2>Ventas por día</h2>
                <small>Importe total</small>
              </div>
              {data.daily.length ? (
                <div className="bar-chart">
                  {data.daily.map((d: any) => (
                    <div className="bar-row" key={d.day}>
                      <span>
                        {d.day.slice(5).split("-").reverse().join("/")}
                      </span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(2, (Number(d.amount) / Math.max(...data.daily.map((v: any) => Number(v.amount)), 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <b>{currency(d.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Sin ventas en este período"
                  text="Probá consultar otro rango de fechas."
                />
              )}
            </section>
            <section className="panel">
              <div className="panel-toolbar">
                <h2>Medios de pago registrados</h2>
              </div>
              <div className="report-lines">
                {Object.entries(data.byMethod).map(([method, amount]) => (
                  <div className="list-row" key={method}>
                    <span>{methodLabels[method]}</span>
                    <b>{currency(String(amount))}</b>
                  </div>
                ))}
                <div className="list-row">
                  <span>Cobros de deuda en efectivo</span>
                  <b>{currency(data.debtCollections)}</b>
                </div>
                <div className="list-row">
                  <span>Comisión de retiros digitales</span>
                  <b>{currency(data.withdrawalCommission)}</b>
                </div>
              </div>
            </section>
          </div>
          <div className="two-columns">
            <section className="panel">
              <div className="panel-toolbar">
                <h2>Productos con mayor venta</h2>
                <small>Top 10 por importe</small>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top.map((p: any, i: number) => (
                      <tr key={i}>
                        <td>
                          <span className="rank">{i + 1}</span>
                          {p.name}
                        </td>
                        <td>{qty(p.quantity)}</td>
                        <td>{currency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="panel-toolbar">
                <h2>Fiados actuales</h2>
              </div>
              {data.customers.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Saldo</th>
                        <th>Límite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers.map((c: any) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td className="negative">{currency(c.balance)}</td>
                          <td>{creditLimitText(c)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Sin deudas pendientes"
                  text="No hay clientes con saldo deudor."
                />
              )}
            </section>
          </div>
          <section className="panel">
            <div className="panel-toolbar">
              <h2>Cierres y arqueos</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Apertura</th>
                    <th>Responsable</th>
                    <th>Esperado</th>
                    <th>Contado</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shifts.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        #{s.id} {s.closedAt ? "" : "· Abierto"}
                      </td>
                      <td>{when(s.openedAt)}</td>
                      <td>{s.employee.name}</td>
                      <td>{s.closedAt ? currency(s.expected) : "—"}</td>
                      <td>{s.closedAt ? currency(s.declared) : "—"}</td>
                      <td>{s.closedAt ? currency(s.difference) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <CommercialReport data={data} />
          <p className="report-note">
            {data.note} Ventas rápidas: {currency(data.quick)} sin costo
            identificado.
          </p>
        </div>
      )}
      {showMp && (
        <Modal
          title="Actividad de Mercado Pago"
          onClose={() => setShowMp(false)}
          wide
        >
          <button onClick={mp.reload}>
            <RefreshCw size={16} /> Actualizar
          </button>
          {mp.data ? (
            <>
              <div
                className={`notice ${mp.data.connected ? "success" : "amber"}`}
              >
                {mp.data.status}
              </div>
              {mp.data.updatedAt && (
                <small>Última consulta: {when(mp.data.updatedAt)}</small>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Referencia</th>
                      <th>Estado</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mp.data.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{when(p.date)}</td>
                        <td>
                          #{p.id}
                          <small>{p.description}</small>
                        </td>
                        <td>{p.status}</td>
                        <td>{currency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <LoadState error={mp.error} />
          )}
        </Modal>
      )}
    </>
  );
}

export function Admin({ auditMode }: { auditMode: boolean }) {
  const { task, notify, busy, employee } = usePos();
  const employees = useResource("/employees"),
    backups = useResource("/backups");
  const [query, setQuery] = useState(""),
    [appliedQuery, setAppliedQuery] = useState("");
  const [auditFilters, setAuditFilters] = useState({
    employeeId: "",
    action: "",
    from: "",
    to: "",
    sort: "date",
    direction: "desc",
  });
  const [auditOffset, setAuditOffset] = useState(0);
  const auditOptions = useResource(auditMode ? "/audit/options" : null);
  const changeAudit = (patch: Partial<typeof auditFilters>) => {
    setAuditFilters((f) => ({ ...f, ...patch }));
    setAuditOffset(0);
  };
  const sortAudit = (sort: string) =>
    changeAudit({
      sort,
      direction:
        auditFilters.sort === sort && auditFilters.direction === "asc"
          ? "desc"
          : "asc",
    });
  const logs = useResource(
    auditMode
      ? `/audit?${new URLSearchParams({ page: "true", q: appliedQuery, offset: String(auditOffset), ...Object.fromEntries(Object.entries(auditFilters).filter(([, v]) => v)) })}`
      : null,
  );
  const [modal, setModal] = useState<"employee" | any | null>(null),
    [reconciliation, setReconciliation] = useState<any>(null);
  if (auditMode)
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">TRAZABILIDAD</span>
            <h1>
              Las acciones dejan huella<span className="heading-dot">.</span>
            </h1>
            <p>
              Historial de seguridad y operaciones sensibles, con fecha y
              segundos.
            </p>
          </div>
        </div>
        <form
          className="audit-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query);
            setAuditOffset(0);
          }}
        >
          <input
            aria-label="Filtrar auditoría"
            placeholder="Buscar empleado, acción o detalle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary">
            <Search size={17} /> Buscar
          </button>
          <Field label="Empleado">
            <select
              value={auditFilters.employeeId}
              onChange={(e) => changeAudit({ employeeId: e.target.value })}
            >
              <option value="">Todos</option>
              {employees.data?.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Acción">
            <select
              value={auditFilters.action}
              onChange={(e) => changeAudit({ action: e.target.value })}
            >
              <option value="">Todas</option>
              {auditOptions.data?.actions.map((a: string) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desde">
            <input
              type="date"
              value={auditFilters.from}
              onChange={(e) => changeAudit({ from: e.target.value })}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={auditFilters.to}
              onChange={(e) => changeAudit({ to: e.target.value })}
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setAppliedQuery("");
              changeAudit({
                employeeId: "",
                action: "",
                from: "",
                to: "",
                sort: "date",
                direction: "desc",
              });
            }}
          >
            Limpiar filtros
          </button>
        </form>
        {logs.data && (
          <p>
            {logs.data.total} registros · Página{" "}
            {Math.floor(auditOffset / 100) + 1}. Tocá Fecha, Empleado o Acción
            para ordenar.
          </p>
        )}
        <section className="panel">
          {logs.data ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      ["date", "Fecha"],
                      ["employee", "Empleado"],
                      ["action", "Acción"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        aria-sort={
                          auditFilters.sort === key
                            ? auditFilters.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          className="sort-button"
                          onClick={() => sortAudit(key)}
                        >
                          {label}{" "}
                          {auditFilters.sort === key
                            ? auditFilters.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </button>
                      </th>
                    ))}
                    <th>Entidad / detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.items.map((l: any) => (
                    <tr key={l.id}>
                      <td>
                        {new Date(l.createdAt).toLocaleString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          hour12: false,
                        })}
                      </td>
                      <td>{l.employeeName}</td>
                      <td>
                        <span className="badge">{l.action}</span>
                      </td>
                      <td>
                        {l.entity}
                        <small className="audit-detail">{l.detail}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <LoadState error={logs.error} />
          )}
        </section>
        <div className="button-row">
          <button
            disabled={auditOffset === 0}
            onClick={() => setAuditOffset((n) => Math.max(0, n - 100))}
          >
            Página anterior
          </button>
          <button
            disabled={!logs.data?.hasMore}
            onClick={() => setAuditOffset((n) => n + 100)}
          >
            Página siguiente
          </button>
        </div>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>
            Un sistema cuidado, un comercio tranquilo
            <span className="heading-dot">.</span>
          </h1>
          <p>Accesos, respaldo de datos y controles de consistencia.</p>
        </div>
      </div>
      <RecoverySettings />
      <EmployeeSettings />
      <div className="two-columns">
        <section className="panel">
          <div className="panel-toolbar">
            <h2>Empleados y permisos</h2>
            <button onClick={() => setModal("employee")}>
              <Plus size={16} /> Agregar
            </button>
          </div>
          {employees.data?.map((e: any) => (
            <div className="list-row employee-row" key={e.id}>
              <div className="avatar">{e.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{e.name}</strong>
                <small>
                  {e.role} · {e.active ? "Activo" : "Inactivo"}
                </small>
              </div>
              <button onClick={() => setModal(e)}>Cambiar PIN</button>
              {e.id !== employee.id && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿${e.active ? "Desactivar" : "Activar"} el acceso de ${e.name}?`,
                      )
                    )
                      void task(async () => {
                        await api(`/employees/${e.id}`, "PATCH", {
                          active: !e.active,
                        });
                        employees.reload();
                        notify("Acceso actualizado");
                      });
                  }}
                >
                  {e.active ? "Desactivar" : "Activar"}
                </button>
              )}
            </div>
          ))}
          {employees.error && <LoadState error={employees.error} />}
        </section>
        <section className="panel">
          <div className="panel-toolbar">
            <h2>
              <Database size={18} /> Respaldo y consistencia
            </h2>
          </div>
          <div className="settings-body">
            <span className="badge green">
              PostgreSQL · base de datos compartida
            </span>
            <p>
              Se genera un respaldo al iniciar, al abrir y cerrar caja y cada 24
              horas mientras el servidor esté encendido. Se conservan 15 días.
            </p>
            {backups.data && (
              <>
                <small>Carpeta configurada</small>
                <code>{backups.data.directory}</code>
                <p>
                  Copia externa:{" "}
                  {backups.data.externalDirectory ?? "Sin configurar"}
                </p>
                {backups.data.externalSuccess && (
                  <p>
                    Última copia externa verificada:{" "}
                    {when(backups.data.externalSuccess)}
                  </p>
                )}
                <p>
                  Último respaldo de esta ejecución:{" "}
                  {backups.data.lastSuccess
                    ? when(backups.data.lastSuccess)
                    : "Todavía no hay un respaldo confirmado"}
                </p>
                {backups.data.error && (
                  <div className="notice error">{backups.data.error}</div>
                )}
              </>
            )}
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    const result = await api("/backups", "POST");
                    backups.reload();
                    notify(`Respaldo guardado: ${result.file}`);
                  })
                }
              >
                <Download size={16} /> Respaldar ahora
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    setReconciliation(await api("/reconcile"));
                  })
                }
              >
                <ShieldCheck size={16} /> Reconciliar
              </button>
            </div>
            {reconciliation && (
              <div
                className={`notice ${reconciliation.ok ? "success" : "error"}`}
              >
                {reconciliation.ok
                  ? `Stock y cuentas consistentes. ${reconciliation.products} productos y ${reconciliation.customers} clientes revisados.`
                  : reconciliation.issues.join(" · ")}
              </div>
            )}
            <p className="muted">
              Para proteger los datos ante una falla del disco, configurá
              BACKUP_DIR en otra unidad o USB. Las copias locales actuales
              sirven para recuperar errores de operación.
            </p>
          </div>
        </section>
      </div>
      <section className="panel settings-body">
        <h2>Operación local y acceso desde el celular</h2>
        <p>
          La interfaz se adapta al celular. El servidor escucha solamente en
          esta PC por defecto. El acceso desde fuera del local requiere
          configurar HTTPS o una VPN en el entorno del comercio.
        </p>
        <p>
          Mercado Pago se configura con <code>MERCADOPAGO_ACCESS_TOKEN</code> en
          el archivo de entorno del servidor. Los cobros siguen funcionando
          aunque el visor no tenga conexión.
        </p>
        <p className="muted">
          Los comprobantes son internos y no reemplazan una factura fiscal.
        </p>
      </section>
      {modal && (
        <Modal
          title={
            modal === "employee"
              ? "Nuevo empleado"
              : `Cambiar PIN · ${modal.name}`
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api(
                  modal === "employee"
                    ? "/employees"
                    : `/employees/${modal.id}`,
                  modal === "employee" ? "POST" : "PATCH",
                  data,
                );
                setModal(null);
                employees.reload();
                notify(
                  "Acceso guardado. El cambio de PIN cierra las sesiones anteriores",
                );
              });
            }}
          >
            {modal === "employee" && (
              <>
                <Field label="Nombre">
                  <input name="name" minLength={2} maxLength={80} required />
                </Field>
                <Field label="Rol">
                  <select name="role">
                    <option value="EMPLEADO">Empleado · ventas y caja</option>
                    <option value="ADMIN">Administrador · acceso total</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="PIN nuevo">
              <input
                type="password"
                name="pin"
                inputMode="numeric"
                minLength={4}
                maxLength={8}
                pattern="[0-9]{4,8}"
                autoComplete="new-password"
                required
              />
            </Field>
            <button className="primary full" disabled={busy}>
              Guardar acceso
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
