import { currency, methodLabels, qty, when } from "./api";
export function CommercialReport({ data }: { data: any }) {
  if (!data.byEmployee) return null;
  const moneyTable = (title: string, rows: any[]) => (
    <section className="panel settings-body">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Detalle</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{methodLabels[r.name] ?? r.name}</td>
              <td>{currency(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>Sin movimientos.</p>}
    </section>
  );
  return (
    <>
      <section className="panel settings-body">
        <h2>Inventario y gastos</h2>
        <p>
          Inventario al costo conocido: <b>{currency(data.inventoryValue)}</b> ·{" "}
          {data.inventoryCostCoverage.known} de{" "}
          {data.inventoryCostCoverage.total} productos con costo.
        </p>
        <p>
          Gastos de caja clasificados: <b>{currency(data.expenses)}</b> ·
          Salidas sin clasificar: {currency(data.unclassifiedOutflows)}.
        </p>
        <p>
          Margen conocido menos gastos registrados:{" "}
          <b>{currency(Number(data.margin) - Number(data.expenses))}</b>. Es un
          resultado parcial: no incluye costos desconocidos, gastos no cargados
          ni impuestos. Las compras de mercadería y retiros del dueño no se
          descuentan como gasto otra vez.
        </p>
      </section>
      <div className="two-columns">
        {moneyTable("Ventas netas por cajero", data.byEmployee)}
        {moneyTable("Ventas netas por hora (Argentina)", data.byHour)}
        {moneyTable(
          "Productos por categoría (sin recargos ni venta rápida)",
          data.byCategory,
        )}
        {moneyTable("Cobros de fiado por medio", data.debtCollectionsByMethod)}
        {moneyTable("Deuda actual con proveedores", data.supplierDebt)}
      </div>
      <section className="panel settings-body">
        <h2>Antigüedad de fiados</h2>
        <p>
          Imputación de pagos y créditos a las compras más antiguas. Saldos
          actuales.
        </p>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Saldo</th>
              <th>Días de deuda más antigua</th>
              <th>Último pago</th>
            </tr>
          </thead>
          <tbody>
            {data.debtAging.map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{currency(c.balance)}</td>
                <td>{c.days ?? "Sin determinar"}</td>
                <td>{c.lastPayment ? when(c.lastPayment) : "Sin pagos"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel settings-body">
        <h2>
          Productos sin ventas en el período ({data.noSalesInPeriod.length})
        </h2>
        <details>
          <summary>Ver productos y stock actual</summary>
          <ul>
            {data.noSalesInPeriod.map((p: any) => (
              <li key={p.id}>
                {p.name} · Stock {qty(p.stock)}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
