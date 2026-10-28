import { useState } from "react";
import { Copy, Printer, Send } from "lucide-react";
import { api, currency, methodLabels, qty, when } from "./api";
import { usePos } from "./context";
import { Empty, Field, Modal, Stat } from "./components";
import { accountKind, accountStatementText } from "./account-summary";
import type { CustomerStatement } from "../shared/customer-statement";

export function CustomerHistory({
  initial,
  onClose,
}: {
  initial: CustomerStatement;
  onClose: () => void;
}) {
  const { task, notify, busy } = usePos();
  const [data, setData] = useState(initial),
    [from, setFrom] = useState(initial.from ?? ""),
    [to, setTo] = useState(initial.to ?? ""),
    [longMessage, setLongMessage] = useState(false);
  const text = accountStatementText(data),
    encoded = encodeURIComponent(text);
  const query = new URLSearchParams({
    ...(data.from ? { from: data.from } : {}),
    ...(data.to ? { to: data.to } : {}),
  }).toString();
  async function load(nextFrom: string, nextTo: string) {
    const q = new URLSearchParams({
      ...(nextFrom ? { from: nextFrom } : {}),
      ...(nextTo ? { to: nextTo } : {}),
    });
    setData(
      await api<CustomerStatement>(
        `/customers/${data.customer.id}/statement?${q}`,
      ),
    );
    setLongMessage(false);
  }
  return (
    <Modal
      title={`Compras y pagos · ${data.customer.name}`}
      onClose={onClose}
      wide
    >
      <form
        className="account-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void task(() => load(from, to));
        }}
      >
        <Field label="Compras desde">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button className="primary" disabled={busy}>
          Consultar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              setFrom("");
              setTo("");
              await load("", "");
            })
          }
        >
          Ver todo
        </button>
      </form>
      <div className="stats three account-stats">
        <Stat
          label="Límite de fiado"
          value={currency(data.customer.creditLimit)}
        />
        <Stat
          label="Disponible para comprar"
          value={currency(data.customer.available)}
        />
        <Stat
          label="Saldo actual a pagar"
          value={currency(data.customer.balance)}
          detail="Compras fiadas menos pagos y anulaciones"
        />
      </div>
      <div className="account-share button-row">
        <a
          className="button"
          target="_blank"
          rel="noreferrer"
          href={`/api/customers/${data.customer.id}/statement.pdf?${query}`}
        >
          <Printer size={17} /> Imprimir / PDF
        </a>
        <button
          onClick={() =>
            void task(async () => {
              await navigator.clipboard.writeText(text);
              notify("Resumen completo copiado");
            })
          }
        >
          <Copy size={17} /> Copiar resumen
        </button>
        {encoded.length <= 6000 ? (
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/?text=${encoded}`}
          >
            <Send size={17} /> Preparar WhatsApp
          </a>
        ) : (
          <button
            onClick={() =>
              void task(async () => {
                await navigator.clipboard.writeText(text);
                setLongMessage(true);
              })
            }
          >
            <Send size={17} /> Preparar WhatsApp
          </button>
        )}
      </div>
      <p className="muted account-help">
        El resumen incluye los resultados del período consultado. WhatsApp abre
        un mensaje preparado para que elijas el destinatario y confirmes el
        envío.
      </p>
      {longMessage && (
        <div className="notice amber">
          El historial es largo: se copió completo para que lo pegues, o podés
          consultar un período más corto.{" "}
          <a
            className="button"
            href="https://web.whatsapp.com"
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp
          </a>
        </div>
      )}
      <section className="account-section">
        <h3>Qué compró el cliente</h3>
        {data.purchases.length ? (
          data.purchases.map((s) => (
            <article className="account-purchase" key={s.id}>
              <div className="account-purchase-head">
                <div>
                  <strong>Compra #{s.id}</strong>
                  <small>{when(s.createdAt)}</small>
                </div>
                <span
                  className={`badge ${s.status === "ANULADA" ? "red" : s.status === "PENDIENTE" ? "amber" : "green"}`}
                >
                  {s.status}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio de venta</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.name}</td>
                        <td>
                          {qty(l.quantity)} {l.unit === "PESO" ? "kg" : "u."}
                        </td>
                        <td>{currency(l.unitPrice)}</td>
                        <td>{currency(l.total)}</td>
                      </tr>
                    ))}
                    {Number(s.quickAmount) > 0 && (
                      <tr>
                        <td colSpan={3}>
                          Venta rápida sin detalle de productos
                        </td>
                        <td>{currency(s.quickAmount)}</td>
                      </tr>
                    )}
                    {Number(s.surcharge) > 0 && (
                      <tr>
                        <td colSpan={3}>Recargo</td>
                        <td>{currency(s.surcharge)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="account-purchase-totals">
                <span>
                  Total de la compra: <b>{currency(s.total)}</b>
                </span>
                <span>
                  Parte fiada: <b>{currency(s.creditAmount)}</b>
                </span>
              </div>
              <div className="account-payment-methods">
                {s.payments.map((p, i) => (
                  <span key={i}>
                    {methodLabels[p.method] ?? p.method}: {currency(p.amount)}
                  </span>
                ))}
              </div>
              {s.voidReason && (
                <p className="notice amber">Anulada: {s.voidReason}</p>
              )}
            </article>
          ))
        ) : (
          <Empty
            title="Sin compras en el período"
            text="Elegí otras fechas o consultá todo el historial."
          />
        )}
      </section>
      <section className="account-section">
        <h3>Cómo se formó el saldo del fiado</h3>
        <p>
          Saldo al inicio del período: <b>{currency(data.openingBalance)}</b>
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th>Importe</th>
                <th>Saldo a pagar</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td>{when(m.createdAt)}</td>
                  <td>
                    {accountKind[m.kind] ?? m.kind}
                    {m.purchase && (
                      <small>
                        Compra #{m.purchase.id}
                        {!data.purchases.some((s) => s.id === m.purchase!.id) &&
                          ` · ${m.purchase.lines.map((l) => `${qty(l.quantity)} × ${l.name}`).join(", ")}`}
                      </small>
                    )}
                  </td>
                  <td
                    className={Number(m.amount) > 0 ? "negative" : "positive"}
                  >
                    {currency(m.amount)}
                  </td>
                  <td>{currency(m.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="list-row">
          <span>Saldo al cierre del período</span>
          <b>{currency(data.closingBalance)}</b>
        </div>
      </section>
      <p className="muted account-help">
        Emitido {when(data.generatedAt)}. Los pagos de deuda se aplican al saldo
        total de la cuenta; no se asignan a una compra individual. Las ventas
        rápidas solo conservan su importe.
      </p>
    </Modal>
  );
}
