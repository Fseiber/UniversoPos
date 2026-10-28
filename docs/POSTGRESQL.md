# PostgreSQL en El Universo POS

## Estado de esta implementación

Prisma usa PostgreSQL 17+, con dinero `DECIMAL(18,2)` y cantidades `DECIMAL(18,3)`.
Las migraciones PostgreSQL están en `prisma/migrations`; las migraciones SQLite
anteriores se conservaron en `prisma/legacy-sqlite` para pruebas y recuperación.
No se aplican migraciones SQLite sobre PostgreSQL.

La instancia local de este proyecto es independiente del servicio PostgreSQL que
ya estaba instalado en Windows. Sus datos y credenciales están en `.postgres/`,
excluida de Git; la conexión del programa está en `.env`, también excluida.
El puerto real está en `.env`: el inicializador usa 55432 o uno libre si está ocupado.
No borrar `.postgres/`: ahora contiene datos del comercio.

La migración realizada trasladó 2 productos activos, 371 fichas importadas, 7 ventas,
cuentas, stock, empleados y auditoría. Conservó IDs, códigos con ceros iniciales,
precios, costos desconocidos, fechas y saldos. Se comprobó la reconciliación.
Las sesiones abiertas no se trasladan: ingresar nuevamente con el PIN habitual.
SQLite y una copia consistente previa al traslado se conservaron como respaldo.

## Arranque en esta computadora

```powershell
npm run db:local:start
npm start
```

Abrir http://127.0.0.1:3001. `Iniciar El Universo.cmd` también inicia la instancia
local si existe y luego el programa. Dejar la consola del POS abierta.

Para verificar y respaldar:

```powershell
npm run db:check
npm run db:backup
```

`db:check` consulta la conexión y reconcilia stock y cuentas; no crea operaciones.
Para detener la instancia propia, primero cerrar el POS con Ctrl+C y después
ejecutar `npm run db:local:stop`. No se cambió el arranque automático de Windows.

## Instalación nueva, con una base local independiente

Requiere Node 24 y PostgreSQL 17 o posterior, incluyendo `initdb`, `pg_ctl`,
`psql`, `pg_dump` y `pg_restore`. En Windows se detecta la carpeta estándar;
si usás otra instalación, configurar `PG_BIN` en `.env` o en el entorno.

```powershell
npm ci
npm run db:local:init
npm run setup
npm run build
npm start
```

El inicializador genera contraseñas aleatorias, autenticación SCRAM y una cuenta
de aplicación que no es superusuario. La instancia escucha solo en loopback.
No reemplaza una conexión PostgreSQL distinta ya configurada en `.env`.
No es necesario instalar una base en cada notebook si se comparte el servidor.

## PC y notebook con los mismos datos

La configuración recomendada es **un solo servidor del POS**, conectado a una sola
base PostgreSQL. Ambos equipos usan la misma dirección de la aplicación.

1. Elegir la PC o servidor que permanecerá encendido. Allí quedan `.env`, PostgreSQL
   y los respaldos. Mantener una base separada para desarrollo y pruebas.
2. Para acceder desde la red local, configurar `HOST=0.0.0.0` en el `.env` de ese
   servidor y reiniciar el POS. El puerto de aplicación es `PORT` (normalmente 3001).
3. Permitir ese puerto en el firewall solo para la red privada necesaria. No se
   modificaron reglas del firewall automáticamente.
4. En la notebook abrir `http://IP-DE-LA-PC:3001`. No usar `127.0.0.1` allí:
   esa dirección apunta a la propia notebook. Actualizar la pantalla para consultar
   cambios que otro equipo haya realizado.
5. Para acceso desde fuera del local, preparar VPN o un proxy HTTPS. Con HTTPS,
   configurar `COOKIE_SECURE=true`. No abrir PostgreSQL directamente a Internet.

Si alojás el backend y PostgreSQL en la nube, reemplazar `DATABASE_URL` en el
servidor por la conexión de ese alojamiento y configurar `PG_BIN` para sus respaldos.
El programa necesita conexión con el servidor para operar: no se implementó un
modo de ventas offline con sincronización posterior.

Si se ejecutan dos backends, ambos deben apuntar a la MISMA base y al MISMO esquema;
crear dos bases PostgreSQL locales independientes no comparte datos. Se conserva
el modelo actual de un único turno abierto para todo el comercio.

## Qué cambió respecto de la sincronización por Git

- Se retiraron `prestart`/`predev` que importaban/exportaban JSON.
- Los hooks ya no agregan catálogo a commits ni modifican la base después de un pull.
- Se retiraron del índice de Git los JSON que estaban preparados para publicar.
  Sus copias locales están en `.legacy-git-catalog/`, ignorada.
- `CatalogLink` ya no forma parte del esquema PostgreSQL.
- `catalog:sync` informa que fue retirado; no toca la base.
- `npm run catalog:hooks` desactiva la antigua ruta `.githooks` en ese clon si estaba
  configurada. Conserva hooks de otras herramientas.

Git comparte código y migraciones, **los datos se guardan en PostgreSQL**.
No versionar `.env`, `.postgres`, bases SQLite ni respaldos.

## Trasladar otra base SQLite existente

Primero detener el POS antiguo y mantenerlo detenido durante el corte. No juntar
dos bases con ventas diferentes mediante esta herramienta: requiere conciliación
específica. El destino PostgreSQL debe estar vacío; el importador se niega a
mezclar, truncar o sobrescribir registros existentes.

```powershell
# Con DATABASE_URL apuntando al destino PostgreSQL vacío:
npm run setup
npm run db:import-sqlite -- --source prisma/universo.db
# Revisar los recuentos; el comando anterior es una vista previa.
npm run db:import-sqlite -- --source prisma/universo.db --apply
npm run db:check
npm run db:backup
```

Se hace un snapshot con la API de respaldo SQLite, incluyendo WAL, y se lee ese
snapshot. Toda la copia a PostgreSQL se confirma en una transacción. Un error deja
el destino sin los registros parciales. Se restauran las secuencias para que los
IDs siguientes no choquen. Los costos desconocidos siguen siendo `NULL`.

## Respaldos y recuperación

El sistema usa `pg_dump --format=custom`, con archivos `universo-<fecha>.dump`.
Se hacen al iniciar, al abrir/cerrar caja, cada 24 horas y desde Configuración.
La copia solo se considera confirmada cuando termina `pg_dump`; un fallo elimina
el archivo parcial. La rotación borra solo dumps propios con más de 15 días.
Las copias SQLite históricas no se borran por esa rotación.

Configurar `BACKUP_DIR` en otra unidad o destino de respaldo. Debe existir un
`pg_dump` compatible con la versión del servidor; las credenciales se transmiten
por entorno del proceso, sin incluirlas en los argumentos ni publicarlas.
El dump incluye el esquema indicado en `DATABASE_URL` y sus registros.

Para recuperar, mantener la base actual intacta y usar una **base vacía distinta**.
La creación de esa base requiere un rol con permiso `CREATEDB` o asistencia del
administrador del servidor; la cuenta normal de la aplicación no tiene ese permiso:

```powershell
# Usar las herramientas de la instalación PostgreSQL, con las credenciales
# del destino configuradas en PGHOST, PGPORT, PGUSER y autenticación segura.
createdb el_universo_recuperacion
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname=el_universo_recuperacion "RUTA/AL/RESPALDO.dump"
```

No ejecutar primero `setup` en esa base vacía: el dump ya contiene tablas y las
migraciones aplicadas. Después de restaurar, cambiar `DATABASE_URL` del servidor
al destino recuperado, aplicar `npm run setup` si el código tiene migraciones
posteriores y ejecutar `npm run db:check`. Revocar las sesiones recuperadas o
cambiar los PIN de los empleados antes de reabrir. La recuperación vuelve al
estado de la fecha del respaldo; no incluye operaciones posteriores.

## Actualizar el código

Con la aplicación detenida, en el servidor:

```powershell
git pull --ff-only
npm ci
npm run setup
npm run build
npm start
```

En equipos que solo usan el navegador no se necesita clonar ni actualizar código.
No ejecutar el importador SQLite en cada actualización.

## Pruebas

`npm test` usa esquemas PostgreSQL temporales `test_<aleatorio>` y los elimina al
terminar; no trunca el esquema del comercio. Puede usarse `TEST_DATABASE_URL` para
un servidor dedicado de pruebas; la cuenta debe poder crear esquemas. Se verifican
ventas/fiados simultáneos, idempotencia, códigos únicos entre activos y pendientes,
traslado SQLite con rollback, conservación de stock, secuencias y restauración de
un dump real. Se mantiene una prueba del historial de migraciones SQLite archivado.

`npm run demo` usa el esquema separado `universo_demo` y PIN ficticio 246810 en el
puerto 3002. Nunca preparar la demostración en el esquema de producción.

Referencias: [transacciones Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions),
[respaldos PostgreSQL](https://www.postgresql.org/docs/17/app-pgdump.html),
[restauración](https://www.postgresql.org/docs/17/app-pgrestore.html).
