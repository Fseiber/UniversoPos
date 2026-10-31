export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-POS-Request": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error ?? "No se pudo completar la operación",
      response.status,
      result.code,
    );
  return result;
}
export const currency = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
export const qty = (value: number | string) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(
    Number(value),
  );
export const when = (value: string) =>
  new Date(value).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
export type Employee = { id: number; name: string; role: string };
export type Product = {
  version: number;
  id: number;
  name: string;
  barcode: string | null;
  category: string;
  unit: string;
  cost: string | null;
  price: string;
  stock: string;
  minimum: string;
  rules: { id: number; minimum: string; unitPrice: string }[];
  offers: { cost: string; supplier: { name: string } }[];
};
export type Customer = {
  creditUnlimited: boolean;
  id: number;
  name: string;
  phone: string;
  creditLimit: string;
  balance: string;
};
export type Shift = {
  id: number;
  opening: string;
  expected: string;
  openedAt: string;
  employee: { name: string };
  movements: {
    id: number;
    amount: string;
    reason: string;
    createdAt: string;
  }[];
};
export const methodLabels: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  DEBITO: "Débito / Posnet",
  CUENTA_CORRIENTE: "Fiado",
};
