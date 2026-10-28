# Sincronización de catálogo por Git retirada

Esta propuesta fue reemplazada por PostgreSQL compartido. No ejecutar exportaciones
ni importar productos automáticamente con cada commit/pull. Git se usa para código
y migraciones; productos, stock, ventas y fiados se guardan en el servidor PostgreSQL.

Los JSON no publicados se conservaron localmente en `.legacy-git-catalog/`, ignorada
por Git. No usarlos para sobrescribir la base nueva. `npm run catalog:hooks` desactiva
los hooks anteriores de este proyecto en cada clon que los haya habilitado.

Ver [instalación, traslado, respaldo y acceso desde la notebook](POSTGRESQL.md).
