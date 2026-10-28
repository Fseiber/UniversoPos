import React, { useEffect, useRef, useState } from "react";
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
import { Products, Customers, Cash } from "./operations";
import { Catalog, Reports, Sales, Admin } from "./management";
import "./style.css";
import "./compact.css";
import "./readability.css";

const navigation = [
  ["venta", "Punto de venta", ShoppingBasket],
  ["productos", "Productos", Boxes],
  ["clientes", "Clientes y fiados", Users],
  ["caja", "Caja y turnos", Wallet],
  ["ventas", "Historial de ventas", ShoppingBasket],
  ["catalogo", "Proveedores y faltantes", Truck],
  ["reportes", "Resumen del negocio", ChartNoAxesCombined],
  ["auditoria", "Auditoría", ShieldCheck],
  ["configuracion", "Configuración", Settings],
] as const;

function App() {
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
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("universo-theme", dark ? "dark" : "light");
  }, [dark]);
  async function refresh() {
    const [p, c, s] = await Promise.all([
      api<Product[]>("/products"),
      api<Customer[]>("/customers"),
      api<Shift | null>("/shift"),
    ]);
    setProducts(p);
    setCustomers(c);
    setShift(s);
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
      <div className="login">
        <div className="login-story">
          <div className="brand">
            <Orbit size={36} />
            <span>
              EL UNIVERSO<small>PUNTO DE VENTA</small>
            </span>
          </div>
          <div>
            <span className="eyebrow">TU COMERCIO, EN ORDEN</span>
            <h1>
              Todo lo que pasa
              <br />
              en tu mostrador.
              <br />
              <em>En un solo lugar.</em>
            </h1>
            <p>
              Ventas, caja, stock y fiados.
              <br />
              La tranquilidad de tener las cuentas claras.
            </p>
          </div>
          <small>Sistema local · El Universo POS</small>
        </div>
        <div className="login-form">
          <span className="eyebrow">BIENVENIDO A EL UNIVERSO</span>
          <h2>
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
              <Field label="Empleado">
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
          <small>Los datos se guardan en esta computadora.</small>
        </div>
      </div>
    );
  const admin = employee.role === "ADMIN";
  return (
    <PosContext.Provider
      value={{
        employee,
        products,
        customers,
        shift,
        refresh,
        task,
        notify,
        busy,
        version,
        error,
        clearError: () => setError(""),
      }}
    >
      <div className={`app ${menu ? "menu-open" : ""}`}>
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
                  className={page === key ? "active" : ""}
                  onClick={() => {
                    setPage(key);
                    setMenu(false);
                  }}
                >
                  <Icon size={19} />
                  {label}
                  {page === key && <span className="nav-dot" />}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-status">
              <i /> Sistema local operativo
            </div>
            <button className="theme" onClick={() => setDark(!dark)}>
              {dark ? <Sun size={17} /> : <Moon size={17} />} Tema{" "}
              {dark ? "claro" : "oscuro"}
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
            </div>
            <div className="header-info">
              <span>
                {new Date().toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                })}
              </span>
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
            {page === "ventas" && <Sales />}
            {page === "catalogo" && <Catalog />}
            {page === "reportes" && <Reports />}
            {(page === "auditoria" || page === "configuracion") && (
              <Admin auditMode={page === "auditoria"} />
            )}
          </div>
        </main>
      </div>
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
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
