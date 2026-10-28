# Operación y recuperación

## Apertura y cierre

El sistema permite un turno abierto para el comercio. Cualquier empleado activo puede operar ese turno y cada venta/movimiento conserva su autor. El efectivo esperado es fondo inicial + ventas en efectivo + cobros de deuda en efectivo + ingresos manuales - retiros y reembolsos. No incluye fiados ni cobros digitales.

Si el respaldo automático falla, una venta o cierre ya confirmado sigue guardado. Revisá Configuración y corregí espacio, conexión del USB o permisos de la carpeta. Luego ejecutá «Respaldar ahora».

No cierres el proceso mientras se confirma una operación. Para detenerlo desde la terminal, usá Ctrl+C. Las sesiones duran ocho horas; el cambio de PIN o la desactivación de un empleado revoca sus sesiones anteriores.

## Recuperar un respaldo

1. Detené todos los servidores del comercio. El proceso de demostración usa otra base, pero también conviene cerrarlo para evitar confusiones.
2. Conservá una copia de la carpeta actual `prisma/` completa, incluyendo `universo.db`, `universo.db-wal` y `universo.db-shm` si existen. No borres ni reemplaces archivos con el servidor en ejecución.
3. Elegí un respaldo confirmado y revisá su fecha. La recuperación reemplaza el estado actual por el de esa fecha; las operaciones posteriores no están incluidas.
4. En una carpeta de recuperación independiente, copiá el respaldo con nombre `universo.db`. Configurá `DATABASE_URL` con la ruta absoluta de ese archivo, por ejemplo `file:C:/Datos/Recuperacion/universo.db`. Esta estrategia conserva intacta la base anterior y evita mezclar un respaldo con archivos WAL antiguos.
5. Con el servidor detenido, ejecutá `npm run setup` para aplicar migraciones posteriores al respaldo, si las hubiera. Luego iniciá con `npm start`.
6. Ingresá, ejecutá Configuración → Reconciliar y verificá clientes, stock y cierres. Compará con el último comprobante del día. Generá un respaldo nuevo antes de retomar ventas.

El respaldo contiene sesiones que existían al crearlo; después de recuperar, cambiá los PIN desde Configuración para revocar las sesiones de esos empleados. Guardá los PIN nuevos fuera de esta documentación.

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
