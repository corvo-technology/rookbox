import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type Db = PrismaClient;

export function createDb(databaseUrl: string): { db: Db; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, keepAlive: true });
  pool.on("error", () => undefined);
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    db,
    close: async () => {
      await db.$disconnect();
      await pool.end().catch(() => undefined);
    },
  };
}
