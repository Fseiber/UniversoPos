import { useEffect, useState } from "react";
import { api } from "./api";
export function ProductReminders({ ids }: { ids: number[] }) {
  const [notes, setNotes] = useState<any[]>([]);
  const key = [...new Set(ids)].sort((a, b) => a - b).join(",");
  useEffect(() => {
    let active = true;
    setNotes([]);
    if (key)
      void api(`/notes/relevant?products=${key}`)
        .then((r) => {
          if (active) setNotes(r);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  return notes.length ? (
    <details className="notice amber">
      <summary>{notes.length} notas de productos del carrito</summary>
      {notes.map((n) => (
        <p key={n.id}>
          <strong>{n.title}</strong> · {n.product?.name}
          <br />
          {n.body}
        </p>
      ))}
    </details>
  ) : null;
}
