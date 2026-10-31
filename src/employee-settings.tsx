import { useEffect, useState } from "react";
import { api } from "./api";
import { usePos } from "./context";
import { Field, NumberInput } from "./components";
export function EmployeeSettings() {
  const { task, notify, busy } = usePos();
  const [values, setValues] = useState<any>(null);
  useEffect(() => {
    void api("/settings/employees").then(setValues);
  }, []);
  if (!values) return null;
  return (
    <section className="panel settings-body">
      <h2>Controles para empleados</h2>
      <p>
        Los dueños operan directamente. Para empleados, superar estos límites
        requiere PIN del dueño y motivo. Con cero, todo recargo o movimiento
        requiere autorización.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task(async () => {
            await api("/settings/employees", "PUT", values);
            notify("Límites de empleados guardados");
          });
        }}
      >
        <Field label="Recargo máximo sin autorización (%)">
          <NumberInput
            max="100"
            value={values.employeeSurchargeLimit}
            onValueChange={(v) =>
              setValues({ ...values, employeeSurchargeLimit: v })
            }
          />
        </Field>
        <Field label="Movimiento / retiro máximo sin autorización ($)">
          <NumberInput
            value={values.employeeMovementLimit}
            onValueChange={(v) =>
              setValues({ ...values, employeeMovementLimit: v })
            }
          />
        </Field>
        <button disabled={busy} className="primary">
          Guardar límites
        </button>
      </form>
    </section>
  );
}
