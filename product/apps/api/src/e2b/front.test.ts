import { describe, expect, it } from "vitest";
import type { LimitClass, RouteLimits } from "../route-limits.js";
import { createThrottle, DEFAULT_LIMITS, parseBudget } from "../route-limits.js";
import { metadataQuery } from "../space/client.js";
import { setupApp } from "../test-app.js";

const HOST = "http://api.test";

async function world(options: Parameters<typeof setupApp>[1] = {}) {
  const w = setupApp({}, options);
  const alice = (await w.apiKeys.create("alice", "ci")).secret;
  const bob = (await w.apiKeys.create("bob", "ci")).secret;
  const call = (key: string | null, method: string, path: string, body?: unknown) =>
    w.app.fetch(
      new Request(`${HOST}${path}`, {
        method,
        headers: {
          ...(key ? { "x-api-key": key } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { ...w, alice, bob, call };
}

describe("the E2B front", () => {
  it("refuses a missing, wrong or revoked key, and a disabled account", async () => {
    const w = await world();
    expect((await w.call(null, "GET", "/sandboxes")).status).toBe(401);
    expect((await w.call("rbx_nope", "GET", "/sandboxes")).status).toBe(401);
    w.disabled.add("alice");
    const refused = await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ code: 401, message: "Invalid API key." });
    expect(w.ecw.requests).toHaveLength(0);
  });

  it("creates a sandbox tagged with its owner and passes the tokens through", async () => {
    const w = await world();
    const res = await w.call(w.alice, "POST", "/sandboxes", {
      templateID: "seed",
      timeout: 120,
      metadata: { purpose: "ci", "rookbox.owner": "bob", "space.resources": "{}" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      sandboxID: "sbx1",
      envdAccessToken: "envd-sbx1",
      trafficAccessToken: "traffic-sbx1",
      domain: "box.example.test",
    });
    const sent = w.ecw.requests[0];
    expect(sent?.apiKey).toBe("svc-key");
    const forwarded = sent?.body as Record<string, unknown>;
    expect(forwarded.metadata).toMatchObject({
      purpose: "ci",
      "rookbox.owner": "alice",
      "space.resources": expect.stringContaining('"vcpu":2'),
    });
    expect(forwarded.timeout).toBe(120);
    // The caller's key is never sent upstream.
    expect(JSON.stringify(w.ecw.requests)).not.toContain(w.alice);
    // The dashboard sees it (and the cap counts it).
    const machines = await w.client("alice").machines.list();
    expect(machines.map((m) => m.id)).toEqual(["sbx1"]);
  });

  it("maps the SDK's default template and uses the default timeout", async () => {
    const w = await world();
    const res = await w.call(w.alice, "POST", "/sandboxes", { templateID: "base" });
    expect(res.status).toBe(201);
    const forwarded = w.ecw.requests[0]?.body as Record<string, unknown>;
    expect(forwarded.templateID).toBe("desktop");
    expect(forwarded.timeout).toBe(900);
    expect(forwarded.autoPause).toBe(false);
  });

  it("creates through the v2 path the newer SDKs use", async () => {
    const w = await world();
    const res = await w.call(w.alice, "POST", "/v2/sandboxes", { templateID: "seed" });
    expect(res.status).toBe(201);
    expect(w.space.sandboxes.get("sbx1")?.metadata["rookbox.owner"]).toBe("alice");
  });

  it("refuses a template this deployment does not offer", async () => {
    const w = await world();
    const res = await w.call(w.alice, "POST", "/sandboxes", { templateID: "secret-img" });
    expect(res.status).toBe(400);
    expect(w.ecw.requests).toHaveLength(0);
  });

  it("enforces the per-user machine cap", async () => {
    const w = await world({ maxMachinesPerUser: 2 });
    for (let n = 0; n < 2; n += 1) {
      expect((await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" })).status).toBe(
        201,
      );
    }
    const third = await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });
    expect(third.status).toBe(429);
    expect(((await third.json()) as { message: string }).message).toMatch(/limit/i);
    // Another account has its own allowance.
    expect((await w.call(w.bob, "POST", "/sandboxes", { templateID: "seed" })).status).toBe(201);
    expect(w.space.sandboxes.size).toBe(3);
  });

  it("answers 503 when the deployment is full", async () => {
    const w = await world({ maxRunningTotal: 1 });
    expect((await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" })).status).toBe(201);
    expect((await w.call(w.bob, "POST", "/sandboxes", { templateID: "seed" })).status).toBe(503);
  });

  it("lists only the caller's sandboxes, with one comma-separated state parameter", async () => {
    const w = await world({ maxMachinesPerUser: 5 });
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed", metadata: { a: "1" } });
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed", metadata: { a: "2" } });
    await w.call(w.bob, "POST", "/sandboxes", { templateID: "seed" });
    w.ecw.requests.length = 0;

    const res = await w.call(w.alice, "GET", "/v2/sandboxes?state=running&state=paused&limit=100");
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { sandboxID: string }[]).map((s) => s.sandboxID);
    expect(ids.sort()).toEqual(["sbx1", "sbx2"]);
    const url = new URL(`http://x${w.ecw.requests[0]?.path}`);
    expect(url.searchParams.getAll("state")).toEqual(["running,paused"]);

    // The SDKs' metadata filter is combined with, never replaces, the owner pair.
    const filtered = await w.call(
      w.alice,
      "GET",
      `/sandboxes?${metadataQuery({ a: "2", "rookbox.owner": "bob" })}`,
    );
    const filteredIds = ((await filtered.json()) as { sandboxID: string }[]).map(
      (s) => s.sandboxID,
    );
    expect(filteredIds).toEqual(["sbx2"]);

    // A paused sandbox is listed; a state the SDK may not ask for is ignored.
    await w.call(w.alice, "POST", "/sandboxes/sbx1/pause");
    const paused = await w.call(w.alice, "GET", "/v2/sandboxes?state=paused");
    expect(((await paused.json()) as unknown[]).length).toBe(1);
  });

  it("forwards the pagination token", async () => {
    const w = await world();
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });
    const res = await w.call(w.alice, "GET", "/v2/sandboxes?limit=1");
    expect(res.headers.get("x-next-token")).toBe("t1");
  });

  it("gets, pauses, resumes, connects, sets the timeout, refreshes and deletes an owned sandbox", async () => {
    const w = await world();
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });

    const got = await w.call(w.alice, "GET", "/sandboxes/sbx1");
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ sandboxID: "sbx1", envdAccessToken: "envd-sbx1" });

    expect((await w.call(w.alice, "POST", "/sandboxes/sbx1/pause")).status).toBe(204);
    expect(w.space.sandboxes.get("sbx1")?.state).toBe("paused");

    const resumed = await w.call(w.alice, "POST", "/sandboxes/sbx1/resume", { timeout: 300 });
    expect(resumed.status).toBe(201);
    expect(w.space.sandboxes.get("sbx1")?.state).toBe("running");

    const connected = await w.call(w.alice, "POST", "/sandboxes/sbx1/connect", { timeout: 300 });
    expect(connected.status).toBe(200);
    expect(await connected.json()).toMatchObject({ trafficAccessToken: "traffic-sbx1" });
    expect(
      (await w.call(w.alice, "POST", "/v2/sandboxes/sbx1/connect", { timeout: 60 })).status,
    ).toBe(200);
    expect(w.ecw.requests.some((r) => r.path === "/v2/sandboxes/sbx1/connect")).toBe(true);

    expect(
      (await w.call(w.alice, "POST", "/sandboxes/sbx1/timeout", { timeout: 600 })).status,
    ).toBe(204);
    expect((await w.call(w.alice, "POST", "/sandboxes/sbx1/refreshes", {})).status).toBe(204);

    expect((await w.call(w.alice, "DELETE", "/sandboxes/sbx1")).status).toBe(204);
    expect(w.space.sandboxes.has("sbx1")).toBe(false);
    expect(await w.client("alice").machines.list()).toEqual([]);
  });

  it("caps an oversized timeout", async () => {
    const w = await world();
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });
    await w.call(w.alice, "POST", "/sandboxes/sbx1/timeout", { timeout: 9_999_999 });
    expect((w.ecw.requests.at(-1)?.body as { timeout: number } | undefined)?.timeout).toBe(86_400);
  });

  it("never reveals another account's sandbox: every by-id route answers 404", async () => {
    const w = await world();
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });
    const routes: [string, string, unknown?][] = [
      ["GET", "/sandboxes/sbx1"],
      ["DELETE", "/sandboxes/sbx1"],
      ["POST", "/sandboxes/sbx1/pause"],
      ["POST", "/sandboxes/sbx1/resume", {}],
      ["POST", "/sandboxes/sbx1/connect", {}],
      ["POST", "/v2/sandboxes/sbx1/connect", {}],
      ["POST", "/sandboxes/sbx1/timeout", { timeout: 60 }],
      ["POST", "/sandboxes/sbx1/refreshes", {}],
      ["GET", "/sandboxes/sbx1/metrics"],
    ];
    const missing = await (await w.call(w.bob, "GET", "/sandboxes/nope")).text();
    for (const [method, path, body] of routes) {
      const res = await w.call(w.bob, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(404);
      // Indistinguishable from a sandbox that does not exist.
      expect((await res.text()).replace("sbx1", "nope")).toBe(missing);
    }
    // Nothing but reads reached the upstream for those calls, and alice's sandbox is intact.
    const mutating = w.ecw.requests.slice(1).filter((r) => r.method !== "GET");
    expect(mutating).toEqual([]);
    expect(w.space.sandboxes.get("sbx1")?.state).toBe("running");
  });

  it("treats a sandbox with no owner tag as nobody's", async () => {
    const w = await world();
    w.space.sandboxes.set("untagged", {
      id: "untagged",
      templateId: "seed",
      state: "running",
      metadata: {},
      envdAccessToken: "e",
      trafficToken: "t",
    });
    expect((await w.call(w.alice, "GET", "/sandboxes/untagged")).status).toBe(404);
    expect((await w.call(w.alice, "DELETE", "/sandboxes/untagged")).status).toBe(404);
  });

  it("refuses odd ids without asking the upstream", async () => {
    const w = await world();
    const res = await w.call(w.alice, "GET", "/sandboxes/..%2Fv2%2Fsandboxes");
    expect(res.status).toBe(404);
    expect(w.ecw.requests).toHaveLength(0);
  });

  it("says metrics are not available for an owned sandbox", async () => {
    const w = await world();
    await w.call(w.alice, "POST", "/sandboxes", { templateID: "seed" });
    expect((await w.call(w.alice, "GET", "/sandboxes/sbx1/metrics")).status).toBe(501);
  });

  it("does not turn an upstream auth failure into the caller's", async () => {
    const w = await world();
    w.ecw.requests.length = 0;
    // A key the upstream refuses: build a front with a wrong service key.
    const { createE2bFront } = await import("./front.js");
    const { silentLogger } = await import("../logger.js");
    const front = createE2bFront({
      upstream: { baseUrl: "http://ecw.test", apiKey: "wrong", fetch: w.ecw.fetch },
      apiKeys: w.apiKeys,
      isActive: async () => true,
      machines: w.service,
      throttle: { hit: () => ({ allowed: true }) },
      logger: silentLogger,
      domain: "box.example.test",
    });
    const res = await front.fetch(
      new Request(`${HOST}/sandboxes/sbx1`, { headers: { "x-api-key": w.alice } }),
      { ip: "1.1.1.1" },
    );
    expect(res.status).toBe(502);
    // Nothing about the service key leaks.
    expect(await res.text()).not.toMatch(/wrong|svc-key/);
  });

  it("rate-limits per account and counts bad keys against the address", async () => {
    const off = Object.fromEntries(
      (Object.keys(DEFAULT_LIMITS) as LimitClass[]).map((c) => [c, {}]),
    ) as RouteLimits;
    const throttle = createThrottle({
      ...off,
      e2b_read: parseBudget("user=2/60") as never,
      auth: parseBudget("ip=2/60") as never,
    });
    const w = setupApp({ throttle });
    const alice = (await w.apiKeys.create("alice", "ci")).secret;
    const get = (key: string) =>
      w.app.fetch(new Request(`${HOST}/sandboxes`, { headers: { "x-api-key": key } }));
    expect((await get(alice)).status).toBe(200);
    expect((await get(alice)).status).toBe(200);
    const limited = await get(alice);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();

    expect((await get("rbx_bad1")).status).toBe(401);
    expect((await get("rbx_bad2")).status).toBe(401);
    expect((await get("rbx_bad3")).status).toBe(429);
  });

  it("serves nothing under those paths without the front, and leaves other routes alone", async () => {
    const w = await world();
    expect((await w.app.fetch(new Request(`${HOST}/health`))).status).toBe(200);
  });
});
