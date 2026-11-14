import { describe, expect, it } from "vitest";
import { adminEmails, desktopOrigin, loadEnv } from "./env.js";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://api.example.test",
  APP_ORIGIN: "https://app.example.test",
  ROOKBOX_ALLOWED_EMAILS: "Owner@Example.test, second@example.test",
  SPACE_ECW_API_URL: "https://api.box.example.test",
  SPACE_ECW_API_KEY: "key",
  E2B_DOMAIN: "box.example.test",
};

describe("loadEnv", () => {
  it("applies defaults and normalizes the allowlist", () => {
    const env = loadEnv(valid);
    expect(env.MACHINE_IDLE_TIMEOUT_S).toBe(1_800);
    expect(env.MAX_MACHINES_PER_USER).toBe(3);
    expect(env.MAX_RUNNING_MACHINES_TOTAL).toBe(5);
    expect(env.PORT).toBe(3000);
    expect(env.RUN_MIGRATIONS).toBe(true);
    expect(env.ROOKBOX_ALLOWED_EMAILS).toEqual(["owner@example.test", "second@example.test"]);
  });

  it("offers every template by default, and takes an allowlist from the environment", () => {
    expect(loadEnv(valid).SPACE_TEMPLATES).toEqual(["desktop", "corvo-computer", "seed"]);
    expect(loadEnv({ ...valid, SPACE_TEMPLATES: " Seed , desktop" }).SPACE_TEMPLATES).toEqual([
      "seed",
      "desktop",
    ]);
    expect(() => loadEnv({ ...valid, SPACE_TEMPLATES: "seed,nope" })).toThrow(/SPACE_TEMPLATES/);
    expect(() => loadEnv({ ...valid, SPACE_TEMPLATES: "" })).toThrow(/SPACE_TEMPLATES/);
  });

  it("starts without a SPACE key, so /health/space can report it missing", () => {
    expect(loadEnv({ ...valid, SPACE_ECW_API_KEY: undefined }).SPACE_ECW_API_KEY).toBe("");
  });

  it("leaves the cookie host-only and the desktop on the API host unless told otherwise", () => {
    const env = loadEnv(valid);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
    expect(env.DESKTOP_HOST).toBeUndefined();
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
    expect(env.MACHINE_ALLOW_INTERNET).toBe(true);
    expect(loadEnv({ ...valid, COOKIE_DOMAIN: "" }).COOKIE_DOMAIN).toBeUndefined();
    expect(desktopOrigin(env)).toBe("https://api.example.test");
    expect(adminEmails(env)).toEqual(["owner@example.test"]);
  });

  it("validates the desktop host", () => {
    const secret = "k".repeat(32);
    const ok = loadEnv({
      ...valid,
      DESKTOP_HOST: "Desk.Example.test",
      DESKTOP_LINK_SECRET: secret,
    });
    expect(ok.DESKTOP_HOST).toBe("desk.example.test");
    expect(desktopOrigin(ok)).toBe("https://desk.example.test");
    expect(() => loadEnv({ ...valid, DESKTOP_HOST: "api.example.test" })).toThrow(/DESKTOP_HOST/);
    expect(() => loadEnv({ ...valid, DESKTOP_HOST: "app.example.test" })).toThrow(/DESKTOP_HOST/);
    expect(() => loadEnv({ ...valid, DESKTOP_HOST: "https://desk.example.test" })).toThrow(
      /DESKTOP_HOST/,
    );
    expect(() => loadEnv({ ...valid, DESKTOP_LINK_SECRET: "short" })).toThrow(
      /DESKTOP_LINK_SECRET/,
    );
    // In production the split deployment needs its own secret.
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: "production", DESKTOP_HOST: "desk.example.test" }),
    ).toThrow(/DESKTOP_LINK_SECRET/);
  });

  it("refuses to delete orphans without acting, and takes admins from the environment", () => {
    expect(() => loadEnv({ ...valid, RECONCILE_KILL_ORPHANS: "true" })).toThrow(/RECONCILE_ACT/);
    expect(
      loadEnv({ ...valid, RECONCILE_ACT: "true", RECONCILE_KILL_ORPHANS: "true" })
        .RECONCILE_INTERVAL_S,
    ).toBe(0);
    expect(
      adminEmails(loadEnv({ ...valid, ROOKBOX_ADMIN_EMAILS: "A@example.test, b@example.test" })),
    ).toEqual(["a@example.test", "b@example.test"]);
    expect(() => loadEnv({ ...valid, ROOKBOX_ADMIN_EMAILS: "nope" })).toThrow(
      /ROOKBOX_ADMIN_EMAILS/,
    );
  });

  it("fails loudly on a missing or weak value, naming it", () => {
    expect(() => loadEnv({ ...valid, SPACE_ECW_API_URL: undefined })).toThrow(/SPACE_ECW_API_URL/);
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadEnv({ ...valid, ROOKBOX_ALLOWED_EMAILS: "" })).toThrow(
      /ROOKBOX_ALLOWED_EMAILS/,
    );
  });
});
