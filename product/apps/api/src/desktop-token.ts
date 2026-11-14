import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed desktop tokens. There are two kinds, bound to one machine and one user:
 *
 * - `link`: what the dashboard hands the browser. It lives for minutes and only opens a session.
 * - `session`: set as a path-scoped, host-only cookie on the desktop origin by opening a link. It
 *   lives for hours so a noVNC session survives normal use and reloads.
 *
 * Format: `v1.<payload>.<mac>`, both base64url. The MAC is HMAC-SHA256 over the kind and the
 * payload, so a link cannot be replayed as a session or the other way round. Verification tries the
 * current secret and then the previous one, which makes rotation a two-step: set the new secret and
 * move the old one to `DESKTOP_LINK_SECRET_PREVIOUS`, then drop it once the longest session ended.
 */
export type TokenKind = "link" | "session";

export type DesktopClaims = {
  kind: TokenKind;
  machineId: string;
  userId: string;
  /** Expiry, in seconds since the epoch. */
  exp: number;
  /** Random id, so a link can be marked used. */
  jti: string;
};

export type VerifyResult =
  | { ok: true; claims: DesktopClaims }
  | { ok: false; reason: "malformed" | "signature" | "expired" };

const VERSION = "v1";

const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** A signing secret derived from another one, for deployments that set no `DESKTOP_LINK_SECRET`. */
export function deriveSecret(base: string): string {
  return createHmac("sha256", base).update("rookbox/desktop-token/v1").digest("hex");
}

export function createDesktopTokens(options: {
  secret: string;
  previousSecret?: string | undefined;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const secrets = [options.secret, ...(options.previousSecret ? [options.previousSecret] : [])];

  const mac = (secret: string, kind: TokenKind, payload: string) =>
    createHmac("sha256", secret).update(`${VERSION}.${kind}.${payload}`).digest();

  return {
    sign(
      kind: TokenKind,
      who: { machineId: string; userId: string },
      ttlS: number,
    ): { token: string; expiresAt: Date } {
      const exp = Math.floor(now() / 1_000) + ttlS;
      const payload = b64(
        JSON.stringify({
          k: kind,
          m: who.machineId,
          u: who.userId,
          e: exp,
          j: randomBytes(9).toString("base64url"),
        }),
      );
      const tag = b64(mac(options.secret, kind, payload));
      return { token: `${VERSION}.${payload}.${tag}`, expiresAt: new Date(exp * 1_000) };
    },

    verify(kind: TokenKind, token: string | undefined | null): VerifyResult {
      const parts = (token ?? "").split(".");
      if (parts.length !== 3 || parts[0] !== VERSION || !parts[1] || !parts[2]) {
        return { ok: false, reason: "malformed" };
      }
      const [, payload, tag] = parts as [string, string, string];
      const given = Buffer.from(tag, "base64url");
      const signed = secrets.some((secret) => {
        const expected = mac(secret, kind, payload);
        return given.length === expected.length && timingSafeEqual(given, expected);
      });
      if (!signed) return { ok: false, reason: "signature" };
      let raw: unknown;
      try {
        raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      } catch {
        return { ok: false, reason: "malformed" };
      }
      const claims = raw as Record<string, unknown>;
      if (
        claims.k !== kind ||
        typeof claims.m !== "string" ||
        typeof claims.u !== "string" ||
        typeof claims.e !== "number" ||
        typeof claims.j !== "string"
      ) {
        return { ok: false, reason: "malformed" };
      }
      if (claims.e <= Math.floor(now() / 1_000)) return { ok: false, reason: "expired" };
      return {
        ok: true,
        claims: { kind, machineId: claims.m, userId: claims.u, exp: claims.e, jti: claims.j },
      };
    },
  };
}

export type DesktopTokens = ReturnType<typeof createDesktopTokens>;
