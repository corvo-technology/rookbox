import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import type { Identity } from "./auth.js";
import type { Logger } from "./logger.js";
import { MachineError, type MachineService } from "./machines/service.js";
import { sandboxHost } from "./space/client.js";

/**
 * A sandbox's public ports need the `e2b-traffic-access-token` header, which a browser cannot
 * attach to a link or a WebSocket. So the "Open desktop" link points here: the API checks the
 * session, confirms the machine is the caller's, and forwards to `https://6080-<id>.<domain>`
 * with the token added.
 */
export const DESKTOP_PORT = 6080;
const TRAFFIC_HEADER = "e2b-traffic-access-token";
const TOKEN_TTL_MS = 60_000;

export type DesktopDeps = {
  machines: Pick<MachineService, "desktopTarget">;
  identity: Identity;
  e2bDomain: string;
  /** Origin the desktop page is served from (the API); WebSocket upgrades must come from it. */
  allowedOrigin: string;
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

export function createDesktopProxy(deps: DesktopDeps) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const tokens = new Map<string, { token: string; until: number }>();

  async function target(userId: string, id: string) {
    const key = `${userId}:${id}`;
    const hit = tokens.get(key);
    if (hit && hit.until > now()) return hit.token;
    const { trafficToken } = await deps.machines.desktopTarget(userId, id);
    tokens.set(key, { token: trafficToken, until: now() + TOKEN_TTL_MS });
    if (tokens.size > 200) tokens.delete(tokens.keys().next().value as string);
    return trafficToken;
  }

  function status(error: unknown): number {
    if (error instanceof MachineError) return error.code === "NOT_FOUND" ? 404 : 409;
    return 502;
  }

  return {
    /** Handles `/desktop/:id/<rest>`; the router mounts it for GET and HEAD. */
    async http(request: Request, id: string, rest: string): Promise<Response> {
      const user = await deps.identity(request.headers);
      if (!user) return new Response("Sign in first.", { status: 401 });
      let token: string;
      try {
        token = await target(user.id, id);
      } catch (error) {
        if (!(error instanceof MachineError)) deps.logger.error("desktop target failed", { error });
        return new Response(
          error instanceof MachineError ? error.message : "Desktop unavailable.",
          {
            status: status(error),
          },
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
        return new Response("The desktop did not answer.", { status: 502 });
      }
      const out = new Headers({
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      });
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    },

    /** Forwards the noVNC WebSocket (`/desktop/:id/websockify`) to the sandbox. */
    attach(server: Server) {
      const wss = new WebSocketServer({
        noServer: true,
        handleProtocols: (protocols) =>
          protocols.has("binary") ? "binary" : (protocols.values().next().value ?? false),
      });
      server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const match = /^\/desktop\/([^/?]+)\/websockify(?:\?|$)/.exec(req.url ?? "");
        if (!match) return; // not ours; leave other upgrades alone
        const id = decodeURIComponent(match[1] ?? "");
        void this.upgrade(wss, req, socket, head, id);
      });
    },

    async upgrade(
      wss: WebSocketServer,
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      id: string,
    ) {
      const reject = (code: number, text: string) => {
        socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
      };
      if (req.headers.origin !== deps.allowedOrigin) return reject(403, "Forbidden");
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(name, value);
      }
      try {
        const user = await deps.identity(headers);
        if (!user) return reject(401, "Unauthorized");
        const token = await target(user.id, id);
        const protocols = String(req.headers["sec-websocket-protocol"] ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        const upstream = new WebSocket(
          `wss://${sandboxHost(DESKTOP_PORT, id, deps.e2bDomain)}/websockify`,
          protocols,
          {
            headers: { [TRAFFIC_HEADER]: token },
          },
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
          });
        });
      } catch (error) {
        if (error instanceof MachineError)
          return reject(error.code === "NOT_FOUND" ? 404 : 409, "Unavailable");
        deps.logger.error("desktop websocket failed", { machine: id, error });
        reject(502, "Bad Gateway");
      }
    },
  };
}

export type DesktopProxy = ReturnType<typeof createDesktopProxy>;
