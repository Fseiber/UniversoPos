import test from "node:test";
import assert from "node:assert/strict";
import { registerCheckout } from "../src/checkout-recovery.js";
import { ApiError, type api } from "../src/api.js";
test("Cobro · respuesta perdida recupera venta registrada y conserva un resultado desconocido", async () => {
  const payload = {
    requestKey: "misma-clave",
    quickAmount: 100,
    payments: [{ amount: 100, method: "EFECTIVO" }],
  };
  let calls: string[] = [];
  const lostReply = (async (url: string) => {
    calls.push(url);
    if (url === "/sales") throw new TypeError("Network error");
    return { id: 42, requestKey: payload.requestKey };
  }) as typeof api;
  assert.equal((await registerCheckout(payload, undefined, lostReply)).id, 42);
  assert.deepEqual(calls, ["/sales", "/sales/by-request/misma-clave"]);
  const unknown = (async (url: string) => {
    if (url === "/sales") throw new TypeError("Disconnected");
    throw new ApiError("No figura", 404);
  }) as typeof api;
  await assert.rejects(
    registerCheckout(payload, undefined, unknown),
    /Resultado pendiente/,
  );
  const priceChanged = (async (url: string) => {
    throw new ApiError(
      url === "/sales" ? "Modo cambió" : "No figura",
      url === "/sales" ? 409 : 404,
    );
  }) as typeof api;
  await assert.rejects(
    registerCheckout(payload, undefined, priceChanged),
    (error) => error instanceof ApiError && error.status === 409,
  );
  const expiredSession = (async () => {
    throw new ApiError("Sesión vencida", 401);
  }) as typeof api;
  await assert.rejects(
    registerCheckout(payload, undefined, expiredSession),
    (error) => error instanceof ApiError && error.status === 401,
  );
});
