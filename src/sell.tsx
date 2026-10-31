import { availableCreditText } from "./customer-credit";
import { CategoryArt, categoryTheme } from "./category-art";
import { whatsappLink } from "./whatsapp";
import { registerCheckout } from "./checkout-recovery";
import { AuthorizationFields } from "./authorization";
import { ApiError } from "./api";
import { useEffect, useRef, useState } from "react";
import Decimal from "decimal.js";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBasket,
  ArrowRight,
  Zap,
  ScanBarcode,
  Package,
  CheckCircle2,
  Copy,
  Printer,
  Send,
} from "lucide-react";
import { api, currency, methodLabels, qty, when, type Product } from "./api";
import { usePos } from "./context";
import { Empty, Field, Modal, NumberInput } from "./components";
import { initialPaymentMethod, quickAmountKey } from "./checkout-input";
import { formatNumericInput } from "./numeric-input";
import { CustomerReminders } from "./customer-reminders";
import { ProductReminders } from "./product-reminders";

type Cart = {
  key: string;
  name: string;
  items: { productId: number; quantity: number }[];
  quickAmount: number;
  customerId: string;
  surcharge: number;
};
const newCart = (n: number): Cart => ({
  key: crypto.randomUUID(),
  name: `Cliente ${n}`,
  items: [],
  quickAmount: 0,
  customerId: "",
  surcharge: 0,
});
const dec = (v: Decimal.Value) => new Decimal(v);
export function cartLines(cart: Cart, products: Product[]) {
  return cart.items.map((item) => {
    const p = products.find((p) => p.id === item.productId);
    const rule = p?.rules
      .filter((r) => dec(item.quantity).gte(r.minimum))
      .sort((a, b) => Number(b.minimum) - Number(a.minimum))[0];
    const price = rule?.unitPrice ?? p?.price ?? 0;
    return {
      ...item,
      product: p,
      price,
      total: dec(price).mul(item.quantity).toDecimalPlaces(2),
    };
  });
}
export function Receipt({ sale, onClose }: { sale: any; onClose: () => void }) {
  const [paper, setPaper] = useState("80");
  const { notify, task } = usePos();
  const text = `EL UNIVERSO\nFecha: ${when(sale.createdAt)}\nCajero: ${sale.employee?.name ?? "Sin identificar"}\nCliente: ${sale.customer?.name ?? sale.pendingName ?? "Consumidor final"}\nComprobante interno #${sale.id}\n${sale.lines.map((l: any) => `${qty(l.quantity)} × ${l.name} · ${currency(l.total)}`).join("\n")}${Number(sale.quickAmount) ? `\nVenta rápida: ${currency(sale.quickAmount)}` : ""}\nRecargo: ${currency(sale.surcharge)}\nTOTAL: ${currency(sale.total)}\n${sale.payments.map((p: any) => `${methodLabels[p.method]}: ${currency(p.amount)}`).join("\n")}\n${sale.status === "PENDIENTE" ? `PENDIENTE · ${sale.pendingName}` : "Gracias por tu compra"}\nNo válido como factura fiscal.`;
  const stockNotice =
    sale.stockTracked === false
      ? "Venta sin control de stock. No modifica existencias."
      : "Venta con control de stock.";
  return (
    <Modal title={`Venta #${sale.id}`} onClose={onClose}>
      <div className={`receipt print-scope thermal-${paper}`}>
        <CheckCircle2 size={36} />
        <h2>
          {sale.status === "PENDIENTE"
            ? "Venta pendiente guardada"
            : "Venta registrada"}
        </h2>
        <p>
          {sale.status === "PENDIENTE"
            ? `${sale.stockTracked === false ? "No se modificó stock." : "El stock se descontó."} El dinero se registra cuando confirmes el cobro.`
            : "Pagos y cuenta corriente actualizados."}
        </p>
        <p>{stockNotice}</p>
        <pre>{text}</pre>
      </div>
      <div className="button-row no-print">
        <Field label="Ancho del ticket">
          <select value={paper} onChange={(e) => setPaper(e.target.value)}>
            <option value="58">Térmica 58 mm</option>
            <option value="80">Térmica 80 mm</option>
            <option value="a4">Hoja / PDF</option>
          </select>
        </Field>
        <button
          onClick={() =>
            void task(async () => {
              await navigator.clipboard.writeText(text);
              notify("Comprobante copiado");
            })
          }
        >
          <Copy size={16} /> Copiar
        </button>
        <button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / PDF
        </button>
        <a
          className="button"
          target="_blank"
          rel="noreferrer"
          href={whatsappLink(text, sale.customer?.phone)}
        >
          <Send size={16} /> WhatsApp
        </a>
      </div>
      <button className="primary full no-print" onClick={onClose}>
        Nueva venta <ArrowRight size={17} />
      </button>
    </Modal>
  );
}

export function Sell({ onOpenCash }: { onOpenCash: () => void }) {
  const [approval, setApproval] = useState<any>();
  const [priceNotice, setPriceNotice] = useState("");
  const previousPrices = useRef(new Map<number, string>());
  const [pendingPayload, setPendingPayload] = useState<any>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("universo-pending-sale") ?? "null",
      );
    } catch {
      return null;
    }
  });
  const {
    products,
    customers,
    shift,
    task,
    refresh,
    busy,
    employee,
    stockSettings,
  } = usePos();
  const [carts, setCarts] = useState<Cart[]>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("universo-carts") ??
          sessionStorage.getItem("universo-carts") ??
          "null",
      );
      if (
        Array.isArray(stored) &&
        stored.length &&
        stored.every((c) => typeof c.key === "string" && Array.isArray(c.items))
      )
        return stored;
    } catch {}
    return [newCart(1)];
  });
  const [selected, setSelected] = useState(0),
    [visibleProducts, setVisibleProducts] = useState(100),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todos");
  const [modal, setModal] = useState<"pay" | "quick" | "pending" | null>(null),
    [weight, setWeight] = useState<Product | null>(null),
    [weightMode, setWeightMode] = useState("KG"),
    [weightValue, setWeightValue] = useState("");
  const [payments, setPayments] = useState([
      { method: "EFECTIVO", amount: "" },
    ]),
    [received, setReceived] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [quickDraft, setQuickDraft] = useState("");
  const cart = carts[selected] ?? carts[0];
  const lines = cartLines(cart, products);
  const subtotal = lines.reduce(
    (s, l) => s.plus(l.total),
    dec(cart.quickAmount),
  );
  const surcharge = subtotal.mul(cart.surcharge).div(100).toDecimalPlaces(2);
  const total = subtotal.plus(surcharge);
  useEffect(() => {
    const changed = products.filter(
      (p) =>
        cart.items.some((i) => i.productId === p.id) &&
        previousPrices.current.has(p.id) &&
        previousPrices.current.get(p.id) !== JSON.stringify([p.price, p.rules]),
    );
    previousPrices.current = new Map(
      products.map((p) => [p.id, JSON.stringify([p.price, p.rules])]),
    );
    if (changed.length) {
      setPriceNotice(
        `Se actualizaron los precios de: ${changed.map((p) => p.name).join(", ")}. Revisá el total antes de cobrar.`,
      );
      setModal(null);
    }
  }, [products]);
  useEffect(() => {
    localStorage.setItem("universo-carts", JSON.stringify(carts));
  }, [carts]);
  function update(change: Partial<Cart>) {
    if (pendingPayload) return;
    setCarts((cs) =>
      cs.map((c, i) => (i === selected ? { ...c, ...change } : c)),
    );
  }
  function add(product: Product, amount = 1) {
    const old = cart.items.find((i) => i.productId === product.id);
    const next = dec(old?.quantity ?? 0)
      .plus(amount)
      .toNumber();
    update({
      items: [
        ...cart.items.filter((i) => i.productId !== product.id),
        { productId: product.id, quantity: next },
      ],
    });
    setSearch("");
    searchRef.current?.focus();
  }
  const filtered = products.filter(
    (p) =>
      (category === "Todos" || p.category === category) &&
      `${p.name} ${p.barcode ?? ""}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  const categories = ["Todos", ...new Set(products.map((p) => p.category))];
  useEffect(() => setVisibleProducts(100), [search, category]);
  function openPayment() {
    setPayments([
      {
        method: initialPaymentMethod(cart.customerId),
        amount: total.toFixed(2),
      },
    ]);
    setReceived("");
    setModal("pay");
  }
  async function save(pendingName?: string) {
    const payload = pendingPayload ?? {
      requestKey: cart.key,
      expectedStockEnabled: stockSettings.stockEnabled,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        expectedUnitPrice: Number(l.price),
      })),
      quickAmount: cart.quickAmount,
      surchargePercent: cart.surcharge,
      customerId: cart.customerId ? Number(cart.customerId) : undefined,
      ...(pendingName
        ? { pendingName, payments: [] }
        : {
            payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
          }),
    };
    localStorage.setItem("universo-pending-sale", JSON.stringify(payload));
    setPendingPayload(payload);
    let result;
    try {
      result = await registerCheckout(payload, approval);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status < 500 &&
        error.status !== 401
      ) {
        localStorage.removeItem("universo-pending-sale");
        setPendingPayload(null);
        await refresh().catch(() => {});
        throw error;
      }
      throw error;
    }
    localStorage.removeItem("universo-pending-sale");
    setPendingPayload(null);
    setApproval(undefined);
    setModal(null);
    setReceipt(result);
    setCarts((cs) =>
      cs.map((c, i) =>
        c.key === payload.requestKey
          ? newCart(Number(c.name.replace(/\D/g, "")) || selected + 1)
          : c,
      ),
    );
    await refresh();
  }
  const paymentSum = payments.reduce((s, p) => s.plus(p.amount || 0), dec(0));
  const cashPayment = payments
    .filter((p) => p.method === "EFECTIVO")
    .reduce((s, p) => s.plus(p.amount || 0), dec(0));
  const customer = customers.find((c) => c.id === Number(cart.customerId));
  return (
    <>
      {pendingPayload && (
        <div className="notice amber">
          <strong>
            Hay un cobro pendiente de verificar. El carrito está protegido.
          </strong>
          <button disabled={busy} onClick={() => void task(() => save())}>
            Verificar / reintentar la misma operación
          </button>
        </div>
      )}
      {priceNotice && (
        <div className="notice amber" role="alert">
          {priceNotice}
          <button onClick={() => setPriceNotice("")}>Revisado</button>
        </div>
      )}
      {!shift && (
        <div className="notice amber">
          <WalletIcon /> Abrí la caja para registrar ventas.
          <button onClick={onOpenCash}>Abrir caja →</button>
        </div>
      )}
      <div className={`pos-layout ${shift ? "" : "needs-shift"}`}>
        <section className="product-browser">
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              const exact = products.find((p) => p.barcode === search.trim());
              const p =
                exact ?? (filtered.length === 1 ? filtered[0] : undefined);
              if (p) {
                if (p.unit === "PESO") {
                  setWeight(p);
                  setWeightValue("");
                } else add(p);
              }
            }}
          >
            <Search size={20} />
            <input
              aria-label="Buscar producto o escanear código"
              placeholder="Buscá un producto o escaneá su código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              ref={searchRef}
              autoFocus
            />
            <kbd>↵</kbd>
          </form>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="section-line">
            <h3>
              Productos disponibles <span>{filtered.length}</span>
            </h3>
            <button
              className="text-button"
              onClick={() => {
                setQuickDraft(cart.quickAmount ? String(cart.quickAmount) : "");
                setModal("quick");
              }}
            >
              <Zap size={15} /> Venta rápida
            </button>
          </div>
          {filtered.length ? (
            <div className="product-grid">
              {filtered.slice(0, visibleProducts).map((p, i) => (
                <button
                  className="product-card"
                  key={p.id}
                  disabled={
                    (stockSettings.stockEnabled && Number(p.stock) <= 0) || busy
                  }
                  onClick={() => {
                    if (p.unit === "PESO") {
                      setWeight(p);
                      setWeightValue("");
                      setWeightMode("KG");
                    } else add(p);
                  }}
                >
                  <div
                    className="product-art category-illustration"
                    style={{
                      backgroundColor: categoryTheme(p.category).paper,
                      color: categoryTheme(p.category).text,
                    }}
                  >
                    <CategoryArt category={p.category} />
                    <span>
                      {p.unit === "PESO"
                        ? "POR KILO"
                        : p.category.toUpperCase()}
                    </span>
                    <div className="card-add">
                      <Plus size={17} />
                    </div>
                  </div>
                  <div className="product-info">
                    <small>{p.barcode || "Sin código"}</small>
                    <strong>{p.name}</strong>
                    <div>
                      <b>
                        {currency(p.price)}
                        {p.unit === "PESO" && <small> / kg</small>}
                      </b>
                      {stockSettings.stockEnabled && (
                        <span
                          className={
                            stockSettings.stockEnabled &&
                            Number(p.stock) <= Number(p.minimum)
                              ? "low"
                              : ""
                          }
                        >
                          {stockSettings.stockEnabled
                            ? `${qty(p.stock)} ${p.unit === "PESO" ? "kg" : "disp."}`
                            : "Sin control de stock"}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title={
                products.length
                  ? "No encontramos ese producto"
                  : "Tu catálogo empieza acá"
              }
              text={
                products.length
                  ? "Probá con otro nombre o código de barras."
                  : "Cargá los productos desde la sección Productos para comenzar a vender."
              }
            />
          )}
          <div className="pos-footer">
            {filtered.length > visibleProducts && (
              <button onClick={() => setVisibleProducts((v) => v + 100)}>
                Mostrar 100 más ({visibleProducts} de {filtered.length})
              </button>
            )}
            <span>
              <i /> Los cambios se guardan al confirmar la venta
            </span>
            <span>{products.length} productos en tu catálogo</span>
          </div>
        </section>
        <aside className="cart">
          <div className="cart-tabs">
            {carts.map((c, i) => (
              <div key={i} className={selected === i ? "selected" : ""}>
                <button onClick={() => setSelected(i)}>
                  {c.name}
                  {c.items.length > 0 && <i />}
                </button>
                {carts.length > 1 && (
                  <button
                    aria-label={`Cerrar ${c.name}`}
                    disabled={Boolean(pendingPayload)}
                    onClick={() => {
                      if (
                        (c.items.length || c.quickAmount) &&
                        !window.confirm(
                          "¿Descartar este carrito sin confirmar?",
                        )
                      )
                        return;
                      setCarts((cs) => cs.filter((_, n) => n !== i));
                      setSelected(0);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              className="tab-add"
              aria-label="Agregar otro cliente"
              disabled={carts.length >= 8 || Boolean(pendingPayload)}
              onClick={() => {
                setCarts((cs) => [...cs, newCart(cs.length + 1)]);
                setSelected(carts.length);
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="cart-title">
            <div>
              <ShoppingBasket size={21} />
              <h2>Venta actual</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Vaciar carrito"
              disabled={Boolean(pendingPayload)}
              onClick={() => {
                if (window.confirm("¿Vaciar este carrito?"))
                  update(newCart(selected + 1));
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <div className="cart-items">
            {!lines.length && !cart.quickAmount ? (
              <Empty
                title="Todavía no hay productos"
                text="Elegí un producto o escaneá su código para sumarlo a esta venta."
              />
            ) : (
              <>
                {lines.map((l) => (
                  <div className="cart-item" key={l.productId}>
                    <div className="cart-item-icon">
                      <Package size={21} />
                    </div>
                    <div>
                      <strong>
                        {l.product?.name ?? "Producto no disponible"}
                      </strong>
                      <small>
                        {currency(l.price)} /{" "}
                        {l.product?.unit === "PESO" ? "kg" : "unidad"}
                      </small>
                      <div className="quantity">
                        <button
                          aria-label={`Restar ${l.product?.name}`}
                          onClick={() =>
                            update({
                              items: cart.items
                                .map((i) =>
                                  i.productId === l.productId
                                    ? {
                                        ...i,
                                        quantity: Math.max(
                                          0,
                                          dec(i.quantity)
                                            .minus(
                                              l.product?.unit === "PESO"
                                                ? 0.1
                                                : 1,
                                            )
                                            .toNumber(),
                                        ),
                                      }
                                    : i,
                                )
                                .filter((i) => i.quantity > 0),
                            })
                          }
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          aria-label={`Cantidad de ${l.product?.name}`}
                          type="number"
                          min={l.product?.unit === "PESO" ? "0.001" : "1"}
                          step={l.product?.unit === "PESO" ? "0.001" : "1"}
                          value={l.quantity}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n > 0)
                              update({
                                items: cart.items.map((i) =>
                                  i.productId === l.productId
                                    ? { ...i, quantity: n }
                                    : i,
                                ),
                              });
                          }}
                        />
                        <button
                          aria-label={`Sumar ${l.product?.name}`}
                          onClick={() =>
                            add(
                              l.product!,
                              l.product?.unit === "PESO" ? 0.1 : 1,
                            )
                          }
                          disabled={!l.product}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="cart-item-end">
                      <b>{currency(l.total.toNumber())}</b>
                      <button
                        className="icon-button"
                        aria-label={`Quitar ${l.product?.name}`}
                        onClick={() =>
                          update({
                            items: cart.items.filter(
                              (i) => i.productId !== l.productId,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {cart.quickAmount > 0 && (
                  <div className="cart-item">
                    <Zap size={20} />
                    <div>
                      <strong>Venta rápida</strong>
                      <small>No modifica stock</small>
                    </div>
                    <b>{currency(cart.quickAmount)}</b>
                    <button
                      className="icon-button"
                      aria-label="Quitar venta rápida"
                      onClick={() => update({ quickAmount: 0 })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="cart-summary">
            <ProductReminders ids={cart.items.map((i) => i.productId)} />
            {cart.customerId && (
              <CustomerReminders customerId={Number(cart.customerId)} />
            )}
            <Field label="Cliente / cuenta corriente">
              <select
                value={cart.customerId}
                onChange={(e) => update({ customerId: e.target.value })}
              >
                <option value="">Consumidor final</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · debe {currency(c.balance)}
                  </option>
                ))}
              </select>
            </Field>
            {customer && (
              <small className="credit-hint">
                Crédito disponible: {availableCreditText(customer)}
              </small>
            )}
            <div className="totals">
              <div>
                <span>Subtotal</span>
                <span>{currency(subtotal.toNumber())}</span>
              </div>
              <div>
                <label htmlFor="surcharge">Recargo (%)</label>
                <input
                  id="surcharge"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={cart.surcharge}
                  onChange={(e) =>
                    update({
                      surcharge: Math.max(
                        0,
                        Math.min(100, Number(e.target.value)),
                      ),
                    })
                  }
                />
                <span>{currency(surcharge.toNumber())}</span>
              </div>
              <div className="grand-total">
                <strong>Total a cobrar</strong>
                <strong>{currency(total.toNumber())}</strong>
              </div>
            </div>
            <button
              className="primary full charge"
              disabled={
                !shift || total.lte(0) || busy || lines.some((l) => !l.product)
              }
              onClick={openPayment}
            >
              Cobrar venta{" "}
              <span>
                {currency(total.toNumber())} <ArrowRight size={18} />
              </span>
            </button>
            <button
              className="subtle full"
              disabled={!shift || total.lte(0) || busy}
              onClick={() => setModal("pending")}
            >
              Dejar pendiente
            </button>
            <small className="cart-footnote">
              Cada venta, una cuenta más clara.
            </small>
          </div>
        </aside>
      </div>
      {modal === "quick" && (
        <Modal title="Venta rápida por monto" onClose={() => setModal(null)}>
          <p>Registrá una venta sin productos. No descuenta stock.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update({ quickAmount: Number(f.get("amount")) });
              setModal(null);
            }}
          >
            <Field label="Importe total">
              <NumberInput
                name="amount"
                min="0.01"
                value={quickDraft}
                onValueChange={setQuickDraft}
                inputRef={quickInputRef}
                max="100000000"
                autoFocus
              />
            </Field>
            <div
              className="numeric-keypad"
              aria-label="Teclado numérico para venta rápida"
            >
              {[
                "7",
                "8",
                "9",
                "4",
                "5",
                "6",
                "1",
                "2",
                "3",
                ",",
                "0",
                "backspace",
                "clear",
                "00",
              ].map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-label={
                    key === "backspace"
                      ? "Borrar último dígito"
                      : key === "clear"
                        ? "Borrar importe"
                        : key === ","
                          ? "Coma decimal"
                          : `Número ${key}`
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const next = quickAmountKey(quickDraft, key);
                    setQuickDraft(next);
                    queueMicrotask(() => {
                      quickInputRef.current?.focus();
                      const end = formatNumericInput(next).length;
                      quickInputRef.current?.setSelectionRange(end, end);
                    });
                  }}
                >
                  {key === "backspace" ? "⌫" : key === "clear" ? "Borrar" : key}
                </button>
              ))}
            </div>
            <button className="primary full">Agregar al carrito</button>
          </form>
        </Modal>
      )}
      {modal === "pending" && (
        <Modal title="Dejar venta pendiente" onClose={() => setModal(null)}>
          <p>
            {stockSettings.stockEnabled
              ? "La mercadería se descuenta ahora."
              : "Esta venta no modifica stock."}{" "}
            El pago queda pendiente. Lo podés registrar desde Pendientes de hoy
            o Historial de ventas → Todas las pendientes.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              void task(() => save(name));
            }}
          >
            <Field label="Nombre o apodo">
              <input
                name="name"
                maxLength={80}
                required
                autoFocus
                defaultValue={customer?.name ?? ""}
              />
            </Field>
            <button className="primary full" disabled={busy}>
              Guardar pendiente
            </button>
          </form>
        </Modal>
      )}
      {modal === "pay" && (
        <Modal title="Cobrar venta" onClose={() => setModal(null)}>
          <div className="payment-total">
            <small>TOTAL A COBRAR</small>
            <strong>{currency(total.toNumber())}</strong>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(() => save());
            }}
          >
            <div className="payment-rows">
              {employee.role !== "ADMIN" && cart.surcharge > 0 && (
                <AuthorizationFields onChange={setApproval} />
              )}
              {payments.map((p, i) => (
                <div className="payment-row" key={i}>
                  <Field label="Medio de pago">
                    <select
                      value={p.method}
                      onChange={(e) =>
                        setPayments((ps) =>
                          ps.map((r, n) =>
                            n === i ? { ...r, method: e.target.value } : r,
                          ),
                        )
                      }
                    >
                      {Object.entries(methodLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Importe">
                    <NumberInput
                      min="0.01"
                      value={p.amount}
                      onValueChange={(amount) =>
                        setPayments((ps) =>
                          ps.map((r, n) => (n === i ? { ...r, amount } : r)),
                        )
                      }
                    />
                  </Field>
                  {payments.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Quitar medio de pago"
                      onClick={() =>
                        setPayments((ps) => ps.filter((_, n) => n !== i))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="text-button"
              type="button"
              disabled={payments.length >= 5}
              onClick={() =>
                setPayments((ps) => [
                  ...ps,
                  {
                    method: "TRANSFERENCIA",
                    amount: Decimal.max(total.minus(paymentSum), 0).toFixed(2),
                  },
                ])
              }
            >
              <Plus size={16} /> Agregar otro medio de pago
            </button>
            {payments.some((p) => p.method === "CUENTA_CORRIENTE") && (
              <div className={`notice ${customer ? "amber" : "error"}`}>
                {customer
                  ? `${customer.name} · crédito disponible ${availableCreditText(customer)}`
                  : "Elegí un cliente en el carrito para registrar fiado."}
              </div>
            )}
            {cashPayment.gt(0) && (
              <Field label="Efectivo recibido (opcional, para calcular vuelto)">
                <NumberInput
                  min={cashPayment.toFixed(2)}
                  required={false}
                  value={received}
                  onValueChange={setReceived}
                />
              </Field>
            )}
            {received && cashPayment.gt(0) && (
              <div className="notice success">
                Vuelto:{" "}
                {currency(
                  Decimal.max(dec(received).minus(cashPayment), 0).toNumber(),
                )}
              </div>
            )}
            <div className="payment-balance">
              <span>Falta asignar</span>
              <strong>{currency(total.minus(paymentSum).toNumber())}</strong>
            </div>
            <button
              className="primary full"
              disabled={
                busy ||
                !paymentSum.eq(total) ||
                (payments.some((p) => p.method === "CUENTA_CORRIENTE") &&
                  !customer) ||
                (Boolean(received) && dec(received).lt(cashPayment))
              }
            >
              Confirmar cobro <CheckCircle2 size={18} />
            </button>
          </form>
        </Modal>
      )}
      {weight && (
        <Modal title={`Agregar ${weight.name}`} onClose={() => setWeight(null)}>
          <p>
            {currency(weight.price)} por kilo. El peso se guarda con precisión
            de un gramo.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              let amount = dec(weightValue);
              if (weightMode === "GRAMOS") amount = amount.div(1000);
              if (weightMode === "MONTO") amount = amount.div(weight.price);
              add(
                weight,
                amount.toDecimalPlaces(3, Decimal.ROUND_DOWN).toNumber(),
              );
              setWeight(null);
            }}
          >
            <Field label="Forma de venta">
              <select
                value={weightMode}
                onChange={(e) => setWeightMode(e.target.value)}
              >
                <option value="KG">Peso en kilos</option>
                <option value="GRAMOS">Peso en gramos</option>
                <option value="MONTO">Monto en pesos</option>
              </select>
            </Field>
            <Field
              label={weightMode === "MONTO" ? "Importe solicitado" : "Peso"}
            >
              <NumberInput
                min={weightMode === "KG" ? "0.001" : "0.01"}
                step={
                  weightMode === "KG"
                    ? "0.001"
                    : weightMode === "GRAMOS"
                      ? "1"
                      : "0.01"
                }
                value={weightValue}
                onValueChange={setWeightValue}
                autoFocus
              />
            </Field>
            {weightValue && (
              <div className="notice">
                {qty(
                  (weightMode === "MONTO"
                    ? dec(weightValue).div(weight.price)
                    : weightMode === "GRAMOS"
                      ? dec(weightValue).div(1000)
                      : dec(weightValue)
                  )
                    .toDecimalPlaces(3, Decimal.ROUND_DOWN)
                    .toNumber(),
                )}{" "}
                kg · importe calculado al agregar. Las ofertas por cantidad se
                aplican al total del carrito.
              </div>
            )}
            <button
              className="primary full"
              disabled={
                !weightValue ||
                (weightMode === "MONTO" &&
                  dec(weightValue).div(weight.price).lt(0.001))
              }
            >
              Agregar producto
            </button>
          </form>
        </Modal>
      )}
      {receipt && (
        <Receipt
          sale={receipt}
          onClose={() => {
            setReceipt(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
function WalletIcon() {
  return <ShoppingBasket size={18} />;
}
