import { useState } from "react";
import Decimal from "decimal.js";
import { creditLimitText, availableCreditText } from "./customer-credit";
import { api, currency, type Customer } from "./api";
import { usePos } from "./context";
import { Field, Modal, NumberInput } from "./components";

export function CustomerPayment({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const { task, refresh, notify, busy } = usePos();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("EFECTIVO"),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState("FULL"),
    [amount, setAmount] = useState(customer.balance);
  const value = new Decimal(amount || 0),
    balance = new Decimal(customer.balance),
    remaining = balance.minus(value);
  const valid = value.gt(0) && value.lte(balance);
  return (
    <Modal title={`Registrar pago · ${customer.name}`} onClose={onClose}>
      <div className="account-credit-strip">
        <div>
          <small>Límite de fiado</small>
          <strong>{creditLimitText(customer)}</strong>
        </div>
        <div>
          <small>Disponible para comprar</small>
          <strong>{availableCreditText(customer)}</strong>
        </div>
      </div>
      <div className="payment-total">
        <small>SALDO QUE EL CLIENTE TIENE QUE PAGAR</small>
        <strong>{currency(customer.balance)}</strong>
      </div>
      <p>
        Elegí el medio y pago total o entrega parcial. Para pagos digitales,
        verificá primero la acreditación.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task(async () => {
            await api(`/customers/${customer.id}/payments`, "POST", {
              requestKey,
              amount,
              method,
              reference,
              confirmed,
            });
            onClose();
            await refresh();
            notify(`Pago de ${currency(amount)} registrado en cuenta y caja`);
          });
        }}
      >
        <Field label="Medio de pago">
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="MERCADO_PAGO">Mercado Pago</option>
            <option value="DEBITO">Débito / Posnet</option>
          </select>
        </Field>
        {method !== "EFECTIVO" && (
          <>
            <Field label="Referencia del comprobante">
              <input
                minLength={3}
                maxLength={120}
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              Verifiqué que el pago está acreditado
            </label>
          </>
        )}
        <Field label="Qué va a pagar">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setAmount(e.target.value === "FULL" ? customer.balance : "");
            }}
          >
            <option value="FULL">
              Pagar todo el saldo: {currency(customer.balance)}
            </option>
            <option value="PARTIAL">Entregar una parte del saldo</option>
          </select>
        </Field>
        {mode === "PARTIAL" && (
          <Field label="Efectivo que entrega el cliente">
            <NumberInput
              min="0.01"
              max={customer.balance}
              value={amount}
              onValueChange={setAmount}
              autoFocus
            />
          </Field>
        )}
        {valid && (
          <div className="account-after-payment">
            <strong>Después de registrar este pago</strong>
            <div>
              <span>Saldo que queda por pagar</span>
              <b>{currency(remaining.toString())}</b>
            </div>
            <div>
              <span>Disponible para comprar fiado</span>
              <b>{availableCreditText(customer, remaining.toString())}</b>
            </div>
          </div>
        )}
        <button className="primary full" disabled={busy || !valid}>
          Registrar pago de {currency(amount || 0)}
        </button>
      </form>
    </Modal>
  );
}
