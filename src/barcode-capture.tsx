import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { usePos } from "./context";
import { Field, Stat } from "./components";

type Item = {
  key: string;
  kind: "PRODUCT" | "IMPORTED";
  id: number;
  name: string;
  barcode: string | null;
  unit: string;
};
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function BarcodeCapture({ onBack }: { onBack: () => void }) {
  const { employee, refresh } = usePos();
  const storageKey = `universo-codigos-${employee.id}`;
  const [search, setSearch] = useState(
    () => localStorage.getItem(storageKey) ?? "",
  );
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [code, setCode] = useState("");
  const [missing, setMissing] = useState(true);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [replacement, setReplacement] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  async function load() {
    const result = await api<{ items: Item[] }>("/barcode-catalog");
    setItems(result.items);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    localStorage.setItem(storageKey, search);
  }, [search, storageKey]);
  const filtered = items.filter(
    (p) =>
      (!missing || !p.barcode) &&
      normalized(`${p.name} ${p.barcode ?? ""}`).includes(normalized(search)),
  );
  function select(item: Item) {
    setSelected(item);
    setCode("");
    setError("");
    setReplacement(false);
    requestAnimationFrame(() => codeRef.current?.focus());
  }
  async function save(confirm = false) {
    if (!selected || !code.trim() || saving.current) return;
    if (selected.barcode && selected.barcode !== code.trim() && !confirm) {
      setReplacement(true);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ barcode: string; name: string }>(
        "/barcodes",
        "POST",
        {
          kind: selected.kind,
          id: selected.id,
          barcode: code.trim(),
          expectedBarcode: selected.barcode,
          replaceExisting: confirm,
        },
      );
      setItems((current) =>
        current.map((p) =>
          p.key === selected.key ? { ...p, barcode: result.barcode } : p,
        ),
      );
      setMessage(`Guardado: ${result.name} · ${result.barcode}`);
      setSelected(null);
      setCode("");
      setReplacement(false);
      setSearch("");
      await refresh();
      requestAnimationFrame(() => searchRef.current?.focus());
    } catch (e) {
      setError((e as Error).message);
      codeRef.current?.select();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Carga rápida de códigos</h1>
          <p>Buscá el producto, escaneá y presioná Enter para guardar.</p>
        </div>
        <button onClick={onBack} disabled={busy}>
          Volver a Productos
        </button>
      </div>
      <div className="stats three">
        <Stat label="Productos" value={String(items.length)} />
        <Stat
          label="Con código"
          value={String(items.filter((p) => p.barcode).length)}
        />
        <Stat
          label="Sin código"
          value={String(items.filter((p) => !p.barcode).length)}
        />
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              load()
                .then(() => {
                  setSelected(null);
                  setError("");
                })
                .catch((e) => setError(e.message));
            }}
          >
            Actualizar lista
          </button>
        </p>
      )}
      <div className="barcode-workspace">
        <section className="panel barcode-picker">
          <div className="settings-body">
            <Field label="1. Buscar producto">
              <input
                autoFocus
                ref={searchRef}
                value={search}
                placeholder="Nombre o código de barras"
                disabled={busy}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length === 1) {
                    e.preventDefault();
                    select(filtered[0]);
                  }
                }}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={missing}
                disabled={busy}
                onChange={(e) => setMissing(e.target.checked)}
              />{" "}
              Mostrar solamente productos sin código
            </label>
            <p>{filtered.length} resultados. Elegí el producto de la lista.</p>
          </div>
          <div className="barcode-results">
            {filtered.slice(0, 60).map((p) => (
              <button
                type="button"
                className={
                  selected?.key === p.key
                    ? "barcode-row selected"
                    : "barcode-row"
                }
                key={p.key}
                disabled={busy}
                onClick={() => select(p)}
              >
                <strong>{p.name}</strong>
                <span>
                  {p.kind === "IMPORTED"
                    ? "Importado · pendiente de habilitar"
                    : "Catálogo activo"}{" "}
                  · {p.unit === "PESO" ? "Por kilo" : "Por unidad"}
                </span>
                <span>{p.barcode ?? "Sin código"}</span>
              </button>
            ))}
            {filtered.length > 60 && (
              <p>
                Se muestran 60 resultados. Escribí parte del nombre para acotar
                la búsqueda.
              </p>
            )}
          </div>
        </section>
        <section className="panel barcode-scanner">
          <div className="settings-body">
            <h2>2. Escanear código</h2>
            {selected ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <h2>{selected.name}</h2>
                <p>
                  {selected.kind === "IMPORTED"
                    ? "Importado pendiente: podés cargar el código ahora y completar precio y stock después."
                    : "Producto del catálogo activo."}
                </p>
                {selected.barcode && (
                  <p>
                    Código actual: <strong>{selected.barcode}</strong>
                  </p>
                )}
                <Field label="Código de barras">
                  <input
                    ref={codeRef}
                    value={code}
                    maxLength={80}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setReplacement(false);
                    }}
                  />
                </Field>
                <p>
                  Usá el lector o escribilo con el teclado. Los ceros iniciales
                  se conservan.
                </p>
                {replacement ? (
                  <div className="notice">
                    <p>
                      Vas a reemplazar {selected.barcode} por {code.trim()} en{" "}
                      {selected.name}.
                    </p>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => void save(true)}
                    >
                      Confirmar reemplazo
                    </button>
                    <button type="button" onClick={() => setReplacement(false)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className="primary" disabled={busy || !code.trim()}>
                    {busy ? "Guardando…" : "Guardar y continuar"}
                  </button>
                )}
              </form>
            ) : (
              <p>
                Seleccioná un producto de la izquierda para comenzar. Cada
                código se guarda inmediatamente; podés salir y continuar más
                tarde.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
