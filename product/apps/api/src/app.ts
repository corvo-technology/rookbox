import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiKeyService } from "./api-keys.js";
import type { AuthUser, Identity } from "./auth.js";
import type { DesktopProxy } from "./desktop.js";
import type { Logger } from "./logger.js";
import type { MachineService } from "./machines/service.js";
import { createRouter } from "./router.js";

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
};

export function createApp(deps: AppDeps) {
  const { logger } = deps;
  const rpc = new RPCHandler(
    createRouter({ machines: deps.machines, apiKeys: deps.apiKeys, logger }),
  );
  const app = new Hono<{ Variables: { user: AuthUser } }>();

  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    if (c.req.path === "/health") return;
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

  app.get("/health", async (c) => {
    try {
      await deps.checkDb?.();
      return c.json({ ok: true });
    } catch (error) {
      logger.error("health check failed", { error });
      return c.json({ ok: false }, 503);
    }
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
