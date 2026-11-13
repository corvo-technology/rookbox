import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApiKeyService, createPrismaApiKeyStore } from "./api-keys.js";
import { createApp } from "./app.js";
import { createAuth, createIdentity, seedOwner } from "./auth.js";
import { createDb } from "./db.js";
import { createDesktopProxy } from "./desktop.js";
import { apiOrigin, loadEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { createMachineService } from "./machines/service.js";
import { createPrismaMachineStore } from "./machines/store.js";
import { applyMigrations } from "./migrate.js";
import { createEcwClient } from "./space/client.js";

const bootLogger = createLogger("info", { service: "rookbox-api" });

try {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, { service: "rookbox-api" });

  if (env.RUN_MIGRATIONS) {
    const dir =
      env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../prisma/migrations", import.meta.url));
    const applied = await applyMigrations(env.DATABASE_URL, dir);
    logger.info("migrations applied", { count: applied.length, names: applied });
  }

  const { db, close } = createDb(env.DATABASE_URL);
  const apiKeys = createApiKeyService(createPrismaApiKeyStore(db));
  const auth = createAuth(db, env, logger, { allowSignUp: false });
  const identity = createIdentity({ auth, apiKeys, db });
  const space = createEcwClient({
    baseUrl: env.SPACE_ECW_API_URL,
    apiKey: env.SPACE_ECW_API_KEY,
    domain: env.E2B_DOMAIN,
  });
  const origin = apiOrigin(env);
  const machines = createMachineService({
    store: createPrismaMachineStore(db),
    space,
    logger,
    e2bDomain: env.E2B_DOMAIN,
    apiOrigin: origin,
    idleTimeoutS: env.MACHINE_IDLE_TIMEOUT_S,
    maxMachinesPerUser: env.MAX_MACHINES_PER_USER,
  });
  const desktop = createDesktopProxy({
    machines,
    identity,
    e2bDomain: env.E2B_DOMAIN,
    allowedOrigin: origin,
    logger,
  });

  const seeded = await seedOwner(db, env, logger);
  if (seeded === "skipped") logger.info("no owner seed requested");

  const app = createApp({
    appOrigin: env.APP_ORIGIN,
    logger,
    identity,
    authHandler: (request) => auth.handler(request),
    machines,
    apiKeys,
    desktop,
    checkDb: async () => {
      await db.$queryRaw`SELECT 1`;
    },
  });

  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
    logger.info("api listening", { host: env.HOST, port: info.port });
  });
  desktop.attach(server as never);

  const shutdown = () => {
    server.close(() => void close().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} catch (error) {
  bootLogger.error("api failed to start", { error });
  process.exit(1);
}
