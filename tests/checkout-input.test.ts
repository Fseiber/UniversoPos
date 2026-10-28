import test from "node:test";
import assert from "node:assert/strict";
import { initialPaymentMethod, quickAmountKey } from "../src/checkout-input.js";

test("Mostrador · cliente seleccionado propone fiado y consumidor final efectivo", () => {
  assert.equal(initialPaymentMethod("12"), "CUENTA_CORRIENTE");
  assert.equal(initialPaymentMethod(""), "EFECTIVO");
});
test("Venta rápida · teclado en pantalla, centavos, borrar y teclado físico comparten valor", () => {
  let value = "";
  for (const key of ["5", "0", "00", ",", "5", "0"])
    value = quickAmountKey(value, key);
  assert.equal(value, "5000.50");
  assert.equal(quickAmountKey(value, "9"), "5000.50");
  assert.equal(quickAmountKey(value, ","), value);
  assert.equal(quickAmountKey(value, "backspace"), "5000.5");
  assert.equal(quickAmountKey(value, "clear"), "");
  assert.equal(quickAmountKey("", ","), "0.");
  assert.equal(quickAmountKey("1250", "00"), "125000");
});
