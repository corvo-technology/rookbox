import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { cookieSettings, createAuth, createIdentity } from "./auth.js";
import type { Env } from "./env.js";
import { silentLogger } from "./logger.js";

const API = "https://api.example.test";

describe("session cookie scope", () => {
  it("is host-only by default: no Domain, __Host- names, Lax, Secure, HttpOnly", async () => {
    const auth = betterAuth({
      secret: "s".repeat(32),
      baseURL: API,
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true },
      advanced: cookieSettings({ BETTER_AUTH_URL: API, COOKIE_DOMAIN: undefined }),
    });
    const { headers } = await auth.api.signUpEmail({
      body: { email: "a@example.test", password: "correct horse battery", name: "A" },
      returnHeaders: true,
    });
    const cookies = headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Host-rookbox\./);
      expect(cookie).not.toMatch(/domain=/i);
      expect(cookie).toMatch(/path=\//i);
      expect(cookie).toMatch(/secure/i);
      expect(cookie).toMatch(/httponly/i);
      expect(cookie).toMatch(/samesite=lax/i);
    }
  });

  it("only gets a Domain when COOKIE_DOMAIN is set, and then drops the __Host- prefix", () => {
    const shared = cookieSettings({ BETTER_AUTH_URL: API, COOKIE_DOMAIN: ".example.test" });
    expect(shared.crossSubDomainCookies).toEqual({ enabled: true, domain: ".example.test" });
    expect(shared.cookies).toBeUndefined();
    const plain = cookieSettings({ BETTER_AUTH_URL: API, COOKIE_DOMAIN: undefined });
    expect(plain.crossSubDomainCookies).toBeUndefined();
  });

  it("works over plain HTTP for local development", () => {
    const dev = cookieSettings({
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      COOKIE_DOMAIN: undefined,
    });
    expect(dev.crossSubDomainCookies).toBeUndefined();
    expect(dev.cookies).toBeUndefined();
    expect(dev.defaultCookieAttributes).toMatchObject({ secure: false, sameSite: "lax" });
  });
});

describe("identity", () => {
  const user = { id: "u1", email: "Owner@Example.test" };
  const base = {
    auth: { api: { getSession: async () => ({ user }) } } as never,
    apiKeys: { authenticate: async () => "u1" },
    db: { user: { findUnique: async () => user } } as never,
  };

  it("accepts an existing account, session or key, whatever the env allowlist says", async () => {
    const identity = createIdentity(base);
    expect(await identity(new Headers())).toMatchObject({ id: "u1" });
    expect(await identity(new Headers({ authorization: "Bearer rbx_abc" }))).toMatchObject({
      id: "u1",
    });
  });
});

describe("disabled accounts", () => {
  const user = { id: "u1", email: "owner@example.test", disabledAt: null as Date | null };
  const base = {
    auth: { api: { getSession: async () => ({ user }) } } as never,
    apiKeys: { authenticate: async () => "u1" },
    db: { user: { findUnique: async () => user } } as never,
  };

  it("refuses a session and a key while disabledAt is set, and accepts them again after", async () => {
    const identity = createIdentity(base);
    const key = new Headers({ authorization: "Bearer rbx_abc" });
    expect(await identity(new Headers())).toEqual({ id: "u1", email: "owner@example.test" });
    user.disabledAt = new Date();
    expect(await identity(new Headers())).toBeNull();
    expect(await identity(key)).toBeNull();
    user.disabledAt = null;
    expect(await identity(key)).toMatchObject({ id: "u1" });
  });

  it("cannot sign in with the right password, but can once enabled (real better-auth)", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
    };
    const env = {
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: API,
      APP_ORIGIN: "https://app.example.test",
      COOKIE_DOMAIN: undefined,
      ROOKBOX_ALLOWED_EMAILS: ["owner@example.test"],
    } as unknown as Env;
    const auth = createAuth({} as never, env, silentLogger, {
      allowSignUp: true,
      database: memoryAdapter(tables),
    });
    const body = { email: "a@example.test", password: "correct horse battery" };
    // The account is not in the env allowlist (it lists someone else): creating it is the
    // operator's call, and it can sign in all the same.
    await auth.api.signUpEmail({ body: { ...body, name: "A" } });
    await expect(auth.api.signInEmail({ body })).resolves.toBeTruthy();

    const row = tables.user?.[0] as { disabledAt?: Date | null };
    // A live session is cut as soon as the flag is set, and comes back when it is cleared.
    const { headers } = await auth.api.signInEmail({ body, returnHeaders: true });
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    const identity = createIdentity({
      auth,
      apiKeys: { authenticate: async () => null },
      db: {} as never,
    });
    expect(await identity(new Headers({ cookie }))).toMatchObject({ email: "a@example.test" });

    row.disabledAt = new Date();
    expect(await identity(new Headers({ cookie }))).toBeNull();
    await expect(auth.api.signInEmail({ body })).rejects.toBeTruthy();
    row.disabledAt = null;
    expect(await identity(new Headers({ cookie }))).toMatchObject({ email: "a@example.test" });
    await expect(auth.api.signInEmail({ body })).resolves.toBeTruthy();
  });
});
