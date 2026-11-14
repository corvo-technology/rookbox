import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { API_ERRORS, type DesktopLink } from "@rookbox/contracts";
import WebSocket, { WebSocketServer } from "ws";
import type { DesktopTokens } from "./desktop-token.js";
import type { Logger } from "./logger.js";
import { MachineError, type MachineService } from "./machines/service.js";
import { sandboxHost } from "./space/client.js";

/**
 * The machine's desktop (noVNC on port 6080), served on its own origin.
 *
 * A sandbox's public ports need the `e2b-traffic-access-token` header, which a browser cannot
 * attach to a link or a WebSocket, so the API forwards to `https://6080-<id>.<domain>` with the
 * token added. That page is a program the machine's owner controls, so it must not run on the
 * origin that holds the login cookie:
 *
 * 1. The signed-in dashboard calls `machines.desktopLink`. The API checks ownership and returns
 *    `<desktop origin>/open/<link token>`, valid for `linkTtlS` (minutes).
 * 2. Opening it (`/open/<token>`) trades the link for a session token, set as a host-only,
 *    path-scoped cookie (`Path=/m/<id>/`, `HttpOnly`, `SameSite=Strict`) and redirects to the page.
 *    A cookie, not a token in the URL, so the secret stays out of history, logs and Referer, while
 *    assets and the WebSocket (same origin, same path) still carry it. A link works once.
 * 3. `/m/<id>/...` and its `websockify` WebSocket need that cookie. The login cookie is never read
 *    here and nothing here sets it: this code path has no access to better-auth.
 */
export const DESKTOP_PORT = 6080;
export const DESKTOP_COOKIE = "rbx_desk";
const TRAFFIC_HEADER = "e2b-traffic-access-token";
const TOKEN_TTL_MS = 60_000;
const MAX_USED_LINKS = 10_000;

export type DesktopDeps = {
  machines: Pick<MachineService, "desktopTarget">;
  tokens: DesktopTokens;
  e2bDomain: string;
  /** Origin the desktop is served from; WebSocket upgrades must come from it. */
  origin: string;
  /** Host (and port) of that origin. When set, upgrades on any other host are refused. */
  host: string | null;
  linkTtlS: number;
  sessionTtlS: number;
  logger: Logger;
  fetch?: typeof fetch;
  now?: () => number;
};

const REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "range",
  "if-none-match",
  "if-modified-since",
];
const RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
];

/** Every value the request's Cookie header holds under `name`. */
export function cookieValues(header: string | null | undefined, name: string): string[] {
  const values: string[] = [];
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name)
      values.push(part.slice(index + 1).trim());
  }
  return values;
}

const text = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra },
  });

export function createDesktopProxy(deps: DesktopDeps) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const secure = deps.origin.startsWith("https:");
  const trafficTokens = new Map<string, { token: string; until: number }>();
  const usedLinks = new Map<string, number>();

  async function target(userId: string, id: string) {
    const key = `${userId}:${id}`;
    const hit = trafficTokens.get(key);
    if (hit && hit.until > now()) return hit.token;
    const { trafficToken } = await deps.machines.desktopTarget(userId, id);
    trafficTokens.set(key, { token: trafficToken, until: now() + TOKEN_TTL_MS });
    if (trafficTokens.size > 200) trafficTokens.delete(trafficTokens.keys().next().value as string);
    return trafficToken;
  }

  function status(error: unknown): number {
    if (error instanceof MachineError) return API_ERRORS[error.code].status;
    return 502;
  }

  /** The session the request's cookie carries for this machine, or null. */
  function sessionFor(cookieHeader: string | null | undefined, id: string) {
    for (const value of cookieValues(cookieHeader, DESKTOP_COOKIE)) {
      const verdict = deps.tokens.verify("session", value);
      if (verdict.ok && verdict.claims.machineId === id) return verdict.claims;
    }
    return null;
  }

  /** Marks a link used. False when it was already. */
  function consume(jti: string, exp: number): boolean {
    const nowS = Math.floor(now() / 1_000);
    for (const [other, until] of usedLinks) if (until <= nowS) usedLinks.delete(other);
    if (usedLinks.has(jti)) return false;
    if (usedLinks.size >= MAX_USED_LINKS) {
      usedLinks.delete(usedLinks.keys().next().value as string);
    }
    usedLinks.set(jti, exp);
    return true;
  }

  const pagePath = (id: string) => {
    const base = `m/${encodeURIComponent(id)}`;
    return `/${base}/vnc.html?autoconnect=true&resize=scale&path=${encodeURIComponent(`${base}/websockify`)}`;
  };

  return {
    /**
     * A link for the machine's desktop, for a user who owns it. Throws a `MachineError` when the
     * machine is not theirs, not running, or has no desktop.
     */
    async issueLink(userId: string, machineId: string): Promise<DesktopLink> {
      await deps.machines.desktopTarget(userId, machineId);
      const { token, expiresAt } = deps.tokens.sign("link", { machineId, userId }, deps.linkTtlS);
      return { url: `${deps.origin}/open/${token}`, expiresAt: expiresAt.toISOString() };
    },

    /** `GET /open/:token`: trades a link for the session cookie and goes to the desktop page. */
    async open(token: string): Promise<Response> {
      const verdict = deps.tokens.verify("link", token);
      if (!verdict.ok) {
        return verdict.reason === "expired"
          ? text(410, "This link expired. Open the desktop again from the dashboard.")
          : text(403, "This link is not valid.");
      }
      const { claims } = verdict;
      try {
        await target(claims.userId, claims.machineId);
      } catch (error) {
        if (!(error instanceof MachineError)) deps.logger.error("desktop target failed", { error });
        return text(status(error), "The desktop is not available.");
      }
      if (!consume(claims.jti, claims.exp)) {
        return text(410, "This link was already used. Open the desktop again from the dashboard.");
      }
      const session = deps.tokens.sign(
        "session",
        { machineId: claims.machineId, userId: claims.userId },
        deps.sessionTtlS,
      );
      const cookie = [
        `${DESKTOP_COOKIE}=${session.token}`,
        `Path=/m/${encodeURIComponent(claims.machineId)}/`,
        `Max-Age=${deps.sessionTtlS}`,
        "HttpOnly",
        "SameSite=Strict",
        ...(secure ? ["Secure"] : []),
      ].join("; ");
      return new Response(null, {
        status: 302,
        headers: {
          location: pagePath(claims.machineId),
          "set-cookie": cookie,
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        },
      });
    },

    /** Handles `/m/:id/<rest>` for GET and HEAD. */
    async http(request: Request, id: string, rest: string): Promise<Response> {
      const session = sessionFor(request.headers.get("cookie"), id);
      if (!session) {
        return text(401, "Open the desktop again from the dashboard.");
      }
      let token: string;
      try {
        token = await target(session.userId, id);
      } catch (error) {
        if (!(error instanceof MachineError)) deps.logger.error("desktop target failed", { error });
        return text(
          status(error),
          error instanceof MachineError ? error.message : "Desktop unavailable.",
        );
      }
      const incoming = new URL(request.url);
      const url = `https://${sandboxHost(DESKTOP_PORT, id, deps.e2bDomain)}/${rest}${incoming.search}`;
      const headers = new Headers({ [TRAFFIC_HEADER]: token });
      for (const name of REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      let upstream: Response;
      try {
        upstream = await doFetch(url, { method: request.method, headers, redirect: "manual" });
      } catch (error) {
        deps.logger.warn("desktop upstream failed", { machine: id, error });
        return text(502, "The desktop did not answer.");
      }
      const out = new Headers({
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
      });
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    },

    /** Forwards the noVNC WebSocket (`/m/:id/websockify`) to the sandbox. */
    attach(server: Server) {
      const wss = new WebSocketServer({
        noServer: true,
        handleProtocols: (protocols) =>
          protocols.has("binary") ? "binary" : (protocols.values().next().value ?? false),
      });
      server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const match = /^\/m\/([^/?]+)\/websockify(?:\?|$)/.exec(req.url ?? "");
        const host = (req.headers.host ?? "").toLowerCase();
        if (!match || (deps.host !== null && host !== deps.host)) {
          socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        let id: string;
        try {
          id = decodeURIComponent(match[1] ?? "");
        } catch {
          socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        void upgrade(wss, req, socket, head, id);
      });
    },
  };

  async function upgrade(
    wss: WebSocketServer,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    id: string,
  ) {
    const reject = (code: number, reason: string) => {
      socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (req.headers.origin !== deps.origin) return reject(403, "Forbidden");
    const session = sessionFor(req.headers.cookie, id);
    if (!session) return reject(401, "Unauthorized");
    try {
      const token = await target(session.userId, id);
      const protocols = String(req.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const upstream = new WebSocket(
        `wss://${sandboxHost(DESKTOP_PORT, id, deps.e2bDomain)}/websockify`,
        protocols,
        { headers: { [TRAFFIC_HEADER]: token } },
      );
      upstream.once("error", (error) => {
        deps.logger.warn("desktop websocket upstream failed", { machine: id, error });
        reject(502, "Bad Gateway");
      });
      upstream.once("open", () => {
        wss.handleUpgrade(req, socket, head, (client) => {
          client.on("message", (data, isBinary) => upstream.send(data, { binary: isBinary }));
          upstream.on("message", (data, isBinary) => client.send(data, { binary: isBinary }));
          client.on("close", () => upstream.close());
          upstream.on("close", () => client.close());
          client.on("error", () => upstream.terminate());
          upstream.on("error", () => client.terminate());
          // The session decides how long a connection may stay open, not just how long it may start.
          const timer = setTimeout(
            () => client.close(4401, "session ended"),
            Math.max(0, session.exp * 1_000 - now()),
          );
          timer.unref();
          client.on("close", () => clearTimeout(timer));
        });
      });
    } catch (error) {
      if (error instanceof MachineError)
        return reject(API_ERRORS[error.code].status, "Unavailable");
      deps.logger.error("desktop websocket failed", { machine: id, error });
      reject(502, "Bad Gateway");
    }
  }
}

export type DesktopProxy = ReturnType<typeof createDesktopProxy>;
