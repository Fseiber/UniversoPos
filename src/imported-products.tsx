import { useEffect, useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { api, currency } from "./api";
import { usePos } from "./context";
import { Field, Modal, NumberInput } from "./components";
import { CategoryPicker } from "./category-picker";

type Imported = {
  barcode: string | null;
  id: number;
  name: string;
  unit: "UNIDAD" | "PESO";
  referencePrice: string;
  sourceRow: number;
  batch: { sourceName: string; sheetName: string };
};
type ImportList = { items: Imported[]; total: number; reviewed: number };

export function ImportedProducts() {
  const { version, task, refresh, notify, busy } = usePos();
  const [data, setData] = useState<ImportList | null>(null),
    [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<Imported | null>(null);
  useEffect(() => {
    let active = true;
    void api<ImportList>("/imported-products")
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  if (error)
    return (
      <div className="notice error" role="alert">
        No se pudieron consultar los productos importados: {error}. Si acabás de
        actualizar la aplicación, reiniciá el servidor.
      </div>
    );
  if (!data?.total) return null;
  const filtered = data.items.filter((p) =>
    p.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 10) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * 10, (currentPage + 1) * 10);
  return (
    <section className="panel">
      <div className="panel-toolbar">
        <h2>
          <FileSpreadsheet size={19} /> Importados por revisar{" "}
          <span className="badge amber">{data.items.length}</span>
        </h2>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "Ocultar lista" : "Revisar productos"}
        </button>
      </div>
      <div className="settings-body">
        <p style={{ marginBottom: 0 }}>
          Estos productos todavía no están habilitados para vender. El precio
          del Excel es anterior y solo sirve como referencia. Completá el precio
          de venta y el stock antes de habilitarlos. El costo de compra es
          opcional y puede completarse después.{" "}
          <strong>
            {data.reviewed} de {data.total} revisados.
          </strong>
        </p>
      </div>
      {expanded && (
        <>
          <div className="panel-toolbar">
            <div className="search-box compact">
              <Search size={18} />
              <input
                aria-label="Buscar entre los productos importados"
                placeholder="Buscar un producto del Excel…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <span className="muted">{filtered.length} pendientes</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto del Excel</th>
                  <th>Unidad</th>
                  <th>Precio anterior</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>
                        {p.batch.sheetName} · fila {p.sourceRow}
                      </small>
                    </td>
                    <td>{p.unit === "PESO" ? "Por kilo" : "Por unidad"}</td>
                    <td>
                      {currency(p.referencePrice)}
                      <small>Sin actualizar</small>
                    </td>
                    <td>
                      <span className="badge amber">Por revisar</span>
                    </td>
                    <td>
                      <button disabled={busy} onClick={() => setSelected(p)}>
                        Actualizar y habilitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="settings-body muted">
              {data.items.length
                ? "No hay coincidencias con esa búsqueda."
                : "Todos los productos importados fueron revisados."}
            </p>
          )}
          <div className="panel-toolbar">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              Página {currentPage + 1} de {lastPage + 1}
            </span>
            <button
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
      {selected && (
        <Modal
          title={`Revisar ${selected.name}`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="notice amber">
            Precio anterior del Excel: {currency(selected.referencePrice)} por{" "}
            {selected.unit === "PESO" ? "kilo" : "unidad"}. No se usa como
            precio de venta hasta que confirmes uno actual.
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api(
                  `/imported-products/${selected.id}/activate`,
                  "POST",
                  input,
                );
                setSelected(null);
                await refresh();
                notify(
                  "Producto habilitado con precio actualizado y stock registrado",
                );
              });
            }}
          >
            <div className="form-grid">
              <Field label="Nombre del producto">
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={selected.name}
                />
              </Field>
              <Field label="Código de barras (si tiene)">
                <input
                  name="barcode"
                  maxLength={80}
                  defaultValue={selected.barcode ?? ""}
                />
              </Field>
              <Field label="Categoría">
                <CategoryPicker />
              </Field>
              <Field label="Precio de venta al cliente (por unidad / kilo)">
                <NumberInput
                  name="price"
                  min="0.01"
                  placeholder="Ingresá el precio vigente"
                  autoFocus
                />
              </Field>
              <Field label="Costo de compra (opcional, por unidad / kilo)">
                <NumberInput
                  name="cost"
                  placeholder="Podés completarlo después"
                  required={false}
                />
              </Field>
              <Field
                label={`Stock inicial (${selected.unit === "PESO" ? "kilos" : "unidades"})`}
              >
                <NumberInput
                  name="stock"
                  step={selected.unit === "PESO" ? "0.001" : "1"}
                  placeholder={
                    selected.unit === "PESO" ? "Ej. 4,750" : "Ej. 12"
                  }
                />
              </Field>
              <Field label="Stock mínimo">
                <NumberInput
                  name="minimum"
                  step={selected.unit === "PESO" ? "0.001" : "1"}
                  defaultValue="0"
                />
              </Field>
            </div>
            <p className="muted">
              {selected.batch.sourceName} · {selected.batch.sheetName} · fila{" "}
              {selected.sourceRow}. La unidad se conserva según el Excel:{" "}
              {selected.unit === "PESO" ? "kilos" : "unidades"}.
            </p>
            <button className="primary full" disabled={busy}>
              Guardar y habilitar para vender
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
