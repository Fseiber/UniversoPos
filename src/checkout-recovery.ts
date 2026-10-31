import { api, ApiError } from "./api";
export async function registerCheckout(
  payload: any,
  approval?: unknown,
  request: typeof api = api,
) {
  try {
    return await request("/sales", "POST", { ...payload, approval });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500 && error.status !== 409)
      throw error;
    try {
      return await request(`/sales/by-request/${payload.requestKey}`);
    } catch (lookupError) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        lookupError instanceof ApiError &&
        lookupError.status === 404
      )
        throw error;
      throw new Error(
        "Resultado pendiente de verificar. Conservamos la operación: usá Verificar / reintentar. No la cobres de nuevo ni armes otra venta igual.",
      );
    }
  }
}
