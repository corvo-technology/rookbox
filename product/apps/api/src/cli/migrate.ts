// `pnpm db:migrate`: applies pending migrations and exits. The server does the same at start.
import { fileURLToPath } from "node:url";
import { applyMigrations } from "../migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL is required\n");
  process.exit(1);
}
const dir =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../prisma/migrations", import.meta.url));
const applied = await applyMigrations(url, dir);
process.stdout.write(`Applied ${applied.length} migration(s).\n`);
