import { useEffect, useState } from "react";
import { creditLimitText, availableCreditText } from "./customer-credit";
import { AuthorizationFields, formApproval } from "./authorization";
import {
  Plus,
  Search,
  Pencil,
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Trash2,
  Percent,
} from "lucide-react";
import Decimal from "decimal.js";
import { api, currency, qty, when, type Product, type Customer } from "./api";
import { usePos } from "./context";
import { Empty, Field, Modal, NumberInput, Stat } from "./components";
import { ImportedProducts } from "./imported-products";
import { CategoryPicker } from "./category-picker";
import { CustomerHistory } from "./customer-history";
import { CustomerPayment } from "./customer-payment";
import type { CustomerStatement } from "../shared/customer-statement";
import { BarcodeCapture } from "./barcode-capture";
import { BulkPrices } from "./bulk-prices";
import { CustomerReminders } from "./customer-reminders";
import { categoryTheme } from "./category-art";

export function Products() {
  const [category, setCategory] = useState("");
  const [bulkPrices, setBulkPrices] = useState(false);
  const [capture, setCapture] = useState(false);
  const { products, employee, task, refresh, notify, busy } = usePos();
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Product | "new" | null>(null),
    [stock, setStock] = useState<Product | null>(null),
    [history, setHistory] = useState<{ product: Product; rows: any[] } | null>(
      null,
    ),
    [offer, setOffer] = useState<Product | null>(null);
  const [cost, setCost] = useState(""),
    [margin, setMargin] = useState("30");
  const [stockMode, setStockMode] = useState("SET");
  const admin = employee.role === "ADMIN";
  const categories = [...new Set(products.map((p) => p.category))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );
  const list = products.filter(
    (p) =>
      (!category || p.category === category) &&
      `${p.name} ${p.barcode ?? ""} ${p.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = categories
    .map((name) => ({
      name,
      products: list
        .filter((p) => p.category === name)
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, "es", {
              numeric: true,
              sensitivity: "base",
            }) || a.id - b.id,
        ),
    }))
    .filter((g) => g.products.length);
  if (capture && admin)
    return <BarcodeCapture onBack={() => setCapture(false)} />;
  return (
    <>
      {bulkPrices && <BulkPrices onClose={() => setBulkPrices(false)} />}
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATÁLOGO E INVENTARIO</span>
          <h1>
            Cada producto, en su lugar<span className="heading-dot">.</span>
          </h1>
          <p>Precios claros y stock con historial de cada movimiento.</p>
        </div>
        {admin && (
          <button onClick={() => setBulkPrices(true)}>
            Actualizar precios
          </button>
        )}
        {admin && (
          <button onClick={() => setCapture(true)}>
            Carga rápida de códigos
          </button>
        )}
        {admin && (
          <button
            className="primary"
            onClick={() => {
              setEditing("new");
              setCost("");
            }}
          >
            <Plus size={17} /> Nuevo producto
          </button>
        )}
      </div>
      <div className="stats three">
        <Stat label="Productos activos" value={String(products.length)} />
        <Stat
          label="Stock bajo"
          value={String(
            products.filter((p) => Number(p.stock) <= Number(p.minimum)).length,
          )}
          detail="En el mínimo o por debajo"
        />
        {admin && (
          <Stat
            label="Valor del inventario"
            value={currency(
              products
                .reduce(
                  (s, p) =>
                    p.cost === null
                      ? s
                      : s.plus(new Decimal(p.cost).mul(p.stock)),
                  new Decimal(0),
                )
                .toNumber(),
            )}
            detail={`Valuado al costo conocido · ${products.filter((p) => p.cost === null).length} productos sin costo de compra`}
          />
        )}
      </div>
      {admin && <ImportedProducts />}
      <section className="panel">
        <div className="panel-toolbar products-toolbar">
          <div className="search-box compact">
            <Search size={18} />
            <input
              placeholder="Buscar por nombre, categoría o código…"
              aria-label="Buscar en catálogo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted">{list.length} productos</span>
          <Field label="Ver categoría">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {list.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  {admin && <th>Costo de compra</th>}
                  <th>Precio de venta</th>
                  <th>Stock</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.name}>
                  <tr className="product-category-heading">
                    <th
                      colSpan={admin ? 6 : 5}
                      scope="rowgroup"
                      style={{
                        backgroundColor: categoryTheme(group.name).paper,
                        color: categoryTheme(group.name).text,
                      }}
                    >
                      {group.name}{" "}
                      <small>{group.products.length} productos</small>
                    </th>
                  </tr>
                  {group.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small>
                          {p.barcode || "Sin código de barras"} ·{" "}
                          {p.unit === "PESO" ? "Por kilo" : "Por unidad"}
                        </small>
                      </td>
                      <td>{p.category}</td>
                      {admin && (
                        <td>
                          {p.cost === null ? (
                            <span className="muted">Sin cargar</span>
                          ) : (
                            currency(p.cost)
                          )}
                        </td>
                      )}
                      <td>
                        <b>{currency(p.price)}</b>
                        {p.rules.length > 0 && (
                          <small>{p.rules.length} oferta(s) por cantidad</small>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${Number(p.stock) <= Number(p.minimum) ? "amber" : "green"}`}
                        >
                          {qty(p.stock)} {p.unit === "PESO" ? "kg" : "u."}
                        </span>
                      </td>
                      <td>
                        {admin && (
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={`Editar ${p.name}`}
                              onClick={() => {
                                setEditing(p);
                                setCost(p.cost ?? "");
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Ajustar stock de ${p.name}`}
                              onClick={() => {
                                setStock(p);
                                setStockMode("SET");
                              }}
                            >
                              <ArrowDownToLine size={16} /> Stock
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Kardex de ${p.name}`}
                              onClick={() =>
                                void task(async () =>
                                  setHistory({
                                    product: p,
                                    rows: await api(
                                      `/products/${p.id}/movements`,
                                    ),
                                  }),
                                )
                              }
                            >
                              <History size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Ofertas de ${p.name}`}
                              onClick={() => setOffer(p)}
                            >
                              <Percent size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <Empty
            title={
              products.length
                ? "No hay productos con estos filtros"
                : "Todavía no hay productos"
            }
            text={
              products.length
                ? "Probá otra categoría o cambiá la búsqueda."
                : "Cargá tu primer producto con precio y stock inicial."
            }
          />
        )}
      </section>
      {editing && (
        <Modal
          title={
            editing === "new" ? "Nuevo producto" : `Editar ${editing.name}`
          }
          onClose={() => setEditing(null)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api(
                  editing === "new" ? "/products" : `/products/${editing.id}`,
                  editing === "new" ? "POST" : "PUT",
                  {
                    ...f,
                    ...(editing !== "new" ? { version: editing.version } : {}),
                  },
                );
                setEditing(null);
                await refresh();
                notify("Producto guardado");
              });
            }}
          >
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  name="name"
                  maxLength={120}
                  defaultValue={editing === "new" ? "" : editing.name}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Código de barras">
                <input
                  name="barcode"
                  maxLength={80}
                  defaultValue={
                    editing === "new" ? "" : (editing.barcode ?? "")
                  }
                />
              </Field>
              <Field label="Categoría">
                <CategoryPicker
                  defaultValue={
                    editing === "new" ? "General" : editing.category
                  }
                />
              </Field>
              <Field label="Unidad de venta">
                <select
                  name="unit"
                  defaultValue={editing === "new" ? "UNIDAD" : editing.unit}
                  onChange={() => {}}
                >
                  <option value="UNIDAD">Unidad</option>
                  <option value="PESO">Peso (stock en kilos)</option>
                </select>
              </Field>
              <Field label="Costo de compra (opcional, por unidad / kilo)">
                <NumberInput
                  name="cost"
                  value={cost}
                  onValueChange={setCost}
                  required={false}
                  placeholder="Podés completarlo después"
                />
              </Field>
              <Field label="Precio de venta al cliente (por unidad / kilo)">
                <NumberInput
                  name="price"
                  min="0.01"
                  defaultValue={editing === "new" ? "" : editing.price}
                />
              </Field>
              {editing === "new" && (
                <Field label="Stock inicial (unidades o kilos)">
                  <NumberInput name="stock" step="0.001" defaultValue="0" />
                </Field>
              )}
              <Field label="Stock mínimo">
                <NumberInput
                  name="minimum"
                  step="0.001"
                  defaultValue={editing === "new" ? "0" : editing.minimum}
                />
              </Field>
            </div>
            <div className="margin-calc">
              <div>
                <Percent size={18} />
                <strong>Calculadora de recargo sobre costo</strong>
              </div>
              <div className="button-row">
                <NumberInput
                  aria-label="Porcentaje sobre costo"
                  value={margin}
                  onValueChange={setMargin}
                  required={false}
                />
                <span>
                  % →{" "}
                  <b>
                    {cost === ""
                      ? "Cargá el costo para calcular"
                      : currency(
                          new Decimal(cost || 0)
                            .mul(
                              new Decimal(1).plus(
                                new Decimal(margin || 0).div(100),
                              ),
                            )
                            .toDecimalPlaces(2)
                            .toNumber(),
                        )}
                  </b>
                </span>
              </div>
              <small>
                Ejemplo: costo + 30%. Es una sugerencia; ingresá el precio final
                arriba.
              </small>
            </div>
            <div className="button-row spread">
              {editing !== "new" && (
                <button
                  type="button"
                  className="danger subtle"
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Dar de baja este producto? El historial se conserva.",
                      )
                    )
                      void task(async () => {
                        await api(`/products/${editing.id}`, "DELETE");
                        setEditing(null);
                        await refresh();
                        notify("Producto dado de baja");
                      });
                  }}
                >
                  <Trash2 size={16} /> Dar de baja
                </button>
              )}
              <button className="primary" disabled={busy}>
                Guardar producto
              </button>
            </div>
          </form>
        </Modal>
      )}
      {stock && (
        <Modal title={`Stock · ${stock.name}`} onClose={() => setStock(null)}>
          <p>
            Stock actual:{" "}
            <b>
              {qty(stock.stock)} {stock.unit === "PESO" ? "kg" : "unidades"}
            </b>
            . Podés reemplazar el stock de prueba por el conteo real cuando
            quieras; el ajuste queda en el historial.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api(`/products/${stock.id}/stock`, "POST", f);
                setStock(null);
                await refresh();
                notify("Stock actualizado y movimiento registrado");
              });
            }}
          >
            <Field label="Tipo de actualización">
              <select
                name="mode"
                value={stockMode}
                onChange={(e) => setStockMode(e.target.value)}
              >
                <option value="SET">Establecer el stock contado</option>
                <option value="DELTA">Sumar o retirar mercadería</option>
              </select>
            </Field>
            <Field
              label={
                stockMode === "SET"
                  ? "Stock contado (reemplaza el actual)"
                  : "Cantidad a ingresar / retirar"
              }
            >
              <NumberInput
                key={stockMode}
                name="quantity"
                min={stockMode === "SET" ? "0" : "-1000000"}
                step={stock.unit === "PESO" ? "0.001" : "1"}
                defaultValue={stockMode === "SET" ? stock.stock : ""}
                autoFocus
              />
            </Field>
            <Field label="Motivo">
              <input
                name="reason"
                minLength={3}
                maxLength={160}
                placeholder="Compra, rotura, vencimiento, ajuste…"
                defaultValue="Conteo de inventario"
                required
              />
            </Field>
            <button className="primary full" disabled={busy}>
              Registrar movimiento
            </button>
          </form>
        </Modal>
      )}
      {history && (
        <Modal
          title={`Kardex · ${history.product.name}`}
          onClose={() => setHistory(null)}
          wide
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th>Cantidad</th>
                  <th>Venta</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.createdAt)}</td>
                    <td>{r.reason}</td>
                    <td
                      className={
                        Number(r.quantity) > 0 ? "positive" : "negative"
                      }
                    >
                      {qty(r.quantity)}
                    </td>
                    <td>{r.saleId ? `#${r.saleId}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {offer && (
        <Modal title={`Ofertas · ${offer.name}`} onClose={() => setOffer(null)}>
          <p>
            Se aplica el precio unitario del umbral más alto alcanzado a todas
            las unidades de la línea.
          </p>
          {products
            .find((p) => p.id === offer.id)
            ?.rules.map((r) => (
              <div className="list-row" key={r.id}>
                <span>
                  Desde {qty(r.minimum)} → {currency(r.unitPrice)} /{" "}
                  {offer.unit === "PESO" ? "kg" : "u."}
                </span>
                <button
                  aria-label="Eliminar oferta"
                  className="icon-button"
                  onClick={() =>
                    void task(async () => {
                      await api(`/rules/${r.id}`, "DELETE");
                      await refresh();
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              const form = e.currentTarget;
              void task(async () => {
                await api(`/products/${offer.id}/rules`, "POST", f);
                form.reset();
                await refresh();
                notify("Oferta guardada");
              });
            }}
          >
            <div className="form-grid">
              <Field label="Cantidad mínima">
                <NumberInput
                  name="minimum"
                  min="0.001"
                  step={offer.unit === "PESO" ? "0.001" : "1"}
                />
              </Field>
              <Field label="Precio unitario de oferta">
                <NumberInput name="unitPrice" min="0.01" />
              </Field>
            </div>
            <button className="primary full" disabled={busy}>
              Agregar oferta
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Customers() {
  const [unlimited, setUnlimited] = useState(false);
  const [reminders, setReminders] = useState<Customer | null>(null);
  const { customers, employee, shift, task, refresh, notify, busy } = usePos();
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Customer | "new" | null>(null),
    [payment, setPayment] = useState<Customer | null>(null),
    [history, setHistory] = useState<CustomerStatement | null>(null);
  useEffect(
    () => setUnlimited(editing !== "new" && Boolean(editing?.creditUnlimited)),
    [editing],
  );
  const total = customers.reduce((s, c) => s.plus(c.balance), new Decimal(0));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CLIENTES Y CUENTAS CORRIENTES</span>
          <h1>
            Clientes y fiados
            <span className="heading-dot">.</span>
          </h1>
          <p>Cada compra fiada suma deuda. Los pagos la reducen.</p>
        </div>
        <button className="primary" onClick={() => setEditing("new")}>
          <Plus size={17} /> Nuevo cliente
        </button>
      </div>
      <div className="stats three">
        <Stat
          label="Total por cobrar"
          value={currency(total.toNumber())}
          detail="Dinero que deben los clientes"
        />
        <Stat
          label="Clientes con deuda"
          value={String(customers.filter((c) => Number(c.balance) > 0).length)}
        />
        <Stat label="Clientes registrados" value={String(customers.length)} />
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <div className="search-box compact">
            <Search size={18} />
            <input
              aria-label="Buscar cliente"
              placeholder="Buscar un cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {customers.length ? (
          <div className="table-scroll">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Límite de fiado</th>
                  <th>Disponible para comprar</th>
                  <th>Saldo a pagar</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {customers
                  .filter((c) =>
                    c.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>{creditLimitText(c)}</td>
                      <td>{availableCreditText(c)}</td>
                      <td>
                        <b
                          className={
                            Number(c.balance) > 0 ? "negative" : "positive"
                          }
                        >
                          {currency(c.balance)}
                        </b>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            onClick={() => setPayment(c)}
                            disabled={Number(c.balance) <= 0 || !shift}
                          >
                            Registrar pago
                          </button>
                          <button
                            aria-label={`Historial de ${c.name}`}
                            onClick={() =>
                              void task(async () =>
                                setHistory(
                                  await api<CustomerStatement>(
                                    `/customers/${c.id}/statement`,
                                  ),
                                ),
                              )
                            }
                          >
                            <History size={17} /> Compras y pagos
                          </button>
                          <button onClick={() => setReminders(c)}>Notas</button>
                          {employee.role === "ADMIN" && (
                            <button
                              className="icon-button"
                              aria-label={`Editar cliente ${c.name}`}
                              onClick={() => setEditing(c)}
                            >
                              <Pencil size={17} />
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
            title="Tu primera cuenta corriente"
            text="Registrá un cliente y su límite para comenzar a fiar con control."
          />
        )}
      </section>
      {editing && (
        <Modal
          title={editing === "new" ? "Nuevo cliente" : `Editar ${editing.name}`}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api(
                  editing === "new" ? "/customers" : `/customers/${editing.id}`,
                  editing === "new" ? "POST" : "PATCH",
                  {
                    ...data,
                    creditUnlimited: unlimited,
                    ...(unlimited
                      ? {
                          creditLimit:
                            editing === "new" ? 0 : editing.creditLimit,
                        }
                      : {}),
                  },
                );
                setEditing(null);
                await refresh();
                notify("Cliente guardado");
              });
            }}
          >
            <Field label="Nombre y apellido">
              <input
                name="name"
                minLength={2}
                maxLength={100}
                defaultValue={editing === "new" ? "" : editing.name}
                required
                autoFocus
              />
            </Field>
            <Field label="Teléfono">
              <input
                name="phone"
                maxLength={40}
                defaultValue={editing === "new" ? "" : editing.phone}
              />
            </Field>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={unlimited}
                disabled={employee.role !== "ADMIN"}
                onChange={(e) => setUnlimited(e.target.checked)}
              />{" "}
              Sin límite de fiado
            </label>
            <Field label="Límite de fiado">
              <NumberInput
                name="creditLimit"
                defaultValue={editing === "new" ? 0 : editing.creditLimit}
                readOnly={employee.role !== "ADMIN"}
                disabled={unlimited}
              />
            </Field>
            {employee.role !== "ADMIN" && (
              <p className="muted">
                El administrador asigna el límite de crédito.
              </p>
            )}
            <button className="primary full" disabled={busy}>
              Guardar cliente
            </button>
          </form>
        </Modal>
      )}
      {payment && (
        <CustomerPayment customer={payment} onClose={() => setPayment(null)} />
      )}
      {history && (
        <CustomerHistory initial={history} onClose={() => setHistory(null)} />
      )}
      {reminders && (
        <Modal
          title={`Notas · ${reminders.name}`}
          onClose={() => setReminders(null)}
        >
          <CustomerReminders customerId={reminders.id} />
        </Modal>
      )}
    </>
  );
}

export function Cash() {
  const { employee, shift, task, refresh, notify, busy } = usePos();
  const [approval, setApproval] = useState<any>();
  const [modal, setModal] = useState<
      "open" | "close" | "movement" | "withdrawal" | null
    >(null),
    [closing, setClosing] = useState<any>(null),
    [declared, setDeclared] = useState(""),
    [withdrawal, setWithdrawal] = useState({
      amount: "",
      percent: "5",
      mode: "RECARGO",
      method: "TRANSFERENCIA",
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CAJA Y TURNOS</span>
          <h1>
            El efectivo, siempre claro<span className="heading-dot">.</span>
          </h1>
          <p>Apertura, movimientos y arqueo de tu jornada.</p>
        </div>
        {shift ? (
          <button
            className="primary"
            onClick={() => {
              setModal("close");
              setDeclared("");
            }}
          >
            Cerrar turno
          </button>
        ) : (
          <button className="primary" onClick={() => setModal("open")}>
            <Wallet size={17} /> Abrir caja
          </button>
        )}
      </div>
      {shift ? (
        <>
          <div className="stats three">
            <Stat
              label="Efectivo esperado"
              value={
                employee.role === "ADMIN"
                  ? currency(shift.expected)
                  : "Conteo a ciegas"
              }
              detail="Incluye cobros de deuda y movimientos"
            />
            <Stat label="Fondo de apertura" value={currency(shift.opening)} />
            <Stat
              label={`Turno #${shift.id}`}
              value={shift.employee.name}
              detail={`Abierto ${when(shift.openedAt)}`}
            />
          </div>
          <div className="button-row cash-actions">
            <button onClick={() => setModal("movement")}>
              <ArrowDownToLine size={17} /> Ingreso o retiro manual
            </button>
            <button onClick={() => setModal("withdrawal")}>
              <ArrowUpFromLine size={17} /> Retiro por medio digital
            </button>
          </div>
          <section className="panel">
            <div className="panel-toolbar">
              <h2>Movimientos manuales del turno</h2>
              <span className="muted">
                Las ventas se consultan en el historial
              </span>
            </div>
            {shift.movements.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Motivo</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shift.movements].reverse().map((m) => (
                      <tr key={m.id}>
                        <td>{when(m.createdAt)}</td>
                        <td>{m.reason}</td>
                        <td
                          className={
                            Number(m.amount) > 0 ? "positive" : "negative"
                          }
                        >
                          {currency(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Sin movimientos manuales"
                text="Los ingresos, retiros y reembolsos en efectivo se registran acá."
              />
            )}
          </section>
        </>
      ) : (
        <section className="panel">
          <Empty
            title="La caja está cerrada"
            text="Ingresá el fondo inicial para abrir un turno y comenzar a vender."
            action={
              <button className="primary" onClick={() => setModal("open")}>
                Abrir mi turno
              </button>
            }
          />
        </section>
      )}
      {modal === "open" && (
        <Modal title="Abrir caja" onClose={() => setModal(null)}>
          <p>Contá el efectivo con el que comienza este turno.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const opening = new FormData(e.currentTarget).get("opening");
              void task(async () => {
                await api("/shifts/open", "POST", { opening });
                setModal(null);
                await refresh();
                notify("Caja abierta. Ya podés comenzar a vender");
              });
            }}
          >
            <Field label="Fondo inicial en efectivo">
              <NumberInput name="opening" defaultValue="0" autoFocus />
            </Field>
            <button className="primary full" disabled={busy}>
              Abrir turno
            </button>
          </form>
        </Modal>
      )}
      {modal === "close" && shift && (
        <Modal
          title={`Cerrar turno #${shift.id}`}
          onClose={() => setModal(null)}
        >
          <p>
            Contá el dinero físico de caja. Las ventas pendientes y fiadas no
            forman parte del efectivo.
          </p>
          {employee.role === "ADMIN" && (
            <div className="payment-total">
              <small>EFECTIVO ESPERADO</small>
              <strong>{currency(shift.expected)}</strong>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                const result = await api("/shifts/close", "POST", { declared });
                setClosing(result);
                setModal(null);
                await refresh();
                notify("Turno cerrado y arqueo guardado");
              });
            }}
          >
            <Field label="Efectivo contado">
              <NumberInput
                value={declared}
                onValueChange={setDeclared}
                autoFocus
              />
            </Field>
            {employee.role === "ADMIN" && declared !== "" && (
              <div className="notice">
                Diferencia:{" "}
                {currency(
                  new Decimal(declared).minus(shift.expected).toNumber(),
                )}
              </div>
            )}
            <button className="primary full" disabled={busy}>
              Confirmar cierre
            </button>
          </form>
        </Modal>
      )}
      {closing && (
        <Modal title="Arqueo guardado" onClose={() => setClosing(null)}>
          <div className="totals">
            <div>
              <span>Esperado</span>
              <b>{currency(closing.expected)}</b>
            </div>
            <div>
              <span>Contado</span>
              <b>{currency(closing.declared)}</b>
            </div>
            <div className="grand-total">
              <span>Diferencia</span>
              <b>{currency(closing.difference)}</b>
            </div>
          </div>
          <p>
            {Number(closing.difference) === 0
              ? "La caja está conciliada."
              : Number(closing.difference) > 0
                ? "Se registró un sobrante de caja."
                : "Se registró un faltante de caja."}
          </p>
          <button className="primary full" onClick={() => setClosing(null)}>
            Listo
          </button>
        </Modal>
      )}
      {modal === "movement" && (
        <Modal title="Movimiento manual de caja" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api("/cash-movements", "POST", {
                  ...data,
                  approval: formApproval(data),
                });
                setModal(null);
                await refresh();
                notify("Movimiento de caja registrado");
              });
            }}
          >
            <Field label="Tipo">
              <select name="direction">
                <option value="INGRESO">Ingreso de efectivo</option>
                <option value="RETIRO">Retiro de efectivo</option>
              </select>
            </Field>
            <Field label="Importe">
              <NumberInput name="amount" min="0.01" />
            </Field>
            <Field label="Clasificar movimiento">
              <select name="category">
                <option value="SIN_CLASIFICAR">Sin clasificar</option>
                <option value="GASTO">Gasto del negocio</option>
                <option value="RETIRO_DUENO">Retiro del dueño</option>
                <option value="INGRESO">Ingreso / aporte</option>
              </select>
            </Field>
            <Field label="Motivo">
              <input
                name="reason"
                minLength={3}
                maxLength={160}
                placeholder="Pago a proveedor, gasto, retiro…"
                required
              />
            </Field>
            {employee.role !== "ADMIN" && <AuthorizationFields />}
            <button className="primary full" disabled={busy}>
              Registrar movimiento
            </button>
          </form>
        </Modal>
      )}
      {modal === "withdrawal" && (
        <Modal
          title="Retiro de efectivo por medio digital"
          onClose={() => setModal(null)}
        >
          <p>
            Primero verificá el ingreso digital. Esta operación registra la
            entrega de efectivo y la comisión; no procesa pagos en el banco.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                const result = await api("/withdrawals", "POST", {
                  ...withdrawal,
                  approval,
                });
                setModal(null);
                await refresh();
                notify(
                  `Retiro registrado: entregar ${currency(result.cashAmount)}, cobro digital ${currency(result.digitalAmount)}`,
                );
              });
            }}
          >
            <Field label="Medio">
              <select
                value={withdrawal.method}
                onChange={(e) =>
                  setWithdrawal((w) => ({
                    ...w,
                    method: e.target.value,
                    percent: e.target.value === "DEBITO" ? "17" : "5",
                  }))
                }
              >
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="DEBITO">Posnet / débito</option>
              </select>
            </Field>
            <Field label="Modalidad">
              <select
                value={withdrawal.mode}
                onChange={(e) =>
                  setWithdrawal((w) => ({ ...w, mode: e.target.value }))
                }
              >
                <option value="RECARGO">Monto de efectivo + recargo</option>
                <option value="DESCUENTO">
                  Descontar comisión del monto digital
                </option>
              </select>
            </Field>
            <div className="form-grid">
              <Field
                label={
                  withdrawal.mode === "RECARGO"
                    ? "Efectivo a entregar"
                    : "Monto digital recibido"
                }
              >
                <NumberInput
                  min="0.01"
                  value={withdrawal.amount}
                  onValueChange={(amount) =>
                    setWithdrawal((w) => ({ ...w, amount }))
                  }
                />
              </Field>
              <Field label="Comisión (%)">
                <NumberInput
                  max="50"
                  value={withdrawal.percent}
                  onValueChange={(percent) =>
                    setWithdrawal((w) => ({ ...w, percent }))
                  }
                />
              </Field>
            </div>
            {withdrawal.amount && (
              <div className="notice">
                {withdrawal.mode === "RECARGO"
                  ? `Cobrar digital: ${currency(
                      new Decimal(withdrawal.amount)
                        .mul(
                          new Decimal(1).plus(
                            new Decimal(withdrawal.percent || 0).div(100),
                          ),
                        )
                        .toDecimalPlaces(2)
                        .toNumber(),
                    )}`
                  : `Entregar efectivo: ${currency(
                      new Decimal(withdrawal.amount)
                        .mul(
                          new Decimal(1).minus(
                            new Decimal(withdrawal.percent || 0).div(100),
                          ),
                        )
                        .toDecimalPlaces(2)
                        .toNumber(),
                    )}`}
              </div>
            )}
            {employee.role !== "ADMIN" && (
              <AuthorizationFields onChange={setApproval} />
            )}
            <button className="primary full" disabled={busy}>
              Registrar entrega
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
