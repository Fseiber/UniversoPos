# El Universo POS

Los ajustes de stock en el encabezado, fiado sin límite, notas, auditoría y ventas pendientes se explican en [Ajustes del mostrador](docs/AJUSTES-MOSTRADOR.md).

Las mejoras de permisos, trabajo entre equipos, recuperación y gestión comercial están documentadas en [las cuatro etapas](docs/CUATRO-ETAPAS.md).

Punto de venta local para el comercio. React + Vite + TypeScript, Express, Prisma y PostgreSQL. Interfaz en español y moneda argentina.

## Iniciar en esta computadora

El proyecto ya tiene dependencias instaladas y compilación generada. Desde esta carpeta:

```powershell
npm run db:local:start
npm start
```

Abrí **http://127.0.0.1:3001**. También podés ejecutar `Iniciar El Universo.cmd`.

En una instalación nueva, la primera pantalla permite crear el administrador y elegir un PIN propio. Si ya lo creaste, ingresá con ese acceso. No hay una contraseña predeterminada del comercio.

## Probar sin cargar datos reales

```powershell
npm run demo
```

Abrí **http://127.0.0.1:3002**. Elegí `Demo · Administración` y usá el PIN **246810**. Este acceso es público, ficticio y exclusivo de demostración. El esquema PostgreSQL `universo_demo` está separado del esquema del comercio. El encabezado indica «Demostración».

## Instalación desde cero

Requiere Node.js 24.21 o una revisión compatible de Node 24, npm y PostgreSQL 17+ con sus herramientas de respaldo. Con el servidor detenido:

```powershell
npm ci
npm run db:local:init
npm run setup
npm run build
npm start
```

`setup` crea `.env` si falta, aplica migraciones PostgreSQL y genera Prisma Client. La aplicación necesita conexión con su servidor; si está en la red local, las ventas no dependen de Internet. Para trasladar SQLite o compartir datos con la notebook, ver [POSTGRESQL.md](docs/POSTGRESQL.md).

Para desarrollo: `npm run dev` (Vite en 5173 y API en 3001). Para validar: `npm run build` y `npm test`. Las pruebas usan bases temporales separadas y no modifican el comercio.

## Circuito de trabajo

1. Crear el administrador; agregar empleados desde Configuración.
2. Cargar productos, códigos, precios y stock inicial. Para granel, el stock se expresa en kilos con tres decimales.
3. Crear clientes y asignar límites de crédito como administrador.
4. Abrir caja indicando efectivo inicial.
5. Vender desde el mostrador: buscar/escanear un producto, usar carritos simultáneos y confirmar los medios de pago. El lector debe funcionar como teclado con Enter al finalizar.
6. Cobrar deudas desde Clientes y fiados. Estos cobros son en efectivo y entran en el arqueo del turno actual.
7. Consultar pendientes y saldarlos en Historial de ventas. La entrega ya descontó stock; el cobro posterior no lo descuenta otra vez.
8. Cerrar caja con el dinero contado. Revisar el arqueo y el estado de respaldo.

Las anulaciones requieren un PIN ADMIN y revierten stock y efectivo o deuda. Una deuda parcialmente cobrada que no permita revertir el saldo completo exige conciliación antes de anular. Los reintegros digitales se gestionan en el medio original; la aplicación registra la anulación interna. Los tickets son comprobantes internos, no facturas fiscales.

## Fases y verificación

La hoja de ruta y sus entregas están en [docs/FASES.md](docs/FASES.md) y [docs/ENTREGAS.md](docs/ENTREGAS.md).

La compilación de producción y las 38 pruebas pasan: escenarios de integración, importación segura y formato y edición de importes. Se verificó por navegador el acceso de demostración, apertura de caja, agregado de producto, cobro, comprobante, métricas, venta rápida con miles y centavos y revisión de productos importados. No se conectó una cuenta real de Mercado Pago ni se probó un lector físico, impresora o teléfono externo.

Los campos de importes muestran puntos de miles mientras escribís: `5000` se ve como `5.000`. Para centavos usá coma: `5.000,50`. El valor enviado y los cálculos conservan el importe correcto. El formato también se aplica a precios, costos, caja y límites de fiado; los códigos de barras y PIN se ingresan sin separadores.

## Catálogo importado desde Excel

Los 371 productos del archivo aportado están en **Productos → Importados por revisar → Revisar productos**. Se conservan los nombres, la unidad y el precio anterior como referencia; no se habilitaron precios viejos para vender. El archivo no trae códigos de barras, categorías, costos ni stock.

Como administrador, buscá el producto y seleccioná **Actualizar y habilitar**. Completá el Precio de venta al cliente y el stock inicial. El Costo de compra es opcional: podés dejarlo vacío y completarlo después desde Editar producto. Elegí la categoría en el selector y agregá el código de barras si tiene. Al guardar aparece en el catálogo activo y el stock inicial queda registrado en el Kardex. El precio anterior y la fila de origen se conservan en el registro de importación. Los pendientes no aparecen en el mostrador ni se incluyen en el valor del inventario.

Se hizo un respaldo previo. El importador detecta reintentos del mismo archivo y omite coincidencias con productos existentes para conservar precios y movimientos actuales. No hay una importación automática con habilitación masiva.

Si el servidor estaba abierto durante esta actualización, detenelo con Ctrl+C, ejecutá `npm start` y recargá el navegador para usar las nuevas rutas de revisión.

## Configuración

`.env` no debe subirse a un repositorio:

| Variable                   | Uso                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Conexión PostgreSQL privada del servidor.                               |
| `PORT`                     | Puerto local, inicialmente 3001.                                                        |
| `HOST`                     | Inicialmente `127.0.0.1`, acceso solo desde esta PC.                                    |
| `BACKUP_DIR`               | Carpeta de respaldos. Configurar otra unidad/USB para protección ante falla del disco.  |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token privado del titular para consulta de actividad. Se usa solo en el backend. |
| `COOKIE_SECURE`            | `true` cuando exista HTTPS. Para localhost HTTP queda desactivado.                      |

El acceso desde celular tiene interfaz responsive y permisos ADMIN para gestión. Acceso fuera del comercio, HTTPS/VPN y puesta en marcha automática de Windows se configuran en el entorno real. No abras puertos del router para usar esta versión sin esa configuración.

## Ajustes de uso diario

### Consolidación por etapas

Historial paginado y búsqueda completa; asistente de precios por categoría con
vista previa y confirmación; devoluciones parciales con PIN y comprobante;
notas vinculadas y envases por cliente; segunda copia verificada y medición con
5.000 productos / 50.000 ventas. Ver [uso, pruebas y límites](docs/CONSOLIDACION.md).

### Notas y clasificación

La sección **Notas** guarda título, detalle, autor y fecha/hora de creación. Todos
los empleados con sesión pueden consultar y actualizar las notas compartidas,
marcarlas como resueltas o volverlas a pendiente. Las ediciones conservan la fecha
original, registran la actualización y dejan auditoría. Incluye búsqueda y carga de
notas anteriores; un cambio simultáneo avisa antes de sobrescribir otra edición.

El catálogo activo fue clasificado por familias comerciales, disponibles en los
filtros del mostrador y en el selector de categoría al editar productos. La
clasificación por nombre puede ajustarse manualmente; no altera precios ni stock.

### Venta con o sin stock

En Punto de venta, el administrador puede pulsar **Activar venta sin stock** para
cobrar todos los productos activos sin exigir ni descontar existencias. El modo
se comparte entre equipos y se conserva al reiniciar. **Volver al modo stock**
restablece el control para las ventas siguientes; no descuenta retroactivamente
lo vendido antes. El historial identifica las ventas sin control y las anulaciones
respetan el modo original. Conviene cargar el conteo real antes de volver al stock.

### Clientes y fiados

La tabla muestra, en este orden, **Límite de fiado**, **Disponible para comprar** y **Saldo a pagar**. El saldo se forma con compras fiadas menos pagos y anulaciones. Registrar un pago permite elegir entre pagar todo el saldo o entregar una parte, con vista previa de saldo y disponible después del pago. Los cobros de deuda se registran en efectivo y requieren una caja abierta.

**Compras y pagos** abre el historial completo del cliente: productos, cantidades, precios históricos, total de cada compra, parte fiada, medios de pago y movimientos de la cuenta con saldo acumulado. Permite consultar fechas o ver todo. Los saldos actuales se identifican por separado del saldo inicial/final del período. Los pagos se aplican al saldo de la cuenta, sin asignación a una compra específica. Las ventas rápidas muestran solo su importe porque no registran productos.

**Imprimir / PDF** abre un resumen completo de los resultados consultados, listo para imprimir o guardar. **Preparar WhatsApp** arma un mensaje con ese mismo detalle; el usuario elige el destinatario y confirma el envío en WhatsApp. Si el historial supera el largo previsto para un enlace, se copia completo y se ofrece abrir WhatsApp para pegarlo, o consultar un período menor. No se envían mensajes automáticamente.

- **Costo de compra opcional:** dejarlo vacío significa que todavía no se conoce. Un costo de $0 cargado explícitamente se trata como cero real. Los reportes distinguen ventas sin costo conocido y muestran el margen parcial; cargar un costo después no cambia ventas anteriores.
- **Corregir stock:** en Productos, usá el botón **Stock**. Elegí **Establecer el stock contado** para reemplazar el valor temporal por la cantidad real. También podés sumar o retirar mercadería. Se guarda el ajuste en Kardex.
- **Fiado predeterminado:** al elegir un cliente en el carrito, el cobro propone Fiado; podés cambiarlo a otro medio de pago antes de confirmar.
- **Venta rápida:** permite escribir con el teclado físico o usar los números en pantalla. Incluye coma decimal, dos ceros, borrar el último dígito y borrar el importe.
- **Mostrador compacto:** se retiró la cabecera decorativa y se agrandaron los textos. En escritorio, los productos se desplazan dentro del catálogo y el cobro permanece a la vista.

## Base compartida entre computadoras

PostgreSQL es la fuente de datos. Se retiró la sincronización de catálogo por Git;
Git comparte código y migraciones. Ambos equipos acceden al mismo servidor del POS.
Ver [instalación, datos y acceso compartido](docs/POSTGRESQL.md).

## Respaldos y recuperación

Se usa `pg_dump` con formato custom (`.dump`) para respaldar PostgreSQL. Se genera una copia al iniciar, abrir/cerrar caja y cada 24 horas. La rotación conserva 15 días de dumps propios. `pg_dump` debe estar instalado y ser compatible con el servidor. Configuración muestra el último éxito o error. SQLite y sus respaldos históricos se conservan como origen del traslado.

El procedimiento de recuperación está en [docs/OPERACION.md](docs/OPERACION.md). El servidor debe detenerse antes de recuperar una base. Los respaldos contienen datos del comercio y hashes de PIN; conservá su carpeta con acceso restringido.

## Precisión y trazabilidad

El servidor recalcula precios, ofertas, totales y límites. Dinero: dos decimales; stock y peso: tres. Decimal se usa en las operaciones y los movimientos se guardan en transacciones. Pagos, Kardex y cuentas corrientes tienen historial. Las reglas SQL adicionales están en una migración: un turno abierto, stock no negativo, límites de cuenta y roles válidos.

Los reportes distinguen ventas del período, cobros, saldos actuales y pendientes. El margen usa el costo histórico de cada venta; no incluye costos desconocidos de ventas rápidas, gastos ni impuestos. Una anulación excluye la venta de los reportes históricos: los reportes son una vista del estado actual de esas operaciones.

Referencia técnica: [transacciones PostgreSQL en Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions) y [consulta de pagos de Mercado Pago](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/search-payments/get).
