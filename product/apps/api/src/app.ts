import { getConnInfo } from "@hono/node-server/conninfo";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { ReconcileReport } from "@rookbox/contracts";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiKeyService } from "./api-keys.js";
import type { AuthUser, Identity } from "./auth.js";
import { clientAddress } from "./client-ip.js";
import type { DesktopProxy } from "./desktop.js";
import type { Logger } from "./logger.js";
import type { MachineService } from "./machines/service.js";
import type { RateLimiter } from "./rate-limit.js";
import type { Throttle } from "./route-limits.js";
import { createRouter } from "./router.js";
import type { SpaceClient } from "./space/client.js";
import type { UsageService } from "./usage/service.js";

export type AppDeps = {
  appOrigin: string;
  logger: Logger;
  identity: Identity;
  /** better-auth's request handler. */
  authHandler: (request: Request) => Promise<Response>;
  machines: MachineService;
  apiKeys: ApiKeyService;
  desktop: Pick<DesktopProxy, "issueLink" | "open" | "http">;
  /**
   * The host the desktop is served from. When set, that host serves ONLY the desktop routes and
   * every other host serves none of them. When null (development), the API's own host serves both.
   */
  desktopHost?: string | null;
  /** Per-route request budgets. Without it, only the sign-in counter applies. */
  throttle?: Throttle;
  /** Resolves when the database answers; `/health` reports it. */
  checkDb?: () => Promise<void>;
  /** For `/health/space`. */
  space?: Pick<SpaceClient, "probe">;
  /** Counts failed sign-ins. Without it, sign-in is not limited here. */
  signInLimiter?: RateLimiter;
  /** Proxies in front of the API whose `X-Forwarded-For` entries are trusted. Default 0. */
  trustedProxyHops?: number;
  /** The socket's peer address; defaults to the Node server's. */
  peerAddress?: (c: Context) => string | undefined;
  /** Lower-case emails that may call `admin.*`. */
  admins?: ReadonlySet<string>;
  users?: { findIdByEmail(email: string): Promise<string | null> };
  reconcile?: (mode: { act: boolean; killOrphans: boolean }) => Promise<ReconcileReport>;
  /** Measured usage for the dashboard and the admin view. Without it those answer 503. */
  usage?: UsageService;
  /** `POST /ingest/usage-events`, signed by the usage reporter. Without it the route is absent. */
  ingestUsage?: (request: Request) => Promise<Response>;
  now?: () => number;
};

const noThrottle: Throttle = { hit: () => ({ allowed: true }) };

function nodePeer(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function createApp(deps: AppDeps) {
  const { logger } = deps;
  const desktopHost = deps.desktopHost ?? null;
  const throttle = deps.throttle ?? noThrottle;
  const hops = deps.trustedProxyHops ?? 0;

  const ipOf = (c: Context) =>
    clientAddress({
      forwardedFor: c.req.header("x-forwarded-for"),
      peer: (deps.peerAddress ?? nodePeer)(c),
      trustedHops: hops,
    });

  const rpc = new RPCHandler(
    createRouter({
      machines: deps.machines,
      apiKeys: deps.apiKeys,
      desktop: deps.desktop,
      throttle,
      admins: deps.admins ?? new Set(),
      users: deps.users ?? { findIdByEmail: async () => null },
      reconcile:
        deps.reconcile ??
        (async () => {
          throw new Error("The reconciler is not configured.");
        }),
      logger,
      usage: deps.usage,
    }),
    { plugins: [new ResponseHeadersPlugin()] },
  );

  /** The two desktop entry points. They read no login cookie and set none. */
  function mountDesktop(app: Hono) {
    app.on(["GET", "HEAD"], "/open/:token", (c) => deps.desktop.open(c.req.param("token")));
    app.on(["GET", "HEAD"], "/m/:id/*", (c): Response | Promise<Response> => {
      const missing = () => Response.json({ code: "NOT_FOUND" }, { status: 404 });
      const match = /^\/m\/([^/]+)\/(.*)$/.exec(c.req.path);
      let id: string;
      try {
        id = decodeURIComponent(match?.[1] ?? "");
      } catch {
        return missing();
      }
      if (!match || !id) return missing();
      return deps.desktop.http(c.req.raw, id, match[2] ?? "");
    });
  }

  // The desktop host: nothing but the desktop. No CORS, no RPC, no auth, no health, no cookies.
  const desk = new Hono();
  mountDesktop(desk);
  desk.notFound((c) => c.json({ code: "NOT_FOUND" }, 404));
  desk.onError((error, c) => {
    logger.error("unhandled error", { error });
    return c.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
  });

  const main = new Hono<{ Variables: { user: AuthUser } }>();

  // Only the dashboard's origin may call the API from a browser.
  main.use(
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

  main.get("/health", async (c) => {
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
  main.get("/health/space", async (c) => {
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

  // The auth endpoints are the one door an outsider can knock on. Every POST counts against a
  // per-address budget; failed sign-ins also count per email and per address, and a locked-out
  // caller is told when to come back.
  main.post("/api/auth/*", async (c, next) => {
    const address = ipOf(c);
    const verdict = throttle.hit("auth", { ip: address });
    if (!verdict.allowed) {
      c.header("retry-after", String(verdict.retryAfterS));
      return c.json({ code: "RATE_LIMITED", retryAfterS: verdict.retryAfterS }, 429);
    }
    return next();
  });

  main.post("/api/auth/sign-in/*", async (c, next) => {
    const limiter = deps.signInLimiter;
    if (!limiter) return next();
    const ipKey = `ip:${ipOf(c)}`;
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => null)) as { email?: unknown } | null;
    const email =
      typeof body?.email === "string" ? `email:${body.email.trim().toLowerCase()}` : null;
    const keys = email ? [ipKey, email] : [ipKey];
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

  main.on(["GET", "POST"], "/api/auth/*", (c) => deps.authHandler(c.req.raw));

  // The usage reporter's door: not a user session, so it is signed instead (see usage/ingest.ts).
  const ingestUsage = deps.ingestUsage;
  if (ingestUsage) main.post("/ingest/usage-events", (c) => ingestUsage(c.req.raw));

  main.use("/rpc/*", async (c, next) => {
    // Preflight carries no credentials; the cors middleware above has already answered it.
    if (c.req.method === "OPTIONS") return next();
    const bearer = c.req.header("authorization")?.startsWith("Bearer ");
    // The login cookie is sent by the browser to this API from any page on the same site, and
    // machine hosts are on that site. CORS only stops a page from reading the answer, not from
    // sending the request, so a browser request from another origin is refused outright.
    // Requests with a key are not browser sessions and carry no ambient credential.
    const origin = c.req.header("origin");
    if (!bearer && origin && origin !== deps.appOrigin) {
      logger.warn("rpc refused: foreign origin", { origin });
      return c.json({ code: "FORBIDDEN", message: "Not allowed." }, 403);
    }
    const user = await deps.identity(c.req.raw.headers);
    if (!user) return c.json({ code: "UNAUTHORIZED", message: "Sign in first." }, 401);
    c.set("user", user);
    return next();
  });
  main.all("/rpc/*", async (c) => {
    const user = c.get("user");
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: { user, ip: ipOf(c) },
    });
    return matched ? c.newResponse(response.body, response) : c.notFound();
  });

  // Without a separate desktop host (development) the API serves the desktop itself.
  if (desktopHost === null) mountDesktop(main as unknown as Hono);

  main.notFound((c) => c.json({ code: "NOT_FOUND" }, 404));
  main.onError((error, c) => {
    logger.error("unhandled error", { error });
    return c.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    if (c.req.path.startsWith("/health")) return;
    // `/open/<token>` carries a credential in its path, so only the route's shape is logged.
    const path = c.req.path.startsWith("/open/") ? "/open/:token" : c.req.path;
    logger.info("request", {
      method: c.req.method,
      path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });
  app.all("*", (c) => {
    const host = new URL(c.req.url).host.toLowerCase();
    const target = desktopHost !== null && host === desktopHost ? desk : main;
    return target.fetch(c.req.raw, c.env);
  });
  return app;
}
