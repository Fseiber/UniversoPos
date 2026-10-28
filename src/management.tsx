import { useEffect, useState } from "react";
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

function useResource(url: string | null) {
  const { version } = usePos();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!url) return;
    let active = true;
    setError("");
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

export function Sales() {
  const { task, refresh, notify, customers, busy } = usePos();
  const [onlyPending, setOnlyPending] = useState(false),
    [receipt, setReceipt] = useState<any>(null),
    [settle, setSettle] = useState<any>(null),
    [voiding, setVoiding] = useState<any>(null),
    [admins, setAdmins] = useState<any[]>([]);
  const { data, error } = useResource(
    `/sales${onlyPending ? "?pending=true" : ""}`,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERACIONES</span>
          <h1>
            La historia de tu mostrador<span className="heading-dot">.</span>
          </h1>
          <p>Últimas 200 ventas, comprobantes y entregas pendientes.</p>
        </div>
        <button
          className={onlyPending ? "primary" : ""}
          onClick={() => setOnlyPending(!onlyPending)}
        >
          {onlyPending ? "Mostrar todas" : "Ver pendientes"}
        </button>
      </div>
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
                        {s.status === "PENDIENTE" && (
                          <button onClick={() => setSettle(s)}>Saldar</button>
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
      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
      {settle && (
        <Modal
          title={`Saldar venta #${settle.id}`}
          onClose={() => setSettle(null)}
        >
          <div className="payment-total">
            <small>{settle.pendingName}</small>
            <strong>{currency(settle.total)}</strong>
          </div>
          <p>
            El stock ya fue descontado al entregar. El pago se registra en la
            caja actual.
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
                notify("Venta pendiente saldada");
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
            Restaura stock y revierte efectivo o deuda. Requiere autorización de
            un administrador.
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
    ["Margen estimado", data.margin],
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
              label="Ventas del período"
              value={currency(data.total)}
              detail={`${data.salesCount} operaciones · pendientes ${currency(data.pending)}`}
            />
            <Stat
              label={
                Number(data.unknownCostRevenue) > 0
                  ? "Margen parcial"
                  : "Margen estimado"
              }
              value={currency(data.margin)}
              detail={
                Number(data.unknownCostRevenue) > 0
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
                          <td>{currency(c.creditLimit)}</td>
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
    [appliedQuery, setAppliedQuery] = useState(""),
    [before, setBefore] = useState<number | undefined>();
  const logs = useResource(
    `/audit?q=${encodeURIComponent(appliedQuery)}${before ? `&before=${before}` : ""}`,
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
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query);
            setBefore(undefined);
          }}
        >
          <input
            aria-label="Filtrar auditoría"
            placeholder="Buscar acción, entidad o detalle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary">
            <Search size={17} /> Buscar
          </button>
        </form>
        <section className="panel">
          {logs.data ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Acción</th>
                    <th>Entidad / detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.map((l: any) => (
                    <tr key={l.id}>
                      <td>
                        {new Date(l.createdAt).toLocaleString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                      </td>
                      <td>{l.employeeId ? `#${l.employeeId}` : "Sistema"}</td>
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
          <button disabled={!before} onClick={() => setBefore(undefined)}>
            Más recientes
          </button>
          <button
            disabled={logs.data?.length !== 100}
            onClick={() => setBefore(logs.data.at(-1).id)}
          >
            Anteriores
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
              SQLite local · migraciones versionadas
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
