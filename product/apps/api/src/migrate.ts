import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

/** Prisma's own bookkeeping table, so a database migrated here stays valid for `prisma migrate`. */
const MIGRATIONS_TABLE = "_prisma_migrations";
/** Arbitrary key that serializes concurrent starts. */
const MIGRATION_LOCK_KEY = 4_823_719_502;

export type Migration = { name: string; sql: string; checksum: string };

/** Migration folders (`<timestamp>_<name>/migration.sql`) in the order they must run. */
export async function readMigrations(dir: string): Promise<Migration[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => {
    throw new Error(`Migrations folder not found: ${dir}`);
  });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrations: Migration[] = [];
  for (const name of names) {
    const sql = await readFile(path.join(dir, name, "migration.sql"), "utf8").catch(() => null);
    if (sql === null) continue;
    migrations.push({ name, sql, checksum: createHash("sha256").update(sql).digest("hex") });
  }
  return migrations;
}

/**
 * Applies the migrations the database has not recorded yet, the way `prisma migrate deploy`
 * does, without the Prisma CLI so the production image stays small.
 */
export async function applyMigrations(url: string, dir: string): Promise<string[]> {
  const migrations = await readMigrations(dir);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`);
    const done = await client.query<{ migration_name: string }>(
      `SELECT "migration_name" FROM "${MIGRATIONS_TABLE}" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
    );
    const finished = new Set(done.rows.map((row) => row.migration_name));
    for (const migration of migrations) {
      if (finished.has(migration.name)) continue;
      const id = randomUUID();
      await client.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" ("id", "checksum", "migration_name") VALUES ($1, $2, $3)`,
        [id, migration.checksum, migration.name],
      );
      try {
        await client.query(migration.sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await client.query(`UPDATE "${MIGRATIONS_TABLE}" SET "logs" = $2 WHERE "id" = $1`, [
          id,
          message,
        ]);
        throw new Error(`Migration ${migration.name} failed: ${message}`);
      }
      await client.query(
        `UPDATE "${MIGRATIONS_TABLE}" SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1`,
        [id],
      );
      applied.push(migration.name);
    }
    return applied;
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    await client.end();
  }
}
