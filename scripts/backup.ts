import "dotenv/config";
import { createBackup } from "../server/backups.js";
console.log(await createBackup());
