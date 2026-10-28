import Decimal from "decimal.js";

/** Formato visible argentino; el valor interno usa punto decimal y nunca miles. */
export function formatNumericInput(value: string) {
  if (!value || value === "-") return value;
  const negative = value.startsWith("-");
  const [integer, fraction] = value.replace(/^-/, "").split(".");
  const grouped = (integer || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `,${fraction}`}`;
}

export function parseNumericInput(
  text: string,
  allowNegative = false,
): string | null {
  const clean = text.replace(/[\s$]/g, "").replace(/\./g, "");
  if (
    !/^-?\d*(,\d*)?$/.test(clean) ||
    (!allowNegative && clean.startsWith("-"))
  )
    return null;
  if (clean === "" || clean === "-") return clean;
  const negative = clean.startsWith("-");
  const [integer, fraction] = clean.replace(/^-/, "").split(",");
  const normalized = (integer || "0").replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${normalized}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function numericInputError(
  value: string,
  min: string | number,
  max?: string | number,
  step: string | number = "0.01",
) {
  if (value === "") return ""; // required se valida en el input visible.
  if (value === "-") return "Completá el número.";
  const number = new Decimal(value);
  if (number.lt(min)) return `El mínimo es ${formatNumericInput(String(min))}.`;
  if (max !== undefined && number.gt(max))
    return `El máximo es ${formatNumericInput(String(max))}.`;
  if (step !== "any" && !number.div(step).isInteger()) {
    const places = new Decimal(step).decimalPlaces();
    return places
      ? `Ingresá hasta ${places} decimales, separados con coma.`
      : "Ingresá un número entero.";
  }
  return "";
}

/** Mantiene la posición de edición aunque se agreguen o quiten puntos. */
export function numericInputEdit(
  text: string,
  caret: number,
  previous: string,
  inputType: string,
  allowNegative: boolean,
) {
  const oldDisplay = formatNumericInput(previous);
  let canonical = parseNumericInput(text, allowNegative);
  if (canonical === null) return null;
  if (canonical === previous && oldDisplay.length === text.length + 1) {
    // Borrar junto a un separador debe borrar un dígito, no reinsertar el punto.
    if (inputType === "deleteContentBackward" && caret > 0) {
      text = text.slice(0, caret - 1) + text.slice(caret);
      caret--;
    } else if (inputType === "deleteContentForward") {
      text = text.slice(0, caret) + text.slice(caret + 1);
    }
    canonical = parseNumericInput(text, allowNegative);
    if (canonical === null) return null;
  }
  const semanticLeft =
    text.slice(0, caret).replace(/[.\s$]/g, "").length +
    (/^-?,/.test(text.replace(/[\s$]/g, "")) ? 1 : 0);
  const display = formatNumericInput(canonical);
  if (caret >= text.length) return { canonical, caret: display.length };
  let position = 0,
    count = 0;
  while (position < display.length && count < semanticLeft) {
    if (display[position] !== ".") count++;
    position++;
  }
  return { canonical, caret: position };
}
