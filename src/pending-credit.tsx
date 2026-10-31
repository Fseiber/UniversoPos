import { useState } from "react";
import Decimal from "decimal.js";
import { api, currency } from "./api";
import { usePos } from "./context";
import { Field, Modal } from "./components";
import { creditLimitText } from "./customer-credit";

export function PendingCredit({
  sale,
  onClose,
}: {
  sale: any;
  onClose: () => void;
}) {
  const { customers, busy, task, refresh, notify } = usePos();
  const [customerId, setCustomerId] = useState(() => {
    if (sale.customerId) return String(sale.customerId);
    const matches = customers.filter(
      (c) =>
        c.name.trim().toLocaleLowerCase("es-AR") ===
        (sale.pendingName ?? "").trim().toLocaleLowerCase("es-AR"),
    );
    return matches.length === 1 ? String(matches[0].id) : "";
  });
  const customer = customers.find((c) => String(c.id) === customerId);
  const balance = customer
    ? new Decimal(customer.balance).plus(sale.total)
    : null;
  const exceedsLimit = Boolean(
    customer && !customer.creditUnlimited && balance!.gt(customer.creditLimit),
  );
  return (
    <Modal title={`Pasar a fiado · Venta #${sale.id}`} onClose={onClose}>
      <div className="payment-total">
        <small>{sale.customer?.name ?? sale.pendingName}</small>
        <strong>{currency(sale.total)}</strong>
      </div>
      <p>
        El total se anotará como deuda del cliente en Clientes y fiados. La
        venta dejará de estar pendiente, sin registrar ingreso de dinero ni
        volver a descontar stock.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!customer || exceedsLimit) return;
          void task(async () => {
            await api(`/sales/${sale.id}/settle`, "POST", {
              customerId: customer.id,
              payments: [
                { method: "CUENTA_CORRIENTE", amount: Number(sale.total) },
              ],
            });
            onClose();
            await refresh();
            notify(`Venta anotada en el fiado de ${customer.name}`);
          });
        }}
      >
        <Field label="Anotar en la cuenta de">
          <select
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Elegí un cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {!customers.length && (
          <p>Primero creá la cuenta del cliente en Clientes y fiados.</p>
        )}
        {customer && (
          <div className="notice pending-credit-summary">
            <p>
              Deuda actual: <strong>{currency(customer.balance)}</strong>
            </p>
            <p>
              Deuda después de esta venta:{" "}
              <strong>{currency(balance!.toString())}</strong>
            </p>
            <p>
              Límite de fiado: <strong>{creditLimitText(customer)}</strong>
            </p>
          </div>
        )}
        {exceedsLimit && (
          <p className="notice error" role="alert">
            Esta venta supera el límite de fiado. Revisá el límite en Clientes y
            fiados antes de continuar.
          </p>
        )}
        <button
          className="primary full"
          disabled={busy || !customer || exceedsLimit}
        >
          Confirmar fiado
        </button>
      </form>
    </Modal>
  );
}
