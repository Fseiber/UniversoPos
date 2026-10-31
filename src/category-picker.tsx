import { useState } from "react";
import { usePos } from "./context";
import { commerceCategories } from "../shared/product-category";

const defaults = [
  "General",
  "Almacén",
  "Bebidas",
  "Golosinas",
  "Lácteos",
  "Fiambres",
  "Panadería",
  "Limpieza",
  "Perfumería",
  "Mascotas",
  "Congelados",
  "Cigarrillos",
  "Otros",
];
export function CategoryPicker({
  defaultValue = "General",
}: {
  defaultValue?: string;
}) {
  const { products } = usePos();
  const [selected, setSelected] = useState(defaultValue);
  const categories = [
    ...new Set([
      ...commerceCategories,
      ...defaults,
      ...products.map((p) => p.category),
      defaultValue,
    ]),
  ];
  return (
    <>
      <select
        aria-label="Elegir categoría"
        name={selected === "__custom__" ? undefined : "category"}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__custom__">Otra categoría…</option>
      </select>
      {selected === "__custom__" && (
        <input
          name="category"
          aria-label="Nombre de la nueva categoría"
          placeholder="Nombre de la categoría"
          required
          maxLength={60}
          autoFocus
        />
      )}
    </>
  );
}
