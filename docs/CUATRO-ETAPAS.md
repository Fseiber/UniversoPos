# Mejoras para operar El Universo POS

Implementación: 31 de octubre de 2026, Argentina. Estas cuatro etapas continúan el análisis del PDF y las mejoras anteriores. Los cambios se aplicaron a PostgreSQL con respaldo previo.

## 1. Dueños y empleados

Los dueños usan un acceso ADMIN y operan directamente. Se pueden crear varios accesos de dueño desde Configuración. Los empleados usan EMPLEADO.

- Los empleados no reciben costo de compra, ofertas de proveedores ni costo histórico de las líneas de venta en las respuestas JSON. El filtro también cubre las devoluciones y la recuperación de ventas. Los módulos de compras y reportes siguen reservados a ADMIN.
- Productos oculta la columna de costo y la valuación para empleados.
- Durante un turno abierto, el empleado no recibe el efectivo esperado. Cuenta y declara primero. Después de confirmar el cierre ve el resultado guardado. El dueño mantiene su vista de control.
- Configuración → Controles para empleados permite establecer recargo máximo (%) y monto máximo de movimientos/retiros sin autorización. Ambos comienzan en cero: cualquier importe positivo requiere autorización. Los límites no afectan a los dueños.
- Para superar el límite, se elige un dueño, se ingresa su PIN y un motivo. Se valida el rol y queda auditoría. Nunca se guarda el PIN en el carrito.

El cierre ciego oculta el esperado del turno; no pretende impedir que un empleado recuerde o calcule ventas que conoce. Los empleados conservan acceso al historial operativo y a cuentas de clientes según la política actual.

## 2. Datos entre equipos y cobros inciertos

Cada diez segundos, mientras la ventana está visible, y al recuperar foco, se actualizan productos, precios, existencias, clientes, turno, modo de stock y contador de notas. Los formularios abiertos conservan sus datos. Se muestra la conexión y la hora de actualización en el menú lateral. Las respuestas antiguas de una consulta no reemplazan una actualización más reciente.

Si cambia el precio de un producto del carrito, se informa y se cierra la preparación del cobro para revisar el total. El servidor también compara el precio esperado por línea. Cambios de precio y de modo de stock se rechazan antes de registrar una venta incompatible.

Las fichas de productos incluyen versión. Cualquier cambio de la ficha, incluido stock, incrementa su versión mediante un trigger de PostgreSQL. Una edición abierta antes de ese cambio se rechaza con un aviso para reabrir y revisar; no pisa datos nuevos.

Los carritos se conservan en el almacenamiento local del navegador. Antes de enviar un cobro se conserva la solicitud exacta y su clave. Si se pierde la respuesta, se consulta la venta por esa clave. Si sigue sin poder conocerse el resultado, se muestra **Verificar / reintentar la misma operación** y se protege la edición del carrito. El reintento usa los datos originales y no crea otra venta. Un rechazo confirmado permite corregir el carrito. Si vence la sesión, se vuelve al ingreso conservando la operación pendiente.

Esto permite recuperar un resultado incierto; no habilita ventas sin conexión al servidor. No se deben borrar los datos del navegador mientras haya un cobro pendiente. Para dos computadoras, ambas deben usar el mismo servidor PostgreSQL y acceder al servidor POS configurado para la red: copiar el repositorio no comparte los datos y este cambio no abre puertos ni configura una VPN automáticamente.

## 3. Arranque y recuperación

Se instalaron en esta PC el acceso directo de escritorio **El Universo POS** y el inicio al entrar a Windows. Iniciar El Universo también puede abrirse desde la carpeta del proyecto.

El iniciador comprueba si el sistema está disponible; si hace falta, inicia PostgreSQL del proyecto, aplica migraciones y abre el POS en segundo plano. Registros: `.postgres/pos.log` y `.postgres/pos-error.log`. El arranque usa la versión compilada: después de cambiar código hay que generar la pantalla con `npm run build` y reiniciar para usar los cambios del servidor.

Para desactivar solo el inicio con Windows: `npm run startup:remove`. Para instalar los accesos en otra PC: `npm run startup:install`. No se probó un reinicio completo de Windows durante el desarrollo.

### Restaurar una copia

1. Revisar que no haya ventas en proceso y avisar a quienes estén usando otros equipos.
2. Abrir **Restaurar El Universo.cmd**. Elegir un respaldo de la lista.
3. Escribir **RESTAURAR COPIA**. Se crea una base nueva, se restaura y se actualiza su estructura si corresponde. Se comprueban compatibilidad y conciliación de stock/cuentas. La base original permanece intacta.
4. Si se quiere usar esa copia, abrir **Detener El Universo.cmd** y escribir **USAR COPIA** en el asistente. El cambio se bloquea si todavía responde el servidor POS.
5. Se intenta generar otro respaldo de la base actual y se conserva su configuración anterior en `.postgres`. Si no se puede respaldar por una falla, se exige otra confirmación explícita para continuar.
6. Abrir **Iniciar El Universo** y revisar Configuración → Reconciliar y las últimas operaciones. La base anterior y las copias de diagnóstico no se borran automáticamente.

El rol utilizado para restaurar necesita permiso para crear una base. En PostgreSQL local, el asistente usa la administración privada del clúster del proyecto; en un servidor remoto hay que disponer de los permisos necesarios. Para recuperar en otra máquina se necesita instalar el proyecto y PostgreSQL, configurar la conexión y disponer del respaldo.

### Copia fuera del disco

La segunda carpeta existente continúa en `C:/Users/Seiber/Documents/Codigo/Respaldo_POS`. Es una copia separada en C:, no una copia fuera de ese disco.

Configuración → Inicio y recuperación permite agregar una carpeta adicional, sin quitar la copia actual. Puede ser un pendrive, otro disco o una carpeta sincronizada. La ruta se guarda en `backup-settings.json` dentro de la carpeta primaria de respaldos, sin credenciales. Después hay que pulsar **Respaldar ahora** para comprobar la copia.

El programa comprueba escritura y compara SHA-256 de cada dump copiado antes de confirmarlo. Si el dispositivo no está disponible, conserva el respaldo local e informa el error. No puede certificar que una aplicación de nube ya subió el archivo. Las copias secundarias no se borran con la rotación de quince días de la carpeta primaria.

**Pendiente de ubicación:** no se eligió una unidad externa ni una nube por cuenta del usuario. Sigue pendiente su ruta y una recuperación en otra computadora física.

## 4. Gestión comercial

### Fiados digitales

Clientes y fiados → Registrar pago permite efectivo, transferencia, Mercado Pago y débito. Para un medio digital exige referencia y confirmación de que se verificó la acreditación. Registrar el pago no mueve dinero bancario ni confirma por sí solo una transferencia real.

Cada pago enviado por la pantalla tiene clave de reintento. No duplica el descuento de deuda; rechaza reutilizar la clave con otros datos. Solo el efectivo aumenta el arqueo de caja. El historial, el PDF de cuenta y los reportes reconocen todos los medios.

### Tickets y WhatsApp

El comprobante principal incorpora fecha, hora, cajero, cliente, productos y medios de pago. Permite elegir 58 mm, 80 mm u hoja/PDF para impresión. El ancho efectivo depende de configurar el papel correcto en la impresora; falta verificar el dispositivo físico del local.

Comprobantes y resúmenes usan el teléfono guardado cuando tiene al menos diez dígitos; si no, abren para elegir destinatario. Cargar el teléfono en formato internacional, por ejemplo 549 más característica y número para un celular argentino, sin el 0 de característica ni el 15 local. No se inventa un prefijo para números incompletos. Preparar el enlace no equivale a enviar ni entregar un mensaje. El ticket es interno, sin emisión fiscal.

### Compras y proveedor

Proveedores y faltantes → Recibir compra:

1. Elegir proveedor y número de factura/remito/referencia.
2. Agregar productos, cantidades y costo por unidad o kilo. Se admite un producto por línea y hasta cien productos en una recepción. Para varias fechas del mismo artículo, registrar recepciones separadas.
3. Indicar, si corresponde, flete/gastos para repartirlos proporcionalmente al importe de los artículos. El último renglón absorbe el redondeo.
4. Lote y vencimiento son opcionales.
5. Confirmar. Todo se guarda junto: compra, cantidades en Kardex, costo anterior/nuevo y deuda con el proveedor. La actualización usa el costo de la última recepción con gastos, no promedio ponderado. No modifica precio de venta ni costo histórico de ventas.

La recepción suma stock aun cuando las ventas estén en modo sin control de stock. Si la ficha de un artículo cambió durante la carga, se rechaza toda la recepción; el botón Actualizar fichas permite revisar y reintentar. La misma clave no registra dos compras.

El listado permite ver detalle, total, saldo y pagos. **Registrar pago** admite entrega parcial o total; efectivo exige fondos y resta de caja, un digital exige referencia/verificación. Los pagos concurrentes o repetidos no superan ni duplican la deuda. No hay reversión automática de recepciones confirmadas: los errores requieren ajuste y revisión documentados.

### Vencimientos

Las recepciones pueden crear avisos por lote y también se pueden cargar vencimientos de mercadería que ya está en el local, sin sumarla otra vez al stock. Se resaltan vencidos y próximos siete días. El listado tiene páginas y conserva los avisos hasta su revisión.

**La cantidad es la recibida/anotada; no es saldo físico por lote.** El POS vende por producto y no identifica el lote entregado. Por eso no se descuenta ni se supone agotado un lote automáticamente. Revisar físicamente y cerrar el aviso con motivo. Si se retira mercadería vencida, registrar también el ajuste real en Productos → Stock. Los avisos no bloquean automáticamente una venta ni envían mensajes externos.

### Reportes y gastos

Resumen del negocio agrega:

- Ventas netas por cajero y hora de Argentina. Las devoluciones se descuentan en la fecha/hora del reintegro y se atribuyen al cajero de la venta original.
- Ventas de productos por categoría actual, sin recargo ni venta rápida, descontando bases devueltas.
- Inventario al costo conocido y cantidad de artículos con costo cargado.
- Productos sin ventas en el período seleccionado y stock actual. No equivale a días exactos desde la última venta.
- Antigüedad de fiados actuales, imputando pagos/créditos a las compras más antiguas, y fecha de último pago.
- Cobros de fiado por medio y deuda actual con proveedores.
- Gastos de caja clasificados y salidas sin clasificar. Caja → Movimiento manual permite distinguir gasto, retiro del dueño e ingreso/aporte.
- Margen conocido menos gastos registrados, señalado como parcial. Compras de mercadería y retiros personales no se descuentan como gasto otra vez. No es una ganancia neta fiscal: faltan costos desconocidos, gastos no registrados e impuestos.

Los nuevos datos también se incluyen en PDF y CSV. No hay conciliación bancaria automática, cuenta de gastos digitales completa ni liquidación de tarjetas. Las categorías corresponden a la clasificación actual; el costo de cada venta conserva su valor histórico.

## Evidencia de verificación

- Compilación aprobada y 46 pruebas automatizadas aprobadas, sin omisiones ni fallos en la última ejecución.
- Nuevos casos: privacidad, arqueo ciego, autorizaciones, precio cambiado, ficha antigua, respuesta de cobro perdida, recepción y pagos concurrentes/idempotentes, costos históricos, lotes, gastos, copias adicionales y restauración aislada.
- Se restauró también el respaldo real previo a las migraciones en otra base local, se actualizaron sus migraciones y se compararon huellas de productos, clientes, ventas, líneas, pagos, movimientos de stock y de cuenta. Sin diferencias: 317 productos y 10 ventas al verificar. La configuración principal no se cambió a la copia.
- Conciliación del comercio aprobada. No se registraron compras, pagos, ventas ni ajustes de prueba en el esquema del comercio.
- Navegador: recepción ficticia con lote y vencimiento en demostración; revisión de Configuración. Evidencia en `output/qa/gestion-compras-vencimientos.png`.
- Pendientes físicos: reinicio de Windows, lector, impresora, red de dos equipos, jornada real y restauración en otra computadora. La validación de cortes de cobro incluye pruebas de lógica y servidor; no se simuló un corte eléctrico físico.

No se hizo commit ni push. Los datos operativos y credenciales siguen fuera de Git.
