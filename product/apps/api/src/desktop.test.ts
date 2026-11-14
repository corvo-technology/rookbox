import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { type Logger, silentLogger } from "./logger.js";
import { DESK, setupApp } from "./test-app.js";

const DESK_URL = `https://${DESK}`;

async function withDesktop(user = "alice") {
  const ctx = setupApp({}, { maxMachinesPerUser: 5 });
  const machine = await ctx.client(user).machines.create({
    name: "d",
    template: "desktop",
    size: SIZE_PRESETS.small,
  });
  const link = await ctx.client(user).machines.desktopLink({ id: machine.id });
  return { ...ctx, machine, link };
}

/** Opens a link and returns the cookie pair the browser would send back. */
async function openLink(app: Awaited<ReturnType<typeof withDesktop>>["app"], url: string) {
  const response = await app.request(url);
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { response, setCookie, cookie: setCookie.split(";")[0] ?? "" };
}

describe("desktop link", () => {
  it("is issued for the owner's running desktop, on the desktop origin, with a short life", async () => {
    const { link, machine } = await withDesktop();
    expect(link.url.startsWith(`${DESK_URL}/open/v1.`)).toBe(true);
    expect(link.url).not.toContain("session");
    expect(machine.access.desktop).toBe(true);
    const ttl = new Date(link.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(60_000);
    expect(ttl).toBeLessThanOrEqual(120_000);
  });

  it("opens into a host-only, path-scoped, HttpOnly cookie and a redirect to the page", async () => {
    const { app, link, machine } = await withDesktop();
    const { response, setCookie } = await openLink(app, link.url);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/m/${machine.id}/vnc.html?autoconnect=true&resize=scale&path=${encodeURIComponent(`m/${machine.id}/websockify`)}`,
    );
    expect(setCookie).toContain(`Path=/m/${machine.id}/`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Max-Age=14400");
    expect(setCookie.toLowerCase()).not.toContain("domain");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves the page with the traffic token once the session cookie is there", async () => {
    const { app, link, machine, upstream } = await withDesktop();
    const { cookie } = await openLink(app, link.url);
    const page = await app.request(`${DESK_URL}/m/${machine.id}/vnc.html?autoconnect=true`, {
      headers: { cookie },
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("vnc");
    expect(upstream).toEqual([
      `https://6080-${machine.id}.box.example.test/vnc.html?autoconnect=true traffic-${machine.id}`,
    ]);
    // The upstream's own cookies never reach the browser.
    expect(page.headers.get("set-cookie")).toBeNull();
    // Assets under the same path keep working with the same cookie.
    const asset = await app.request(`${DESK_URL}/m/${machine.id}/app/ui.js`, {
      headers: { cookie },
    });
    expect(asset.status).toBe(200);
  });

  it("needs the cookie: no cookie, a login cookie or a link in its place gets nothing", async () => {
    const { app, link, machine, upstream } = await withDesktop();
    const path = `${DESK_URL}/m/${machine.id}/vnc.html`;
    expect((await app.request(path)).status).toBe(401);
    // The main login cookie means nothing here.
    expect((await app.request(path, { headers: { cookie: "session=alice" } })).status).toBe(401);
    const linkToken = link.url.split("/open/")[1] ?? "";
    expect((await app.request(path, { headers: { cookie: `rbx_desk=${linkToken}` } })).status).toBe(
      401,
    );
    expect(upstream).toHaveLength(0);
  });

  it("works once", async () => {
    const { app, link } = await withDesktop();
    expect((await app.request(link.url)).status).toBe(302);
    expect((await app.request(link.url)).status).toBe(410);
  });

  it("is refused after it expires", async () => {
    const { app, tokens, machine, upstream } = await withDesktop();
    const old = tokens.sign("link", { machineId: machine.id, userId: "alice" }, -1);
    const response = await app.request(`${DESK_URL}/open/${old.token}`);
    expect(response.status).toBe(410);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(upstream).toHaveLength(0);
  });

  it("is refused when tampered with", async () => {
    const { app, link } = await withDesktop();
    const token = link.url.split("/open/")[1] ?? "";
    const [v, payload, mac] = token.split(".") as [string, string, string];
    const swapped = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), u: "bob" }),
    ).toString("base64url");
    for (const bad of [
      `${v}.${swapped}.${mac}`,
      `${v}.${payload}.${mac.slice(0, -3)}abc`,
      "garbage",
    ]) {
      const response = await app.request(`${DESK_URL}/open/${bad}`);
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("is not issued for another user's machine, and a forged one does not open it", async () => {
    const { client, tokens, app, machine } = await withDesktop("alice");
    await expect(client("bob").machines.desktopLink({ id: machine.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Signed with the real key but claiming bob owns it: the ownership check still says no.
    const forged = tokens.sign("link", { machineId: machine.id, userId: "bob" }, 60);
    expect((await app.request(`${DESK_URL}/open/${forged.token}`)).status).toBe(404);
  });

  it("is not issued for a machine without a desktop or one that is not running", async () => {
    const { client, machine } = await withDesktop();
    const plain = await client("alice").machines.create({
      name: "s",
      template: "seed",
      size: SIZE_PRESETS.small,
    });
    await expect(client("alice").machines.desktopLink({ id: plain.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await client("alice").machines.suspend({ id: machine.id });
    await expect(client("alice").machines.desktopLink({ id: machine.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("needs a signed-in caller", async () => {
    const { client, machine } = await withDesktop();
    await expect(client().machines.desktopLink({ id: machine.id })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("a session for one machine does not open another, even the same owner's", async () => {
    const { app, link, client, machine } = await withDesktop();
    const other = await client("alice").machines.create({
      name: "d2",
      template: "desktop",
      size: SIZE_PRESETS.small,
    });
    const { cookie } = await openLink(app, link.url);
    const response = await app.request(`${DESK_URL}/m/${other.id}/vnc.html`, {
      headers: { cookie },
    });
    expect(response.status).toBe(401);
    expect(
      (await app.request(`${DESK_URL}/m/${machine.id}/vnc.html`, { headers: { cookie } })).status,
    ).toBe(200);
  });

  it("does not open a link whose machine stopped running meanwhile", async () => {
    const { app, link, client, machine } = await withDesktop();
    await client("alice").machines.suspend({ id: machine.id });
    const response = await app.request(link.url);
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("stops accepting a session after its lifetime", async () => {
    const { app, tokens, machine } = await withDesktop();
    const dead = tokens.sign("session", { machineId: machine.id, userId: "alice" }, -1);
    const response = await app.request(`${DESK_URL}/m/${machine.id}/vnc.html`, {
      headers: { cookie: `rbx_desk=${dead.token}` },
    });
    expect(response.status).toBe(401);
  });
});

describe("hosts", () => {
  it("serves only the desktop on the desktop host", async () => {
    const { app } = await withDesktop();
    for (const path of [
      "/health",
      "/health/space",
      "/rpc/machines/list",
      "/api/auth/get-session",
      "/",
    ]) {
      const response = await app.request(`${DESK_URL}${path}`, {
        headers: { cookie: "session=alice" },
      });
      expect(response.status, path).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    const post = await app.request(`${DESK_URL}/rpc/machines/list`, {
      method: "POST",
      headers: { cookie: "session=alice", "content-type": "application/json" },
      body: "{}",
    });
    expect(post.status).toBe(404);
    // No CORS headers either, whatever the origin says.
    const preflight = await app.request(`${DESK_URL}/rpc/machines/list`, {
      method: "OPTIONS",
      headers: { origin: "https://app.example.test", "access-control-request-method": "POST" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves no desktop route on any other host", async () => {
    const { app, link, machine } = await withDesktop();
    const token = link.url.split("/open/")[1] ?? "";
    for (const host of [
      "https://api.example.test",
      "http://api.test",
      "https://evil.example.test",
    ]) {
      expect((await app.request(`${host}/open/${token}`)).status, host).toBe(404);
      expect((await app.request(`${host}/m/${machine.id}/vnc.html`)).status, host).toBe(404);
    }
    // The link still works where it belongs: the wrong-host attempts did not use it up.
    expect((await app.request(link.url)).status).toBe(302);
  });

  it("serves the API routes on the API host", async () => {
    const { app } = await withDesktop();
    expect((await app.request("https://api.example.test/health")).status).toBe(200);
  });

  it("falls back to serving the desktop on the API host when no desktop host is set", async () => {
    const ctx = setupApp({ desktopHost: null }, { maxMachinesPerUser: 5 });
    const machine = await ctx.client("alice").machines.create({
      name: "d",
      template: "desktop",
      size: SIZE_PRESETS.small,
    });
    const { token } = ctx.tokens.sign("link", { machineId: machine.id, userId: "alice" }, 60);
    expect((await ctx.app.request(`http://127.0.0.1:3000/open/${token}`)).status).toBe(302);
  });

  it("does not log the link token", async () => {
    // The request log records the route's shape for /open/, not the credential in its path.
    const lines: string[] = [];
    const logger: Logger = {
      ...silentLogger,
      info: (message, fields) => void lines.push(JSON.stringify({ message, ...fields })),
    };
    const ctx = setupApp({ logger });
    await ctx.app.request(`${DESK_URL}/open/v1.secretpayload.secretmac`);
    expect(lines.join("\n")).toContain("/open/:token");
    expect(lines.join("\n")).not.toContain("secretpayload");
  });
});

describe("desktop framing and start", () => {
  it("lets only the dashboard frame the page and the redirect", async () => {
    const { app, link, machine } = await withDesktop();
    const { response, cookie } = await openLink(app, link.url);
    const policy = "frame-ancestors https://app.example.test";
    expect(response.headers.get("content-security-policy")).toBe(policy);
    expect(response.headers.get("x-frame-options")).toBeNull();
    const page = await app.request(`${DESK_URL}/m/${machine.id}/vnc.html`, { headers: { cookie } });
    expect(page.headers.get("content-security-policy")).toBe(policy);
    expect(page.headers.get("x-frame-options")).toBeNull();
  });

  it("keeps DENY on the API's own routes", async () => {
    const { app } = await withDesktop();
    const health = await app.request("https://api.example.test/health");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
  });

  it("starts the stack before it issues a link", async () => {
    const { space, link } = await withDesktop();
    expect(link.url).toContain("/open/");
    const call = space.calls.find((c) => c.op === "exec");
    expect(String(call?.args[2])).toContain("novnc_proxy");
  });
});
