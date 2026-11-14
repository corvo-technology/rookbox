import { describe, expect, it } from "vitest";
import { createDesktopTokens, deriveSecret } from "./desktop-token.js";

const SECRET = "a".repeat(32);
const WHO = { machineId: "sbx1", userId: "alice" };

function tokens(secret = SECRET, previousSecret?: string) {
  const clock = { t: 1_700_000_000_000 };
  return { clock, tokens: createDesktopTokens({ secret, previousSecret, now: () => clock.t }) };
}

describe("desktop tokens", () => {
  it("round-trips the claims", () => {
    const { tokens: t, clock } = tokens();
    const { token, expiresAt } = t.sign("link", WHO, 120);
    expect(expiresAt.getTime()).toBe(clock.t + 120_000);
    const verdict = t.verify("link", token);
    expect(verdict).toMatchObject({
      ok: true,
      claims: { kind: "link", machineId: "sbx1", userId: "alice", exp: clock.t / 1000 + 120 },
    });
  });

  it("expires", () => {
    const { tokens: t, clock } = tokens();
    const { token } = t.sign("link", WHO, 120);
    clock.t += 119_000;
    expect(t.verify("link", token).ok).toBe(true);
    clock.t += 1_000;
    expect(t.verify("link", token)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a changed payload or signature", () => {
    const { tokens: t } = tokens();
    const { token } = t.sign("link", WHO, 120);
    const [v, payload, mac] = token.split(".") as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), u: "bob" }),
    ).toString("base64url");
    expect(t.verify("link", `${v}.${forged}.${mac}`)).toEqual({ ok: false, reason: "signature" });
    expect(t.verify("link", `${v}.${payload}.${mac.slice(0, -2)}AA`)).toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it("rejects junk", () => {
    const { tokens: t } = tokens();
    for (const junk of ["", "x", "v1.a.b", "v2.a.b", "v1..", null, undefined, "a.b.c.d"]) {
      expect(t.verify("link", junk).ok).toBe(false);
    }
  });

  it("does not accept a link as a session or the reverse", () => {
    const { tokens: t } = tokens();
    expect(t.verify("session", t.sign("link", WHO, 60).token).ok).toBe(false);
    expect(t.verify("link", t.sign("session", WHO, 60).token).ok).toBe(false);
  });

  it("does not accept another secret's tokens", () => {
    const { token } = tokens("b".repeat(32)).tokens.sign("link", WHO, 60);
    expect(tokens().tokens.verify("link", token)).toEqual({ ok: false, reason: "signature" });
  });

  it("keeps accepting the previous secret while rotating, but signs with the new one", () => {
    const oldSecret = "o".repeat(32);
    const fresh = "n".repeat(32);
    const issuedBeforeRotation = tokens(oldSecret).tokens.sign("session", WHO, 600).token;
    const rotated = tokens(fresh, oldSecret).tokens;
    expect(rotated.verify("session", issuedBeforeRotation).ok).toBe(true);
    const issuedAfter = rotated.sign("session", WHO, 600).token;
    expect(tokens(fresh).tokens.verify("session", issuedAfter).ok).toBe(true);
    expect(tokens(oldSecret).tokens.verify("session", issuedAfter).ok).toBe(false);
    // Once the previous secret is dropped, old tokens stop working.
    expect(tokens(fresh).tokens.verify("session", issuedBeforeRotation).ok).toBe(false);
  });

  it("derives a separate, stable key from another secret", () => {
    expect(deriveSecret("x".repeat(32))).toBe(deriveSecret("x".repeat(32)));
    expect(deriveSecret("x".repeat(32))).not.toBe("x".repeat(32));
    expect(deriveSecret("x".repeat(32))).not.toBe(deriveSecret("y".repeat(32)));
  });
});
