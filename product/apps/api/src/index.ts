import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApiKeyService, createPrismaApiKeyStore } from "./api-keys.js";
import { createApp } from "./app.js";
import { createAuth, createIdentity, createIsActive, seedOwner } from "./auth.js";
import { createDb } from "./db.js";
import { createDesktopProxy } from "./desktop.js";
import { createDesktopTokens, deriveSecret } from "./desktop-token.js";
import { adminEmails, desktopOrigin, loadEnv, routeLimits } from "./env.js";
import { createLogger } from "./logger.js";
import { createMachineService } from "./machines/service.js";
import { createPrismaMachineStore } from "./machines/store.js";
import { applyMigrations } from "./migrate.js";
import { createRateLimiter } from "./rate-limit.js";
import { reconcile, startReconciler } from "./reconcile.js";
import { createThrottle } from "./route-limits.js";
import { createEcwClient } from "./space/client.js";
import { createIngestHandler } from "./usage/ingest.js";
import { createPrismaUsageStore } from "./usage/prisma-store.js";
import { createUsageService } from "./usage/service.js";

const bootLogger = createLogger("info", { service: "rookbox-api" });

try {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, { service: "rookbox-api" });

  if (env.COOKIE_DOMAIN) {
    logger.warn(
      "COOKIE_DOMAIN is set: the session cookie is sent to every subdomain of it, including machine hosts. Unset it.",
      { domain: env.COOKIE_DOMAIN },
    );
  }
  if (env.NODE_ENV === "production") {
    if (env.TRUSTED_PROXY_HOPS === 0) {
      logger.warn(
        "TRUSTED_PROXY_HOPS is 0: client addresses are the proxy's, so per-address limits are shared by everyone. Set it to the number of proxies in front of the API.",
      );
    }
    if (!env.DESKTOP_HOST) {
      logger.warn(
        "DESKTOP_HOST is not set: the desktop is served from the API's own origin. Serve it from its own host.",
      );
    }
    if (!env.DESKTOP_LINK_SECRET) {
      logger.warn(
        "DESKTOP_LINK_SECRET is not set: desktop links are signed with a key derived from BETTER_AUTH_SECRET.",
      );
    }
  }

  if (env.RUN_MIGRATIONS) {
    const dir =
      env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../prisma/migrations", import.meta.url));
    const applied = await applyMigrations(env.DATABASE_URL, dir);
    logger.info("migrations applied", { count: applied.length, names: applied });
  }

  const { db, close } = createDb(env.DATABASE_URL);
  const apiKeys = createApiKeyService(createPrismaApiKeyStore(db));
  const auth = createAuth(db, env, logger, { allowSignUp: false });
  const identity = createIdentity({
    auth,
    apiKeys,
    db,
    allowedEmails: new Set(env.ROOKBOX_ALLOWED_EMAILS),
  });
  const space = createEcwClient({
    baseUrl: env.SPACE_ECW_API_URL,
    apiKey: env.SPACE_ECW_API_KEY,
    domain: env.E2B_DOMAIN,
    timeoutMs: env.SPACE_TIMEOUT_MS,
    maxOutputBytes: env.EXEC_MAX_OUTPUT_BYTES,
  });
  const store = createPrismaMachineStore(db);
  const machines = createMachineService({
    store,
    space,
    logger,
    e2bDomain: env.E2B_DOMAIN,
    templates: env.SPACE_TEMPLATES,
    defaultIdleTimeoutS: env.MACHINE_IDLE_TIMEOUT_S,
    maxMachinesPerUser: env.MAX_MACHINES_PER_USER,
    maxRunningTotal: env.MAX_RUNNING_MACHINES_TOTAL,
    allowInternet: env.MACHINE_ALLOW_INTERNET,
  });
  const desktop = createDesktopProxy({
    machines,
    tokens: createDesktopTokens({
      secret: env.DESKTOP_LINK_SECRET ?? deriveSecret(env.BETTER_AUTH_SECRET),
      previousSecret: env.DESKTOP_LINK_SECRET_PREVIOUS,
    }),
    e2bDomain: env.E2B_DOMAIN,
    origin: desktopOrigin(env),
    appOrigin: env.APP_ORIGIN,
    host: env.DESKTOP_HOST ?? null,
    linkTtlS: env.DESKTOP_LINK_TTL_S,
    sessionTtlS: env.DESKTOP_SESSION_TTL_S,
    isActive: createIsActive(db),
    logger,
  });

  const usage = createUsageService({
    store: createPrismaUsageStore(db),
    logger,
    adminEmails: env.ADMIN_EMAILS ?? env.ROOKBOX_ALLOWED_EMAILS.slice(0, 1),
  });
  if (!env.INGEST_SECRET) logger.warn("INGEST_SECRET is not set: usage is not being recorded");

  const seeded = await seedOwner(db, env, logger);
  if (seeded === "skipped") logger.info("no owner seed requested");

  const reconcileDeps = {
    store,
    space,
    logger,
    stuckAfterMs: env.RECONCILE_STUCK_AFTER_S * 1_000,
    orphanGraceMs: env.RECONCILE_ORPHAN_GRACE_S * 1_000,
  };
  const stopReconciler =
    env.RECONCILE_INTERVAL_S > 0
      ? startReconciler(
          reconcileDeps,
          { act: env.RECONCILE_ACT, killOrphans: env.RECONCILE_KILL_ORPHANS },
          env.RECONCILE_INTERVAL_S,
        )
      : () => undefined;

  const app = createApp({
    appOrigin: env.APP_ORIGIN,
    logger,
    identity,
    authHandler: (request) => auth.handler(request),
    machines,
    apiKeys,
    desktop,
    desktopHost: env.DESKTOP_HOST ?? null,
    throttle: createThrottle(routeLimits(env), { enabled: env.RATE_LIMITS_ENABLED }),
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
    admins: new Set(adminEmails(env)),
    users: {
      async findIdByEmail(email) {
        return (await db.user.findUnique({ where: { email } }))?.id ?? null;
      },
    },
    reconcile: (mode) => reconcile(reconcileDeps, mode),
    space,
    usage,
    ingestUsage: createIngestHandler({ secret: env.INGEST_SECRET, usage, logger }),
    signInLimiter: createRateLimiter({
      max: env.SIGNIN_MAX_ATTEMPTS,
      windowMs: env.SIGNIN_WINDOW_S * 1_000,
    }),
    checkDb: async () => {
      await db.$queryRaw`SELECT 1`;
    },
  });

  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
    logger.info("api listening", { host: env.HOST, port: info.port });
  });
  desktop.attach(server as never);

  const shutdown = () => {
    stopReconciler();
    server.close(() => void close().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} catch (error) {
  bootLogger.error("api failed to start", { error });
  process.exit(1);
}
