console.error(
  "La sincronización por Git se retiró: PostgreSQL es la base compartida. Configurá ambos equipos para acceder al mismo servidor del POS. Ver docs/POSTGRESQL.md.",
);
process.exitCode = 1;
