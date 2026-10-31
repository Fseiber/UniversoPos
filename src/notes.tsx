import { useEffect, useState } from "react";
import { api, when } from "./api";
import { usePos } from "./context";
import { Field, Modal, Empty } from "./components";
type Note = {
  id: number;
  title: string;
  body: string;
  resolved: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  author: { name: string };
  customerId: number | null;
  customer: { name: string } | null;
  dueAt: string | null;
  productId: number | null;
  supplierId: number | null;
  product: { name: string } | null;
  supplier: { name: string } | null;
};
export function Notes() {
  const { task, busy, notify, customers, products } = usePos();
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>(
    [],
  );
  useEffect(() => {
    void api("/notes/lookups")
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => {});
  }, []);
  const [items, setItems] = useState<Note[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [state, setState] = useState("all"),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const params = (before?: number) =>
    new URLSearchParams({
      q: search,
      state,
      ...(before ? { before: String(before) } : {}),
    });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api<{ items: Note[]; nextCursor: number | null }>(
      `/notes?${new URLSearchParams({ q: search, state })}`,
    )
      .then((r) => {
        if (active) {
          setItems(r.items);
          setCursor(r.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, state, revision]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notas del comercio</h1>
          <p>
            Envases, visitas de preventistas y cualquier detalle que quieras
            recordar.
          </p>
        </div>
        <button className="primary" onClick={() => setEditing("new")}>
          Nueva nota
        </button>
      </div>
      <section className="panel">
        <form
          className="panel-toolbar notes-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <input
            aria-label="Buscar notas"
            placeholder="Buscar en título o detalle…"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button>Buscar</button>
          <select
            aria-label="Estado de las notas"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="open">Pendientes</option>
            <option value="resolved">Resueltas</option>
          </select>
          <button type="button" onClick={() => setRevision((r) => r + 1)}>
            Actualizar
          </button>
        </form>
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="settings-body">Cargando notas…</p>
        ) : !items.length ? (
          <Empty
            title="No hay notas para mostrar"
            text="Podés escribir una nueva nota o cambiar la búsqueda."
          />
        ) : (
          <div className="notes-grid">
            {items.map((note) => (
              <article className="note-card" key={note.id}>
                <div className="panel-toolbar">
                  <h2>{note.title}</h2>
                  <span
                    className={`badge ${note.resolved ? "green" : "amber"}`}
                  >
                    {note.resolved ? "Resuelta" : "Pendiente"}
                  </span>
                </div>
                <p className="note-body">{note.body}</p>
                {note.customer && (
                  <p>
                    Cliente: <strong>{note.customer.name}</strong>
                  </p>
                )}
                {note.product && (
                  <p>
                    Producto: <strong>{note.product.name}</strong>
                  </p>
                )}
                {note.supplier && (
                  <p>
                    Proveedor: <strong>{note.supplier.name}</strong>
                  </p>
                )}
                {note.dueAt && (
                  <p
                    className={
                      Date.parse(note.dueAt) < Date.now() && !note.resolved
                        ? "notice amber"
                        : ""
                    }
                  >
                    Recordar: {when(note.dueAt)}
                  </p>
                )}
                <small>
                  Creada: {when(note.createdAt)} · {note.author.name}
                </small>
                {note.version > 0 && (
                  <small>Actualizada: {when(note.updatedAt)}</small>
                )}
                <div className="button-row">
                  <button disabled={busy} onClick={() => setEditing(note)}>
                    Editar
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        await api(`/notes/${note.id}`, "PATCH", {
                          resolved: !note.resolved,
                          expectedVersion: note.version,
                        });
                        setRevision((r) => r + 1);
                        notify(
                          note.resolved
                            ? "Nota pendiente"
                            : "Nota marcada como resuelta",
                        );
                      })
                    }
                  >
                    {note.resolved ? "Volver a pendiente" : "Marcar resuelta"}
                  </button>
                  {note.resolved && (
                    <button
                      className="danger subtle"
                      disabled={busy}
                      onClick={() => setDeleting(note)}
                    >
                      Eliminar nota
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {cursor && !loading && !error && (
          <div className="settings-body">
            <button
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  const r = await api<{
                    items: Note[];
                    nextCursor: number | null;
                  }>(`/notes?${params(cursor)}`);
                  setItems((old) => [...old, ...r.items]);
                  setCursor(r.nextCursor);
                })
              }
            >
              Cargar más notas
            </button>
          </div>
        )}
      </section>
      {deleting && (
        <Modal title="Eliminar nota resuelta" onClose={() => setDeleting(null)}>
          <p>
            Se eliminará «{deleting.title}» de las notas. Su contenido completo
            y la eliminación quedan registrados en Auditoría.
          </p>
          <div className="button-row">
            <button onClick={() => setDeleting(null)}>Cancelar</button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await api(`/notes/${deleting.id}`, "DELETE", {
                    expectedVersion: deleting.version,
                  });
                  setDeleting(null);
                  setRevision((r) => r + 1);
                  notify("Nota eliminada; registro conservado en Auditoría");
                })
              }
            >
              Confirmar eliminación
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Nueva nota" : "Editar nota"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void task(async () => {
                const values = {
                  customerId: form.get("customerId")
                    ? Number(form.get("customerId"))
                    : null,
                  productId: form.get("productId")
                    ? Number(form.get("productId"))
                    : null,
                  supplierId: form.get("supplierId")
                    ? Number(form.get("supplierId"))
                    : null,
                  dueAt: form.get("dueAt")
                    ? new Date(String(form.get("dueAt"))).toISOString()
                    : null,
                  title: String(form.get("title")),
                  body: String(form.get("body")),
                };
                if (editing === "new") await api("/notes", "POST", values);
                else
                  await api(`/notes/${editing.id}`, "PATCH", {
                    ...values,
                    expectedVersion: editing.version,
                  });
                setEditing(null);
                setRevision((r) => r + 1);
                notify("Nota guardada");
              });
            }}
          >
            <Field label="Título">
              <input
                name="title"
                required
                maxLength={120}
                autoFocus
                defaultValue={editing === "new" ? "" : editing.title}
                placeholder="Ej.: Romero debe un envase"
              />
            </Field>
            <Field label="Detalle">
              <textarea
                name="body"
                required
                maxLength={6000}
                rows={7}
                defaultValue={editing === "new" ? "" : editing.body}
                placeholder="Escribí los detalles que necesites recordar…"
              />
            </Field>
            <Field label="Vincular a cliente (opcional)">
              <select
                name="customerId"
                defaultValue={
                  editing === "new" ? "" : (editing.customerId ?? "")
                }
              >
                <option value="">Nota general</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de recordatorio (opcional)">
              <input
                type="datetime-local"
                name="dueAt"
                defaultValue={
                  editing === "new" || !editing.dueAt
                    ? ""
                    : new Date(
                        Date.parse(editing.dueAt) -
                          new Date(editing.dueAt).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                }
              />
            </Field>
            <Field label="Producto (opcional)">
              <select
                name="productId"
                defaultValue={
                  editing === "new" ? "" : (editing.productId ?? "")
                }
              >
                <option value="">Sin producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Proveedor (opcional)">
              <select
                name="supplierId"
                defaultValue={
                  editing === "new" ? "" : (editing.supplierId ?? "")
                }
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <p>La fecha y hora se guardan automáticamente.</p>
            <button className="primary full" disabled={busy}>
              Guardar nota
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
