import "dotenv/config";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { app } from "./app.js";
import { db, initializeDatabase } from "./db.js";
import { automaticBackup } from "./backups.js";
await initializeDatabase();
const dist = path.resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, process.env.HOST ?? "127.0.0.1", () =>
  console.log(
    `El Universo POS: http://${process.env.HOST ?? "127.0.0.1"}:${port}`,
  ),
);
await automaticBackup();
const daily = setInterval(() => {
  void automaticBackup();
}, 24 * 3600_000);
daily.unref();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(daily);
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
