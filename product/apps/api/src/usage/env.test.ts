import { describe, expect, it } from "vitest";
import { loadEnv } from "../env.js";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://api.example.test",
  APP_ORIGIN: "https://app.example.test",
  ROOKBOX_ALLOWED_EMAILS: "owner@example.test",
  SPACE_ECW_API_URL: "https://api.box.example.test",
  E2B_DOMAIN: "box.example.test",
};

describe("usage settings", () => {
  it("are optional, so an API without them still starts", () => {
    const env = loadEnv(valid);
    expect(env.INGEST_SECRET).toBeUndefined();
    expect(env.ADMIN_EMAILS).toBeUndefined();
  });

  it("take a long enough secret and a list of admin emails", () => {
    const env = loadEnv({
      ...valid,
      INGEST_SECRET: "s".repeat(32),
      ADMIN_EMAILS: " Admin@Example.test, other@example.test ",
    });
    expect(env.ADMIN_EMAILS).toEqual(["admin@example.test", "other@example.test"]);
  });

  it("refuse a short secret, naming it", () => {
    expect(() => loadEnv({ ...valid, INGEST_SECRET: "short" })).toThrow(/INGEST_SECRET/);
  });
});
