// `pnpm db:migrate`: applies pending migrations and exits. The server does the same at start.
import { fileURLToPath } from "node:url";
import { applyMigrations } from "../migrate.js";
import { databaseUrls, provisionDatabase } from "../provision.js";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL is required\n");
  process.exit(1);
}
const dir =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../prisma/migrations", import.meta.url));
const urls = databaseUrls({
  DATABASE_URL: url,
  DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
});
const applied = await applyMigrations(urls.migrationUrl, dir);
process.stdout.write(`Applied ${applied.length} migration(s).\n`);
const provisioned = await provisionDatabase(urls);
process.stdout.write(
  provisioned.warning ? `Warning: ${provisioned.warning}\n` : "Runtime login provisioned.\n",
);
