# Comparación del PDF con el proyecto actual

Revisión: 31 de octubre de 2026. Fuente: `P:/Descargar (Chorme)/Análisis de El Universo POS.pdf`, cuatro páginas. Se leyó completo y se contrastó con el código local y la verificación de consolidación anterior. Esta revisión no modifica funciones ni datos del comercio y no vuelve a ejecutar la suite.

## Conclusión

El PDF describe una versión anterior. Sus recomendaciones sobre permisos, cierre de caja, compras y operación siguen siendo útiles. Sus afirmaciones de que no existen Notas o modo sin stock, o de que el historial visible termina en 200 ventas, ya no describen esta copia local. Las seis etapas implementadas antes no abarcan todos los puntos del PDF.

La evidencia de la última verificación es compilación correcta, 43 pruebas aprobadas y conciliación sin diferencias. Eso no prueba una jornada real, la memoria disponible en una PC de 4 GB ni la recuperación en otra computadora.

## Siete problemas prioritarios del PDF

| Punto | Estado actual | Trabajo pendiente |
|---|---|---|
| 1. Costos visibles para empleados | Pendiente. `/api/products` incluye costo y ofertas; las líneas del historial contienen `unitCost`. | Filtrar en servidor todos los caminos que revelen costos o márgenes, incluidos historial, devoluciones y respuestas de ventas; adaptar pantallas y probar permisos. |
| 2. Cierre de caja ciego | Pendiente. La consulta de turno entrega el esperado al usuario autenticado y el cierre actual permite conocerlo antes de declarar. | Guardar primero la declaración del empleado y mostrar después el resultado según el permiso; ocultar también datos que permitan reconstruirlo antes. |
| 3. Topes de recargos, movimientos y retiros | Pendiente. Recargo de venta entre 0 y 100%; retiros tienen límites de validación y fondos, pero no autorización por rol/tope del dueño. | Política configurable para empleados y PIN de administrador para excederla, con motivo y auditoría. |
| 4. Modo sin stock | Implementado conforme al pedido del dueño. Ajuste global, sin bloquear por disponibilidad ni descontar stock; se conserva el modo original de cada venta. Anulación y devolución respetan ese modo. | No hace falta eliminar el control de stock negativo. Al activar el control, realizar conteo físico. Seguimiento por producto sería una opción futura distinta. |
| 5. PostgreSQL en equipo de 4 GB | Sin validar en ese equipo. Las mediciones locales no acreditan consumo allí. | Medir memoria y respuesta en la PC indicada y ajustar conexiones/configuración con esa evidencia. No cambiar a SQLite solo por la recomendación del PDF. |
| 6. Arranque, restauración y respaldo | Parcial. Segunda copia verificada configurada en `C:/Users/Seiber/Documents/Codigo/Respaldo_POS`; continúa en C:. | Inicio controlado con Windows, restauración guiada, copia fuera del disco y simulacro en otra PC con tiempos medidos. |
| 7. Bloqueo del administrador por PIN | Pendiente de mejora. Hay bloqueo de cinco minutos al llegar a cinco fallos y se comparte la verificación entre acceso y autorizaciones. | Conservar protección contra intentos, revisar límites por origen/usuario y recuperación del administrador; probar intentos concurrentes y autorizaciones. |

La propuesta del PDF de registrar siempre movimientos y permitir existencias negativas en artículos sin seguimiento no coincide con el pedido original: vender sin descontar nada. La solución actual conserva las existencias y no crea movimientos de stock por esas ventas. La venta sí queda registrada y auditada. El conteo real posterior es necesario porque no se reconstruye el inventario físico a partir de ese modo.

## Doce funciones comerciales del PDF

| Función | Estado actual |
|---|---|
| Compras e ingreso de mercadería | Pendiente el circuito de comprobante, recepción, actualización de costos e importe adeudado al proveedor. Proveedores y ajustes ya existen. |
| Precios masivos | Implementado por categoría o catálogo, porcentaje y redondeo, vista previa, margen conocido, respaldo y auditoría. Pendiente selección por proveedor. Máximo de 1.000 artículos por lote. |
| Pago de fiado por otros medios y antigüedad | Pendiente. El cobro de deuda sigue registrando `PAGO_EFECTIVO`; el historial ya muestra compras y pagos, pero falta el resumen de antigüedad y pago digital integrado. |
| WhatsApp con destinatario | Parcial. Se prepara el texto; los enlaces de comprobante/resumen usan `wa.me/?text=` sin número. Falta seleccionar y normalizar el teléfono del cliente, conservando opción de compartir. |
| Recargo/descuento por medio | Pendiente. El recargo se calcula sobre el subtotal de la venta antes de repartir pagos; no hay política por cada medio. |
| Ticket completo y térmico | Parcial. Existe comprobante interno imprimible y para compartir; el ticket principal no incluye fecha, hora, cajero y cliente de forma completa. Falta formato 58/80 mm y prueba de impresora. |
| Vencimientos | Pendiente. Conviene diseñarlos por lote cuando un mismo artículo tenga varias fechas, no depender solo de una fecha única por producto. |
| Historial y auditoría | Parcial. Historial general paginado de 50, total, búsqueda por número/nombres/producto y fechas ya implementado. La API admite estado/medio; la pantalla no expone todos esos selectores. Auditoría aún muestra ID del empleado y busca sin `mode: insensitive`. Kardex continúa limitado. |
| Pedido al proveedor desde faltantes | Pendiente la agrupación y armado del pedido/mensaje al preventista. |
| Pulido de datos | Parcial. Catálogo clasificado y selector de categorías con opción personalizada. La categoría sigue siendo texto libre en servidor; falta normalización central, varios códigos por artículo y baja de clientes. El código de un producto inactivo continúa reservado: decidir una política explícita de reasignación conservando trazabilidad. |
| Reportes ampliados | Parcial. Hay resumen, cobros por medio, productos destacados y margen con costos desconocidos, incluyendo devoluciones. Faltan familias/empleados/franjas, rotación, antigüedad de deuda y resultado con gastos clasificados. Un retiro del dueño no debe contarse automáticamente como gasto del negocio. |
| Refresco entre equipos | Parcial. Cada diez segundos y al recuperar foco se actualizan contador de notas y modo de stock. Productos, precios, clientes y turno todavía se actualizan al cargar o después de acciones locales. Falta sincronizar esos datos sin perder el carrito o formularios abiertos. |

## Mejoras locales que el PDF no contemplaba

- Notas editables con fecha, resolución, versión para conflictos y vínculos a cliente, producto o proveedor.
- Recordatorios dentro del sistema y consulta contextual desde caja.
- Envases prestados/devueltos por cliente, separados de la deuda de dinero.
- Devoluciones parciales con autorización, prorrateo, reintegro, reposición opcional y comprobante imprimible.
- Pruebas aisladas de historial, lotes de precios, devoluciones, envases y copia secundaria.
- Medición de API con 5.000 productos y 50.000 ventas ficticias; mostrador con carga visual inicial de 100 artículos.

## Orden recomendado para continuar

1. **Control de empleados:** costos privados, cierre ciego y autorizaciones de recargos/movimientos/retiros. Incluir todas las respuestas del servidor y pruebas por rol.
2. **Operación segura:** refresco completo entre equipos, aviso de cambio de precio, conflicto al editar fichas antiguas, estado real de conexión y tratamiento de un cobro con respuesta incierta.
3. **Recuperación:** inicio con Windows, restauración guiada y copia fuera del disco, con recuperación y conciliación en otra máquina.
4. **Fiados y comprobantes:** cobro por transferencia/otros medios, antigüedad, WhatsApp al teléfono y ticket térmico completo. Completar filtros y auditoría.
5. **Compras y reposición:** recepción con proveedor, costos y deuda; pedido desde faltantes; vencimientos por lote si corresponde.
6. **Gestión y prueba del local:** reportes ampliados, medición en la PC de pocos recursos y jornada con lector, impresora y dos equipos.

No se implementa esta nueva lista por el solo hecho de leer el PDF. Es el resultado de la comparación solicitada. El conteo físico, las políticas comerciales y las pruebas de equipos reales deben acompañar las mejoras del programa.

## Referencias locales revisadas

- `server/app.ts`, `server/services.ts`, `server/auth.ts`: productos, turnos, pagos, autorizaciones y venta.
- `server/history.ts`, `server/price-changes.ts`, `server/returns.ts`: historial, precios y devoluciones.
- `server/management.ts`: retiros, auditoría, reportes y respaldo.
- `src/main.tsx`, `src/sell.tsx`, `src/operations.tsx`, `src/management.tsx`, `src/customer-history.tsx`: refresco, ticket y pantallas.
- `prisma/schema.prisma`, `scripts/postgres-local.ts`, `package.json`: datos y operación local.
- `docs/CONSOLIDACION.md`: alcance y evidencia de las etapas implementadas.
