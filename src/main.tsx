import React, { useEffect, useRef, useState } from "react";
import { AppearancePicker } from "./appearance-picker";
import { applyAppearance, normalizeAccent } from "./appearance";
import { StockModeButton } from "./stock-mode-button";
import { createRoot } from "react-dom/client";
import {
  ShoppingBasket,
  Boxes,
  Users,
  Wallet,
  ChartNoAxesCombined,
  Truck,
  ShieldCheck,
  Settings,
  Orbit,
  LogOut,
  Sun,
  Moon,
  Check,
  AlertCircle,
  Menu,
  NotebookPen,
  Palette,
} from "lucide-react";
import {
  api,
  type Customer,
  type Employee,
  type Product,
  type Shift,
} from "./api";
import { PosContext } from "./context";
import { Field } from "./components";
import { Sell } from "./sell";
import { Notes } from "./notes";
import { Products, Customers, Cash } from "./operations";
import { Catalog, Reports, Sales, Admin } from "./management";
import "./style.css";
import "./compact.css";
import "./readability.css";
import "./theme.css";

const navigation = [
  ["venta", "Punto de venta", ShoppingBasket],
  ["productos", "Productos", Boxes],
  ["clientes", "Clientes y fiados", Users],
  ["caja", "Caja y turnos", Wallet],
  ["ventas", "Historial de ventas", ShoppingBasket],
  ["notas", "Notas", NotebookPen],
  ["catalogo", "Proveedores y faltantes", Truck],
  ["reportes", "Resumen del negocio", ChartNoAxesCombined],
  ["auditoria", "Auditoría", ShieldCheck],
  ["configuracion", "Configuración", Settings],
] as const;

function App() {
  const [noteCount, setNoteCount] = useState(0);
  const [stockSettings, setStockSettings] = useState({
    stockEnabled: true,
    version: 0,
  });
  const [bootstrap, setBootstrap] = useState<{
    needsSetup: boolean;
    employees: Employee[];
    demo?: boolean;
  }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [products, setProducts] = useState<Product[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [shift, setShift] = useState<Shift | null>(null);
  const [page, setPage] = useState("venta"),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [dark, setDark] = useState(
      localStorage.getItem("universo-theme") === "dark",
    ),
    [menu, setMenu] = useState(false);
  const lock = useRef(false);
  const [accent, setAccent] = useState(() =>
    normalizeAccent(localStorage.getItem("universo-accent")),
  );
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("universo-sidebar-collapsed") === "true",
  );
  const [pendingToday, setPendingToday] = useState(0);
  const [pendingView, setPendingView] = useState(false);
  const refreshSequence = useRef(0);
  useEffect(() => {
    applyAppearance(document.documentElement, accent, dark);
    localStorage.setItem("universo-theme", dark ? "dark" : "light");
    localStorage.setItem("universo-accent", accent);
  }, [dark, accent]);
  const [connection, setConnection] = useState("Conectando…");
  const [lastSync, setLastSync] = useState("");
  async function refresh() {
    const sequence = ++refreshSequence.current;
    const [p, c, s, settings, pending] = await Promise.all([
      api<Product[]>("/products"),
      api<Customer[]>("/customers"),
      api<Shift | null>("/shift"),
      api<{ stockEnabled: boolean; version: number }>("/settings/stock"),
      api<{ today: number }>("/sales/pending-summary"),
    ]);
    if (sequence !== refreshSequence.current) return;
    setProducts(p);
    setCustomers(c);
    setShift(s);
    setStockSettings(settings);
    setPendingToday(pending.today);
    setConnection("Conectado");
    setLastSync(new Date().toLocaleTimeString("es-AR"));
    setVersion((v) => v + 1);
  }
  async function task(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      if ((e as { code?: string }).code === "SESSION_EXPIRED")
        setEmployee(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        setBootstrap(await api("/bootstrap"));
        try {
          setEmployee(await api<Employee>("/me"));
        } catch {
          /* Inicio de sesión inicial. */
        }
      } catch (e) {
        setError((e as Error).message);
      }
      setReady(true);
    })();
  }, []);
  useEffect(() => {
    if (employee) void task(refresh);
  }, [employee]);
  useEffect(() => {
    if (!employee) return;
    const sync = () => {
      if (lock.current || document.hidden) return;
      void refresh().catch((e) => {
        setConnection(
          "Sin conexión o sesión vencida. No confirmes cobros nuevos",
        );
        if (e.code === "SESSION_EXPIRED") setEmployee(null);
      });
      void api<{ open: number }>("/notes/summary")
        .then((r) => setNoteCount(r.open))
        .catch(() => {});
      void api<{ stockEnabled: boolean; version: number }>("/settings/stock")
        .then(setStockSettings)
        .catch(() => {});
    };
    const timer = setInterval(sync, 10000);
    sync();
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [employee]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 6500);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const notify = (text: string) => setMessage(text);
  if (!ready)
    return (
      <div className="loading">
        <Orbit /> Preparando tu espacio…
      </div>
    );
  if (!employee)
    return (
      <main className="login">
        <section className="login-form" aria-labelledby="login-title">
          <div className="login-brand">
            <span className="login-mark">
              <Orbit size={32} />
            </span>
            <div>
              <strong>El Universo</strong>
              <small>Punto de venta</small>
            </div>
          </div>
          <h2 id="login-title">
            {bootstrap?.needsSetup
              ? "Empecemos por tu acceso"
              : "Tu turno comienza acá"}
          </h2>
          <p>
            {bootstrap?.needsSetup
              ? "Creá el administrador del comercio. Este PIN autoriza las operaciones sensibles."
              : "Elegí tu nombre e ingresá tu PIN para trabajar."}
          </p>
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void task(async () => {
                if (bootstrap?.needsSetup) {
                  const created = await api<Employee>("/setup", "POST", {
                    name: f.get("name"),
                    pin: f.get("pin"),
                  });
                  setBootstrap(await api("/bootstrap"));
                  setEmployee(
                    await api("/login", "POST", {
                      employeeId: created.id,
                      pin: f.get("pin"),
                    }),
                  );
                } else
                  setEmployee(
                    await api("/login", "POST", {
                      employeeId: Number(f.get("employeeId")),
                      pin: f.get("pin"),
                    }),
                  );
              });
            }}
          >
            {bootstrap?.needsSetup ? (
              <Field label="Tu nombre">
                <input
                  name="name"
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  required
                  autoFocus
                />
              </Field>
            ) : (
              <Field label="Usuario">
                <select name="employeeId" required>
                  {bootstrap?.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ·{" "}
                      {e.role === "ADMIN" ? "Administrador" : "Empleado"}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="PIN de acceso">
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                placeholder="Entre 4 y 8 dígitos"
                autoComplete={
                  bootstrap?.needsSetup ? "new-password" : "current-password"
                }
                required
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {busy
                ? "Ingresando…"
                : bootstrap?.needsSetup
                  ? "Crear mi espacio de trabajo"
                  : "Ingresar al comercio"}{" "}
              <span>→</span>
            </button>
          </form>
          <small>
            {bootstrap?.demo
              ? "Demostración · Datos ficticios"
              : "Acceso con PIN · El Universo POS"}
          </small>
        </section>
      </main>
    );
  const admin = employee.role === "ADMIN";
  return (
    <PosContext.Provider
      value={{
        employee,
        products,
        customers,
        shift,
        stockSettings,
        refresh,
        task,
        notify,
        busy,
        version,
        error,
        clearError: () => setError(""),
      }}
    >
      <div
        className={`app ${menu ? "menu-open" : ""} ${sidebarCollapsed ? "workspace-collapsed" : ""}`}
      >
        <aside className="sidebar">
          <div className="brand">
            <Orbit size={31} />
            <span>
              EL UNIVERSO<small>PUNTO DE VENTA</small>
            </span>
          </div>
          <span className="nav-label">ESPACIO DE TRABAJO</span>
          <nav>
            {navigation
              .filter(
                ([key]) =>
                  admin ||
                  ![
                    "catalogo",
                    "reportes",
                    "auditoria",
                    "configuracion",
                  ].includes(key),
              )
              .map(([key, label, Icon]) => (
                <button
                  key={key}
                  aria-label={label}
                  title={label}
                  className={page === key ? "active" : ""}
                  onClick={() => {
                    setPage(key);
                    setPendingView(false);
                    setMenu(false);
                  }}
                >
                  <Icon size={19} />
                  <span className="nav-item-label">{label}</span>
                  {key === "notas" && noteCount > 0 && (
                    <span className="badge amber">{noteCount}</span>
                  )}
                  {page === key && <span className="nav-dot" />}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-status sync-status" role="status">
              <i /> {connection}
            </div>
            {lastSync && (
              <small className="sync-time">Datos actualizados {lastSync}</small>
            )}
            <button
              className="theme"
              aria-label={
                dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
              }
              title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
              <span className="sidebar-theme-label">
                Tema {dark ? "claro" : "oscuro"}
              </span>
            </button>
            <button
              className="theme"
              aria-label="Elegir color principal"
              title="Elegir color principal"
              onClick={() => setAppearanceOpen(true)}
            >
              <Palette size={17} />
              <span className="sidebar-theme-label">Color principal</span>
            </button>
            <div className="user">
              <div className="avatar">
                {employee.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <strong>{employee.name}</strong>
                <small>{admin ? "Administrador" : "Empleado"}</small>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                onClick={() =>
                  void task(async () => {
                    await api("/logout", "POST");
                    setEmployee(null);
                    setBootstrap(await api("/bootstrap"));
                  })
                }
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <div>
              <button
                className="mobile-menu icon-button"
                aria-label="Abrir menú"
                onClick={() => setMenu(!menu)}
              >
                <Menu size={22} />
              </button>
              <span className="breadcrumb">
                {bootstrap?.demo ? "Demostración" : "Mi comercio"}{" "}
                <span>/</span>{" "}
                <strong>{navigation.find((n) => n[0] === page)?.[1]}</strong>
              </span>
              <button
                className="workspace-toggle icon-button"
                aria-label={
                  sidebarCollapsed
                    ? "Ampliar espacio de trabajo"
                    : "Reducir a íconos"
                }
                aria-expanded={!sidebarCollapsed}
                title={
                  sidebarCollapsed
                    ? "Ampliar espacio de trabajo"
                    : "Reducir a íconos"
                }
                onClick={() => {
                  setSidebarCollapsed(!sidebarCollapsed);
                  localStorage.setItem(
                    "universo-sidebar-collapsed",
                    String(!sidebarCollapsed),
                  );
                }}
              >
                <Menu size={22} />
              </button>
            </div>
            <div className="header-info">
              <span>
                {new Date().toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                })}
              </span>
              {page === "venta" && (
                <>
                  <StockModeButton />
                  <button
                    className="pending-sales-button"
                    onClick={() => {
                      setPendingView(true);
                      setPage("ventas");
                    }}
                  >
                    Pendientes de hoy ({pendingToday})
                  </button>
                </>
              )}
              <span className={`badge ${shift ? "green" : "amber"}`}>
                <i />
                {shift ? `Caja #${shift.id} abierta` : "Caja cerrada"}
              </span>
            </div>
          </header>
          {error && (
            <div className="notice error" role="alert">
              <AlertCircle size={18} />
              {error}
              <button aria-label="Cerrar aviso" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              <Check size={18} />
              {message}
              <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
                ×
              </button>
            </div>
          )}
          {busy && <div className="progress" />}
          <div className="content">
            <div hidden={page !== "venta"}>
              <Sell onOpenCash={() => setPage("caja")} />
            </div>
            {page === "productos" && <Products />}
            {page === "clientes" && <Customers />}
            {page === "caja" && <Cash />}
            {page === "ventas" && <Sales initialPendingToday={pendingView} />}
            {page === "notas" && <Notes />}
            {page === "catalogo" && <Catalog />}
            {page === "reportes" && <Reports />}
            {(page === "auditoria" || page === "configuracion") && (
              <Admin auditMode={page === "auditoria"} />
            )}
          </div>
        </main>
      </div>
      {appearanceOpen && (
        <AppearancePicker
          color={accent}
          dark={dark}
          onColor={setAccent}
          onDark={setDark}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
    </PosContext.Provider>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="loading">
        No se pudo mostrar la pantalla. Recargá para volver a ingresar. Las
        operaciones confirmadas están guardadas.
      </div>
    ) : (
      this.props.children
    );
  }
}
applyAppearance(
  document.documentElement,
  normalizeAccent(localStorage.getItem("universo-accent")),
  localStorage.getItem("universo-theme") === "dark",
);
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
