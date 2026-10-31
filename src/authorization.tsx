import { useEffect, useState } from "react";
import { api, type Employee } from "./api";
import { Field } from "./components";
export function AuthorizationFields({
  onChange,
}: {
  onChange?: (value: any) => void;
}) {
  const [owners, setOwners] = useState<Employee[]>([]);
  const [value, setValue] = useState({ adminId: "", pin: "", reason: "" });
  useEffect(() => {
    void api("/bootstrap").then((r) =>
      setOwners(r.employees.filter((e: Employee) => e.role === "ADMIN")),
    );
  }, []);
  const update = (key: string, text: string) => {
    const next = { ...value, [key]: text };
    setValue(next);
    onChange?.(next);
  };
  return (
    <fieldset>
      <legend>Autorización del dueño (si supera el límite)</legend>
      <Field label="Dueño">
        <select
          name="approvalAdminId"
          value={value.adminId}
          onChange={(e) => update("adminId", e.target.value)}
        >
          <option value="">Seleccionar</option>
          {owners.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="PIN del dueño">
        <input
          name="approvalPin"
          type="password"
          autoComplete="off"
          value={value.pin}
          onChange={(e) => update("pin", e.target.value)}
        />
      </Field>
      <Field label="Motivo de autorización">
        <input
          name="approvalReason"
          maxLength={160}
          value={value.reason}
          onChange={(e) => update("reason", e.target.value)}
        />
      </Field>
    </fieldset>
  );
}
export function formApproval(data: Record<string, any>) {
  if (!data.approvalAdminId) return undefined;
  return {
    adminId: Number(data.approvalAdminId),
    pin: data.approvalPin,
    reason: data.approvalReason,
  };
}
