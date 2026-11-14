import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.js";
import { createThrottle, LIMIT_CLASSES, parseBudget, type RouteLimits } from "./route-limits.js";
import { APP, setupApp } from "./test-app.js";

function limits(overrides: Partial<Record<(typeof LIMIT_CLASSES)[number], string>>): RouteLimits {
  return Object.fromEntries(
    LIMIT_CLASSES.map((cls) => {
      const spec = overrides[cls];
      return [cls, spec ? parseBudget(spec) : {}];
    }),
  ) as RouteLimits;
}

const small = SIZE_PRESETS.small;

describe("per-route limits over RPC", () => {
  it("answers a coded error with Retry-After once the budget is spent, per user", async () => {
    const { client, app } = setupApp({
      throttle: createThrottle(limits({ machine_create: "user=2/600" })),
    });
    await client("alice").machines.create({ name: "a", template: "seed", size: small });
    await client("alice").machines.delete({ id: "sbx1" });
    await client("alice").machines.create({ name: "b", template: "seed", size: small });
    const error = await client("alice")
      .machines.create({ name: "c", template: "seed", size: small })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "RATE_LIMITED", status: 429, data: { retryAfterS: 600 } });
    // Bob has his own budget.
    await expect(
      client("bob").machines.create({ name: "a", template: "seed", size: small }),
    ).resolves.toMatchObject({ name: "a" });

    // The raw response carries Retry-After as a header.
    const raw = await app.request("http://api.test/rpc/machines/create", {
      method: "POST",
      headers: { cookie: "session=alice", "content-type": "application/json" },
      body: JSON.stringify({ json: { name: "d", template: "seed", size: small } }),
    });
    expect(raw.status).toBe(429);
    expect(Number(raw.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits an address across accounts, and cannot be dodged with a spoofed header", async () => {
    const { app } = setupApp({
      throttle: createThrottle(limits({ machine_exec: "ip=2/60" })),
      trustedProxyHops: 0,
      peerAddress: () => "203.0.113.9",
    });
    const call = (user: string, forwarded: string) =>
      app.request("http://api.test/rpc/machines/exec", {
        method: "POST",
        headers: {
          cookie: `session=${user}`,
          "content-type": "application/json",
          "x-forwarded-for": forwarded,
        },
        body: JSON.stringify({ json: { id: "sbx1", command: "id" } }),
      });
    // NOT_FOUND (404) counts as a request; the third is cut off whatever the header says.
    expect((await call("a", "1.1.1.1")).status).toBe(404);
    expect((await call("b", "2.2.2.2")).status).toBe(404);
    expect((await call("c", "3.3.3.3")).status).toBe(429);
  });

  it("covers every sensitive route", async () => {
    const all = limits(
      Object.fromEntries(LIMIT_CLASSES.map((cls) => [cls, "user=1/600"])) as never,
    );
    const { client, apiKeys: _ } = setupApp(
      { throttle: createThrottle(all) },
      { maxMachinesPerUser: 9 },
    );
    const alice = client("alice");
    const m = await alice.machines.create({ name: "a", template: "desktop", size: small });
    const calls: Record<string, () => Promise<unknown>> = {
      create: () => alice.machines.create({ name: "z", template: "seed", size: small }),
      fork: () => alice.machines.fork({ id: m.id }),
      suspend: () => alice.machines.suspend({ id: m.id }),
      restore: () => alice.machines.restore({ id: m.id }),
      exec: () => alice.machines.exec({ id: m.id, command: "id" }),
      desktopLink: () => alice.machines.desktopLink({ id: m.id }),
      apiKey: () => alice.apiKeys.create({ name: "k" }),
      delete: () => alice.machines.delete({ id: m.id }),
    };
    // create and suspend/restore share budgets with what ran above (create, then lifecycle).
    await alice.machines.exec({ id: m.id, command: "id" });
    await alice.machines.desktopLink({ id: m.id });
    await alice.apiKeys.create({ name: "first" });
    await alice.machines.fork({ id: m.id });
    await alice.machines.suspend({ id: m.id });
    await alice.machines.delete({ id: m.id }).catch(() => undefined);
    for (const name of Object.keys(calls)) {
      await expect(calls[name]?.(), name).rejects.toMatchObject({ code: "RATE_LIMITED" });
    }
  });

  it("does not limit reads", async () => {
    const { client } = setupApp({
      throttle: createThrottle(
        limits(Object.fromEntries(LIMIT_CLASSES.map((c) => [c, "user=1/600"])) as never),
      ),
    });
    for (let n = 0; n < 5; n += 1) {
      expect(await client("alice").machines.list()).toEqual([]);
      expect(await client("alice").apiKeys.list()).toEqual([]);
    }
  });
});

describe("auth endpoints", () => {
  it("counts every POST per address and answers 429 with Retry-After", async () => {
    const { app } = setupApp({
      throttle: createThrottle(limits({ auth: "ip=3/600" })),
      trustedProxyHops: 1,
    });
    const post = (ip: string) =>
      app.request("http://api.test/api/auth/sign-out", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
      });
    for (let n = 0; n < 3; n += 1) expect((await post("5.5.5.5")).status).toBe(200);
    const blocked = await post("5.5.5.5");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");
    expect(await blocked.json()).toEqual({ code: "RATE_LIMITED", retryAfterS: 600 });
    expect((await post("6.6.6.6")).status).toBe(200);
    // Reading the session is not counted.
    const get = await app.request("http://api.test/api/auth/get-session", {
      headers: { "x-forwarded-for": "5.5.5.5" },
    });
    expect(get.status).toBe(200);
  });

  it("keeps the failed-sign-in counter next to it", async () => {
    const { app } = setupApp({
      authHandler: async () => new Response("no", { status: 401 }),
      signInLimiter: createRateLimiter({ max: 1, windowMs: 60_000 }),
      throttle: createThrottle(limits({ auth: "ip=100/600" })),
    });
    const attempt = () =>
      app.request("http://api.test/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.test", password: "x" }),
      });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});

describe("browser requests from other origins", () => {
  const body = JSON.stringify({ json: {} });
  const post = (app: ReturnType<typeof setupApp>["app"], headers: Record<string, string>) =>
    app.request("http://api.test/rpc/machines/list", {
      method: "POST",
      headers: { cookie: "session=alice", "content-type": "application/json", ...headers },
      body,
    });

  it("refuses a cookie-authenticated request whose Origin is not the dashboard", async () => {
    const { app } = setupApp();
    expect((await post(app, { origin: "https://3000-sbx1.box.example.test" })).status).toBe(403);
    expect((await post(app, { origin: "https://evil.example.test" })).status).toBe(403);
    expect((await post(app, { origin: APP })).status).toBe(200);
    // No Origin: not a browser cross-site request.
    expect((await post(app, {})).status).toBe(200);
  });

  it("lets a key through whatever the Origin, since a key is not ambient", async () => {
    const { app, apiKeys } = setupApp();
    const { secret } = await apiKeys.create("alice", "ci");
    const response = await app.request("http://api.test/rpc/machines/list", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        origin: "https://anything.example.test",
      },
      body,
    });
    expect(response.status).toBe(200);
  });
});

describe("admin", () => {
  it("suspends a user's machines, for an admin only", async () => {
    const { client, space } = setupApp({}, { maxMachinesPerUser: 5 });
    const a = await client("alice").machines.create({ name: "a", template: "seed", size: small });
    const b = await client("alice").machines.create({ name: "b", template: "seed", size: small });
    await client("alice").machines.suspend({ id: b.id });
    const o = await client("bob").machines.create({ name: "o", template: "seed", size: small });
    await expect(
      client("alice").admin.suspendUserMachines({ email: "alice@example.test" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await client("admin").admin.suspendUserMachines({ email: "Alice@Example.test" }),
    ).toEqual({
      suspended: 1,
      skipped: 1,
      failed: 0,
    });
    expect(space.sandboxes.get(a.id)?.state).toBe("paused");
    expect(space.sandboxes.get(o.id)?.state).toBe("running");
  });

  it("answers not found for an unknown email", async () => {
    const { client } = setupApp();
    await expect(
      client("admin").admin.suspendUserMachines({ email: "nobody@elsewhere.test" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("runs the reconciler in report mode by default", async () => {
    const { client, space } = setupApp({}, { maxMachinesPerUser: 5 });
    await client("alice").machines.create({ name: "a", template: "seed", size: small });
    space.sandboxes.delete("sbx1");
    const report = await client("admin").admin.reconcile({});
    expect(report).toMatchObject({ mode: "report", missing: ["sbx1"] });
    expect(report.fixed.rowsRemoved).toBe(0);
  });
});
