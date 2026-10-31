# Evaluación de El Universo POS

Fecha de la revisión: 31 de octubre de 2026, hora de Argentina.

## Dictamen

El sistema tiene una base funcional para un comercio pequeño: venta, caja, stock,
cuenta corriente y trazabilidad están integrados y los controles centrales pasan
las pruebas. Lo ubico en etapa de piloto supervisado. Todavía no hay evidencia
suficiente para declararlo consolidado para operación continua, varias cajas
independientes o recuperación ante una falla de la PC.

La prioridad inmediata es completar el inventario real y asegurar la operación.
Agregar muchas funciones antes de resolver esos puntos aumenta la complejidad
sin mejorar la confiabilidad del mostrador.

## Alcance y evidencia

- Compilación TypeScript y bundle de producción: aprobados.
- Suite automatizada: 38 pruebas, 38 aprobadas, ninguna omitida ni fallida.
- Pruebas adicionales en un esquema PostgreSQL desechable: permisos sobre costos,
  cambio concurrente de precio y límite del historial.
- Consultas de calidad y reconciliación de la base del comercio: solo lectura.
- Navegador: ingreso a demostración, mostrador, bloqueo del cobro sin caja abierta
  y teclado de venta rápida; se ingresó 5.000 usando botones. No se confirmó esa venta.
- No se ingresó una venta, pago ni ajuste de stock real durante la evaluación.
- Los resultados corresponden a esta versión y estos datos. No representan una
  prueba de carga de una jornada completa ni certificación fiscal o de seguridad.

Se conservaron las pruebas existentes. No se corrigió código funcional durante
esta evaluación: el objetivo fue identificar y explicar el estado actual.

## Qué funciona y se comprobó

| Área | Evidencia y resultado |
|---|---|
| Acceso | PIN hasheado, sesión, roles, bloqueo por intentos fallidos y revocación al cambiar PIN: pruebas aprobadas. |
| Ventas | Venta de contado, totales calculados por servidor e idempotencia: aprobados. Repetir la misma solicitud no duplica la venta. |
| Stock | Rechazo por insuficiencia, movimientos de Kardex, ajuste por conteo y conservación de cantidades: aprobados. |
| Concurrencia | Dos ventas sobre la última unidad no generan stock negativo. Dos fiados concurrentes no superan el crédito. |
| Fiados | Límite, disponible, saldo, cobro de deuda y arqueo: aprobados. El pago no puede superar la deuda. |
| Historial de cliente | Compras, pagos, saldos por período y PDF con permisos: pruebas aprobadas. |
| Medios de pago | Pagos mixtos, venta por monto y recargo: aprobados. La suma debe coincidir con el total. |
| Granel y precios | Cantidades decimales, redondeo y reglas por cantidad: aprobados. |
| Pendientes | Descuentan stock al entregar y no lo vuelven a descontar al saldar: aprobado. |
| Anulación | Autorización ADMIN y reversión de stock/caja/deuda sin duplicaciones: aprobadas dentro del flujo implementado. |
| Importaciones y códigos | Reintentos, códigos reservados, ceros iniciales y transferencia al habilitar: aprobados. |
| Costos desconocidos | Se conservan como desconocidos y el reporte distingue el margen parcial: aprobado. |
| Respaldos | Generación, rotación y restauración real en esquema de prueba: aprobadas. |
| Migración | Traslado desde SQLite, rollback y secuencias: aprobados. |
| Interfaz | Mostrador con catálogo y carrito, búsqueda, categorías y aviso de caja cerrada. Teclado visual: 5000 se presenta como 5.000. |

Mercado Pago se probó mediante respuestas simuladas y comportamiento sin credenciales.
Eso verifica el código de consulta, no la conexión del comercio con una cuenta real.
WhatsApp prepara un mensaje; no existe evidencia de entrega automática ni debe
interpretarse la apertura del enlace como confirmación de envío.

## Estado del catálogo al consultar

| Indicador | Resultado |
|---|---:|
| Productos activos | 317 |
| Stock cero | 314 |
| Sin costo de compra | 315 |
| Categoría General | 316 |
| Sin código | 3 |
| Venta por peso | 22 |
| Importados pendientes | 104 |
| Nombres activos repetidos, ignorando mayúsculas y espacios externos | 0 |

Los productos sin código son Manteca Serenisima, Pan Casero Redondo y Pan Casero c/u.
Los recuentos pueden cambiar cuando el dueño continúa cargando productos; no son
un inventario físico certificado. La reconciliación entre saldos y movimientos
de stock y cuentas no detectó diferencias.

El stock cero explica por qué gran parte del catálogo no puede venderse todavía.
Se debe realizar el conteo y cargarlo desde Productos → Stock. No conviene inventar
cantidades para poder cobrar: se perdería el valor de las alertas y la reposición.

Los costos faltantes no bloquean ventas, por diseño. Sí impiden conocer la
rentabilidad completa. Debe mantenerse visible esa cobertura para no confundir
un margen parcial con la ganancia del negocio. Conviene completar categorías por
familias y confirmar precios por kilo y códigos contra los envases físicos.

## Hallazgos y mejoras por prioridad

### P1. Preparación del catálogo y recuperación operativa

**1. Inventario inicial incompleto.** Comprobado en datos: 314 productos con stock
cero. Completar conteo y revisar los 22 productos por peso antes de usarlos en caja.
Condición de cierre: cada artículo que se venderá tiene cantidad real, unidad y
precio revisados; una venta de prueba controlada descuenta la cantidad correcta.

**2. Respaldo en la carpeta del proyecto.** La ubicación actual está dentro del
proyecto y había cuatro dumps al consultar. El último listado tenía tamaño no nulo,
pero el tamaño solo no demuestra su recuperación. La suite sí restauró un dump
de prueba. Una falla del disco donde están PostgreSQL y los respaldos puede afectar
ambos. Implementar copia automática a otro medio y verificar una recuperación en
otra máquina. Definir cuánto tiempo de operaciones se acepta perder y cuánto
tiempo puede estar parada la caja. El intervalo diario no ofrece recuperación de
cada venta individual. Referencia: [respaldos PostgreSQL](https://www.postgresql.org/docs/17/backup.html).

**3. Historial general limitado.** Prueba adicional: con 202 ventas en el esquema
aislado, GET /api/sales devolvió 200. El servidor aplica un límite de 200 sin cursor
de paginación en ese endpoint. Esto no significa que las ventas se borren ni que
todos los reportes estén truncados. Sí limita el historial general y la localización
de operaciones antiguas. Agregar paginación, búsqueda por número, fechas, cliente,
empleado, estado y medio de pago, con indicación del total y exportación completa.
El Kardex también limita su consulta a 500 movimientos y necesita paginación.

### P2. Consistencia de la experiencia y control de empleados

**4. Pantallas desactualizadas entre equipos.** Por revisión, refresh se ejecuta
al cargar y después de acciones locales, sin actualización periódica o eventos de
otros equipos. Prueba adicional: un empleado vio precio 100; otro usuario lo cambió
a 120; el cobro por 100 se rechazó con HTTP 400 y el stock siguió en 1. Al reintentar
con 120 se guardó una sola venta. La protección del servidor funciona. Falta que la
interfaz actualice el dato y explique qué producto cambió antes de cobrar.

**5. Edición de productos desde fichas antiguas.** Por revisión, PUT de productos
no compara una versión de la ficha leída por el administrador. Una transacción
serializable protege operaciones simultáneas dentro de la base, pero no detecta
por sí sola un formulario abierto varios minutos antes. Agregar versión o fecha de
actualización y mostrar el conflicto antes de reemplazar campos con valores viejos.

**6. Costos accesibles al rol empleado.** Prueba adicional: la consulta de productos
con sesión EMPLEADO devolvió el costo de compra. El endpoint también incluye ofertas
y proveedores. Si estos datos son exclusivos del dueño, filtrar campos en el
servidor y agregar pruebas de esa política. No alcanza con ocultar botones.
Hoy es una política de acceso amplia, no evidencia de acceso anónimo.
Revisar además quién puede cerrar caja, retirar dinero y consultar clientes.
Referencia: [autorización OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

**7. Recuperación tras fallos de conexión.** Los carritos usan sessionStorage y
las ventas tienen clave de idempotencia, lo cual es una buena base. Falta probar
en navegador el corte después de confirmar en servidor pero antes de recibir la
respuesta, reconexión, sesión vencida durante el cobro y reinicio del navegador.
Mostrar estados claros: guardando, registrada, rechazada o resultado pendiente
de verificar. No indicar “no guardada” si el resultado de la red es incierto.

**8. Estado de servicio poco verificable.** Por revisión, /api/health devuelve
ok:true sin consultar PostgreSQL. El texto “Sistema local operativo” tampoco es
un monitor completo. Agregar comprobación de disponibilidad y alertas de último
respaldo, conexión y sesión. Debe mostrarse cuándo el catálogo fue actualizado.

### P3. Completar la gestión comercial

**9. Compras y reposición.** Hay proveedores, ofertas y ajustes, pero hace falta un
circuito completo de recepción de mercadería: documento, proveedor, cantidades,
costo, gastos y registro de diferencias. Conectar esas recepciones con Kardex y
actualización de costos, sin modificar el costo histórico de ventas anteriores.

**10. Devoluciones y cambios.** La anulación completa no sustituye una devolución
parcial. Diseñar devolución de una parte del ticket, cambio por otro artículo,
estado de devolución y registro de reintegro digital pendiente/confirmado.

**11. Caja y conciliación por medio.** Mantener separado lo vendido, lo cobrado,
lo fiado y lo pendiente. Agregar gastos clasificados, conciliación de transferencias,
comisiones y liquidaciones de tarjetas. Un comprobante marcado como transferencia
no demuestra por sí solo acreditación bancaria.

**12. Reportes para decisiones.** Incorporar inventario valorizado con cobertura de
costos, rotación, días sin venta, productos sin stock, ventas por empleado y familia,
deuda por antigüedad y cierre diario. Diferenciar facturación, cobros, margen bruto
y resultado después de gastos. Evitar presentar ventas rápidas como rentabilidad
conocida si no hay costo asociado.

**13. Varias cajas y sucursales.** Actualmente hay un único turno abierto global,
por diseño. Compartir PostgreSQL no crea arqueos independientes por terminal.
Para varias cajas reales se necesitan identificador de caja, apertura/cierre por
caja, permisos, depósitos e inventario por ubicación si corresponde.

**14. Comprobantes e integraciones.** El ticket actual es interno. Evaluar por
separado la facturación fiscal requerida para el negocio con su contador, impresión
térmica, cajón y lectores reales. No se verificó aquí una integración fiscal.

## Hoja de ruta propuesta

| Etapa | Entrega y condición para cerrarla |
|---|---|
| 1. Preparar la operación | Conteo real, precios/unidades revisados, categorías útiles y respaldo externo. Recuperar una copia en otra máquina y conciliar. |
| 2. Resolver fricción en caja | Actualización entre equipos, aviso de cambios de precio, historial completo, estados de conexión y recuperación de cobros inciertos. Probar con dos navegadores. |
| 3. Completar controles | Matriz de permisos, devolución parcial, gastos y conciliación digital. Comprobar que cada excepción deja autor, motivo y movimientos correctos. |
| 4. Gestionar compras | Recepción de mercadería y costos, inventario y alertas de reposición. Conciliar una compra de prueba de extremo a extremo. |
| 5. Consolidar y desplegar | Arranque controlado, respaldo externo monitoreado, recuperación documentada, actualizaciones con rollback y pruebas de equipos físicos y jornada real. |

No se asigna una fecha de entrega sin conocer disponibilidad de conteo, equipos e
integraciones. Cada etapa necesita evidencia de cierre y no solo pantallas terminadas.

## Criterios antes de considerarlo consolidado

1. Un empleado puede completar el día habitual sin recurrir a la terminal.
2. Se pueden localizar todas las operaciones, incluso antiguas, y explicar cada
   diferencia de caja, stock o cuenta mediante movimientos y responsables.
3. Dos equipos no pierden cambios ni duplican ventas ante reintentos.
4. El cierre distingue efectivo, digitales, fiado y pendientes y concilia con los
   comprobantes reales del comercio.
5. Se recupera un respaldo fuera de la máquina original dentro de un tiempo medido.
6. Una jornada de prueba con el lector y la impresora del local termina sin errores
   pendientes ni diferencias de conciliación.
7. El acceso remoto está configurado y probado; no depende de copiar bases entre PCs.
8. Las pruebas incluyen caídas, reconexión y tareas de varios usuarios, además del
   circuito normal. Faltan pruebas de carga sostenida y de varios días de operación.

## Límites de esta evaluación

No se probó una impresora o lector físico, apertura del cajón, cortes de energía,
dos equipos físicos en la red, ancho de banda limitado, integración real con Mercado
Pago, emisión fiscal ni recuperación en otra computadora. No se realizó una auditoría
de penetración ni una evaluación normativa. Son trabajos pendientes concretos;
los 38 escenarios aprobados no cubren todas esas condiciones.

La evidencia visual de venta rápida está en `output/qa/auditoria-venta-rapida.png`.
