import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NumberInput } from "../src/components.js";
import {
  formatNumericInput,
  numericInputEdit,
  numericInputError,
  parseNumericInput,
} from "../src/numeric-input.js";

test("Importes · formato argentino sin cambiar el valor ni perder centavos", () => {
  assert.equal(formatNumericInput("5000"), "5.000");
  assert.equal(formatNumericInput("5000000.50"), "5.000.000,50");
  assert.equal(formatNumericInput("-12500.125"), "-12.500,125");
  assert.equal(formatNumericInput("0."), "0,");
  assert.equal(parseNumericInput("5.000,50"), "5000.50");
  assert.equal(parseNumericInput("$ 1.250.000,05"), "1250000.05");
  assert.equal(parseNumericInput("-12.500,125", true), "-12500.125");
  assert.equal(parseNumericInput("-5000"), null);
  assert.equal(parseNumericInput("5,00,00"), null);
  assert.equal(parseNumericInput("0005000"), "5000");
});

test("Importes · edición y borrado junto al separador de miles", () => {
  assert.deepEqual(numericInputEdit("5000", 4, "500", "insertText", false), {
    canonical: "5000",
    caret: 5,
  });
  assert.deepEqual(numericInputEdit("5.0000", 6, "5000", "insertText", false), {
    canonical: "50000",
    caret: 6,
  });
  assert.deepEqual(
    numericInputEdit("1234", 1, "1234", "deleteContentBackward", false),
    { canonical: "234", caret: 0 },
  );
  assert.deepEqual(
    numericInputEdit("1234", 1, "1234", "deleteContentForward", false),
    { canonical: "134", caret: 1 },
  );
  assert.deepEqual(numericInputEdit(",", 1, "", "insertText", false), {
    canonical: "0.",
    caret: 2,
  });
  assert.deepEqual(numericInputEdit("15.234", 2, "1234", "insertText", false), {
    canonical: "15234",
    caret: 2,
  });
});

test("Importes · conserva mínimos, máximos y precisión de dinero y granel", () => {
  assert.equal(numericInputError("5000.50", "0.01"), "");
  assert.match(numericInputError("0", "0.01"), /mínimo/);
  assert.match(numericInputError("5001", "0", "5000"), /máximo/);
  assert.match(numericInputError("1.001", "0"), /2 decimales/);
  assert.equal(numericInputError("1.001", "0", undefined, "0.001"), "");
  assert.equal(numericInputError("-12.125", "-1000", undefined, "0.001"), "");
  assert.match(numericInputError("1.5", "0", undefined, "1"), /entero/);
  assert.match(numericInputError("-", "-1000"), /Completá/);
});

test("Importes · el formulario envía 5000.50 aunque el campo muestre 5.000,50", () => {
  const html = renderToStaticMarkup(
    createElement(NumberInput, { name: "amount", defaultValue: "5000.50" }),
  );
  assert.match(html, /type="text"[^>]*value="5\.000,50"/);
  assert.match(html, /type="hidden"[^>]*name="amount"[^>]*value="5000\.50"/);
  assert.equal((html.match(/name="amount"/g) ?? []).length, 1);
});
