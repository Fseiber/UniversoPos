import { db, type Tx } from "./db.js";
export async function stockSettings(client: Tx = db) {
  return (
    (await client.posSettings.findUnique({ where: { id: 1 } })) ?? {
      id: 1,
      stockEnabled: true,
      version: 0,
    }
  );
}
