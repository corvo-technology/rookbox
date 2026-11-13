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
import { memoryApiKeyStore, newMachineService } from "./test-support.js";

const APP = "https://app.example.test";

function setup() {
  const { service, space } = newMachineService();
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
    expect(await response.json()).toEqual({ ok: true });
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
