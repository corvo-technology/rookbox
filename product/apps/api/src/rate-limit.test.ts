import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

function limiter(max = 3) {
  const clock = { t: 1_000_000 };
  return { clock, limiter: createRateLimiter({ max, windowMs: 60_000, now: () => clock.t }) };
}

describe("rate limiter", () => {
  it("allows up to the maximum failures, then blocks with a retry time", () => {
    const { limiter: l } = limiter();
    for (let n = 0; n < 3; n += 1) {
      expect(l.check("a")).toEqual({ allowed: true });
      l.fail("a");
    }
    expect(l.check("a")).toEqual({ allowed: false, retryAfterS: 60 });
    expect(l.check("b")).toEqual({ allowed: true });
  });

  it("lets a key try again when the window ends", () => {
    const { limiter: l, clock } = limiter(1);
    l.fail("a");
    expect(l.check("a").allowed).toBe(false);
    clock.t += 60_001;
    expect(l.check("a").allowed).toBe(true);
  });

  it("forgets a key after a success", () => {
    const { limiter: l } = limiter(1);
    l.fail("a");
    l.reset("a");
    expect(l.check("a").allowed).toBe(true);
  });

  it("keeps a bounded number of keys", () => {
    const l = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 2 });
    l.fail("a");
    l.fail("b");
    l.fail("c");
    expect(l.check("a").allowed).toBe(true);
    expect(l.check("c").allowed).toBe(false);
  });
});
