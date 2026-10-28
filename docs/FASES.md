> Actualización 28/10/2026: PostgreSQL reemplaza SQLite como motor actual. Los detalles de puesta en marcha y operación compartida están en [POSTGRESQL.md](POSTGRESQL.md). Las referencias a SQLite en las fases anteriores describen la implementación original.

# El Universo POS — hoja de ruta

Fuente: chat «Punto Venta», última reorganización del usuario. El cambio posterior a React/Express/TypeScript reemplaza Django. No se mantienen dos implementaciones.

Cada fase pasa por desarrollo, pruebas y cierre. Las actualizaciones se entregan en este chat al cerrar cada fase. Los límites de validación externa se declaran explícitamente.

| Fase            | Alcance                                                                                                                  | Estado                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Base técnica    | React/Vite/TypeScript, Express, Prisma, SQLite, migraciones y configuración                                              | Compilación aprobada                                                   |
| 0 — MVP         | Empleados/PIN/roles, productos, caja/arqueo, clientes/límites, ventas efectivo/fiado, cobro de deudas, Kardex, auditoría | Implementada y probada localmente                                      |
| 1 — Mostrador   | Carritos simultáneos, venta por monto, pagos mixtos, movimientos de caja, recargos                                       | Implementada y probada localmente                                      |
| 2 — Catálogo    | Granel, ofertas por cantidad, proveedores/comparador, margen, faltantes                                                  | Implementada y probada localmente                                      |
| 3 — Excepciones | Anulación con autorización ADMIN, ventas pendientes con stock entregado                                                  | Implementada y probada localmente                                      |
| 4 — Gestión     | Visor MP tolerante a fallos, comprobantes, reportes, panel móvil, consulta de auditoría                                  | Implementada; validación real MP/teléfono pendiente                    |
| 5 — Producción  | Backups/rotación, reconciliación, temas, instrucciones de instalación y operación                                        | Herramientas locales probadas; puesta en marcha en el kiosco pendiente |

## Decisiones de implementación

- Aplicación local: Express sirve la compilación de React; Vite se usa solamente para desarrollo. SQLite reside en la PC del local. No se publica en Sites.
- Prisma es fuente del esquema y las migraciones se versionan. Dinero con dos decimales y cantidades con tres mediante Decimal. Los cálculos usan Decimal; las actualizaciones se realizan dentro de transacciones y guardan valores calculados, evitando aritmética flotante de SQLite.
- PagoVenta existe desde el inicio. Cobro de deudas y efectivo inicial entran en el arqueo; fiado y cobros digitales no aumentan el efectivo.
- Sesiones aleatorias revocables en cookie HttpOnly, PIN hasheado, bloqueo temporal y permisos en el servidor. No se guardan tokens en localStorage.
- Stock inicial, ajustes y ventas generan movimientos. Una venta rechazada no deja deuda ni movimientos parciales.
- Las fases posteriores a F0 amplían las mismas operaciones; pendientes descuentan stock al entregar y registran cobros al saldar.
- Mercado Pago requiere credenciales del titular. Acceso remoto/HTTPS e instalación física requieren el entorno real. No se declara verificado lo que no pueda probarse localmente.
