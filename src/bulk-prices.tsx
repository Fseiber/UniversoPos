import { useState } from "react";
import { usePos } from "./context";
import { api, currency } from "./api";
import { Field, Modal } from "./components";
export function BulkPrices({ onClose }: { onClose: () => void }) {
  const { products, task, refresh, notify, busy } = usePos();
  const [preview, setPreview] = useState<any>(null);
  const [requestKey, setRequestKey] = useState("");
  return (
    <Modal title="Actualizar precios por lote" onClose={onClose}>
      {!preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void task(async () => {
              setPreview(
                await api("/price-changes/preview", "POST", {
                  category: f.get("category") || undefined,
                  percent: Number(f.get("percent")),
                  roundTo: Number(f.get("roundTo")),
                }),
              );
              setRequestKey(crypto.randomUUID());
            });
          }}
        >
          <Field label="Categoría">
            <select name="category">
              <option value="">Todo el catálogo activo</option>
              {[...new Set(products.map((p) => p.category))].sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Variación porcentual (negativo para bajar)">
            <input
              name="percent"
              type="number"
              required
              min={-99}
              max={1000}
              step="0.01"
              placeholder="Ej.: 10"
            />
          </Field>
          <Field label="Redondeo">
            <select name="roundTo">
              <option value="0">Conservar centavos</option>
              <option value="1">Al peso más cercano</option>
              <option value="10">A $10</option>
              <option value="100">A $100</option>
            </select>
          </Field>
          <p>
            Primero verás los precios y márgenes. Las ofertas por cantidad
            conservan sus precios propios.
          </p>
          <button className="primary full" disabled={busy}>
            Ver vista previa
          </button>
        </form>
      ) : (
        <>
          <p>
            {preview.rows.length} productos. Revisá los cambios antes de
            confirmar. El margen mostrado es bruto sobre precio de venta; sin
            costo queda pendiente.
          </p>
          <div className="table-scroll" style={{ maxHeight: "45vh" }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Anterior</th>
                  <th>Nuevo</th>
                  <th>Margen anterior / nuevo</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{currency(r.oldPrice)}</td>
                    <td>{currency(r.newPrice)}</td>
                    <td>
                      {r.oldMargin === null
                        ? "Sin costo"
                        : `${r.oldMargin}% / ${r.newMargin}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="button-row">
            <button disabled={busy} onClick={() => setPreview(null)}>
              Modificar selección
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  const result = await api("/price-changes/apply", "POST", {
                    token: preview.token,
                    requestKey,
                  });
                  await refresh();
                  notify(`${result.updated} precios actualizados`);
                  onClose();
                })
              }
            >
              Confirmar actualización
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
