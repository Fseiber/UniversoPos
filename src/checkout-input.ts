export const initialPaymentMethod = (customerId: string) =>
  customerId ? "CUENTA_CORRIENTE" : "EFECTIVO";

export function quickAmountKey(value: string, key: string) {
  if (key === "clear") return "";
  if (key === "backspace") return value.slice(0, -1);
  if (key === ",") return value.includes(".") ? value : `${value || "0"}.`;
  if (!/^\d{1,2}$/.test(key)) return value;
  const next = value + key;
  if ((next.split(".")[1]?.length ?? 0) > 2) return value;
  return next.replace(/^0+(?=\d)/, "");
}
