## PostgreSQL · 28/10/2026

Motor actual PostgreSQL, migraciones y restricciones propias, Decimal nativo, transacciones serializables con reintentos y reserva global de códigos. Se retiró la sincronización de catálogo por Git y se conservaron los JSON locales fuera del índice. Se trasladaron los datos reales desde SQLite con snapshot consistente previo: 2 productos, 371 importados y 7 ventas, junto con cuentas, stock, empleados y auditoría. Reconciliación sin diferencias. Respaldos `.dump` y recuperación comprobada en pruebas.

38 pruebas verifican PostgreSQL, concurrencia, traslado y restauración. La instancia del proyecto queda separada del servicio existente en Windows. Acceso desde notebook, firewall y HTTPS/VPN requieren la configuración de red descrita en [POSTGRESQL.md](POSTGRESQL.md); no se habilitaron puertos automáticamente. Las entregas siguientes son el historial anterior y no reemplazan esta configuración.

# Entregas por fase

## Actualización - cuenta corriente e historial compartible

Columnas en el orden límite de fiado, disponible para comprar y saldo a pagar. Registro de pago completo o parcial con vista previa de los saldos resultantes. La deuda sigue validándose contra el saldo real en el servidor.

Historial por cliente con filtro de fechas, todas las compras asociadas, productos y precios históricos, partes fiadas y medios de pago, pagos de deuda y anulaciones con saldo acumulado. Incluye saldo inicial/final del período y estado actual de la cuenta, sin mezclar ambos. No se truncan resultados a 500 movimientos. Las ventas rápidas muestran el importe, sin inventar detalle de productos.

Exportación privada a PDF imprimible y resumen de texto para copiar o preparar WhatsApp, con envío a confirmar por el usuario. El resumen usa exactamente el período consultado; los historiales largos se copian completos en lugar de truncarse. Los precios de costo no se exponen en este resumen del cliente.

Compilación y 35 pruebas aprobadas. Verificados historial y pago parcial con un cliente ficticio: límite $500.000, saldo $7.900; una entrega de $2.000 deja saldo $5.900 y disponible $494.100. El PDF se renderizó e inspeccionó. No se registraron pagos ni cambios en la cuenta real de Romero.

## Actualización - operación de mostrador y datos opcionales

El precio que se cobra se identifica como «Precio de venta al cliente». El «Costo de compra» es opcional y puede completarse luego desde Editar producto. Los costos faltantes se guardan como nulos, no como cero: el inventario informa qué parte no está valuada y el margen excluye ventas sin costo conocido. Cada venta conserva el costo que se conocía al vender, incluso si después se carga o cambia el costo del producto.

Selector de categorías con opciones habituales, categorías existentes y una opción para crear otra. El botón Stock permite establecer el conteo actual (reemplazando cantidades temporales) o sumar/retirar mercadería, siempre con movimientos en Kardex y auditoría.

Mostrador sin cabecera decorativa, controles y letras más grandes, catálogo con desplazamiento independiente y cobro visible en escritorio. Cliente seleccionado propone fiado, con medio de pago editable. Venta rápida incorpora teclado numérico con mouse, coma decimal, dos ceros, borrar y compatibilidad con el teclado físico.

Respaldo previo a la migración de costos opcionales, preservación de registros y restricciones SQL, compilación correcta y 32 pruebas aprobadas. Se comprobó visualmente el mostrador a 1280 × 720, el importe 5.000,50 ingresado combinando clics y teclado, y Fiado como medio inicial para un cliente seleccionado.

## Actualización - catálogo real desde Excel

371 registros preparados en una tabla de revisión: 346 por unidad y 25 por peso. Se verificaron nombres sin duplicados, valores numéricos y unidades, y se conservó la fila de origen. El Excel no aporta costos, stock, categorías ni códigos. Los precios anteriores son referencias y los registros pendientes no son productos vendibles.

La habilitación requiere ADMIN y precio, costo y stock explícitos. Crea el producto y el movimiento inicial de stock de forma atómica, evita doble habilitación y conserva la referencia anterior. El importador es idempotente por huella del archivo y omite coincidencias existentes sin sobrescribirlas. Respaldo previo de la base antes de cargar los registros. El archivo Excel original no se modificó.

Compilación aprobada y 27 pruebas correctas. Verificación visual de la lista, buscador y formulario con precio actual y stock vacíos. La verificación de las 371 filas contra los registros cargados se realiza con `scripts/verify-catalog-import.mjs`.

## Actualización - importes legibles

Separadores de miles mientras se escribe, coma decimal y envío del valor numérico sin separadores. Aplicado en venta rápida, cobros, precios/costos, caja, cuentas y los demás campos compartidos. Mantiene validaciones de mínimos, máximos y precisión, permite editar y borrar junto a los separadores y no modifica códigos ni PIN. Compilación aprobada y 23 pruebas correctas. Verificación en navegador: escribir `5000` muestra `5.000`; agregar `,50` y enviar el formulario agrega `$ 5.000,50` al carrito de demostración.

Implementación local del 27 de octubre de 2026, basada en la última hoja de ruta del chat «Punto Venta».

## Base técnica

React/Vite/TypeScript y Express, Prisma 6.19.3, SQLite con WAL y claves foráneas, migraciones versionadas, configuración de entorno, scripts de arranque, demostración separada y pruebas con base temporal. Compilación de producción aprobada. Dependencias revisadas por npm sin vulnerabilidades conocidas al instalar la versión final.

## Fase 0 - MVP

Implementada. Empleados/PIN/roles, bloqueo tras cinco intentos durante cinco minutos, sesiones revocables, productos, caja, clientes, límites, ventas, fiados, cobros de deuda, movimientos de stock y auditoría. Pruebas de rollback, idempotencia, crédito, efectivo y permisos aprobadas. Venta de demostración verificada por navegador hasta el comprobante.

## Fase 1 - Mostrador

Implementada. Hasta ocho carritos en pestañas, conservados en la sesión del navegador, venta rápida por monto, pagos mixtos, recargo sobre el total, ingresos/retiros manuales y retiro de efectivo por transferencia o Posnet con las dos modalidades de comisión. Pruebas de caja y medios de pago aprobadas.

## Fase 2 - Catálogo

Implementada. Productos por peso, ingreso en kilos/gramos/monto, Kardex, ofertas por cantidad con precedencia del umbral más alto, proveedores/preventistas, comparador, calculadora de precio sobre costo y faltantes automáticos/manuales. Pruebas de granel, precisión y precedencia aprobadas. La calculadora sugiere costo + porcentaje; no representa margen porcentual sobre el precio de venta.

## Fase 3 - Excepciones

Implementada. Pendientes con apodo y entrega de stock inmediata; saldado posterior con control de duplicación; anulación completa con PIN ADMIN y reversión de stock/caja/deuda. Pruebas de autorización y reversión aprobadas. Reintegros digitales se realizan por separado en el medio original.

## Fase 4 - Gestión

Implementada localmente. Resumen por fechas, productos más vendidos por importe, margen histórico, deuda actual, cierres y diferencias; PDF/CSV; impresión y ticket copiable; enlace para abrir WhatsApp sin envío automático; auditoría filtrable con paginación; visor MP tolerante a fallos y configuración secreta del servidor. Pruebas de PDF, permisos y respuestas de MP simuladas aprobadas. Panel comprobado por navegador con la venta ficticia.

Pendiente de validación externa: cuenta real de Mercado Pago, prueba física del teléfono y red/HTTPS o VPN. El visor no usa datos bancarios simulados en la aplicación: sin credenciales informa que no está configurado. Las simulaciones existen solamente en la suite de pruebas.

## Fase 5 - Producción y mantenimiento

Implementadas y verificadas las herramientas locales. Backup SQLite consistente al iniciar/abrir/cerrar y por intervalo de 24 horas, rotación de copias propias a 15 días, backup manual, estados de error, reconciliación de cuentas/stock, tema oscuro/claro, compilación estática servida por Express y documentación de operación/recuperación. Pruebas de integridad del archivo, retención, preservación de archivos ajenos y persistencia aprobadas.

Pendiente del local: selección del disco/USB externo, puesta en marcha en la PC del kiosco, lectores/impresora, configuración de arranque de Windows, acceso remoto y simulacro de recuperación con el responsable. No se declara producción certificada ni despliegue remoto terminado.

## Evidencia automatizada

### Catálogo por Git · 28/10/2026

Sincronización de catálogo mediante JSON por identidad estable; base comercial,
stock y accesos locales. Incluye importados pendientes y sus códigos, transferencia
de identidad al habilitar, respaldo previo, reconciliación por campo y rechazo de
conflictos. Hooks opcionales por clon para commit/merge y comprobación antes de
start/dev. Guía: `docs/CATALOGO-GIT.md`.

38 pruebas aprobadas, incluida una simulación con dos bases y ediciones desde ambos
equipos. Clon vacío comprobado con 372 fichas del catálogo: 2 productos, 370 pendientes,
stock cero, cero ventas/clientes/usuarios. Sin push automático ni sincronización en vivo.

`npm run build`: TypeScript y bundle de producción correctos.

`npm test`: 19 escenarios de integración aprobados, con API real de Express y SQLite, incluyendo restricciones SQL. Las bases temporales de las ejecuciones exitosas se eliminan al finalizar. No se cargaron datos de demostración en la base del comercio. En la comprobación final, la base del comercio tiene un administrador ya creado y ningún producto, cliente, turno o venta; ese acceso se conserva sin modificarlo.
