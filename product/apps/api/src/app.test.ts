import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppClient } from "@rookbox/contracts";
import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { createApiKeyService } from "./api-keys.js";
import { createApp } from "./app.js";
import type { AuthUser, Identity } from "./auth.js";
import { createDesktopProxy } from "./desktop.js";
import { silentLogger } from "./logger.js";
import { createRateLimiter } from "./rate-limit.js";
import { SpaceError } from "./space/client.js";
import { memoryApiKeyStore, newMachineService } from "./test-support.js";

const APP = "https://app.example.test";

function setup(extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const { service, space } = newMachineService({ maxMachinesPerUser: 2 });
  const keys = memoryApiKeyStore();
  const apiKeys = createApiKeyService(keys);
  // Sessions are "session:<user>" cookies; the real identity is better-auth, covered by its own tests.
  const identity: Identity = async (headers) => {
    const cookie = headers.get("cookie")?.match(/session=([a-z]+)/)?.[1];
    if (cookie) return { id: cookie, email: `${cookie}@example.test` } satisfies AuthUser;
    const bearer = headers.get("authorization")?.match(/^Bearer (rbx_\w+)$/)?.[1];
    const userId = bearer ? await apiKeys.authenticate(bearer) : null;
    return userId ? { id: userId, email: `${userId}@example.test` } : null;
  };
  const upstream: string[] = [];
  const desktop = createDesktopProxy({
    machines: service,
    identity,
    e2bDomain: "box.example.test",
    allowedOrigin: "https://api.example.test",
    logger: silentLogger,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      upstream.push(`${url} ${headers.get("e2b-traffic-access-token")}`);
      return new Response("<html>vnc</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
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
    ) as AppClient;
  return { app, client, space, keys, apiKeys, upstream };
}

describe("auth guard", () => {
  it("rejects RPC calls without a session or key", async () => {
    const { client } = setup();
    await expect(client().machines.list()).rejects.toMatchObject({ status: 401 });
  });

  it("serves /health without auth", async () => {
    const { app } = setup();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, db: "ok" });
  });

  it("reports a database failure on /health without saying why", async () => {
    const { app } = setup({
      checkDb: async () => {
        throw new Error("connect ECONNREFUSED db.internal.example:5432");
      },
    });
    const response = await app.request("/health");
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: false, db: "down" });
    expect(text).not.toContain("internal");
  });

  it("accepts a Rookbox API key as a bearer token, and stops accepting it once revoked", async () => {
    const { client, apiKeys } = setup();
    const { key, secret } = await apiKeys.create("alice", "ci");
    expect(await client(undefined, secret).machines.list()).toEqual([]);
    await apiKeys.revoke("alice", key.id);
    await expect(client(undefined, secret).machines.list()).rejects.toMatchObject({ status: 401 });
  });

  it("only allows the dashboard origin through CORS, with credentials", async () => {
    const { app } = setup();
    const ok = await app.request("/rpc/machines/list", {
      method: "OPTIONS",
      headers: { origin: APP, "access-control-request-method": "POST" },
    });
    expect(ok.headers.get("access-control-allow-origin")).toBe(APP);
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    const other = await app.request("/rpc/machines/list", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.test", "access-control-request-method": "POST" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("machines over RPC", () => {
  it("never shows one user another user's machines", async () => {
    const { client } = setup();
    const created = await client("alice").machines.create({
      name: "mine",
      template: "seed",
      size: SIZE_PRESETS.small,
    });
    expect((await client("alice").machines.list()).map((m) => m.id)).toEqual([created.id]);
    expect(await client("bob").machines.list()).toEqual([]);
    await expect(client("bob").machines.get({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      client("bob").machines.exec({ id: created.id, command: "id" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps a state conflict to CONFLICT", async () => {
    const { client } = setup();
    const m = await client("alice").machines.create({
      name: "m",
      template: "seed",
      size: SIZE_PRESETS.small,
    });
    await expect(client("alice").machines.restore({ id: m.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("runs a command and returns stdout, stderr and the exit code", async () => {
    const { client } = setup();
    const m = await client("alice").machines.create({
      name: "m",
      template: "seed",
      size: SIZE_PRESETS.small,
    });
    expect(await client("alice").machines.exec({ id: m.id, command: "echo hi" })).toEqual({
      stdout: "hi\n",
      stderr: "",
      exitCode: 0,
      truncated: false,
    });
  });
});

describe("errors over RPC", () => {
  it("tells the client what failed by code, without the upstream message", async () => {
    const { client, space } = setup();
    space.create = async () => {
      throw new SpaceError(401, "Invalid or missing API key");
    };
    const error = await client("alice")
      .machines.create({ name: "m", template: "seed", size: SIZE_PRESETS.small })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "HOST_AUTH", status: 502 });
    expect(JSON.stringify(error)).not.toContain("API key");
  });

  it("reports the machine limit with the number", async () => {
    const { client } = setup();
    for (const name of ["a", "b"]) {
      await client("alice").machines.create({ name, template: "seed", size: SIZE_PRESETS.small });
    }
    await expect(
      client("alice").machines.create({ name: "c", template: "seed", size: SIZE_PRESETS.small }),
    ).rejects.toMatchObject({ code: "MACHINE_LIMIT", data: { limit: 2 } });
  });

  it("hides an unexpected failure behind a plain message", async () => {
    const { client, space } = setup();
    space.list = async () => {
      throw new TypeError("secret detail at 10.0.0.9");
    };
    await client("alice").machines.create({
      name: "m",
      template: "seed",
      size: SIZE_PRESETS.small,
    });
    const error = await client("alice")
      .machines.list()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  it("serves the deployment's config", async () => {
    const { client } = setup();
    expect(await client("alice").config.get()).toEqual({
      templates: ["desktop", "corvo-computer", "seed"],
      maxMachines: 2,
      defaultIdleTimeoutS: 900,
      domain: "box.example.test",
    });
  });
});

describe("/health/space", () => {
  it("answers without a session, reporting only status classes", async () => {
    const { app, space } = setup();
    space.probeResult = {
      keyConfigured: true,
      reachable: true,
      statusClass: "4xx",
      auth: "rejected",
      ms: 12,
    };
    const response = await app.request("/health/space");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      keyConfigured: true,
      reachable: true,
      statusClass: "4xx",
      auth: "rejected",
      ms: 12,
    });
  });

  it("is ok when SPACE accepts the key", async () => {
    const { app } = setup();
    const response = await app.request("/health/space");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, auth: "ok" });
  });

  it("answers when no key is set", async () => {
    const { app, space } = setup();
    space.probeResult = {
      keyConfigured: false,
      reachable: true,
      statusClass: "4xx",
      auth: "missing",
      ms: 3,
    };
    const response = await app.request("/health/space");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ keyConfigured: false, auth: "missing" });
  });
});

describe("sign-in limit", () => {
  /** An app whose auth answers with the given statuses in turn, behind a limit of two failures. */
  function authApp(answers: number[]) {
    return createApp({
      appOrigin: APP,
      logger: silentLogger,
      identity: async () => null,
      authHandler: async () => new Response("x", { status: answers.shift() ?? 401 }),
      machines: newMachineService().service,
      apiKeys: createApiKeyService(memoryApiKeyStore()),
      desktop: { http: async () => new Response("") },
      signInLimiter: createRateLimiter({ max: 2, windowMs: 60_000 }),
    });
  }

  const attempt = (app: ReturnType<typeof setup>["app"], email: string, ip = "1.1.1.1") =>
    app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "wrong" }),
    });

  it("blocks an email after repeated failures, with a retry time", async () => {
    const failing = authApp([]);
    expect((await attempt(failing, "a@example.test", "1.1.1.1")).status).toBe(401);
    expect((await attempt(failing, "a@example.test", "2.2.2.2")).status).toBe(401);
    const blocked = await attempt(failing, "A@example.test", "3.3.3.3");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.json()).toMatchObject({ code: "RATE_LIMITED" });
    // Another email from a fresh address is unaffected.
    expect((await attempt(failing, "b@example.test", "4.4.4.4")).status).toBe(401);
  });

  it("blocks an address that keeps failing across emails", async () => {
    const failing = authApp([]);
    await attempt(failing, "a@example.test");
    await attempt(failing, "b@example.test");
    expect((await attempt(failing, "c@example.test")).status).toBe(429);
  });

  it("forgets an email's failures after a good sign-in", async () => {
    const ok = authApp([401, 200, 401, 401]);
    expect((await attempt(ok, "a@example.test", "1.1.1.1")).status).toBe(401);
    expect((await attempt(ok, "a@example.test", "2.2.2.2")).status).toBe(200);
    expect((await attempt(ok, "a@example.test", "3.3.3.3")).status).toBe(401);
    expect((await attempt(ok, "a@example.test", "4.4.4.4")).status).toBe(401);
  });
});

describe("desktop proxy", () => {
  it("needs a session", async () => {
    const { app } = setup();
    expect((await app.request("/desktop/sbx1/vnc.html")).status).toBe(401);
  });

  it("forwards an owner's request with the traffic token, and nobody else's", async () => {
    const { app, client, upstream } = setup();
    const m = await client("alice").machines.create({
      name: "d",
      template: "desktop",
      size: SIZE_PRESETS.small,
    });
    const own = await app.request(`/desktop/${m.id}/vnc.html?autoconnect=true`, {
      headers: { cookie: "session=alice" },
    });
    expect(own.status).toBe(200);
    expect(await own.text()).toContain("vnc");
    expect(upstream).toEqual([
      `https://6080-${m.id}.box.example.test/vnc.html?autoconnect=true traffic-${m.id}`,
    ]);
    const other = await app.request(`/desktop/${m.id}/vnc.html`, {
      headers: { cookie: "session=bob" },
    });
    expect(other.status).toBe(404);
    expect(upstream).toHaveLength(1);
  });

  it("is not offered for a machine without a desktop", async () => {
    const { app, client } = setup();
    const m = await client("alice").machines.create({
      name: "s",
      template: "seed",
      size: SIZE_PRESETS.small,
    });
    const response = await app.request(`/desktop/${m.id}/vnc.html`, {
      headers: { cookie: "session=alice" },
    });
    expect(response.status).toBe(404);
  });
});
