import { useEffect, useState } from "react";
import { api, when } from "./api";
import { usePos } from "./context";
import { Field, NumberInput } from "./components";
export function CustomerReminders({ customerId }: { customerId: number }) {
  const { task, busy } = usePos();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [expanded, setExpanded] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void api(`/customers/${customerId}/reminders`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [customerId, revision]);
  if (error)
    return (
      <p className="notice error">
        No se pudieron consultar los recordatorios: {error}
      </p>
    );
  return (
    <section className="customer-reminders">
      <button type="button" onClick={() => setExpanded(!expanded)}>
        Notas{" "}
        {data
          ? `· ${data.notes.length} notas · ${data.balances.reduce((s: number, b: any) => s + b.quantity, 0)} envases pendientes`
          : ""}
      </button>
      {data?.notes.map((n: any) => (
        <div className="notice amber" key={n.id}>
          <strong>{n.title}</strong>
          <span>{n.body}</span>
          {n.dueAt && <small>{when(n.dueAt)}</small>}
        </div>
      ))}
      {data?.balances
        .filter((b: any) => b.quantity > 0)
        .map((b: any) => (
          <p key={b.kind}>
            <strong>
              Debe {b.quantity} envases: {b.kind}
            </strong>
          </p>
        ))}
      {expanded && data && (
        <>
          <p>
            Envases prestados: aumenta lo que debe. Envases entregados:
            descuenta el saldo, sin cobrar dinero.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void task(async () => {
                await api(`/customers/${customerId}/containers`, "POST", {
                  requestKey: key,
                  kind: f.get("kind"),
                  quantity:
                    Number(f.get("quantity")) *
                    (f.get("action") === "return" ? -1 : 1),
                  reason: f.get("reason"),
                });
                setKey(crypto.randomUUID());
                setRevision((r) => r + 1);
              });
            }}
          >
            <Field label="Tipo de envase">
              <input
                name="kind"
                required
                minLength={2}
                maxLength={60}
                placeholder="Ej.: botella retornable 1 L"
              />
            </Field>
            <Field label="Movimiento">
              <select name="action">
                <option value="loan">Se lleva envases prestados</option>
                <option value="return">Entrega envases</option>
              </select>
            </Field>
            <Field label="Cantidad">
              <NumberInput
                name="quantity"
                defaultValue="1"
                min={1}
                max={10000}
                step="1"
              />
            </Field>
            <Field label="Detalle">
              <input name="reason" required minLength={3} maxLength={160} />
            </Field>
            <button className="primary" disabled={busy}>
              Registrar envases
            </button>
          </form>
          <details>
            <summary>Últimos movimientos</summary>
            {data.movements.map((m: any) => (
              <p key={m.id}>
                {when(m.createdAt)} · {m.quantity > 0 ? "+" : ""}
                {m.quantity} {m.kind} · {m.reason}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
