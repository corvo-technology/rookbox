import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ServerClient } from "@rookbox/contracts";
import { createApiKeyService } from "./api-keys.js";
import { createApp } from "./app.js";
import type { AuthUser, Identity } from "./auth.js";
import { createDesktopProxy } from "./desktop.js";
import { createDesktopTokens } from "./desktop-token.js";
import { silentLogger } from "./logger.js";
import { reconcile } from "./reconcile.js";
import { memoryApiKeyStore, newMachineService } from "./test-support.js";

export const APP = "https://app.example.test";
export const DESK = "desk.example.test";
export const DESK_SECRET = "d".repeat(32);

/**
 * The real application (router, guards, desktop proxy, rate limits) over in-memory fakes for the
 * database and the machine service. Sessions are `session=<user>` cookies; the real identity is
 * better-auth, covered by its own tests.
 */
export function setupApp(
  extra: Partial<Parameters<typeof createApp>[0]> = {},
  options: { maxMachinesPerUser?: number } = {},
) {
  const { service, space, store } = newMachineService({
    maxMachinesPerUser: options.maxMachinesPerUser ?? 2,
  });
  const keys = memoryApiKeyStore();
  const apiKeys = createApiKeyService(keys);
  const identity: Identity = async (headers) => {
    const cookie = headers.get("cookie")?.match(/session=([a-z]+)/)?.[1];
    if (cookie) return { id: cookie, email: `${cookie}@example.test` } satisfies AuthUser;
    const bearer = headers.get("authorization")?.match(/^Bearer (rbx_\w+)$/)?.[1];
    const userId = bearer ? await apiKeys.authenticate(bearer) : null;
    return userId ? { id: userId, email: `${userId}@example.test` } : null;
  };
  const upstream: string[] = [];
  const tokens = createDesktopTokens({ secret: DESK_SECRET });
  const desktop = createDesktopProxy({
    machines: service,
    tokens,
    e2bDomain: "box.example.test",
    origin: `https://${DESK}`,
    host: DESK,
    linkTtlS: 120,
    sessionTtlS: 14_400,
    logger: silentLogger,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      upstream.push(`${url} ${headers.get("e2b-traffic-access-token")}`);
      return new Response("<html>vnc</html>", {
        status: 200,
        headers: { "content-type": "text/html", "set-cookie": "leak=1" },
      });
    },
  });
  const app = createApp({
    appOrigin: APP,
    logger: silentLogger,
    identity,
    authHandler: async () => new Response("auth"),
    machines: service,
    apiKeys,
    desktop,
    desktopHost: DESK,
    admins: new Set(["admin@example.test"]),
    users: {
      async findIdByEmail(email) {
        const match = /^([a-z]+)@example\.test$/.exec(email);
        return match?.[1] ?? null;
      },
    },
    reconcile: (mode) =>
      reconcile(
        { store, space, logger: silentLogger, stuckAfterMs: 600_000, orphanGraceMs: 900_000 },
        mode,
      ),
    checkDb: async () => undefined,
    space,
    ...extra,
  });
  const client = (cookie?: string, bearer?: string) =>
    createORPCClient(
      new RPCLink({
        url: "http://api.test/rpc",
        fetch: (request) => {
          const headers = new Headers(request.headers);
          if (cookie) headers.set("cookie", `session=${cookie}`);
          if (bearer) headers.set("authorization", `Bearer ${bearer}`);
          return Promise.resolve(app.fetch(new Request(request, { headers })));
        },
      }),
    ) as ServerClient;
  return { app, client, space, store, keys, apiKeys, upstream, tokens, desktop, service };
}
