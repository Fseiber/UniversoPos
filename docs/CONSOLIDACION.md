# Consolidación por etapas · 31/10/2026

## Etapa 1: Notas e historial

El aviso de confirmación ahora aparece abajo a la derecha. Los filtros de Notas
se mantienen en una fila en escritorio y se adaptan en pantallas pequeñas. Se
mejoró el contraste del detalle respetando el tema claro/oscuro.

Historial usa páginas de 50 ventas, con Anterior/Siguiente y total de resultados.
Busca por número, nombre de cliente, empleado o producto y filtra por fechas. Ver
pendientes conserva la búsqueda. La API nueva es `/api/sales/history`; el endpoint
antiguo conserva compatibilidad y su límite de 200, pero ya no alimenta esa pantalla.
La paginación se comprobó con 205 ventas y luego con una carga de 50.000.

## Etapa 2: Actualización masiva de precios

Productos → Actualizar precios permite seleccionar categoría o catálogo completo,
variación porcentual y redondeo. La vista previa muestra precio anterior/nuevo y
margen bruto sobre venta; un costo desconocido se indica como pendiente.

No se modifica nada hasta Confirmar. La vista previa vence a los 15 minutos y un
reinicio del servidor la invalida. El servidor verifica que los productos no hayan
cambiado; si cambiaron, rechaza todo el lote. Hay respaldo previo, auditoría antes/
después e idempotencia para reintentos. Solo ADMIN puede usar el asistente. Los
precios propios de ofertas por cantidad no se alteran y la pantalla lo informa.
El máximo es de 1.000 productos por lote; en catálogos mayores se selecciona una categoría.
No se aplicó un aumento al catálogo real durante el desarrollo.

## Etapa 3: Devoluciones parciales

Historial → Devolver permite elegir cantidades, ver el importe y confirmar con
motivo y PIN de administrador. Se consideran las cantidades ya devueltas y se
prorratea el recargo de la venta original, con redondeo acumulado para evitar
duplicar centavos entre devoluciones.

El reintegro puede registrarse en efectivo, contra deuda del cliente o en un medio
digital. Efectivo exige fondos en la caja actual; cuenta corriente exige saldo
suficiente. Para un medio digital, el operador debe confirmar que ya efectuó el
reintegro por fuera del POS: el sistema no mueve dinero bancario automáticamente.

La opción mercadería apta para vender permite revertir su costo en el margen y,
si la venta original usó stock, reponer cantidades. Una venta sin control de stock
nunca repone existencias. Una venta con devoluciones no puede anularse completa:
se devuelven las unidades restantes. El ticket original se conserva; cada devolución
tiene comprobante interno imprimible, movimiento y auditoría propios. Se puede
reimprimir desde el historial.

El resumen descuenta devoluciones en la fecha del reintegro; el conteo de ventas
originales no se reduce. El margen conserva el costo de mercadería no recuperable.
No equivale a ganancia neta después de gastos e impuestos. Las ventas rápidas sin
líneas se gestionan con anulación; las devoluciones parciales seleccionan productos.

## Etapa 4: Notas vinculadas y envases

Una nota puede vincularse a cliente, producto y/o proveedor, y tener una fecha de
recordatorio. El menú muestra un contador de notas pendientes. Es un recordatorio
dentro del sistema: no se envían mensajes ni notificaciones externas automáticamente.

Al seleccionar un cliente en caja aparecen sus notas pendientes y envases. Las
notas de productos del carrito también pueden consultarse allí. Clientes → Notas
y envases permite consultar y registrar movimientos sin iniciar una venta.

Los envases se registran por tipo, con cantidad prestada/entregada, motivo, fecha y
autor. No se permite entregar más de lo adeudado. Los reintentos no duplican
movimientos. Este saldo es de unidades, separado del dinero de fiado; no cobra
depósitos por envases ni modifica stock comercial. Los movimientos anteriores se
conservan. Las notas se resuelven manualmente cuando corresponda.

## Etapa 5: Segunda copia de respaldo

Se configuró `BACKUP_SECONDARY_DIR` en el `.env` local con la ruta indicada:
`C:\Users\Seiber\Documents\Codigo\Respaldo_POS`.

Después de generar el dump local, se copia mediante un archivo parcial y se compara
SHA-256 antes de confirmar. Un error conserva la copia local y se informa en
Configuración. La segunda carpeta y su último éxito confirmado se muestran allí.
La política de 15 días se mantiene en la carpeta primaria; las copias secundarias
se conservan sin borrado automático.

La carpeta indicada está en la unidad C:, igual que la instancia de este proyecto.
Es una copia separada, pero no protección ante falla completa del disco. Para esa
protección debe usarse otro dispositivo o una copia fuera de la PC. La restauración
automatizada pasó en un esquema temporal; el simulacro en otra computadora y la
prueba de falla física siguen pendientes. No se modificó el inicio de Windows.

Las bases y carpetas de respaldo de las pruebas se aíslan: no se copian dumps
ficticios a la carpeta de respaldo del comercio.

## Etapa 6: Rendimiento

Se ejecutó `npx tsx scripts/performance-check.ts` con 5.000 productos y 50.000
ventas/cobros ficticios en un esquema temporal. Siete consultas por escenario.
Mediciones en esta PC mediante Supertest sobre API y PostgreSQL locales:

| Consulta | Mediana | Máximo observado en 7 consultas |
|---|---:|---:|
| Primera página de historial | 11 ms | 18 ms |
| Página anterior de historial | 11 ms | 15 ms |
| Búsqueda por número | 68 ms | 69 ms |
| Catálogo de 5.000 productos | 82 ms | 91 ms |
| Arqueo con 50.000 pagos | 275 ms | 282 ms |
| Resumen diario de 50.000 ventas | 1.152 ms | 1.186 ms |

Estos valores no miden la red, una PC vieja ni el renderizado de un navegador. El
catálogo tuvo aproximadamente 1,13 MB de respuesta; el resumen sigue cargando y
procesando registros, por lo que conviene pasar sus agregados a SQL al crecer.
Se agregaron índices de fecha/empleado/cliente/estado de ventas y el mostrador
renderiza inicialmente hasta 100 productos, con búsqueda y Mostrar más, para
evitar dibujar miles de tarjetas de golpe.

Resultado detallado: `output/qa/rendimiento-5000-50000.json`. No se cargaron estos
productos ni ventas en el esquema del comercio. Falta validar una jornada real,
el lector/impresora y el acceso desde dos equipos físicos.

## Verificación

Compilación aprobada y 43 pruebas automatizadas. Las nuevas pruebas cubren historial
completo, autorización y conflictos en lotes, devoluciones con recargo, costo de
mercadería no recuperable, fiados, modo sin stock, recordatorios, envases y copia
verificada. La conciliación del comercio se comprueba por separado sin modificar
operaciones. Las etapas anteriores no reemplazan la auditoría histórica; documentan
las mejoras realizadas después de ella.
