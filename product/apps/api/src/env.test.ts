import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

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
    expect(env.MACHINE_IDLE_TIMEOUT_S).toBe(900);
    expect(env.PORT).toBe(3000);
    expect(env.RUN_MIGRATIONS).toBe(true);
    expect(env.ROOKBOX_ALLOWED_EMAILS).toEqual(["owner@example.test", "second@example.test"]);
  });

  it("fails loudly on a missing or weak value, naming it", () => {
    expect(() => loadEnv({ ...valid, SPACE_ECW_API_KEY: undefined })).toThrow(/SPACE_ECW_API_KEY/);
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadEnv({ ...valid, ROOKBOX_ALLOWED_EMAILS: "" })).toThrow(
      /ROOKBOX_ALLOWED_EMAILS/,
    );
  });
});
