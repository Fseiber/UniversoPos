import { useEffect, useState } from "react";
import { api } from "./api";
import { Field } from "./components";
import { usePos } from "./context";
export function RecoverySettings() {
  const { task, notify, busy } = usePos();
  const [directory, setDirectory] = useState("");
  useEffect(() => {
    void api("/recovery").then((r) => setDirectory(r.offsiteDirectory ?? ""));
  }, []);
  return (
    <section className="panel settings-body">
      <h2>Inicio y recuperación</h2>
      <p>
        El acceso directo El Universo POS inicia la base y el sistema, y abre la
        pantalla. Para recuperar datos, abrí Restaurar El Universo en la carpeta
        del proyecto: elegís una copia, se verifica en una base nueva y después
        decidís si usarla. Antes de activarla, cerrá las cajas y abrí Detener El Universo. Se conserva la base anterior.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task(async () => {
            await api("/recovery/offsite", "PUT", { directory });
            notify(
              "Carpeta adicional guardada. Generá un respaldo para verificar la copia",
            );
          });
        }}
      >
        <Field label="Copia adicional: pendrive, otro disco o carpeta sincronizada">
          <input
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="E:\Respaldos El Universo"
            required
          />
        </Field>
        <p>
          Una carpeta en C: protege ante errores de operación; para una falla
          del disco necesitás otro dispositivo o sincronización externa. El
          programa puede verificar la copia local, pero no la llegada a la nube.
        </p>
        <button className="primary" disabled={busy}>
          Guardar carpeta adicional
        </button>
      </form>
    </section>
  );
}
