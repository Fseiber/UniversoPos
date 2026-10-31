# Ajustes del mostrador, clientes y auditoría

31 de octubre de 2026. Continuación de las cuatro etapas.

- **Apariencia:** en el menú lateral, debajo de Tema claro/oscuro, Color principal abre un selector con ocho colores y una opción personalizada mediante selector visual o código hexadecimal. En el menú reducido se identifica con el ícono de paleta. La selección se aplica inmediatamente, funciona con ambos temas y se conserva en ese navegador al recargar. Los fondos generales, textos, tablas, importes, botones, avisos y ventanas usan tonos adaptados para mantener contraste. Los colores propios de las categorías de productos se conservan.

- **Modo de stock:** botón junto a la fecha, visible solo en Punto de venta. El dueño puede alternarlo; el empleado ve el estado. Se conserva el control de cambios entre equipos y el modo original de cada venta.
- **Espacio de trabajo:** botón de menú junto al nombre de la pantalla para reducir la barra lateral a una columna de íconos o ampliarla. Los íconos siguen permitiendo abrir cada sección; al pasar el mouse se muestra su nombre. La preferencia se conserva en ese navegador. El menú móvil mantiene su funcionamiento.
- **Imágenes y colores:** cada familia habitual tiene una ilustración compartida por sus productos. Su color ocupa todo el rectángulo superior de la tarjeta del punto de venta, conservando el símbolo. No se cargan fotografías individuales ni se cambian datos del catálogo. Categorías personalizadas sin ilustración asignada usan la imagen general.
- **Productos por categoría:** listado agrupado y ordenado por categoría; dentro de cada grupo, los productos se ordenan por nombre. Cada grupo tiene un encabezado con su color y cantidad de productos. El selector Ver categoría permite consultar una sola familia y se combina con la búsqueda.
- **Fiado sin límite:** al crear o editar un cliente, el dueño puede marcar Sin límite de fiado. Se muestra así también en disponible, resúmenes y PDF. La deuda y los pagos siguen registrándose normalmente; no se permite pagar más de la deuda. Para volver a un límite numérico, debe ser igual o mayor que la deuda actual. Los empleados no pueden habilitarlo por su cuenta. No se modificaron los límites de clientes existentes.
- **Notas:** el botón antes llamado Notas y envases pasa a Notas. La función de envases se conserva. Una nota resuelta ofrece Eliminar nota y pide confirmar; se verifica su versión para impedir eliminar una nota reabierta o modificada desde otro equipo. Antes de eliminar, se registra el contenido completo, vínculos, autor y fechas en Auditoría, junto con quién la eliminó.
- **Auditoría:** se puede ordenar globalmente por fecha, nombre de empleado o acción, en ambos sentidos, pulsando el encabezado de columna. Incluye búsqueda sin distinguir mayúsculas, filtro por empleado, acción y fechas, total y páginas de cien registros. El orden se aplica antes de paginar, no solo a los registros visibles.

## Cliente que promete transferir después

1. En Punto de venta, elegir al cliente y agregar su compra.
2. Pulsar **Dejar pendiente**. Se propone el nombre del cliente; se puede corregir antes de guardar.
3. La entrega se registra sin un cobro y sin sumar automáticamente deuda al fiado. En modo stock descuenta mercadería al entregar; sin control de stock conserva las existencias.
4. Cuando llegue la transferencia, verificarla por el medio habitual y pulsar **Pendientes de hoy** en el encabezado del mostrador.
5. En la compra del cliente, pulsar **Registrar cobro**, elegir **Transferencia** y confirmar el pago.
6. La venta pasa a **COMPLETADA**, sale de pendientes y aparece con su medio de pago en Todas las ventas. No vuelve a descontar mercadería.

Para una entrega de un día anterior: **Historial de ventas → Todas las pendientes**. El filtro del día usa la zona horaria de Argentina. El contador del encabezado se actualiza después de una operación y con el refresco periódico entre equipos.

Pendiente y fiado son distintos: pendiente guarda una entrega que todavía no fue cobrada; fiado carga deuda al cliente. Registrar una transferencia en el POS no ejecuta movimientos bancarios ni verifica automáticamente la acreditación.

## Verificación

Compilación y 48 pruebas automatizadas aprobadas. Incluyen fiado sin límite y su regreso a límite, restricciones en PostgreSQL, borrado de nota con auditoría y versión, ordenamiento de más de cien registros y transferencia de una pendiente con límites de fecha del día. El cobro repetido no duplica pagos. La prueba de apariencia verifica pares de texto/fondo con contraste mínimo 4,5:1 en ambos temas, usando los colores predefinidos, extremos y una grilla de colores personalizados; también valida el rechazo de códigos inválidos.

Se comprobó en navegador el cambio de verde a azul, un color personalizado claro con texto oscuro, el cambio entre tema claro/oscuro y la conservación del color al recargar. Se revisaron Clientes y fiados, el mostrador y el selector, con datos de demostración. Evidencia: `output/qa/tema-oscuro-azul.png` y `output/qa/selector-apariencia.png`.

En navegador se creó un cliente ficticio sin límite y se simuló su entrega pendiente, nombre automático y cobro posterior por transferencia en el esquema separado de demostración. No se registraron estas operaciones en la base del comercio.

Migración aplicada: `20261031090000_unlimited_credit`, con respaldo previo. No se hizo commit ni push.
