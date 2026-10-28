import { execFileSync } from "node:child_process";
let previous = "";
try {
  previous = execFileSync("git", ["config", "--get", "core.hooksPath"], {
    encoding: "utf8",
  }).trim();
} catch {}
if (previous === ".githooks")
  execFileSync("git", ["config", "--local", "--unset", "core.hooksPath"], {
    stdio: "inherit",
  });
console.log(
  "La sincronización del catálogo por Git se retiró. PostgreSQL comparte los datos; Git se usa para código y migraciones. Los hooks de otras herramientas se conservan.",
);
