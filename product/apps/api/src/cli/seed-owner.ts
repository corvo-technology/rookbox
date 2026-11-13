// `pnpm owner:seed`: creates the owner account (the first ROOKBOX_ALLOWED_EMAILS entry) from
// ROOKBOX_SEED_OWNER_PASSWORD, then exits. Needs the same environment as the server.
import { seedOwner } from "../auth.js";
import { createDb } from "../db.js";
import { loadEnv } from "../env.js";
import { createLogger } from "../logger.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, { service: "rookbox-api" });
const { db, close } = createDb(env.DATABASE_URL);
try {
  const result = await seedOwner(db, env, logger);
  process.stdout.write(`Owner account: ${result}\n`);
} finally {
  await close();
}
