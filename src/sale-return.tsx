import { useState } from "react";
import { api, currency, qty, methodLabels, when } from "./api";
import { usePos } from "./context";
import { Modal, Field, NumberInput } from "./components";
export function ReturnReceipt({
  returned,
  onClose,
}: {
  returned: any;
  onClose: () => void;
}) {
  return (
    <Modal title={`Devolución #${returned.id}`} onClose={onClose}>
      <div className="receipt print-scope">
        <h2>EL UNIVERSO · Devolución</h2>
        <p>
          Venta original #{returned.saleId} · {when(returned.createdAt)}
        </p>
        {JSON.parse(returned.lineDetails).map((r: any) => (
          <p key={r.lineId}>
            {qty(r.quantity)} × {r.name} · {currency(r.amount)}
          </p>
        ))}
        <h2>Total: {currency(returned.amount)}</h2>
        <p>
          {methodLabels[returned.method]} · {returned.reason}
        </p>
        <p>Comprobante interno. No válido como factura fiscal.</p>
      </div>
      <div className="button-row no-print">
        <button onClick={() => window.print()}>Imprimir / PDF</button>
        <button onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
export function SaleReturn({
  sale,
  onClose,
}: {
  sale: any;
  onClose: () => void;
}) {
  const { task, busy, refresh, notify } = usePos();
  const [preview, setPreview] = useState<any>(null),
    [items, setItems] = useState<any[]>([]),
    [admins, setAdmins] = useState<any[]>([]),
    [key, setKey] = useState("");
  const [completed, setCompleted] = useState<any>(null);
  if (completed)
    return <ReturnReceipt returned={completed} onClose={onClose} />;

  return (
    <Modal title={`Devolver productos · venta #${sale.id}`} onClose={onClose}>
      {!preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const selected = sale.lines
              .map((l: any) => ({
                lineId: l.id,
                quantity: Number(form.get(String(l.id))),
              }))
              .filter((l: any) => l.quantity > 0);
            void task(async () => {
              setPreview(
                await api(`/sales/${sale.id}/return-preview`, "POST", {
                  items: selected,
                }),
              );
              setItems(selected);
              setKey(crypto.randomUUID());
              setAdmins(
                (await api("/bootstrap")).employees.filter(
                  (e: any) => e.role === "ADMIN",
                ),
              );
            });
          }}
        >
          <p>
            Elegí las cantidades. Se consideran devoluciones anteriores y el
            recargo original.
          </p>
          {sale.lines.map((line: any) => (
            <Field
              key={line.id}
              label={`${line.name} · venta original ${qty(line.quantity)}`}
            >
              <NumberInput
                name={String(line.id)}
                defaultValue="0"
                min={0}
                max={Number(line.quantity)}
                step="0.001"
              />
            </Field>
          ))}
          <button className="primary full" disabled={busy}>
            Calcular devolución
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void task(async () => {
              const r = await api(`/sales/${sale.id}/returns`, "POST", {
                items,
                requestKey: key,
                expectedAmount: String(preview.amount),
                method: f.get("method"),
                reason: f.get("reason"),
                restock: f.get("restock") === "on",
                externalConfirmed: f.get("externalConfirmed") === "on",
                adminId: Number(f.get("adminId")),
                pin: f.get("pin"),
              });
              await refresh();
              notify(`Devolución #${r.id} registrada: ${currency(r.amount)}`);
              setCompleted(r);
            });
          }}
        >
          <div className="payment-total">
            <small>Importe a devolver</small>
            <strong>{currency(preview.amount)}</strong>
          </div>
          {preview.rows.map((r: any) => (
            <p key={r.lineId}>
              {qty(r.quantity)} × {r.name}: {currency(r.amount)}
            </p>
          ))}
          <Field label="Reintegro">
            <select name="method">
              {Object.entries(methodLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <label>
            <input name="restock" type="checkbox" defaultChecked /> Mercadería
            apta para vender (reponer stock si la venta original lo descontó)
          </label>
          {!preview.stockTracked && (
            <p>
              La venta original fue sin stock: esta devolución no modifica
              existencias.
            </p>
          )}
          <label>
            <input name="externalConfirmed" type="checkbox" /> Si elegí un medio
            digital, ya realicé el reintegro por fuera del sistema.
          </label>
          <Field label="Motivo">
            <input name="reason" required minLength={5} maxLength={160} />
          </Field>
          <Field label="Administrador">
            <select name="adminId">
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PIN de autorización">
            <input name="pin" type="password" pattern="[0-9]{4,8}" required />
          </Field>
          <div className="button-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Volver
            </button>
            <button className="primary" disabled={busy}>
              Confirmar devolución
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
