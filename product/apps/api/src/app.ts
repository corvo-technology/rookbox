import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiKeyService } from "./api-keys.js";
import type { AuthUser, Identity } from "./auth.js";
import type { DesktopProxy } from "./desktop.js";
import type { Logger } from "./logger.js";
import type { MachineService } from "./machines/service.js";
import type { RateLimiter } from "./rate-limit.js";
import { createRouter } from "./router.js";
import type { SpaceClient } from "./space/client.js";

export type AppDeps = {
  appOrigin: string;
  logger: Logger;
  identity: Identity;
  /** better-auth's request handler. */
  authHandler: (request: Request) => Promise<Response>;
  machines: MachineService;
  apiKeys: ApiKeyService;
  desktop: Pick<DesktopProxy, "http">;
  /** Resolves when the database answers; `/health` reports it. */
  checkDb?: () => Promise<void>;
  /** For `/health/space`. */
  space?: Pick<SpaceClient, "probe">;
  /** Counts failed sign-ins. Without it, sign-in is not limited here. */
  signInLimiter?: RateLimiter;
  now?: () => number;
};

/** The caller's address as the proxy in front of the API reports it. */
function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export function createApp(deps: AppDeps) {
  const { logger } = deps;
  const rpc = new RPCHandler(
    createRouter({ machines: deps.machines, apiKeys: deps.apiKeys, logger }),
  );
  const app = new Hono<{ Variables: { user: AuthUser } }>();

  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    if (c.req.path.startsWith("/health")) return;
    logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  // Only the dashboard's origin may call the API from a browser.
  app.use(
    "*",
    cors({
      origin: (origin) => (origin === deps.appOrigin ? origin : ""),
      credentials: true,
      allowHeaders: ["content-type", "authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );

  const startedAt = (deps.now ?? Date.now)();

  app.get("/health", async (c) => {
    const uptimeS = Math.round(((deps.now ?? Date.now)() - startedAt) / 1000);
    try {
      await deps.checkDb?.();
      return c.json({ ok: true, db: "ok", uptimeS });
    } catch (error) {
      // The reason stays in the log: a connection error can name the database host.
      logger.error("health check failed", { error });
      return c.json({ ok: false, db: "down", uptimeS }, 503);
    }
  });

  // Whether SPACE answers and accepts the service key. It reports only the HTTP status class,
  // and answers even when no key is set, so the owner can check a fresh deploy.
  let spaceCache: { at: number; body: unknown; ok: boolean } | null = null;
  app.get("/health/space", async (c) => {
    const now = (deps.now ?? Date.now)();
    if (!spaceCache || now - spaceCache.at > 5_000) {
      const probe = (await deps.space?.probe()) ?? null;
      const ok = probe?.reachable === true && probe.auth === "ok";
      spaceCache = {
        at: now,
        ok,
        body: probe ? { ok, ...probe } : { ok: false, reachable: false, auth: "unknown" },
      };
      if (!ok) logger.warn("space health check failed", { probe });
    }
    return c.json(spaceCache.body as Record<string, unknown>, spaceCache.ok ? 200 : 503);
  });

  // Sign-in is the one door an outsider can knock on, so failed attempts are counted per email
  // and per address, and a locked-out caller is told when to come back.
  app.post("/api/auth/sign-in/*", async (c, next) => {
    const limiter = deps.signInLimiter;
    if (!limiter) return next();
    const address = `ip:${clientAddress(c.req.raw.headers)}`;
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => null)) as { email?: unknown } | null;
    const email =
      typeof body?.email === "string" ? `email:${body.email.trim().toLowerCase()}` : null;
    const keys = email ? [address, email] : [address];
    for (const key of keys) {
      const verdict = limiter.check(key);
      if (!verdict.allowed) {
        c.header("retry-after", String(verdict.retryAfterS));
        return c.json({ code: "RATE_LIMITED", retryAfterS: verdict.retryAfterS }, 429);
      }
    }
    await next();
    if (c.res.status >= 400) for (const key of keys) limiter.fail(key);
    else if (email) limiter.reset(email);
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.authHandler(c.req.raw));

  app.use("/rpc/*", async (c, next) => {
    // Preflight carries no credentials; the cors middleware above has already answered it.
    if (c.req.method === "OPTIONS") return next();
    const user = await deps.identity(c.req.raw.headers);
    if (!user) return c.json({ code: "UNAUTHORIZED", message: "Sign in first." }, 401);
    c.set("user", user);
    return next();
  });
  app.all("/rpc/*", async (c) => {
    const user = c.get("user");
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: { user },
    });
    return matched ? c.newResponse(response.body, response) : c.notFound();
  });

  app.on(["GET", "HEAD"], "/desktop/:id/*", (c) => {
    const id = c.req.param("id");
    const prefix = `/desktop/${id}/`;
    const rest = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : "";
    return deps.desktop.http(c.req.raw, decodeURIComponent(id), rest);
  });

  app.notFound((c) => c.json({ code: "NOT_FOUND" }, 404));
  app.onError((error, c) => {
    logger.error("unhandled error", { error });
    return c.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
  });
  return app;
}
