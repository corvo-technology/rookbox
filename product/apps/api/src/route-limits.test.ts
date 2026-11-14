import { describe, expect, it } from "vitest";
import { loadEnv, routeLimits } from "./env.js";
import { createThrottle, DEFAULT_LIMITS, LIMIT_CLASSES, parseBudget } from "./route-limits.js";

describe("parseBudget", () => {
  it("reads per-user and per-address budgets", () => {
    expect(parseBudget("user=20/3600, ip=60/3600")).toEqual({
      user: { max: 20, windowS: 3600 },
      ip: { max: 60, windowS: 3600 },
    });
    expect(parseBudget("ip=5/10")).toEqual({ ip: { max: 5, windowS: 10 } });
  });

  it("turns a scope or the class off", () => {
    expect(parseBudget("user=off,ip=5/10")).toEqual({ ip: { max: 5, windowS: 10 } });
    expect(parseBudget("off")).toEqual({});
  });

  it("explains a bad value", () => {
    for (const bad of ["20/3600", "user=0/10", "user=5/0", "team=5/10", "user=5", ""]) {
      expect(parseBudget(bad), bad).toHaveProperty("error");
    }
  });

  it("parses every default", () => {
    for (const cls of LIMIT_CLASSES)
      expect(parseBudget(DEFAULT_LIMITS[cls])).not.toHaveProperty("error");
  });
});

describe("throttle", () => {
  const clock = { t: 0 };
  const make = (spec: string) =>
    createThrottle(
      { ...routeLimitsOff(), machine_exec: parseBudget(spec) as never },
      { now: () => clock.t },
    );
  const routeLimitsOff = () =>
    Object.fromEntries(LIMIT_CLASSES.map((cls) => [cls, {}])) as ReturnType<typeof routeLimits>;

  it("allows the budget, then answers with a retry time, per user", () => {
    clock.t = 1_000;
    const throttle = make("user=2/60");
    const alice = { userId: "alice", ip: "1.1.1.1" };
    expect(throttle.hit("machine_exec", alice).allowed).toBe(true);
    expect(throttle.hit("machine_exec", alice).allowed).toBe(true);
    expect(throttle.hit("machine_exec", alice)).toEqual({ allowed: false, retryAfterS: 60 });
    // Another account on the same address has its own budget.
    expect(throttle.hit("machine_exec", { userId: "bob", ip: "1.1.1.1" }).allowed).toBe(true);
    clock.t += 61_000;
    expect(throttle.hit("machine_exec", alice).allowed).toBe(true);
  });

  it("limits an address across accounts", () => {
    clock.t = 1_000;
    const throttle = make("ip=2/60");
    expect(throttle.hit("machine_exec", { userId: "a", ip: "9.9.9.9" }).allowed).toBe(true);
    expect(throttle.hit("machine_exec", { userId: "b", ip: "9.9.9.9" }).allowed).toBe(true);
    expect(throttle.hit("machine_exec", { userId: "c", ip: "9.9.9.9" }).allowed).toBe(false);
    expect(throttle.hit("machine_exec", { userId: "c", ip: "8.8.8.8" }).allowed).toBe(true);
  });

  it("does not spend the user's budget on a request the address budget refused", () => {
    clock.t = 1_000;
    const throttle = make("user=2/60,ip=1/60");
    expect(throttle.hit("machine_exec", { userId: "a", ip: "1.1.1.1" }).allowed).toBe(true);
    expect(throttle.hit("machine_exec", { userId: "a", ip: "1.1.1.1" }).allowed).toBe(false);
    // From a new address the user still has one request left, not none.
    expect(throttle.hit("machine_exec", { userId: "a", ip: "2.2.2.2" }).allowed).toBe(true);
    expect(throttle.hit("machine_exec", { userId: "a", ip: "3.3.3.3" }).allowed).toBe(false);
  });

  it("counts classes separately and can be switched off", () => {
    clock.t = 1_000;
    const throttle = make("user=1/60");
    const who = { userId: "a", ip: "1.1.1.1" };
    expect(throttle.hit("machine_exec", who).allowed).toBe(true);
    expect(throttle.hit("machine_exec", who).allowed).toBe(false);
    expect(throttle.hit("machine_create", who).allowed).toBe(true);
    const off = createThrottle(routeLimitsOff(), { enabled: false });
    for (let n = 0; n < 100; n += 1) expect(off.hit("machine_exec", who).allowed).toBe(true);
  });
});

describe("limits from the environment", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://api.example.test",
    APP_ORIGIN: "https://app.example.test",
    ROOKBOX_ALLOWED_EMAILS: "owner@example.test",
    SPACE_ECW_API_URL: "https://api.box.example.test",
    E2B_DOMAIN: "box.example.test",
  };

  it("uses the defaults and takes overrides", () => {
    const limits = routeLimits(loadEnv(base));
    expect(limits.machine_create.user).toEqual({ max: 20, windowS: 3600 });
    expect(limits.auth).toEqual({ ip: { max: 60, windowS: 600 } });
    const custom = routeLimits(loadEnv({ ...base, RATE_LIMIT_MACHINE_EXEC: "user=5/10,ip=off" }));
    expect(custom.machine_exec).toEqual({ user: { max: 5, windowS: 10 } });
  });

  it("names the variable that is wrong", () => {
    expect(() => loadEnv({ ...base, RATE_LIMIT_MACHINE_EXEC: "lots" })).toThrow(
      /RATE_LIMIT_MACHINE_EXEC/,
    );
  });
});
