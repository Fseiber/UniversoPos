# Operación y recuperación

## Apertura y cierre

El sistema permite un turno abierto para el comercio. Cualquier empleado activo puede operar ese turno y cada venta/movimiento conserva su autor. El efectivo esperado es fondo inicial + ventas en efectivo + cobros de deuda en efectivo + ingresos manuales - retiros y reembolsos. No incluye fiados ni cobros digitales.

Si el respaldo automático falla, una venta o cierre ya confirmado sigue guardado. Revisá Configuración y corregí espacio, conexión del USB o permisos de la carpeta. Luego ejecutá «Respaldar ahora».

No cierres el proceso mientras se confirma una operación. Para detenerlo desde la terminal, usá Ctrl+C. Las sesiones duran ocho horas; el cambio de PIN o la desactivación de un empleado revoca sus sesiones anteriores.

## Recuperar un respaldo

La aplicación usa PostgreSQL y respaldos `.dump` generados con `pg_dump`. Conservar
la base actual y restaurar en una base vacía distinta con `pg_restore`. El detalle
de comandos, comprobaciones y revocación de sesiones está en
[PostgreSQL: respaldos y recuperación](POSTGRESQL.md#respaldos-y-recuperación).
No copiar archivos SQLite sobre PostgreSQL ni importar SQLite en cada arranque.

## Configurar el visor Mercado Pago

El titular debe obtener su Access Token y colocarlo en `.env` como `MERCADOPAGO_ACCESS_TOKEN`. No lo pegues en el chat ni en el frontend. Reiniciá el servidor y consultá Resumen del negocio → Actividad Mercado Pago. Verificá una operación conocida en la cuenta real. El visor consulta actividad; no crea cargos ni reintegros. Ante fallos muestra la última respuesta de esa ejecución del servidor e indica si los datos están desactualizados.

## Validaciones pendientes en el local

- Probar el lector como teclado y su terminación Enter.
- Probar el tamaño de pantalla y la impresión/PDF con el navegador del comercio.
- Elegir el destino físico de backups y hacer un simulacro de recuperación en otra carpeta.
- Confirmar titulares y permisos de empleados; asignar PIN propios.
- Verificar Mercado Pago con las credenciales del comercio.
- Definir la configuración HTTPS/VPN para acceso remoto y probar desde el teléfono.
- Definir si el servidor se inicia manualmente o mediante una tarea de Windows. No se cambió la configuración de inicio de la computadora.
