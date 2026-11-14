import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { cookieSettings, createIdentity } from "./auth.js";

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

  it("refuses a signed-in account whose email is no longer allowed, session or key", async () => {
    const allowed = createIdentity({ ...base, allowedEmails: new Set(["owner@example.test"]) });
    expect(await allowed(new Headers())).toMatchObject({ id: "u1" });
    expect(await allowed(new Headers({ authorization: "Bearer rbx_abc" }))).toMatchObject({
      id: "u1",
    });
    const removed = createIdentity({ ...base, allowedEmails: new Set(["someone@example.test"]) });
    expect(await removed(new Headers())).toBeNull();
    expect(await removed(new Headers({ authorization: "Bearer rbx_abc" }))).toBeNull();
  });
});
