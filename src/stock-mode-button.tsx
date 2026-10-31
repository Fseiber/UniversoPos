import { api } from "./api";
import { usePos } from "./context";
export function StockModeButton() {
  const { employee, stockSettings, task, refresh, busy } = usePos();
  return (
    <button
      className={`stock-mode-button ${stockSettings.stockEnabled ? "enabled" : "disabled"}`}
      aria-pressed={stockSettings.stockEnabled}
      disabled={busy || employee.role !== "ADMIN"}
      title={
        employee.role === "ADMIN"
          ? "Cambiar entre venta con stock y sin control de stock"
          : "El dueño puede cambiar este modo"
      }
      onClick={() =>
        void task(async () => {
          await api("/settings/stock", "PUT", {
            stockEnabled: !stockSettings.stockEnabled,
            expectedVersion: stockSettings.version,
          });
          await refresh();
        })
      }
    >
      {stockSettings.stockEnabled ? "Stock: activado" : "Stock: sin control"}
    </button>
  );
}
