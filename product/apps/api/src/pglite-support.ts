// Test support: a real PostgreSQL engine (PGlite, WASM, no Docker) with the product's real
// migrations and the real provisioning step applied. Not imported by the server.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { readMigrations } from "./migrate.js";
import { provisionRuntimeRole, type SqlRunner } from "./provision.js";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../prisma/migrations", import.meta.url));
export const RUNTIME_LOGIN = "rookbox_runtime";
export const RUNTIME_PASSWORD = "runtime-secret";
export const RUNTIME_URL = `postgres://${RUNTIME_LOGIN}:${RUNTIME_PASSWORD}@localhost/rookbox`;

export function runner(lite: Pick<PGlite, "query">): SqlRunner {
  return {
    query: async (sql, params) => ({
      rows: (await lite.query(sql, params as never)).rows as never,
    }),
  };
}

/**
 * A fresh database: every Prisma migration in order (as the owner, which in PGlite is the
 * superuser), the migrations ledger, then provisioning of the runtime login.
 */
export async function createDatabase(): Promise<PGlite> {
  const lite = await PGlite.create();
  for (const migration of await readMigrations(MIGRATIONS_DIR)) await lite.exec(migration.sql);
  await lite.exec(
    `CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY, "migration_name" TEXT)`,
  );
  const provisioned = await provisionRuntimeRole(runner(lite), RUNTIME_URL);
  if (provisioned.warning) throw new Error(provisioned.warning);
  return lite;
}

export const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function userSql(id: string): string {
  return `INSERT INTO "user" ("id","name","email","updatedAt") VALUES (${q(id)}, ${q(id)}, ${q(`${id}@example.test`)}, now())`;
}

export function machineSql(id: string, ownerId: string): string {
  return `INSERT INTO "machine" ("id","ownerId","name","template","vcpu","memoryMib","diskMib") VALUES (${q(id)}, ${q(ownerId)}, ${q(`name-${id}`)}, 'desktop-v2', 1, 1024, 4096)`;
}

export function apiKeySql(id: string, userId: string): string {
  return `INSERT INTO "api_key" ("id","userId","name","hint","keyHash") VALUES (${q(id)}, ${q(userId)}, 'key', 'rbx_', ${q(`hash-${id}`)})`;
}

/** Two users with a machine and a key each, written as the owner. */
export async function seedTwoUsers(lite: PGlite): Promise<void> {
  await lite.exec(
    [
      userSql("user-a"),
      userSql("user-b"),
      machineSql("m-a", "user-a"),
      machineSql("m-b", "user-b"),
      apiKeySql("k-a", "user-a"),
      apiKeySql("k-b", "user-b"),
    ]
      .map((sql) => `${sql};`)
      .join("\n"),
  );
}
