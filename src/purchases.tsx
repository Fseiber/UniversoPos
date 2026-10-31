import { useEffect, useState } from "react";
import { api, currency, qty, when, methodLabels } from "./api";
import { usePos } from "./context";
import { Field, Modal, NumberInput } from "./components";
type Row = {
  key: string;
  productId: string;
  version: number;
  quantity: string;
  unitCost: string;
  lot: string;
  expiresAt: string;
};
const newRow = (): Row => ({
  key: crypto.randomUUID(),
  productId: "",
  version: 0,
  quantity: "1",
  unitCost: "",
  lot: "",
  expiresAt: "",
});
export function Purchases() {
  const { products, version, task, refresh, notify, busy } = usePos();
  const [suppliers, setSuppliers] = useState<any[]>([]),
    [page, setPage] = useState<any>(null),
    [lots, setLots] = useState<any>(null),
    [error, setError] = useState("");
  const [cursor, setCursor] = useState<number[]>([]),
    [lotCursor, setLotCursor] = useState<number[]>([]);
  const [modal, setModal] = useState<"receive" | "lot" | null>(null),
    [paying, setPaying] = useState<any>(null),
    [resolving, setResolving] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([newRow()]),
    [requestKey, setKey] = useState(() => crypto.randomUUID());
  const [payment, setPayment] = useState({
    amount: "",
    method: "EFECTIVO",
    reference: "",
    confirmed: false,
  });
  useEffect(() => {
    let active = true;
    void Promise.all([
      api("/suppliers"),
      api(
        `/commerce/purchases${cursor.length ? `?before=${cursor.at(-1)}` : ""}`,
      ),
      api(
        `/commerce/lots${lotCursor.length ? `?before=${lotCursor.at(-1)}` : ""}`,
      ),
    ])
      .then(([s, p, l]) => {
        if (active) {
          setSuppliers(s);
          setPage(p);
          setLots(l);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version, cursor, lotCursor]);
  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <section className="panel settings-body">
        <div className="button-row">
          <h2>Recepción de mercadería</h2>
          <button
            className="primary"
            disabled={!suppliers.length || !products.length}
            onClick={() => {
              setRows([newRow()]);
              setKey(crypto.randomUUID());
              setModal("receive");
            }}
          >
            Recibir compra
          </button>
          <button onClick={() => setModal("lot")}>
            Registrar vencimiento existente
          </button>
        </div>
        <p>
          La recepción suma stock, registra el costo de la última compra y la
          deuda con el proveedor. El pago se registra por separado. No cambia el
          precio de venta ni el costo de ventas anteriores.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Compra</th>
                <th>Proveedor / comprobante</th>
                <th>Total</th>
                <th>Saldo a pagar</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {page?.items.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    #{p.id}
                    <small>{when(p.createdAt)}</small>
                  </td>
                  <td>
                    {p.supplier.name}
                    <small>{p.document}</small>
                  </td>
                  <td>{currency(p.total)}</td>
                  <td>
                    {currency(p.balance)}
                    {Number(p.balance) > 0 && (
                      <button
                        onClick={() => {
                          setPaying(p);
                          setKey(crypto.randomUUID());
                          setPayment({
                            amount: p.balance,
                            method: "EFECTIVO",
                            reference: "",
                            confirmed: false,
                          });
                        }}
                      >
                        Registrar pago
                      </button>
                    )}
                  </td>
                  <td>
                    <details>
                      <summary>{p.lines.length} artículos</summary>
                      {p.lines.map((l: any) => (
                        <p key={l.id}>
                          {qty(l.quantity)} × {l.name} · Costo recibido{" "}
                          {currency(l.unitCost)} · Costo con gastos{" "}
                          {currency(l.newCost)}
                        </p>
                      ))}
                      <p>Gastos repartidos: {currency(p.expenses)}</p>
                      {p.payments.map((v: any) => (
                        <p key={v.id}>
                          {when(v.createdAt)} · {methodLabels[v.method]}{" "}
                          {currency(v.amount)} · {v.reference}
                        </p>
                      ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!page?.items.length && <p>Todavía no hay compras en esta página.</p>}
        <div className="button-row">
          <button
            disabled={!cursor.length}
            onClick={() => setCursor((c) => c.slice(0, -1))}
          >
            Anterior
          </button>
          <button
            disabled={!page?.nextCursor}
            onClick={() => setCursor((c) => [...c, page.nextCursor])}
          >
            Siguiente
          </button>
        </div>
      </section>
      <section className="panel settings-body">
        <h2>Vencimientos y lotes por revisar</h2>
        <p>
          Las cantidades son las recibidas o anotadas, no un saldo físico por
          lote. Las ventas no identifican qué lote se entregó. Revisá
          físicamente y cerrá el aviso cuando corresponda; cerrar no modifica
          stock. Los ajustes de mercadería se hacen desde Productos → Stock.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Producto / lote</th>
                <th>Cantidad registrada</th>
                <th>Vencimiento</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {lots?.items.map((l: any) => {
                const days = l.expiresAt
                  ? Math.ceil(
                      (new Date(l.expiresAt).getTime() - Date.now()) / 86400000,
                    )
                  : null;
                return (
                  <tr key={l.id}>
                    <td>
                      {l.product.name}
                      <small>{l.code}</small>
                    </td>
                    <td>
                      {qty(l.quantity)}{" "}
                      {l.product.unit === "PESO" ? "kg" : "u."}
                    </td>
                    <td>
                      <span
                        className={`badge ${days !== null && days <= 7 ? "amber" : ""}`}
                      >
                        {days === null
                          ? "Sin fecha"
                          : days < 0
                            ? `Vencido hace ${-days} días`
                            : days === 0
                              ? "Vence hoy"
                              : `Vence en ${days} días`}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setResolving(l)}>
                        Cerrar aviso revisado
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!lots?.items.length && <p>No hay lotes pendientes de revisión.</p>}
        <div className="button-row">
          <button
            disabled={!lotCursor.length}
            onClick={() => setLotCursor((c) => c.slice(0, -1))}
          >
            Anterior
          </button>
          <button
            disabled={!lots?.nextCursor}
            onClick={() => setLotCursor((c) => [...c, lots.nextCursor])}
          >
            Siguiente
          </button>
        </div>
      </section>
      {modal === "receive" && (
        <Modal
          title="Recibir compra del proveedor"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                const result = await api("/commerce/purchases", "POST", {
                  ...f,
                  requestKey,
                  supplierId: Number(f.supplierId),
                  items: rows.map(({ key, ...r }) => ({
                    ...r,
                    productId: Number(r.productId),
                    expiresAt: r.expiresAt || undefined,
                  })),
                });
                setModal(null);
                await refresh();
                notify(
                  `Compra #${result.id} recibida. Stock y costo actualizados; pago al proveedor pendiente`,
                );
              });
            }}
          >
            <Field label="Proveedor">
              <select name="supplierId" required>
                <option value="">Seleccionar</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Número de factura, remito o referencia">
              <input name="document" required maxLength={100} />
            </Field>
            <Field label="Flete y gastos de esta compra (se reparten al costo)">
              <NumberInput name="expenses" defaultValue="0" />
            </Field>
            {rows.map((r, index) => (
              <fieldset key={r.key}>
                <legend>Artículo {index + 1}</legend>
                <Field label="Producto">
                  <select
                    required
                    value={r.productId}
                    onChange={(e) => {
                      const p = products.find(
                        (p) => p.id === Number(e.target.value),
                      );
                      update(r.key, {
                        productId: e.target.value,
                        version: p?.version ?? 0,
                        unitCost: p?.cost ?? "",
                      });
                    }}
                  >
                    <option value="">Seleccionar</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.unit === "PESO" ? "(kg)" : "(u.)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Cantidad recibida">
                    <NumberInput
                      min="0.001"
                      step="0.001"
                      value={r.quantity}
                      onValueChange={(quantity) => update(r.key, { quantity })}
                    />
                  </Field>
                  <Field label="Costo por unidad / kilo (sin flete)">
                    <NumberInput
                      value={r.unitCost}
                      onValueChange={(unitCost) => update(r.key, { unitCost })}
                    />
                  </Field>
                  <Field label="Lote (opcional)">
                    <input
                      maxLength={80}
                      value={r.lot}
                      onChange={(e) => update(r.key, { lot: e.target.value })}
                    />
                  </Field>
                  <Field label="Vencimiento (opcional)">
                    <input
                      type="date"
                      value={r.expiresAt}
                      onChange={(e) =>
                        update(r.key, { expiresAt: e.target.value })
                      }
                    />
                  </Field>
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) => rs.filter((x) => x.key !== r.key))
                    }
                  >
                    Quitar artículo
                  </button>
                )}
              </fieldset>
            ))}
            <div className="button-row">
              <button
                type="button"
                disabled={rows.length >= 100}
                onClick={() => setRows((rs) => [...rs, newRow()])}
              >
                Agregar artículo
              </button>
              <button
                type="button"
                onClick={() =>
                  void task(async () => {
                    const fresh = await api<any[]>("/products");
                    setRows((rs) =>
                      rs.map((r) => ({
                        ...r,
                        version:
                          fresh.find((p) => p.id === Number(r.productId))
                            ?.version ?? r.version,
                      })),
                    );
                    notify(
                      "Fichas actualizadas. Revisá cantidades y costos antes de confirmar",
                    );
                  })
                }
              >
                Actualizar fichas tras conflicto
              </button>
            </div>
            <button className="primary full" disabled={busy}>
              Confirmar recepción
            </button>
          </form>
        </Modal>
      )}
      {paying && (
        <Modal
          title={`Pagar compra #${paying.id}`}
          onClose={() => setPaying(null)}
        >
          <p>
            Saldo {currency(paying.balance)}. No se procesa ningún pago bancario
            desde aquí.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                await api(`/commerce/purchases/${paying.id}/payments`, "POST", {
                  ...payment,
                  requestKey,
                });
                setPaying(null);
                await refresh();
                notify("Pago al proveedor registrado");
              });
            }}
          >
            <Field label="Importe">
              <NumberInput
                min="0.01"
                max={paying.balance}
                value={payment.amount}
                onValueChange={(amount) =>
                  setPayment((p) => ({ ...p, amount }))
                }
              />
            </Field>
            <Field label="Medio">
              <select
                value={payment.method}
                onChange={(e) =>
                  setPayment((p) => ({
                    ...p,
                    method: e.target.value,
                    confirmed: false,
                  }))
                }
              >
                {Object.entries(methodLabels)
                  .filter(([m]) => m !== "CUENTA_CORRIENTE")
                  .map(([m, label]) => (
                    <option key={m} value={m}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Referencia">
              <input
                required={payment.method !== "EFECTIVO"}
                minLength={payment.method !== "EFECTIVO" ? 3 : undefined}
                maxLength={120}
                value={payment.reference}
                onChange={(e) =>
                  setPayment((p) => ({ ...p, reference: e.target.value }))
                }
              />
            </Field>
            {payment.method !== "EFECTIVO" && (
              <label>
                <input
                  type="checkbox"
                  required
                  checked={payment.confirmed}
                  onChange={(e) =>
                    setPayment((p) => ({ ...p, confirmed: e.target.checked }))
                  }
                />{" "}
                Verifiqué el pago digital
              </label>
            )}
            <button className="primary full" disabled={busy}>
              Registrar pago
            </button>
          </form>
        </Modal>
      )}
      {modal === "lot" && (
        <Modal
          title="Registrar vencimiento de mercadería existente"
          onClose={() => setModal(null)}
        >
          <p>Solo crea un aviso; no suma mercadería al stock.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api("/commerce/lots", "POST", {
                  ...f,
                  productId: Number(f.productId),
                });
                setModal(null);
                await refresh();
                notify("Vencimiento registrado");
              });
            }}
          >
            <Field label="Producto">
              <select required name="productId">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lote o referencia">
              <input name="code" maxLength={80} required />
            </Field>
            <Field label="Cantidad anotada">
              <NumberInput name="quantity" min="0.001" step="0.001" />
            </Field>
            <Field label="Vencimiento">
              <input name="expiresAt" type="date" required />
            </Field>
            <button className="primary full" disabled={busy}>
              Guardar aviso
            </button>
          </form>
        </Modal>
      )}
      {resolving && (
        <Modal
          title="Cerrar aviso de vencimiento"
          onClose={() => setResolving(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason");
              void task(async () => {
                await api(`/commerce/lots/${resolving.id}/resolve`, "POST", {
                  reason,
                });
                setResolving(null);
                await refresh();
                notify("Revisión del lote guardada");
              });
            }}
          >
            <p>
              {resolving.product.name} · {resolving.code}. No modifica stock. Si
              retiraste mercadería vencida, registrá el ajuste en Productos.
            </p>
            <Field label="Qué verificaste / motivo">
              <input name="reason" minLength={5} maxLength={160} required />
            </Field>
            <button className="primary full" disabled={busy}>
              Guardar revisión
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
